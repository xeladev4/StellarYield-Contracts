import { Router } from "express";
import {
  getVaultEpochs,
  getUserPendingYield,
} from "../controllers/yields.js";

export const yieldsRouter = Router();

yieldsRouter.get("/:contractId/epochs", getVaultEpochs);
yieldsRouter.get("/:contractId/pending/:userAddress", getUserPendingYield);
