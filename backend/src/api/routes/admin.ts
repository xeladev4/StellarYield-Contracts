import { Router } from "express";
import { getAdminStats, getAdminIndexer, getAdminEvents, getVaultAudit } from "../controllers/admin.js";
import { requireApiKey } from "../middleware/auth.js";

export const adminRouter = Router();

adminRouter.use(requireApiKey({ role: "admin" }));

adminRouter.get("/stats", getAdminStats);
adminRouter.get("/indexer", getAdminIndexer);
adminRouter.get("/events", getAdminEvents);
// Per-vault audit trail: GET /api/v1/admin/vaults/:contractId/audit
adminRouter.get("/vaults/:contractId/audit", getVaultAudit);
