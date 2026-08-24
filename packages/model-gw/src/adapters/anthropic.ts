/**
 * Anthropic adapter — raw Messages API over fetch (no SDK dependency).
 */
import type {
  CompleteRequest, CompleteResponse, EmbedResponse, ProviderAdapter,
  ToolCallRequest, ToolCallResponse,
} from '../types.js';

const API = 'https://api.anthropic.com/v1/messages';
const VERSION = '2023-06-01';

function split(messages: CompleteRequest['messages']) {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const rest = messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content }));
  return { system: system || undefined, messages: rest };
}

export class AnthropicAdapter implements ProviderAdapter {
  readonly provider = 'anthropic';
  constructor(private apiKey = process.env.ANTHROPIC_API_KEY ?? '') {}

  available(): boolean { return this.apiKey.length > 0; }

  private async post(body: Record<string, unknown>): Promise<any> {
    const res = await fetch(API, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': VERSION,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 400)}`);
    return res.json();
  }

  async complete(modelId: string, req: CompleteRequest): Promise<CompleteResponse> {
    const { system, messages } = split(req.messages);
    const data = await this.post({
      model: modelId, system, messages,
      max_tokens: req.maxTokens ?? 4096, temperature: req.temperature ?? 0.2,
    });
    const text = (data.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
    return {
      text,
      usage: { inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0 },
      stopReason: data.stop_reason ?? 'end_turn',
    };
  }

  async stream(modelId: string, req: CompleteRequest, onDelta: (t: string) => void): Promise<CompleteResponse> {
    const { system, messages } = split(req.messages);
    const res = await fetch(API, {
      method: 'POST',
      headers: {
        'content-type': 'application/json', 'x-api-key': this.apiKey, 'anthropic-version': VERSION,
      },
      body: JSON.stringify({
        model: modelId, system, messages, stream: true,
        max_tokens: req.maxTokens ?? 4096, temperature: req.temperature ?? 0.2,
      }),
    });
    if (!res.ok || !res.body) throw new Error(`Anthropic API ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '', full = '', inTok = 0, outTok = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const ev = JSON.parse(payload);
          if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
            full += ev.delta.text; onDelta(ev.delta.text);
          }
          if (ev.type === 'message_start') inTok = ev.message?.usage?.input_tokens ?? 0;
          if (ev.type === 'message_delta') outTok = ev.usage?.output_tokens ?? outTok;
        } catch { /* keepalive lines */ }
      }
    }
    return { text: full, usage: { inputTokens: inTok, outputTokens: outTok }, stopReason: 'end_turn' };
  }

  async toolCall(modelId: string, req: ToolCallRequest): Promise<ToolCallResponse> {
    const { system, messages } = split(req.messages);
    const data = await this.post({
      model: modelId, system, messages,
      max_tokens: req.maxTokens ?? 4096, temperature: req.temperature ?? 0.2,
      tools: req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema })),
      tool_choice: req.toolChoice === 'auto' || !req.toolChoice
        ? { type: 'auto' } : { type: 'tool', name: req.toolChoice.name },
    });
    const blocks: any[] = data.content ?? [];
    return {
      text: blocks.filter((b) => b.type === 'text').map((b) => b.text).join('') || null,
      toolCalls: blocks.filter((b) => b.type === 'tool_use').map((b) => ({ name: b.name, input: b.input ?? {} })),
      usage: { inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0 },
    };
  }

  async embed(): Promise<EmbedResponse> {
    throw new Error('Anthropic adapter does not provide embeddings; bind an embedding-capable model.');
  }
}
