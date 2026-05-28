import { createHmac } from "crypto";
import { lookup } from "dns/promises";
import { query } from "../db/index.js";
import { logger } from "../logger.js";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "169.254.169.254",
  "100.100.100.200",
]);

function isPrivateIp(ip: string): boolean {
  const v4 = [
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^169\.254\./,
    /^0\./,
  ];
  const v6 = [/^::1$/, /^fe80:/i, /^fc00:/i, /^fd[0-9a-f]{2}:/i, /^::$/];
  return v4.some((r) => r.test(ip)) || v6.some((r) => r.test(ip));
}

export async function validateWebhookUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL");
  }

  if (parsed.protocol !== "https:") throw new Error("Webhook URL must use HTTPS");

  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) throw new Error("Webhook URL hostname is not allowed");

  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new Error("Unable to resolve webhook URL hostname");
  }

  for (const { address } of addresses) {
    if (isPrivateIp(address)) {
      throw new Error("Webhook URL resolves to a private or reserved address");
    }
  }
}

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
    // Re-validate at delivery time to defend against DNS rebinding.
    try {
      await validateWebhookUrl(webhook.url);
    } catch (err) {
      logger.warn(
        { webhookId: webhook.id, url: webhook.url, err },
        "Webhook URL failed SSRF check at delivery; skipping",
      );
      return;
    }

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
        redirect: "manual",
      });

      if (response.status >= 300 && response.status < 400) {
        logger.warn(
          { webhookId: webhook.id, url: webhook.url, status: response.status },
          "Webhook delivery returned redirect; rejected for SSRF protection",
        );
        return;
      }

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
