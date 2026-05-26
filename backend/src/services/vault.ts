import type { Vault, UserVaultPosition, PaginatedResponse } from "../types/index.js";

interface ListVaultsOptions {
  page: number;
  pageSize: number;
  state?: string;
}

export class VaultService {
  async listVaults(_opts: ListVaultsOptions): Promise<PaginatedResponse<Vault>> {
    throw new Error("Not implemented");
  }

  async getVault(_contractId: string): Promise<Vault | null> {
    throw new Error("Not implemented");
  }

  async getVaultPositions(_contractId: string): Promise<UserVaultPosition[]> {
    throw new Error("Not implemented");
  }

  async upsertVault(_vault: Partial<Vault> & { contractId: string }): Promise<void> {
    throw new Error("Not implemented");
  }
}
