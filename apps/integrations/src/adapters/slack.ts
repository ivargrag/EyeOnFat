/**
 * S1 — Slack adapter scaffold: Block Kit approvals, /eof commands, digests.
 *
 * Wiring steps (production): create the Slack app from a manifest with
 * chat:write + commands + links:read scopes; set SLACK_BOT_TOKEN and
 * SLACK_SIGNING_SECRET; deploy an interactivity endpoint that maps the Slack
 * user (via SSO-linked email) to an EoF user and submits the gate signature
 * AS THAT HUMAN with channel='slack'. The bot itself can never sign.
 */
import type { ChannelAdapter, DomainEvent } from '../notify.js';

export function gateApprovalBlocks(e: DomainEvent): unknown[] {
  const gateId = String(e.payload.gateId ?? '');
  return [
    { type: 'section', text: { type: 'mrkdwn', text: `◆ *Gate ${gateId}* awaiting your signature\n${String(e.payload.title ?? e.objectType)}` } },
    {
      type: 'actions',
      elements: [
        { type: 'button', style: 'primary', text: { type: 'plain_text', text: 'Approve' }, action_id: 'gate_approve', value: e.objectRef },
        { type: 'button', text: { type: 'plain_text', text: 'Hold' }, action_id: 'gate_hold', value: e.objectRef },
        { type: 'button', style: 'danger', text: { type: 'plain_text', text: 'Reject' }, action_id: 'gate_reject', value: e.objectRef },
        { type: 'button', text: { type: 'plain_text', text: 'Open in Eye on Fat' }, url: e.deepLink, action_id: 'open' },
      ],
    },
  ];
}

export class SlackAdapter implements ChannelAdapter {
  readonly channel = 'slack' as const;
  constructor(
    private botToken = process.env.SLACK_BOT_TOKEN ?? '',
    private defaultChannel = process.env.SLACK_DEFAULT_CHANNEL ?? '',
  ) {}

  configured(): boolean { return Boolean(this.botToken && this.defaultChannel); }

  async deliver(event: DomainEvent): Promise<void> {
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.botToken}` },
      body: JSON.stringify({ channel: this.defaultChannel, blocks: gateApprovalBlocks(event), text: `Gate ${String(event.payload.gateId ?? '')} pending` }),
    });
  }
}
