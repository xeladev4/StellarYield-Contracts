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
        continue;
      }

      const totalShares = BigInt(row.total_shares);
      if (totalShares <= BigInt(0)) {
        continue;
      }

      const epochYield = (BigInt(row.yield_amount) * shares) / totalShares;
      if (epochYield > BigInt(0)) {
        pendingYield += epochYield;
        pendingEpochs.push(row.epoch);
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
    estimatedApy: number;
  }> {
    const rows = await query<{
      total_epochs: string;
      total_yield: string;
      first_epoch_at: Date | null;
      last_epoch_at: Date | null;
      total_assets: string | null;
    }>(
      `SELECT COUNT(e.id)::text AS total_epochs,
              COALESCE(SUM(e.yield_amount::numeric), 0)::text AS total_yield,
              MIN(e.distributed_at) AS first_epoch_at,
              MAX(e.distributed_at) AS last_epoch_at,
              MAX(v.total_assets)::text AS total_assets
       FROM epochs e
       JOIN vaults v ON e.vault_id = v.id
       WHERE v.contract_id = $1`,
      [contractId],
    );

    const totalEpochs = BigInt(rows[0]?.total_epochs ?? "0");
    const totalYield = BigInt(rows[0]?.total_yield ?? "0");
    const average = totalEpochs > BigInt(0) ? totalYield / totalEpochs : BigInt(0);

    const SECONDS_PER_YEAR = 365.25 * 24 * 60 * 60;
    let estimatedApy = 0;

    if (totalEpochs >= BigInt(2)) {
      const firstAt = rows[0]?.first_epoch_at;
      const lastAt = rows[0]?.last_epoch_at;
      const totalAssetsNum = Number(rows[0]?.total_assets ?? "0");
      if (firstAt && lastAt && totalAssetsNum > 0) {
        const activeDurationSeconds = (lastAt.getTime() - firstAt.getTime()) / 1000;
        if (activeDurationSeconds > 0) {
          estimatedApy =
            (Number(totalYield) / totalAssetsNum) * (SECONDS_PER_YEAR / activeDurationSeconds);
        }
      }
    }

    return {
      totalEpochs: totalEpochs.toString(),
      totalYieldDistributed: totalYield.toString(),
      averageYieldPerEpoch: average.toString(),
      estimatedApy,
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
