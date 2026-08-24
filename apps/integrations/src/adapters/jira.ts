/**
 * W1 — PM-tool adapter pattern (Jira first). Two-way milestone sync:
 * EoF milestones mirror to a board; status flows back. EoF remains the
 * system of record for savings.
 */
export interface MilestoneSyncMapping {
  tenantId: string;
  projectId: string;        // EoF project
  externalProjectKey: string; // e.g. Jira project key
  issueTypeId: string;
}

export interface PmToolAdapter {
  readonly tool: 'jira' | 'asana' | 'monday' | 'azure_devops';
  configured(): boolean;
  pushMilestone(m: MilestoneSyncMapping, milestone: { id: string; name: string; owner: string; due: string | null; pct: number }): Promise<{ externalId: string }>;
  pullStatus(m: MilestoneSyncMapping): Promise<Array<{ externalId: string; done: boolean; pct: number }>>;
}

export class JiraAdapter implements PmToolAdapter {
  readonly tool = 'jira' as const;
  constructor(
    private baseUrl = process.env.JIRA_BASE_URL ?? '',
    private email = process.env.JIRA_EMAIL ?? '',
    private apiToken = process.env.JIRA_API_TOKEN ?? '',
  ) {}

  configured(): boolean { return Boolean(this.baseUrl && this.email && this.apiToken); }

  private get auth() { return `Basic ${Buffer.from(`${this.email}:${this.apiToken}`).toString('base64')}`; }

  async pushMilestone(m: MilestoneSyncMapping, milestone: { id: string; name: string; owner: string; due: string | null; pct: number }): Promise<{ externalId: string }> {
    const res = await fetch(`${this.baseUrl}/rest/api/3/issue`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: this.auth },
      body: JSON.stringify({
        fields: {
          project: { key: m.externalProjectKey },
          issuetype: { id: m.issueTypeId },
          summary: `[EoF] ${milestone.name}`,
          ...(milestone.due ? { duedate: milestone.due } : {}),
        },
      }),
    });
    if (!res.ok) throw new Error(`Jira issue create failed (${res.status})`);
    const data = await res.json() as { key: string };
    return { externalId: data.key };
  }

  async pullStatus(m: MilestoneSyncMapping): Promise<Array<{ externalId: string; done: boolean; pct: number }>> {
    const jql = encodeURIComponent(`project = ${m.externalProjectKey} AND summary ~ "[EoF]"`);
    const res = await fetch(`${this.baseUrl}/rest/api/3/search?jql=${jql}&fields=status`, {
      headers: { authorization: this.auth },
    });
    if (!res.ok) throw new Error(`Jira search failed (${res.status})`);
    const data = await res.json() as { issues: Array<{ key: string; fields: { status: { statusCategory: { key: string } } } }> };
    return data.issues.map((i) => ({
      externalId: i.key,
      done: i.fields.status.statusCategory.key === 'done',
      pct: i.fields.status.statusCategory.key === 'done' ? 100 : 50,
    }));
  }
}
