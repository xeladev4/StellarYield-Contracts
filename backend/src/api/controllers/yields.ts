import type { Request, Response, NextFunction } from "express";
import { YieldService } from "../../services/yield.js";

const yieldService = new YieldService();

export async function getVaultEpochs(req: Request, res: Response, next: NextFunction) {
  try {
    const epochs = await yieldService.getVaultEpochs(req.params["contractId"]!);
    res.json(epochs);
  } catch (err) {
    next(err);
  }
}

export async function getUserPendingYield(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await yieldService.getUserPendingYield(
      req.params["contractId"]!,
      req.params["userAddress"]!,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}
