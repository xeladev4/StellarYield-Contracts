import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { UserService } from "./user.js";
import * as db from "../db/index.js";

// Mock the database module
vi.mock("../db/index.js");

// Mock the logger to avoid pino-pretty issues in tests
vi.mock("../logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

const TEST_ADDRESS = "GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJJBBX7UYXVXPXD5XNMJXVXV";

describe("UserService", () => {
  let userService: UserService;

  beforeEach(() => {
    userService = new UserService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getUser", () => {
    it("should return a user with kycVerified status when user exists", async () => {
      const mockUser = {
        id: 1,
        address: TEST_ADDRESS,
        kyc_verified: true,
        created_at: new Date("2024-01-01"),
        updated_at: new Date("2024-01-02"),
      };

      vi.mocked(db.query).mockResolvedValueOnce([mockUser]);

      const result = await userService.getUser(TEST_ADDRESS);

      expect(result).toEqual({
        id: 1,
        address: TEST_ADDRESS,
        kycVerified: true,
        createdAt: mockUser.created_at,
        updatedAt: mockUser.updated_at,
      });
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining("SELECT id, address, kyc_verified"),
        [TEST_ADDRESS],
      );
    });

    it("should return null when user does not exist", async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const result = await userService.getUser(TEST_ADDRESS);

      expect(result).toBeNull();
    });
  });

  describe("getUserPortfolio", () => {
    it("should return portfolio with positions and totalDeposited sum", async () => {
      const mockPositions = [
        {
          id: 1,
          user_address: TEST_ADDRESS,
          vault_id: 1,
          shares: "1000",
          deposited: "5000",
          last_claimed_epoch: 0,
          updated_at: new Date("2024-01-01"),
        },
        {
          id: 2,
          user_address: TEST_ADDRESS,
          vault_id: 2,
          shares: "2000",
          deposited: "3000",
          last_claimed_epoch: 1,
          updated_at: new Date("2024-01-02"),
        },
      ];

      vi.mocked(db.query).mockResolvedValueOnce(mockPositions);

      const result = await userService.getUserPortfolio(TEST_ADDRESS);

      expect(result.positions).toHaveLength(2);
      expect(result.positions[0]).toEqual({
        id: 1,
        userAddress: TEST_ADDRESS,
        vaultId: 1,
        shares: "1000",
        deposited: "5000",
        lastClaimedEpoch: 0,
        updatedAt: mockPositions[0].updated_at,
      });
      expect(result.positions[1]).toEqual({
        id: 2,
        userAddress: TEST_ADDRESS,
        vaultId: 2,
        shares: "2000",
        deposited: "3000",
        lastClaimedEpoch: 1,
        updatedAt: mockPositions[1].updated_at,
      });
      expect(result.totalDeposited).toBe("8000");
    });

    it("should return empty portfolio with zero totalDeposited when user has no positions", async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const result = await userService.getUserPortfolio(TEST_ADDRESS);

      expect(result.positions).toHaveLength(0);
      expect(result.totalDeposited).toBe("0");
    });
  });
});
