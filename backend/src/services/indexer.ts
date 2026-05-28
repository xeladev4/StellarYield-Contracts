import { rpc, xdr, scValToNative } from "@stellar/stellar-sdk";
import { config } from "../config.js";
import { query } from "../db/index.js";
import { logger } from "../logger.js";
import { getSorobanRpc } from "./stellar.js";
import { YieldService } from "./yield.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function decodeSymbol(topic: rpc.Api.EventResponse["topic"][number]): string {
  try {
    return String(scValToNative(topic) ?? "");
  } catch {
    return "";
  }
}

function decodeAddr(topic: rpc.Api.EventResponse["topic"][number]): string {
  try {
    const v = scValToNative(topic);
    return typeof v === "string" ? v : String(v ?? "");
  } catch {
    return "";
  }
}

function decodeBigInt(val: unknown): bigint {
  if (typeof val === "bigint") return val;
  if (typeof val === "number") return BigInt(Math.trunc(val));
  if (typeof val === "string" && /^-?\d+$/.test(val)) return BigInt(val);
  if (Array.isArray(val) && val.length > 0) return decodeBigInt(val[0]);
  if (val && typeof val === "object") {
    const first = Object.values(val as Record<string, unknown>)[0];
    if (first !== undefined) return decodeBigInt(first);
  }
  return 0n;
}

function decodeValue(ev: rpc.Api.EventResponse): unknown {
  try {
    return scValToNative(ev.value);
  } catch {
    return null;
  }
}

async function storeIndexedEvent(
  contractId: string,
  eventType: string,
  ev: rpc.Api.EventResponse,
  payload: Record<string, unknown>,
): Promise<void> {
  await query(
    `INSERT INTO indexed_events (ledger, tx_hash, contract_id, event_type, payload)
     VALUES ($1, $2, $3, $4, $5)`,
    [ev.ledger, ev.txHash, contractId, eventType, JSON.stringify(payload)],
  );
}

// ── Indexer ────────────────────────────────────────────────────────────────────

export class Indexer {
  private readonly _server: rpc.Server;
  private readonly _yieldService: YieldService;
  private _lastLedger: number;
  private _running: boolean;
  private _timer: ReturnType<typeof setInterval> | null;

  constructor(options?: { server?: rpc.Server; yieldService?: YieldService }) {
    this._server = options?.server ?? getSorobanRpc();
    this._yieldService = options?.yieldService ?? new YieldService();
    this._lastLedger = config.indexer.startLedger;
    this._running = false;
    this._timer = null;
  }

  async start(): Promise<void> {
    this._running = true;
    this._lastLedger = await this._loadLastLedger();
    logger.info({ lastLedger: this._lastLedger }, "Indexer starting");
    await this.tick();
    this._timer = setInterval(
      () => void this.tick(),
      config.indexer.pollIntervalMs,
    );
  }

  stop(): void {
    this._running = false;
    if (this._timer !== null) {
      clearInterval(this._timer);
      this._timer = null;
    }
    logger.info("Indexer stopped");
  }

  async tick(): Promise<void> {
    if (!this._running && this._timer !== null) return;

    const filters: rpc.Api.EventFilter[] = [
      {
        type: "contract",
        ...(config.stellar.vaultFactoryContractId
          ? { contractIds: [config.stellar.vaultFactoryContractId] }
          : {}),
      },
    ];

    let response: rpc.Api.GetEventsResponse;
    try {
      response = await this._server.getEvents({
        startLedger: this._lastLedger + 1,
        filters,
        limit: 100,
      });
    } catch (err) {
      logger.warn(err, "getEvents RPC call failed — skipping tick");
      return;
    }

    let maxLedger = this._lastLedger;
    for (const ev of response.events) {
      await this.processEvent(ev);
      if (ev.ledger > maxLedger) maxLedger = ev.ledger;
    }

    if (maxLedger > this._lastLedger) {
      this._lastLedger = maxLedger;
      await this._saveLastLedger(maxLedger).catch((err) =>
        logger.warn(err, "Failed to persist lastLedger"),
      );
    }
  }

  async processEvent(ev: rpc.Api.EventResponse): Promise<void> {
    if (ev.type !== "contract") return;

    const contractId = ev.contractId?.contractId() ?? "";
    const eventType = decodeSymbol(ev.topic[0]);

    switch (eventType) {
      case "deposit":
        await this._handleDeposit(contractId, ev);
        break;
      case "withdraw":
        await this._handleWithdraw(contractId, ev);
        break;
      case "yield_dis":
        await this._handleYieldDistributed(contractId, ev);
        break;
      default:
        logger.debug({ contractId, eventType }, "Unhandled event type");
    }
  }

  protected async _handleDeposit(
    contractId: string,
    ev: rpc.Api.EventResponse,
  ): Promise<void> {
    const caller = decodeAddr(ev.topic[1]);
    const data = decodeValue(ev);
    const dataArr = Array.isArray(data) ? data : Object.values(data as Record<string, unknown>);
    const assets = decodeBigInt(dataArr[0]);
    const shares = decodeBigInt(dataArr[1]);

    const payload = { caller, assets: assets.toString(), shares: shares.toString() };
    await storeIndexedEvent(contractId, "deposit", ev, payload).catch((err) =>
      logger.warn(err, "Failed to store deposit event"),
    );

    const vaultRow = await query<{ id: number }>(
      "SELECT id FROM vaults WHERE contract_id = $1",
      [contractId],
    );
    if (vaultRow.length === 0) {
      logger.warn({ contractId }, "Deposit event for unknown vault — skipping position update");
      return;
    }
    const vaultId = vaultRow[0].id;

    await query(
      `INSERT INTO user_vault_positions (user_address, vault_id, shares, deposited)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_address, vault_id) DO UPDATE SET
         shares    = user_vault_positions.shares    + EXCLUDED.shares,
         deposited = user_vault_positions.deposited + EXCLUDED.deposited,
         updated_at = NOW()`,
      [caller, vaultId, shares.toString(), assets.toString()],
    );

    logger.info({ contractId, caller, shares: shares.toString() }, "Processed deposit event");
  }

  protected async _handleWithdraw(
    contractId: string,
    ev: rpc.Api.EventResponse,
  ): Promise<void> {
    const owner = decodeAddr(ev.topic[3] ?? ev.topic[1]);
    const data = decodeValue(ev);
    const dataArr = Array.isArray(data) ? data : Object.values(data as Record<string, unknown>);
    const assets = decodeBigInt(dataArr[0]);
    const shares = decodeBigInt(dataArr[1]);

    const payload = { owner, assets: assets.toString(), shares: shares.toString() };
    await storeIndexedEvent(contractId, "withdraw", ev, payload).catch((err) =>
      logger.warn(err, "Failed to store withdraw event"),
    );

    const vaultRow = await query<{ id: number }>(
      "SELECT id FROM vaults WHERE contract_id = $1",
      [contractId],
    );
    if (vaultRow.length === 0) {
      logger.warn({ contractId }, "Withdraw event for unknown vault — skipping position update");
      return;
    }
    const vaultId = vaultRow[0].id;

    await query(
      `INSERT INTO user_vault_positions (user_address, vault_id, shares, deposited)
       VALUES ($1, $2, 0, 0)
       ON CONFLICT (user_address, vault_id) DO UPDATE SET
         shares    = GREATEST(0, user_vault_positions.shares    - $3),
         deposited = GREATEST(0, user_vault_positions.deposited - $4),
         updated_at = NOW()`,
      [owner, vaultId, shares.toString(), assets.toString()],
    );

    logger.info({ contractId, owner, shares: shares.toString() }, "Processed withdraw event");
  }

  protected async _handleYieldDistributed(
    contractId: string,
    ev: rpc.Api.EventResponse,
  ): Promise<void> {
    const epoch = Number(decodeSymbol(ev.topic[1]) || 0) || (() => {
      try { return Number(scValToNative(ev.topic[1]) ?? 0); } catch { return 0; }
    })();
    const data = decodeValue(ev);
    const dataArr = Array.isArray(data) ? data : Object.values(data as Record<string, unknown>);
    const amount = decodeBigInt(dataArr[0]);

    const payload = { epoch, amount: amount.toString() };
    await storeIndexedEvent(contractId, "yield_distributed", ev, payload).catch((err) =>
      logger.warn(err, "Failed to store yield_distributed event"),
    );

    const vaultRow = await query<{ id: number }>(
      "SELECT id FROM vaults WHERE contract_id = $1",
      [contractId],
    );
    if (vaultRow.length === 0) {
      logger.warn({ contractId }, "yield_distributed for unknown vault — skipping epoch record");
      return;
    }
    const vaultId = vaultRow[0].id;

    const supplyRow = await query<{ total_supply: string }>(
      "SELECT total_supply FROM vaults WHERE id = $1",
      [vaultId],
    );
    const totalShares = supplyRow[0]?.total_supply ?? "0";

    await this._yieldService.recordEpoch(vaultId, epoch, amount.toString(), totalShares);

    logger.info({ contractId, epoch, amount: amount.toString() }, "Processed yield_distributed event");
  }

  private async _loadLastLedger(): Promise<number> {
    try {
      const rows = await query<{ last_ledger: number }>(
        "SELECT last_ledger FROM indexer_state ORDER BY id DESC LIMIT 1",
      );
      if (rows.length > 0 && rows[0].last_ledger > 0) return rows[0].last_ledger;
    } catch (err) {
      logger.warn(err, "Could not read indexer_state — using config start ledger");
    }
    return config.indexer.startLedger;
  }

  private async _saveLastLedger(ledger: number): Promise<void> {
    await query(
      `INSERT INTO indexer_state (id, last_ledger) VALUES (1, $1)
       ON CONFLICT (id) DO UPDATE SET last_ledger = EXCLUDED.last_ledger, updated_at = NOW()`,
      [ledger],
    );
  }
}

// ── Standalone event parsers (exported for unit testing) ──────────────────────

export interface ParsedDepositEvent {
  caller: string;
  receiver: string;
  assets: bigint;
  shares: bigint;
}

export function parseDepositEvent(rawEvent: unknown): ParsedDepositEvent | null {
  try {
    if (!rawEvent || typeof rawEvent !== "object") return null;
    const ev = rawEvent as Record<string, unknown>;
    const topics = (ev["topic"] ?? ev["topics"]) as unknown[] | undefined;
    const value = ev["value"] ?? ev["data"];

    if (!Array.isArray(topics) || topics.length < 3 || value == null) return null;

    const parsedTopics = topics.map((t) =>
      typeof t === "string" ? xdr.ScVal.fromXDR(t, "base64") : (t as xdr.ScVal),
    );
    const parsedValue =
      typeof value === "string"
        ? xdr.ScVal.fromXDR(value, "base64")
        : (value as xdr.ScVal);

    let eventName: string;
    try {
      eventName = String(scValToNative(parsedTopics[0]) ?? "");
    } catch {
      return null;
    }
    if (eventName !== "deposit") return null;

    const caller = String(scValToNative(parsedTopics[1]) ?? "");
    const receiver = String(scValToNative(parsedTopics[2]) ?? "");

    const data = scValToNative(parsedValue);
    const arr = Array.isArray(data) ? data : Object.values((data as Record<string, unknown>) ?? {});
    const assets = decodeBigInt(arr[0]);
    const shares = decodeBigInt(arr[1]);

    return { caller, receiver, assets, shares };
  } catch {
    return null;
  }
}

export interface ParsedYieldDistributedEvent {
  epoch: number;
  amount: bigint;
  timestamp: bigint;
}

export function parseYieldDistributedEvent(rawEvent: unknown): ParsedYieldDistributedEvent | null {
  try {
    if (!rawEvent || typeof rawEvent !== "object") return null;
    const ev = rawEvent as Record<string, unknown>;
    const topics = (ev["topic"] ?? ev["topics"]) as unknown[] | undefined;
    const value = ev["value"] ?? ev["data"];

    if (!Array.isArray(topics) || topics.length < 2 || value == null) return null;

    const parsedTopics = topics.map((t) =>
      typeof t === "string" ? xdr.ScVal.fromXDR(t, "base64") : (t as xdr.ScVal),
    );
    const parsedValue =
      typeof value === "string"
        ? xdr.ScVal.fromXDR(value, "base64")
        : (value as xdr.ScVal);

    let eventName: string;
    try {
      eventName = String(scValToNative(parsedTopics[0]) ?? "");
    } catch {
      return null;
    }
    if (eventName !== "yield_dis") return null;

    const epoch = Number(scValToNative(parsedTopics[1]) ?? 0);

    const data = scValToNative(parsedValue);
    const arr = Array.isArray(data) ? data : Object.values((data as Record<string, unknown>) ?? {});
    const amount = decodeBigInt(arr[0]);
    const timestamp = decodeBigInt(arr[1]);

    return { epoch, amount, timestamp };
  } catch {
    return null;
  }
}

export { decodeAddr, decodeBigInt, decodeSymbol, decodeValue, storeIndexedEvent };
