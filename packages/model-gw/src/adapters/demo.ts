/**
 * Demo adapter — deterministic engine used when no provider key is configured
 * (and for CI). Responses are supplied by the caller via a resolver so the
 * gateway stays content-agnostic; packages/agents registers the demo corpus.
 */
import type {
  CompleteRequest, CompleteResponse, EmbedResponse, ProviderAdapter,
  ToolCallRequest, ToolCallResponse,
} from '../types.js';

export type DemoResolver = (req: CompleteRequest) => string;

const fallbackResolver: DemoResolver = (req) => {
  const last = req.messages[req.messages.length - 1]?.content ?? '';
  return JSON.stringify({
    note: 'demo-engine deterministic response',
    echo: last.slice(0, 120),
  });
};

export class DemoAdapter implements ProviderAdapter {
  readonly provider = 'demo';
  constructor(private resolver: DemoResolver = fallbackResolver) {}

  setResolver(r: DemoResolver) { this.resolver = r; }
  available(): boolean { return true; }

  async complete(_modelId: string, req: CompleteRequest): Promise<CompleteResponse> {
    const text = this.resolver(req);
    return { text, usage: { inputTokens: 0, outputTokens: 0 }, stopReason: 'end_turn' };
  }

  async stream(modelId: string, req: CompleteRequest, onDelta: (t: string) => void): Promise<CompleteResponse> {
    const res = await this.complete(modelId, req);
    // stream in word chunks for a realistic ticker
    for (const chunk of res.text.split(/(?<=\s)/)) onDelta(chunk);
    return res;
  }

  async toolCall(modelId: string, req: ToolCallRequest): Promise<ToolCallResponse> {
    const res = await this.complete(modelId, req);
    return { text: res.text, toolCalls: [], usage: res.usage };
  }

  async embed(_modelId: string, texts: string[]): Promise<EmbedResponse> {
    // stable pseudo-embeddings (djb2 over 8 dims) — enough for dev search
    const embeddings = texts.map((t) => {
      const v = new Array(8).fill(0);
      for (let i = 0; i < t.length; i++) v[i % 8] = (v[i % 8] * 31 + t.charCodeAt(i)) % 997;
      return v.map((x) => x / 997);
    });
    return { embeddings, usage: { inputTokens: 0, outputTokens: 0 } };
  }
}
