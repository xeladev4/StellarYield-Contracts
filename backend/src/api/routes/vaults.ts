import { Router } from "express";
import {
  listVaults,
  getVault,
  getVaultPositions,
} from "../controllers/vaults.js";

export const vaultsRouter = Router();

vaultsRouter.get("/", listVaults);
vaultsRouter.get("/:contractId", getVault);
vaultsRouter.get("/:contractId/positions", getVaultPositions);
