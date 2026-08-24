/**
 * Domain-event → notification fan-out contract. The API emits DomainEvents;
 * each registered channel adapter renders and delivers them.
 */
export type DomainEventType =
  | 'gate.opened' | 'gate.signed' | 'gate.rejected'
  | 'coach.paused' | 'coach.completed'
  | 'procura.bid_received' | 'procura.award'
  | 'project.stage_changed' | 'milestone.slipping';

export interface DomainEvent {
  id: string;
  tenantId: string;
  type: DomainEventType;
  ts: string;
  objectType: string;
  objectRef: string;
  payload: Record<string, unknown>;
  /** Deep link into the exact project/gate in the web app (T4). */
  deepLink: string;
}

export interface ChannelAdapter {
  readonly channel: 'teams' | 'slack' | 'email' | 'webhook';
  configured(): boolean;
  deliver(event: DomainEvent): Promise<void>;
}

const adapters: ChannelAdapter[] = [];
export function registerChannel(a: ChannelAdapter): void { adapters.push(a); }

export async function dispatch(event: DomainEvent): Promise<void> {
  await Promise.allSettled(adapters.filter((a) => a.configured()).map((a) => a.deliver(event)));
}
