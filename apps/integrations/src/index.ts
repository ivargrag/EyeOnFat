/**
 * apps/integrations — "sit on the side, not in the way" (PRD §6, P4).
 *
 * v1 ships the typed adapter layer and the webhook dispatcher. The Teams bot
 * and Slack app require external app registrations (Entra app + bot channel;
 * Slack app manifest) before they can run — see each adapter file for the
 * exact wiring steps. The CRITICAL invariant is preserved end-to-end: a gate
 * approval arriving from Teams/Slack becomes a signed API call carrying the
 * HUMAN user identity mapped via SSO — never a bot identity.
 */
export * from './webhooks.js';
export * from './notify.js';
export * from './adapters/teams.js';
export * from './adapters/slack.js';
export * from './adapters/jira.js';
