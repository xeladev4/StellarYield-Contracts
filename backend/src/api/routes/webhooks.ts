import { Router } from "express";
import { z } from "zod";
import { createWebhook, listWebhooks, deleteWebhook } from "../controllers/webhooks.js";
import { requireApiKey } from "../middleware/auth.js";
import { validateBody, validateParams } from "../middleware/validate.js";

const KNOWN_EVENTS = [
  "deposit",
  "yield_distributed",
  "vault_state_changed",
  "vault_created",
] as const;

const createWebhookSchema = z.object({
  url: z
    .string()
    .url()
    .refine((v) => v.startsWith("https://"), { message: "Webhook URL must use HTTPS" }),
  events: z
    .array(z.enum(KNOWN_EVENTS))
    .min(1, "At least one event must be specified"),
  secret: z.string().optional(),
});

const webhookParamsSchema = z.object({
  id: z.string().regex(/^\d+$/, "ID must be a positive integer"),
});

export const webhooksRouter = Router();

webhooksRouter.use(requireApiKey());

webhooksRouter.post("/", validateBody(createWebhookSchema), createWebhook);
webhooksRouter.get("/", listWebhooks);
webhooksRouter.delete("/:id", validateParams(webhookParamsSchema), deleteWebhook);
