import { readFileSync } from "fs";
import { Router } from "express";
import { pool } from "../../db/index.js";

const { version } = JSON.parse(
  readFileSync(new URL("../../../package.json", import.meta.url), "utf-8"),
) as { version: string };

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ version, status: "ok" });
  } catch {
    res.status(503).json({ version, status: "error" });
  }
});
