/**
 * OpenAI adapter — Chat Completions + Embeddings over fetch (no SDK dependency).
 */
import type {
  CompleteRequest, CompleteResponse, EmbedResponse, ProviderAdapter,
  ToolCallRequest, ToolCallResponse,
} from '../types.js';

const API = 'https://api.openai.com/v1';

export class OpenAIAdapter implements ProviderAdapter {
  readonly provider = 'openai';
  constructor(private apiKey = process.env.OPENAI_API_KEY ?? '') {}

  available(): boolean { return this.apiKey.length > 0; }

  private async post(path: string, body: Record<string, unknown>): Promise<any> {
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${(await res.text()).slice(0, 400)}`);
    return res.json();
  }

  async complete(modelId: string, req: CompleteRequest): Promise<CompleteResponse> {
    const data = await this.post('/chat/completions', {
      model: modelId, messages: req.messages,
      max_tokens: req.maxTokens ?? 4096, temperature: req.temperature ?? 0.2,
      ...(req.json ? { response_format: { type: 'json_object' } } : {}),
    });
    return {
      text: data.choices?.[0]?.message?.content ?? '',
      usage: { inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0 },
      stopReason: data.choices?.[0]?.finish_reason ?? 'stop',
    };
  }

  async stream(modelId: string, req: CompleteRequest, onDelta: (t: string) => void): Promise<CompleteResponse> {
    const res = await fetch(`${API}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: modelId, messages: req.messages, stream: true,
        max_tokens: req.maxTokens ?? 4096, temperature: req.temperature ?? 0.2,
      }),
    });
    if (!res.ok || !res.body) throw new Error(`OpenAI API ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '', full = '';
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
          const delta = ev.choices?.[0]?.delta?.content;
          if (delta) { full += delta; onDelta(delta); }
        } catch { /* ignore */ }
      }
    }
    return { text: full, usage: { inputTokens: 0, outputTokens: Math.ceil(full.length / 4) }, stopReason: 'stop' };
  }

  async toolCall(modelId: string, req: ToolCallRequest): Promise<ToolCallResponse> {
    const data = await this.post('/chat/completions', {
      model: modelId, messages: req.messages,
      max_tokens: req.maxTokens ?? 4096, temperature: req.temperature ?? 0.2,
      tools: req.tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.inputSchema },
      })),
      tool_choice: req.toolChoice === 'auto' || !req.toolChoice
        ? 'auto' : { type: 'function', function: { name: req.toolChoice.name } },
    });
    const msg = data.choices?.[0]?.message ?? {};
    return {
      text: msg.content ?? null,
      toolCalls: (msg.tool_calls ?? []).map((c: any) => ({
        name: c.function?.name, input: JSON.parse(c.function?.arguments || '{}'),
      })),
      usage: { inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0 },
    };
  }

  async embed(_modelId: string, texts: string[]): Promise<EmbedResponse> {
    const data = await this.post('/embeddings', { model: 'text-embedding-3-small', input: texts });
    return {
      embeddings: data.data.map((d: any) => d.embedding),
      usage: { inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: 0 },
    };
  }
}
