import { describe, it, expect, vi } from "vitest";
import { readCurrentEpoch, readEpochData } from "./stellar.js";

// Mock the readVaultState and simulateRead dependencies
vi.mock("./stellar.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./stellar.js")>();
  return {
    ...actual,
    readVaultState: vi.fn(),
  };
});

describe("Stellar SDK Helper Methods", () => {
  it("readCurrentEpoch returns 0 for Funding state", async () => {
    const { readVaultState } = await import("./stellar.js");
    (readVaultState as any).mockResolvedValue("Funding");
    
    const epoch = await readCurrentEpoch("CC_ANY");
    expect(epoch).toBe(0);
  });

  it("readEpochData returns zeroed struct for epoch 0", async () => {
    const data = await readEpochData("CC_ANY", 0);
    expect(data.yieldAmount).toBe(0n);
    expect(data.totalShares).toBe(0n);
    expect(data.timestamp).toBe(0n);
  });
});
