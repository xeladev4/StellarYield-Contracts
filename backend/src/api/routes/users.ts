import { Router } from "express";
import { z } from "zod";
import {
  getUser,
  getUserKyc,
  getUserPortfolio,
  searchUsers,
} from "../controllers/users.js";
import {
  validateParams,
  validateQuery,
  stellarAddressSchema,
} from "../middleware/validate.js";

export const usersRouter = Router();

const addressParamSchema = z.object({
  address: stellarAddressSchema,
});

const searchQuerySchema = z.object({
  search: z.string().min(4, "Search query must be at least 4 characters long"),
});

const kycQuerySchema = z.object({
  vaultId: z.string().length(56).regex(/^C[A-Z2-7]{55}$/),
});

usersRouter.get("/", validateQuery(searchQuerySchema), searchUsers);
usersRouter.get(
  "/:address/kyc",
  validateParams(addressParamSchema),
  validateQuery(kycQuerySchema),
  getUserKyc,
);
usersRouter.get("/:address", validateParams(addressParamSchema), getUser);
usersRouter.get(
  "/:address/portfolio",
  validateParams(addressParamSchema),
  getUserPortfolio,
);
