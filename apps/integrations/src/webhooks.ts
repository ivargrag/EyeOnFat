/**
 * W4 — signed outbound webhooks (HMAC-SHA256) for every domain event.
 * Zapier/Make connectors build on this + the public API.
 */
import { createHmac } from 'node:crypto';
import type { ChannelAdapter, DomainEvent } from './notify.js';

export interface WebhookTarget { url: string; secret: string }

export class WebhookDispatcher implements ChannelAdapter {
  readonly channel = 'webhook' as const;
  constructor(private targets: WebhookTarget[] = []) {}

  configured(): boolean { return this.targets.length > 0; }

  sign(secret: string, body: string, ts: string): string {
    return createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
  }

  async deliver(event: DomainEvent): Promise<void> {
    const body = JSON.stringify(event);
    const ts = String(Math.floor(Date.now() / 1000));
    await Promise.allSettled(this.targets.map((t) =>
      fetch(t.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-eof-timestamp': ts,
          'x-eof-signature': `v1=${this.sign(t.secret, body, ts)}`,
        },
        body,
      })));
  }
}
