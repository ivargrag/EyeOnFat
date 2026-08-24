/**
 * T1–T4 — Microsoft Teams adapter scaffold.
 *
 * Wiring steps (production):
 *  1. Register an Entra ID app + Azure Bot resource; enable the Teams channel.
 *  2. Set TEAMS_APP_ID / TEAMS_APP_PASSWORD; deploy this adapter as the bot
 *     messaging endpoint (POST /api/messages via Bot Framework).
 *  3. Adaptive Card approvals: the card's Action.Execute posts back here; the
 *     activity's AAD user is mapped to an EoF user via SSO (Entra oid → user),
 *     and the gate signature is submitted to the EoF API AS THAT HUMAN with
 *     channel='teams'. Bots cannot sign gates — the API enforces this.
 *  4. Tab app: point a static tab at the web /dashboard with SSO silent auth.
 */
import type { ChannelAdapter, DomainEvent } from '../notify.js';

export interface AdaptiveCard { type: 'AdaptiveCard'; version: string; body: unknown[]; actions?: unknown[] }

/** Render a gate-approval Adaptive Card (dual-sign flows collect both signatures). */
export function gateApprovalCard(e: DomainEvent): AdaptiveCard {
  const gateId = String(e.payload.gateId ?? '');
  return {
    type: 'AdaptiveCard', version: '1.5',
    body: [
      { type: 'TextBlock', size: 'Medium', weight: 'Bolder', text: `◆ Gate ${gateId} awaiting your signature` },
      { type: 'TextBlock', wrap: true, text: String(e.payload.title ?? e.objectType) },
      { type: 'Input.Text', id: 'note', placeholder: 'Reason / note (recorded to the audit log)' },
    ],
    actions: [
      { type: 'Action.Execute', title: 'Approve', verb: 'gate.sign', data: { gateRef: e.objectRef, decision: 'approve' } },
      { type: 'Action.Execute', title: 'Hold', verb: 'gate.sign', data: { gateRef: e.objectRef, decision: 'hold' } },
      { type: 'Action.Execute', title: 'Reject', verb: 'gate.sign', data: { gateRef: e.objectRef, decision: 'reject' } },
      { type: 'Action.OpenUrl', title: 'Open in Eye on Fat', url: e.deepLink },
    ],
  };
}

export class TeamsAdapter implements ChannelAdapter {
  readonly channel = 'teams' as const;
  constructor(
    private appId = process.env.TEAMS_APP_ID ?? '',
    private appPassword = process.env.TEAMS_APP_PASSWORD ?? '',
    private webhookUrl = process.env.TEAMS_CHANNEL_WEBHOOK ?? '', // incoming-webhook fallback for digests
  ) {}

  configured(): boolean { return Boolean(this.webhookUrl || (this.appId && this.appPassword)); }

  async deliver(event: DomainEvent): Promise<void> {
    if (!this.webhookUrl) return; // full bot delivery requires the Bot Framework wiring above
    await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'message',
        attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', content: gateApprovalCard(event) }],
      }),
    });
  }
}
