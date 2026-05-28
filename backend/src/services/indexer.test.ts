import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("../db/index.js", () => ({ query: vi.fn().mockResolvedValue([]) }));
vi.mock("../logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("./stellar.js", () => ({ getSorobanRpc: vi.fn() }));
vi.mock("./yield.js", () => ({ YieldService: vi.fn().mockImplementation(() => ({})) }));

import { rpc, xdr, Contract, nativeToScVal } from "@stellar/stellar-sdk";
import { Indexer, parseDepositEvent, parseYieldDistributedEvent } from "./indexer.js";

const VAULT_CONTRACT = "CDLZFC3SYJYHZDQA6M57EYUC2XBDA6LQF3M6KFRDZ7TXJYJL2K3B";
const ACCOUNT = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN";

function makeMockEvent(
  eventType: string,
  contractId: string,
  extraTopics: xdr.ScVal[] = [],
  valueData: xdr.ScVal = xdr.ScVal.scvVoid(),
): rpc.Api.EventResponse {
  return {
    type: "contract",
    contractId: new Contract(contractId),
    topic: [xdr.ScVal.scvSymbol(eventType), ...extraTopics],
    value: valueData,
    ledger: 1000,
    id: `event-${Math.random()}`,
    txHash: "abc123",
    pagingToken: "",
    ledgerClosedAt: new Date().toISOString(),
    transactionIndex: 0,
    operationIndex: 0,
    inSuccessfulContractCall: true,
  } as unknown as rpc.Api.EventResponse;
}

// ── Indexer class tests ────────────────────────────────────────────────────────

describe("Indexer", () => {
  let indexer: Indexer;
  let mockServer: { getEvents: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = {
      getEvents: vi.fn().mockResolvedValue({ events: [], latestLedger: 999 }),
    };
    indexer = new Indexer({ server: mockServer as unknown as rpc.Server });
    indexer["_running"] = true;
  });

  it("passes both RPC events to processEvent", async () => {
    const events = [
      makeMockEvent("deposit", VAULT_CONTRACT),
      makeMockEvent("withdraw", VAULT_CONTRACT),
    ];
    mockServer.getEvents.mockResolvedValueOnce({ events, latestLedger: 1005 });
    const spy = vi.spyOn(indexer, "processEvent").mockResolvedValue(undefined);

    await indexer.tick();

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenCalledWith(events[0]);
    expect(spy).toHaveBeenCalledWith(events[1]);
  });

  it("logs a warning and does not throw on RPC error", async () => {
    mockServer.getEvents.mockRejectedValueOnce(new Error("network error"));
    const { logger } = await import("../logger.js");

    await expect(indexer.tick()).resolves.not.toThrow();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("updates lastLedger to the highest ledger seen", async () => {
    const events = [
      { ...makeMockEvent("deposit", VAULT_CONTRACT), ledger: 1001 },
      { ...makeMockEvent("deposit", VAULT_CONTRACT), ledger: 1005 },
    ];
    mockServer.getEvents.mockResolvedValueOnce({ events, latestLedger: 1010 });
    vi.spyOn(indexer, "processEvent").mockResolvedValue(undefined);

    await indexer.tick();

    expect(indexer["_lastLedger"]).toBe(1005);
  });
});

// ── Standalone event parser tests ──────────────────────────────────────────────

describe("Indexer Event Parsers", () => {
  it("parses valid deposit event", () => {
    const topics = [
      nativeToScVal("deposit"),
      nativeToScVal(ACCOUNT),
      nativeToScVal(ACCOUNT),
    ];
    const data = nativeToScVal([1000n, 1000n]);

    const result = parseDepositEvent({ topics, data });
    expect(result).not.toBeNull();
    expect(result?.caller).toBe(ACCOUNT);
    expect(result?.receiver).toBe(ACCOUNT);
    expect(result?.assets).toBe(1000n);
    expect(result?.shares).toBe(1000n);
  });

  it("handles malformed deposit safely", () => {
    expect(parseDepositEvent(null)).toBeNull();
    expect(parseDepositEvent({})).toBeNull();
    expect(parseDepositEvent({ topics: ["invalid_base64"], data: "invalid" })).toBeNull();
  });

  it("parses yield distributed event", () => {
    const topics = [
      nativeToScVal("yield_dis"),
      nativeToScVal(5),
    ];
    const data = nativeToScVal([5000n, 123456789n]);

    const result = parseYieldDistributedEvent({ topics, data });
    expect(result).not.toBeNull();
    expect(result?.epoch).toBe(5);
    expect(result?.amount).toBe(5000n);
    expect(result?.timestamp).toBe(123456789n);
  });

  it("handles malformed yield event safely", () => {
    expect(parseYieldDistributedEvent(null)).toBeNull();
    expect(parseYieldDistributedEvent({})).toBeNull();
  });
});
