import type { Vault, UserVaultPosition, PaginatedResponse } from "../types/index.js";
import { query } from "../db/index.js";
import { logger } from "../logger.js";

interface ListVaultsOptions {
  page: number;
  pageSize: number;
  state?: string;
}

export class VaultService {
  async listVaults(opts: ListVaultsOptions): Promise<PaginatedResponse<Vault>> {
    const { page, pageSize, state } = opts;
    const offset = (page - 1) * pageSize;

    // Build WHERE clause if state filter is provided
    const whereClause = state ? "WHERE state = $3" : "";
    const params: any[] = [pageSize, offset];
    if (state) params.push(state);

    // Query vaults with pagination
    const vaults = await query<{
      id: number;
      contract_id: string;
      factory_id: string | null;
      asset: string;
      name: string | null;
      symbol: string | null;
      state: string;
      total_assets: string;
      total_supply: string;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT id, contract_id, factory_id, asset, name, symbol, state, 
              total_assets, total_supply, created_at, updated_at
       FROM vaults
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      params,
    );

    // Get total count
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM vaults ${whereClause}`,
      state ? [state] : [],
    );
    const total = parseInt(countResult[0]?.count ?? "0", 10);

    // Map database rows to Vault type
    const data: Vault[] = vaults.map((row) => ({
      id: row.id,
      contractId: row.contract_id,
      factoryId: row.factory_id,
      asset: row.asset,
      name: row.name,
      symbol: row.symbol,
      state: row.state as any,
      totalAssets: row.total_assets,
      totalSupply: row.total_supply,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return {
      data,
      total,
      page,
      pageSize,
    };
  }

  async countVaults(): Promise<number> {
    const countResult = await query<{ count: string }>(
      "SELECT COUNT(*) as count FROM vaults",
    );
    return parseInt(countResult[0]?.count ?? "0", 10);
  }

  async listVaultsByFactory(factoryId: string): Promise<Vault[]> {
    const rows = await query<{
      id: number;
      contract_id: string;
      factory_id: string | null;
      asset: string;
      name: string | null;
      symbol: string | null;
      state: string;
      total_assets: string;
      total_supply: string;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT id, contract_id, factory_id, asset, name, symbol, state,
              total_assets, total_supply, created_at, updated_at
       FROM vaults
       WHERE factory_id = $1
       ORDER BY created_at DESC`,
      [factoryId],
    );

    return rows.map((row) => ({
      id: row.id,
      contractId: row.contract_id,
      factoryId: row.factory_id,
      asset: row.asset,
      name: row.name,
      symbol: row.symbol,
      state: row.state as any,
      totalAssets: row.total_assets,
      totalSupply: row.total_supply,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async getVault(contractId: string): Promise<Vault | null> {
    const rows = await query<{
      id: number;
      contract_id: string;
      factory_id: string | null;
      asset: string;
      name: string | null;
      symbol: string | null;
      state: string;
      total_assets: string;
      total_supply: string;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT id, contract_id, factory_id, asset, name, symbol, state,
              total_assets, total_supply, created_at, updated_at
       FROM vaults
       WHERE contract_id = $1`,
      [contractId],
    );

    if (rows.length === 0) return null;

    const row = rows[0];
    return {
      id: row.id,
      contractId: row.contract_id,
      factoryId: row.factory_id,
      asset: row.asset,
      name: row.name,
      symbol: row.symbol,
      state: row.state as any,
      totalAssets: row.total_assets,
      totalSupply: row.total_supply,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async getVaultPositions(contractId: string): Promise<UserVaultPosition[]> {
    const rows = await query<{
      id: number;
      user_address: string;
      vault_id: number;
      shares: string;
      deposited: string;
      last_claimed_epoch: number;
      updated_at: Date;
    }>(
      `SELECT uvp.id, uvp.user_address, uvp.vault_id, uvp.shares, 
              uvp.deposited, uvp.last_claimed_epoch, uvp.updated_at
       FROM user_vault_positions uvp
       JOIN vaults v ON uvp.vault_id = v.id
       WHERE v.contract_id = $1
       ORDER BY uvp.shares DESC`,
      [contractId],
    );

    return rows.map((row) => ({
      id: row.id,
      userAddress: row.user_address,
      vaultId: row.vault_id,
      shares: row.shares,
      deposited: row.deposited,
      lastClaimedEpoch: row.last_claimed_epoch,
      updatedAt: row.updated_at,
    }));
  }

  async upsertVault(vault: Partial<Vault> & { contractId: string }): Promise<void> {
    const {
      contractId,
      factoryId = null,
      asset = "",
      name = null,
      symbol = null,
      state = "Funding",
      totalAssets = "0",
      totalSupply = "0",
    } = vault;

    logger.info(
      { contractId, factoryId, name, asset },
      "Upserting vault into database",
    );

    await query(
      `INSERT INTO vaults (contract_id, factory_id, asset, name, symbol, state, total_assets, total_supply, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       ON CONFLICT (contract_id)
       DO UPDATE SET
         factory_id = COALESCE(EXCLUDED.factory_id, vaults.factory_id),
         asset = COALESCE(EXCLUDED.asset, vaults.asset),
         name = COALESCE(EXCLUDED.name, vaults.name),
         symbol = COALESCE(EXCLUDED.symbol, vaults.symbol),
         state = COALESCE(EXCLUDED.state, vaults.state),
         total_assets = COALESCE(EXCLUDED.total_assets, vaults.total_assets),
         total_supply = COALESCE(EXCLUDED.total_supply, vaults.total_supply),
         updated_at = NOW()`,
      [contractId, factoryId, asset, name, symbol, state, totalAssets, totalSupply],
    );

    logger.info({ contractId }, "Vault upserted successfully");
  }
}
