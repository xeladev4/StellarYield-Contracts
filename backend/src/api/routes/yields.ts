import { Router } from "express";
import { z } from "zod";
import {
  getVaultEpochs,
  getUserPendingYield,
  getYieldSummary,
} from "../controllers/yields.js";
import { validateQuery } from "../middleware/validate.js";

const epochQuerySchema = z.object({
  epoch: z.coerce.number().int().positive().optional(),
});

export const yieldsRouter = Router();

yieldsRouter.get("/:contractId/summary", getYieldSummary);
yieldsRouter.get("/:contractId/epochs", validateQuery(epochQuerySchema), getVaultEpochs);
yieldsRouter.get("/:contractId/pending/:userAddress", getUserPendingYield);
