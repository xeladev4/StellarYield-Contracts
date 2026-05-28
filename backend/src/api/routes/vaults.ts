import { Router } from "express";
import {
  listVaults,
  getVaultCount,
  listVaultsByFactory,
  getVault,
  getVaultPositions,
} from "../controllers/vaults.js";

export const vaultsRouter = Router();

vaultsRouter.get("/", listVaults);
vaultsRouter.get("/count", getVaultCount);
vaultsRouter.get("/factory/:factoryId", listVaultsByFactory);
vaultsRouter.get("/:contractId", getVault);
vaultsRouter.get("/:contractId/positions", getVaultPositions);
