import { vi, describe, it, expect, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getEarlyRedemptionFeePreview: vi.fn(),
  getVaultExportData: vi.fn(),
}));

vi.mock("../../services/vault.js", () => ({
  VaultService: vi.fn(() => ({
    getEarlyRedemptionFeePreview: mocks.getEarlyRedemptionFeePreview,
    getVaultExportData: mocks.getVaultExportData,
  })),
}));
vi.mock("../../services/stellar.js", () => ({
  readTotalAssets: vi.fn(),
  readVaultState: vi.fn(),
}));
vi.mock("../../db/index.js", () => ({ query: vi.fn() }));

import { getEarlyRedemptionFee, exportVaultCsv } from "./vaults.js";

const CONTRACT_ID = "CDLZFC3SYJYHZDQA6M57EYUC2XBDA6LQF3M6KFRDZ7TXJYJL2K3B";

function makeRes() {
  return {
    json: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
}

describe("getEarlyRedemptionFee", () => {
  const next = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when shares is missing", async () => {
    const res = makeRes();
    const req = { params: { contractId: CONTRACT_ID }, query: {} } as any;

    await getEarlyRedemptionFee(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mocks.getEarlyRedemptionFeePreview).not.toHaveBeenCalled();
  });

  it("returns 400 when shares is zero", async () => {
    const res = makeRes();
    const req = { params: { contractId: CONTRACT_ID }, query: { shares: "0" } } as any;

    await getEarlyRedemptionFee(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mocks.getEarlyRedemptionFeePreview).not.toHaveBeenCalled();
  });

  it("returns 400 when shares is non-numeric", async () => {
    const res = makeRes();
    const req = { params: { contractId: CONTRACT_ID }, query: { shares: "abc" } } as any;

    await getEarlyRedemptionFee(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 404 when the vault is unknown", async () => {
    mocks.getEarlyRedemptionFeePreview.mockResolvedValue(null);
    const res = makeRes();
    const req = { params: { contractId: CONTRACT_ID }, query: { shares: "1000" } } as any;

    await getEarlyRedemptionFee(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns the fee breakdown for a valid share amount", async () => {
    const preview = {
      grossAssets: "1000",
      feeBps: 250,
      feeAmount: "25",
      netAssets: "975",
    };
    mocks.getEarlyRedemptionFeePreview.mockResolvedValue(preview);
    const res = makeRes();
    const req = { params: { contractId: CONTRACT_ID }, query: { shares: "1000" } } as any;

    await getEarlyRedemptionFee(req, res as any, next);

    expect(mocks.getEarlyRedemptionFeePreview).toHaveBeenCalledWith(CONTRACT_ID, 1000n);
    expect(res.json).toHaveBeenCalledWith(preview);
  });
});

describe("exportVaultCsv", () => {
  const next = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when the vault does not exist", async () => {
    mocks.getVaultExportData.mockResolvedValue(null);
    const res = makeRes();
    const req = { params: { contractId: CONTRACT_ID } } as any;

    await exportVaultCsv(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.send).not.toHaveBeenCalled();
  });

  it("returns a CSV attachment with header and data rows", async () => {
    mocks.getVaultExportData.mockResolvedValue({
      contractId: CONTRACT_ID,
      state: "Active",
      totalAssets: "1000",
      totalSupply: "900",
      depositorCount: 3,
      epochCount: 4,
      expectedApy: 500,
      maturityDate: new Date("2025-12-31T00:00:00.000Z"),
    });
    const res = makeRes();
    const req = { params: { contractId: CONTRACT_ID } } as any;

    await exportVaultCsv(req, res as any, next);

    expect(res.set).toHaveBeenCalledWith("Content-Type", "text/csv");
    expect(res.set).toHaveBeenCalledWith(
      "Content-Disposition",
      `attachment; filename="vault-${CONTRACT_ID}.csv"`,
    );

    const csv = (res.send as any).mock.calls[0][0] as string;
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe(
      "contractId,state,totalAssets,totalSupply,depositorCount,epochCount,expectedApy,maturityDate",
    );
    expect(lines[1]).toBe(
      `${CONTRACT_ID},Active,1000,900,3,4,500,2025-12-31T00:00:00.000Z`,
    );
  });

  it("emits empty fields for null apy and maturity date", async () => {
    mocks.getVaultExportData.mockResolvedValue({
      contractId: CONTRACT_ID,
      state: "Funding",
      totalAssets: "0",
      totalSupply: "0",
      depositorCount: 0,
      epochCount: 0,
      expectedApy: null,
      maturityDate: null,
    });
    const res = makeRes();
    const req = { params: { contractId: CONTRACT_ID } } as any;

    await exportVaultCsv(req, res as any, next);

    const csv = (res.send as any).mock.calls[0][0] as string;
    const lines = csv.trim().split("\r\n");
    expect(lines[1]).toBe(`${CONTRACT_ID},Funding,0,0,0,0,,`);
  });
});
