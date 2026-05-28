import type { Request, Response, NextFunction } from "express";
import { query } from "../../db/index.js";

interface WebhookRow {
  id: number;
  url: string;
  events: string[];
  active: boolean;
  created_at: Date;
}

function formatWebhook(w: WebhookRow) {
  return { id: w.id, url: w.url, events: w.events, active: w.active, createdAt: w.created_at };
}

export async function createWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    const { url, events, secret } = req.body as { url: string; events: string[]; secret?: string };

    const rows = await query<WebhookRow>(
      `INSERT INTO webhooks (url, events, secret)
       VALUES ($1, $2, $3)
       RETURNING id, url, events, active, created_at`,
      [url, events, secret ?? null],
    );

    res.status(201).json(formatWebhook(rows[0]));
  } catch (err) {
    next(err);
  }
}

export async function listWebhooks(_req: Request, res: Response, next: NextFunction) {
  try {
    const rows = await query<WebhookRow>(
      "SELECT id, url, events, active, created_at FROM webhooks WHERE active = TRUE ORDER BY created_at DESC",
    );

    res.json(rows.map(formatWebhook));
  } catch (err) {
    next(err);
  }
}

export async function deleteWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parseInt(req.params["id"] as string, 10);

    const rows = await query<{ id: number }>(
      "UPDATE webhooks SET active = FALSE WHERE id = $1 AND active = TRUE RETURNING id",
      [id],
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "NotFound", message: "Webhook not found" });
      return;
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
