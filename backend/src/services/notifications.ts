import { createHmac } from "crypto";
import { query } from "../db/index.js";
import { logger } from "../logger.js";

interface WebhookRow {
  id: number;
  url: string;
  events: string[];
  secret: string | null;
}

export class NotificationService {
  async notify(event: string, data: Record<string, unknown>): Promise<void> {
    const webhooks = await query<WebhookRow>(
      "SELECT id, url, events, secret FROM webhooks WHERE active = TRUE AND $1 = ANY(events)",
      [event],
    );

    if (webhooks.length === 0) return;

    const payload = JSON.stringify({ event, data, timestamp: new Date().toISOString() });

    await Promise.allSettled(webhooks.map((webhook) => this.deliver(webhook, payload)));
  }

  private async deliver(webhook: WebhookRow, payload: string): Promise<void> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (webhook.secret) {
      const signature = createHmac("sha256", webhook.secret).update(payload).digest("hex");
      headers["X-StellarYield-Signature"] = `sha256=${signature}`;
    }

    try {
      const response = await fetch(webhook.url, {
        method: "POST",
        headers,
        body: payload,
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        logger.warn(
          { webhookId: webhook.id, url: webhook.url, status: response.status },
          "Webhook delivery returned non-2xx status",
        );
      }
    } catch (err) {
      logger.warn({ webhookId: webhook.id, url: webhook.url, err }, "Webhook delivery failed");
    }
  }

  async registerWebhook(url: string, events: string[], secret?: string): Promise<void> {
    await query("INSERT INTO webhooks (url, events, secret) VALUES ($1, $2, $3)", [
      url,
      events,
      secret ?? null,
    ]);
  }
}
