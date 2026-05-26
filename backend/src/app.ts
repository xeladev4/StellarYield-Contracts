import express, { type Express } from "express";
import { healthRouter } from "./api/routes/health.js";
import { vaultsRouter } from "./api/routes/vaults.js";
import { usersRouter } from "./api/routes/users.js";
import { yieldsRouter } from "./api/routes/yields.js";
import { errorHandler } from "./api/middleware/errors.js";

export function createApp(): Express {
  const app = express();

  app.use(express.json());

  app.use("/health", healthRouter);
  app.use("/api/v1/vaults", vaultsRouter);
  app.use("/api/v1/users", usersRouter);
  app.use("/api/v1/yields", yieldsRouter);

  app.use(errorHandler);

  return app;
}
