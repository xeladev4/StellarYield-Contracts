import type { Request, Response, NextFunction } from "express";
import { VaultService } from "../../services/vault.js";
import { readTotalAssets, readVaultState } from "../../services/stellar.js";

const vaultService = new VaultService();

function setCacheHeaders(res: Response): void {
  res.set("Cache-Control", "max-age=10, stale-while-revalidate=60");
}

export async function listVaults(req: Request, res: Response, next: NextFunction) {
  try {
    const {
      page,
      pageSize,
      state,
      sort,
      order,
    } = req.query as unknown as {
      page: number;
      pageSize: number;
      state?: string;
      sort: "created_at" | "total_assets";
      order: "asc" | "desc";
    };
    const result = await vaultService.listVaults({ page, pageSize, state, sort, order });
    setCacheHeaders(res);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getVaultCount(_req: Request, res: Response, next: NextFunction) {
  try {
    const total = await vaultService.countVaults();
    setCacheHeaders(res);
    res.json({ total });
  } catch (err) {
    next(err);
  }
}

export async function listVaultsByFactory(req: Request, res: Response, next: NextFunction) {
  try {
    const vaults = await vaultService.listVaultsByFactory(String(req.params["factoryId"]));
    setCacheHeaders(res);
    res.json(vaults);
  } catch (err) {
    next(err);
  }
}

export async function getVault(req: Request, res: Response, next: NextFunction) {
  try {
    const vault = await vaultService.getVault(String(req.params["contractId"]));
    if (!vault) {
      res.status(404).json({ error: "NotFound", message: "Vault not found" });
      return;
    }
    setCacheHeaders(res);
    res.json(vault);
  } catch (err) {
    next(err);
  }
}

export async function getVaultLiveState(req: Request, res: Response) {
  try {
    const state = await readVaultState(String(req.params["contractId"]));
    res.json({ state });
  } catch (_err) {
    res.status(500).json({
      error: "RpcError",
      message: "Failed to read live vault state from chain",
    });
  }
}

export async function getVaultLiveTotalAssets(req: Request, res: Response) {
  try {
    const totalAssets = await readTotalAssets(String(req.params["contractId"]));
    res.json({ totalAssets: totalAssets.toString() });
  } catch (_err) {
    res.status(500).json({
      error: "RpcError",
      message: "Failed to read live total assets from chain",
    });
  }
}

export async function getVaultPositions(req: Request, res: Response, next: NextFunction) {
  try {
    const positions = await vaultService.getVaultPositions(String(req.params["contractId"]));
    res.json(positions);
  } catch (err) {
    next(err);
  }
}
