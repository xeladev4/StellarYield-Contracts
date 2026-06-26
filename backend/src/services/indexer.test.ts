import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("../db/index.js", () => ({ query: vi.fn().mockResolvedValue([]) }));
vi.mock("../logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("./stellar.js", () => ({ getSorobanRpc: vi.fn() }));
vi.mock("./vault.js", () => ({ VaultService: vi.fn().mockImplementation(() => ({})) }));
vi.mock("./notifications.js", () => ({ NotificationService: vi.fn().mockImplementation(() => ({})) }));

import { rpc, xdr, nativeToScVal } from "@stellar/stellar-sdk";
import { Indexer, parseDepositEvent, parseYieldDistributedEvent, parseCancelFundingEvent } from "./indexer.js";
import { getSorobanRpc } from "./stellar.js";

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
    contractId,
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
  let mockServer: {
    getLatestLedger: ReturnType<typeof vi.fn>;
    getEvents: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = {
      getLatestLedger: vi.fn().mockResolvedValue({ sequence: 1010 }),
      getEvents: vi.fn().mockResolvedValue({ events: [], latestLedger: 999 }),
    };
    (getSorobanRpc as any).mockReturnValue(mockServer);
    indexer = new Indexer();
    indexer["running"] = true;
  });

  it("passes both RPC events to processEvent", async () => {
    const events = [
      makeMockEvent("deposit", VAULT_CONTRACT),
      makeMockEvent("withdraw", VAULT_CONTRACT),
    ];
    mockServer.getLatestLedger.mockResolvedValueOnce({ sequence: 1005 });
    mockServer.getEvents.mockResolvedValueOnce({ events, latestLedger: 1005 });
    const spy = vi.spyOn(indexer as any, "processEvent").mockResolvedValue(undefined);

    await indexer.tick();

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenCalledWith(events[0]);
    expect(spy).toHaveBeenCalledWith(events[1]);
  });

  it("logs a warning and does not throw on RPC error", async () => {
    mockServer.getLatestLedger.mockRejectedValueOnce(new Error("network error"));
    const { logger } = await import("../logger.js");

    await expect(indexer.tick()).resolves.not.toThrow();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("updates lastLedger to the latest ledger from getLatestLedger", async () => {
    const events = [
      { ...makeMockEvent("deposit", VAULT_CONTRACT), ledger: 1001 },
      { ...makeMockEvent("deposit", VAULT_CONTRACT), ledger: 1005 },
    ];
    mockServer.getLatestLedger.mockResolvedValueOnce({ sequence: 1010 });
    mockServer.getEvents.mockResolvedValueOnce({ events, latestLedger: 1010 });
    vi.spyOn(indexer as any, "processEvent").mockResolvedValue(undefined);

    await indexer.tick();

    expect(indexer.lastLedger).toBe(1010);
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

// ── Indexer tick tests ─────────────────────────────────────────────────────────

describe("Indexer tick", () => {
  const account = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("leaves lastLedger unchanged when no new ledgers are available", async () => {
    const { getSorobanRpc } = await import("./stellar.js");
    const { Indexer } = await import("./indexer.js");
    const { query } = await import("../db/index.js");

    (getSorobanRpc as any).mockReturnValue({
      getLatestLedger: vi.fn().mockResolvedValue({ sequence: 0 }),
      getEvents: vi.fn(),
    });
    (query as any).mockResolvedValue([]);

    const indexer = new Indexer();
    const before = indexer.lastLedger;
    await indexer.tick();

    expect(indexer.lastLedger).toBe(before);
  });

  it("updates user_vault_positions on a deposit event", async () => {
    const { getSorobanRpc } = await import("./stellar.js");
    const { Indexer } = await import("./indexer.js");
    const { query } = await import("../db/index.js");

    const depositEvent = {
      id: "0000000001",
      contractId: "CCONTRACT123",
      type: "contract",
      ledger: 100,
      txHash: "abc123",
      topic: [
        nativeToScVal("deposit"),
        nativeToScVal(account),
        nativeToScVal(account),
      ],
      value: nativeToScVal([500n, 500n]),
    };

    (getSorobanRpc as any).mockReturnValue({
      getLatestLedger: vi.fn().mockResolvedValue({ sequence: 100 }),
      getEvents: vi.fn().mockResolvedValue({ events: [depositEvent], latestLedger: 100 }),
    });
    (query as any).mockResolvedValue([]);

    const indexer = new Indexer();
    await indexer.tick();

    const calls: string[] = (query as any).mock.calls.map((c: any[]) => c[0] as string);
    expect(calls.some((sql) => sql.includes("user_vault_positions"))).toBe(true);
  });

  it("logs a warning and does not crash when RPC throws", async () => {
    const { getSorobanRpc } = await import("./stellar.js");
    const { Indexer } = await import("./indexer.js");
    const { logger } = await import("../logger.js");

    (getSorobanRpc as any).mockReturnValue({
      getLatestLedger: vi.fn().mockRejectedValue(new Error("RPC unavailable")),
    });

    const indexer = new Indexer();
    await expect(indexer.tick()).resolves.toBeUndefined();
    expect((logger.warn as any).mock.calls.length).toBeGreaterThan(0);
  });
  it("parses cancel_funding event", () => {
    const topics = [xdr.ScVal.scvSymbol("fund_cxl")];
    const data = xdr.ScVal.scvVoid();

    const mockEvent = makeMockEvent("cancel_funding", VAULT_CONTRACT, [], data);
    mockEvent.topic = topics;

    const result = parseCancelFundingEvent(mockEvent);
    expect(result).not.toBeNull();
    expect(result?.contractId).toBe(VAULT_CONTRACT);
  });

  it("handles malformed cancel_funding event safely", () => {
    expect(parseCancelFundingEvent(null)).toBeNull();
    expect(parseCancelFundingEvent({})).toBeNull();
    expect(parseCancelFundingEvent({ topics: [], value: null })).toBeNull();
  });

  it("recognizes both cancel_funding event name formats", () => {
    const topics1 = [xdr.ScVal.scvSymbol("fund_cxl")];
    const topics2 = [xdr.ScVal.scvSymbol("funding_cancelled")];
    
    const event1 = makeMockEvent("cancel_funding", VAULT_CONTRACT, [], xdr.ScVal.scvVoid());
    event1.topic = topics1;
    
    const event2 = makeMockEvent("cancel_funding", VAULT_CONTRACT, [], xdr.ScVal.scvVoid());
    event2.topic = topics2;

    expect(parseCancelFundingEvent(event1)).not.toBeNull();
    expect(parseCancelFundingEvent(event2)).not.toBeNull();
  });

});

// ── Issue #569: yield_claimed parsers ──────────────────────────────────────────

import {
  parseYieldClaimedEvent,
  parseYieldClaimedPartialEvent,
  parseEarlyRedemptionRequestedEvent,
} from "./indexer.js";

describe("parseYieldClaimedEvent", () => {
  it("parses a valid yield_clm event", () => {
    const topics = [nativeToScVal("yield_clm"), nativeToScVal(ACCOUNT)];
    const data = nativeToScVal([5000n, 3]);
    const result = parseYieldClaimedEvent({ topics, data });
    expect(result).not.toBeNull();
    expect(result?.user).toBe(ACCOUNT);
    expect(result?.amount).toBe(5000n);
    expect(result?.epoch).toBe(3);
  });

  it("returns null for malformed events", () => {
    expect(parseYieldClaimedEvent(null)).toBeNull();
    expect(parseYieldClaimedEvent({})).toBeNull();
    expect(parseYieldClaimedEvent({ topics: [nativeToScVal("wrong")], data: nativeToScVal([]) })).toBeNull();
  });
});

describe("parseYieldClaimedPartialEvent", () => {
  it("parses a valid prt_yld event", () => {
    const topics = [nativeToScVal("prt_yld"), nativeToScVal(ACCOUNT)];
    const data = nativeToScVal([3000n, 500n, 7]);
    const result = parseYieldClaimedPartialEvent({ topics, data });
    expect(result).not.toBeNull();
    expect(result?.user).toBe(ACCOUNT);
    expect(result?.claimed).toBe(3000n);
    expect(result?.shortfall).toBe(500n);
    expect(result?.epoch).toBe(7);
  });

  it("returns null for malformed events", () => {
    expect(parseYieldClaimedPartialEvent(null)).toBeNull();
    expect(parseYieldClaimedPartialEvent({})).toBeNull();
  });
});

// ── Issue #571: parseEarlyRedemptionRequestedEvent ────────────────────────────

describe("parseEarlyRedemptionRequestedEvent", () => {
  it("parses a valid erq_req event", () => {
    const topics = [nativeToScVal("erq_req"), nativeToScVal(ACCOUNT)];
    const data = nativeToScVal([42, 10000n, 2]);
    const result = parseEarlyRedemptionRequestedEvent({ topics, data });
    expect(result).not.toBeNull();
    expect(result?.user).toBe(ACCOUNT);
    expect(result?.requestId).toBe(42);
    expect(result?.shares).toBe(10000n);
    expect(result?.queuePosition).toBe(2);
  });

  it("returns null for unrecognised topic", () => {
    const topics = [nativeToScVal("unknown_event"), nativeToScVal(ACCOUNT)];
    const data = nativeToScVal([1, 100n, 1]);
    expect(parseEarlyRedemptionRequestedEvent({ topics, data })).toBeNull();
  });

  it("returns null for malformed events", () => {
    expect(parseEarlyRedemptionRequestedEvent(null)).toBeNull();
    expect(parseEarlyRedemptionRequestedEvent({})).toBeNull();
  });
});
