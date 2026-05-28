import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../db/index.js", () => ({ query: vi.fn() }));

async function getTestContext() {
  const { query } = await import("../../db/index.js");
  const { getAdminStats } = await import("./admin.js");
  return { query: query as ReturnType<typeof vi.fn>, getAdminStats };
}

describe("Admin Controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  describe("getAdminStats", () => {
    it("returns vault/user/epoch counts and TVL", async () => {
      const { query, getAdminStats } = await getTestContext();
      // vaultCount
      query.mockResolvedValueOnce([{ count: "2" }]);
      // userCount
      query.mockResolvedValueOnce([{ count: "42" }]);
      // totalValueLocked
      query.mockResolvedValueOnce([{ total: "12345" }]);
      // epochCount
      query.mockResolvedValueOnce([{ count: "3" }]);

      const req = {} as any;
      const res = { json: vi.fn() } as any;
      const next = vi.fn();

      await getAdminStats(req, res, next);

      expect(res.json).toHaveBeenCalledWith({ vaultCount: 2, userCount: 42, totalValueLocked: "12345", epochCount: 3 });
    });
  });
});
