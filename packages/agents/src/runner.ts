/**
 * Agent step execution — builds the prompt, calls the ModelGateway, and
 * enforces the grounding contract: outputs without provenance become refusals
 * (invariant #8), never guesses.
 */
import type { ModelGateway } from '@eof/model-gw';
import { rosterByName } from './roster.js';
import { neutraliseUntrusted, renderPrompt } from './prompts.js';
import type { AgentName } from '@eof/domain';

export interface AgentStepResult {
  ok: boolean;
  refused: boolean;
  output: Record<string, unknown>;
  provenance: Array<Record<string, unknown>>;
  modelUsed: string;
  tokensIn: number;
  tokensOut: number;
}

export async function runAgentStep(
  gateway: ModelGateway,
  args: {
    tenantId: string;
    agent: AgentName;
    context: Record<string, unknown>;
    /** Ingested/untrusted document text, neutralised before inclusion. */
    untrustedContent?: string;
  },
): Promise<AgentStepResult> {
  const def = rosterByName.get(args.agent);
  if (!def) throw new Error(`Unknown agent: ${args.agent}`);

  const contextBlock = [
    JSON.stringify(args.context, null, 2),
    args.untrustedContent ? neutraliseUntrusted(args.untrustedContent) : '',
  ].filter(Boolean).join('\n\n');

  const prompt = renderPrompt(def.promptFile, { context: contextBlock });
  const res = await gateway.complete(
    { tenantId: args.tenantId, agent: args.agent },
    { messages: [{ role: 'user', content: prompt }], json: true, temperature: 0.2 },
  );

  let parsed: Record<string, unknown>;
  try {
    const jsonText = res.text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    parsed = JSON.parse(jsonText);
  } catch {
    return {
      ok: false, refused: true,
      output: { refusal: 'unparseable model output', raw: res.text.slice(0, 500) },
      provenance: [], modelUsed: res.modelUsed,
      tokensIn: res.usage.inputTokens, tokensOut: res.usage.outputTokens,
    };
  }

  const refused = typeof parsed.refusal === 'string';
  const provenance = Array.isArray(parsed.provenance) ? parsed.provenance : [];
  // Grounding contract: non-refusal outputs must carry provenance (council
  // outputs carry per-stance provenance instead).
  const hasStanceProv = Array.isArray(parsed.stances);
  if (!refused && provenance.length === 0 && !hasStanceProv) {
    return {
      ok: false, refused: true,
      output: { refusal: 'insufficient data', missing: ['output carried no provenance — refusing rather than guessing'] },
      provenance: [], modelUsed: res.modelUsed,
      tokensIn: res.usage.inputTokens, tokensOut: res.usage.outputTokens,
    };
  }
  return {
    ok: !refused, refused,
    output: parsed, provenance: provenance as Array<Record<string, unknown>>,
    modelUsed: res.modelUsed,
    tokensIn: res.usage.inputTokens, tokensOut: res.usage.outputTokens,
  };
}

/** Run the Lever Council (F7.6) — one gateway call producing structured stances. */
export async function runCouncil(
  gateway: ModelGateway,
  args: { tenantId: string; context: Record<string, unknown>; participants: AgentName[] },
): Promise<AgentStepResult> {
  const prompt = renderPrompt('council.md', {
    context: `Participants: ${args.participants.join(', ')}\n\n${JSON.stringify(args.context, null, 2)}`,
  });
  const res = await gateway.complete(
    { tenantId: args.tenantId, agent: 'COACH' },
    { messages: [{ role: 'user', content: prompt }], json: true, temperature: 0.4 },
  );
  try {
    const parsed = JSON.parse(res.text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, ''));
    return {
      ok: true, refused: false, output: parsed, provenance: [],
      modelUsed: res.modelUsed, tokensIn: res.usage.inputTokens, tokensOut: res.usage.outputTokens,
    };
  } catch {
    return {
      ok: false, refused: true, output: { refusal: 'unparseable council output' }, provenance: [],
      modelUsed: res.modelUsed, tokensIn: res.usage.inputTokens, tokensOut: res.usage.outputTokens,
    };
  }
}
