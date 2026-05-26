import type { Epoch } from "../types/index.js";

export class YieldService {
  async getVaultEpochs(_contractId: string): Promise<Epoch[]> {
    throw new Error("Not implemented");
  }

  async getUserPendingYield(
    _contractId: string,
    _userAddress: string,
  ): Promise<{ pendingYield: string; epochs: number[] }> {
    throw new Error("Not implemented");
  }

  async recordEpoch(
    _vaultId: number,
    _epoch: number,
    _yieldAmount: string,
    _totalShares: string,
  ): Promise<void> {
    throw new Error("Not implemented");
  }
}
