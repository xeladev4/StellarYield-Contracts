import { Router } from "express";
import { getAdminStats, getAdminIndexer, getAdminEvents } from "../controllers/admin.js";
import { requireApiKey } from "../middleware/auth.js";

export const adminRouter = Router();

adminRouter.use(requireApiKey({ role: "admin" }));

adminRouter.get("/stats", getAdminStats);
adminRouter.get("/indexer", getAdminIndexer);
adminRouter.get("/events", getAdminEvents);
