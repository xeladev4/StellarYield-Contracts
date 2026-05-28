import type { Epoch } from "../types/index.js";
import { query } from "../db/index.js";

export class YieldService {
  async getVaultEpochs(contractId: string): Promise<Epoch[]> {
    const rows = await query<{
      id: number;
      vault_id: number;
      epoch: number;
      yield_amount: string;
      total_shares: string;
      distributed_at: Date | null;
    }>(
      `SELECT e.id, e.vault_id, e.epoch, e.yield_amount, e.total_shares, e.distributed_at
       FROM epochs e
       JOIN vaults v ON e.vault_id = v.id
       WHERE v.contract_id = $1
       ORDER BY e.epoch ASC`,
      [contractId],
    );

    return rows.map((row) => ({
      id: row.id,
      vaultId: row.vault_id,
      epoch: row.epoch,
      yieldAmount: row.yield_amount,
      totalShares: row.total_shares,
      distributedAt: row.distributed_at,
    }));
  }

  async getUserPendingYield(
    contractId: string,
    userAddress: string,
  ): Promise<{ pendingYield: string; epochs: number[]; claimedEpochs: number[] }> {
    const positionRows = await query<{
      shares: string;
      last_claimed_epoch: number;
    }>(
      `SELECT uvp.shares, uvp.last_claimed_epoch
       FROM user_vault_positions uvp
       JOIN vaults v ON uvp.vault_id = v.id
       WHERE v.contract_id = $1 AND uvp.user_address = $2`,
      [contractId, userAddress],
    );

    const position = positionRows[0];
    const lastClaimedEpoch = position?.last_claimed_epoch ?? -1;
    const shares = BigInt(position?.shares ?? "0");

    const epochRows = await query<{
      epoch: number;
      yield_amount: string;
      total_shares: string;
    }>(
      `SELECT e.epoch, e.yield_amount, e.total_shares
       FROM epochs e
       JOIN vaults v ON e.vault_id = v.id
       WHERE v.contract_id = $1
       ORDER BY e.epoch ASC`,
      [contractId],
    );

    const pendingEpochs: number[] = [];
    const claimedEpochs: number[] = [];
    let pendingYield = BigInt(0);

    for (const row of epochRows) {
      if (row.epoch <= lastClaimedEpoch) {
        claimedEpochs.push(row.epoch);
      } else {
        pendingEpochs.push(row.epoch);
        const totalShares = BigInt(row.total_shares);
        if (totalShares > BigInt(0)) {
          pendingYield += (shares * BigInt(row.yield_amount)) / totalShares;
        }
      }
    }

    return {
      pendingYield: pendingYield.toString(),
      epochs: pendingEpochs,
      claimedEpochs,
    };
  }

  async getYieldSummary(contractId: string): Promise<{
    totalEpochs: string;
    totalYieldDistributed: string;
    averageYieldPerEpoch: string;
  }> {
    const rows = await query<{
      total_epochs: string;
      total_yield: string;
    }>(
      `SELECT COUNT(e.id)::text AS total_epochs,
              COALESCE(SUM(e.yield_amount::numeric), 0)::text AS total_yield
       FROM epochs e
       JOIN vaults v ON e.vault_id = v.id
       WHERE v.contract_id = $1`,
      [contractId],
    );

    const totalEpochs = BigInt(rows[0]?.total_epochs ?? "0");
    const totalYield = BigInt(rows[0]?.total_yield ?? "0");
    const average = totalEpochs > BigInt(0) ? totalYield / totalEpochs : BigInt(0);

    return {
      totalEpochs: totalEpochs.toString(),
      totalYieldDistributed: totalYield.toString(),
      averageYieldPerEpoch: average.toString(),
    };
  }

  async recordEpoch(
    vaultId: number,
    epoch: number,
    yieldAmount: string,
    totalShares: string,
  ): Promise<void> {
    await query(
      `INSERT INTO epochs (vault_id, epoch, yield_amount, total_shares, distributed_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (vault_id, epoch) DO NOTHING`,
      [vaultId, epoch, yieldAmount, totalShares],
    );
  }
}
