export class NotificationService {
  async notify(_event: string, _data: Record<string, unknown>): Promise<void> {
    throw new Error("Not implemented");
  }

  async registerWebhook(_url: string, _events: string[], _secret?: string): Promise<void> {
    throw new Error("Not implemented");
  }
}
