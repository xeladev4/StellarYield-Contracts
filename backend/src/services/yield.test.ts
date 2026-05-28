import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db/index.js", () => ({ query: vi.fn() }));

async function getTestContext() {
  const { query } = await import("../db/index.js");
  const { YieldService } = await import("./yield.js");
  const service = new YieldService();
  return { query: query as ReturnType<typeof vi.fn>, service };
}

describe("YieldService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getVaultEpochs", () => {
    it("returns epochs for a vault contract id", async () => {
      const { query, service } = await getTestContext();
      query.mockResolvedValue([
        {
          id: 1,
          vault_id: 10,
          epoch: 1,
          yield_amount: "1000",
          total_shares: "50000",
          distributed_at: new Date("2025-01-01"),
        },
        {
          id: 2,
          vault_id: 10,
          epoch: 2,
          yield_amount: "2000",
          total_shares: "60000",
          distributed_at: new Date("2025-02-01"),
        },
      ]);

      const epochs = await service.getVaultEpochs("CC_VAULT_1");
      expect(epochs.length).toBe(2);
      expect(epochs[0].epoch).toBe(1);
      expect(epochs[1].epoch).toBe(2);
      expect(epochs[0].yieldAmount).toBe("1000");
      expect(epochs[1].yieldAmount).toBe("2000");
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("JOIN vaults v"),
        ["CC_VAULT_1"],
      );
    });

    it("returns empty array when vault has no epochs", async () => {
      const { query, service } = await getTestContext();
      query.mockResolvedValue([]);

      const epochs = await service.getVaultEpochs("CC_NO_EPOCHS");
      expect(epochs).toEqual([]);
    });
  });
});
