import { Router } from "express";
import { z } from "zod";
import {
  listVaults,
  getVaultCount,
  listVaultsByFactory,
  getVault,
  getVaultPositions,
} from "../controllers/vaults.js";
import { validateParams, validateQuery } from "../middleware/validate.js";

const contractAddressSchema = z.string().length(56).regex(/^C[A-Z2-7]{55}$/);

const listVaultsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  state: z.string().optional(),
  sort: z.enum(["created_at", "total_assets"]).default("created_at"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

const vaultParamsSchema = z.object({
  contractId: contractAddressSchema,
});

const vaultFactoryParamsSchema = z.object({
  factoryId: contractAddressSchema,
});

export const vaultsRouter = Router();

vaultsRouter.get("/", validateQuery(listVaultsQuerySchema), listVaults);
vaultsRouter.get("/count", getVaultCount);
vaultsRouter.get("/factory/:factoryId", validateParams(vaultFactoryParamsSchema), listVaultsByFactory);
vaultsRouter.get("/:contractId/positions", validateParams(vaultParamsSchema), getVaultPositions);
vaultsRouter.get("/:contractId", validateParams(vaultParamsSchema), getVault);
