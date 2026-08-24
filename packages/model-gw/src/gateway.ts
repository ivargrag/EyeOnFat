/**
 * ModelGateway — the single door to every LLM (invariant #7).
 * Model selection: explicit binding → tenant per-agent binding → MODEL_DEFAULT
 * → first active registry model whose provider is available → demo-engine.
 */
import { AnthropicAdapter } from './adapters/anthropic.js';
import { OpenAIAdapter } from './adapters/openai.js';
import { DemoAdapter, type DemoResolver } from './adapters/demo.js';
import type {
  CompleteRequest, CompleteResponse, GatewayTelemetry, ProviderAdapter,
  RegistryModel, ToolCallRequest, ToolCallResponse,
} from './types.js';

export interface GatewayOptions {
  /** Load the model registry (DB-backed in the API; static in tests). */
  loadRegistry: () => Promise<RegistryModel[]>;
  /** Per-tenant, per-agent model binding lookup (optional). */
  agentBinding?: (tenantId: string, agent: string) => Promise<string | null>;
  onTelemetry?: (t: GatewayTelemetry) => void;
  demoResolver?: DemoResolver;
  defaultModel?: string;
}

export class ModelGateway {
  private adapters: Map<string, ProviderAdapter>;
  private demo: DemoAdapter;
  private registryCache: RegistryModel[] | null = null;
  private registryLoadedAt = 0;

  constructor(private opts: GatewayOptions) {
    this.demo = new DemoAdapter(opts.demoResolver);
    this.adapters = new Map<string, ProviderAdapter>([
      ['anthropic', new AnthropicAdapter()],
      ['openai', new OpenAIAdapter()],
      ['demo', this.demo],
    ]);
  }

  /** Register an additional provider adapter (bedrock, vertex, local/vLLM…). */
  registerAdapter(adapter: ProviderAdapter): void {
    this.adapters.set(adapter.provider, adapter);
  }

  setDemoResolver(r: DemoResolver): void { this.demo.setResolver(r); }

  private async registry(): Promise<RegistryModel[]> {
    const TTL = 60_000;
    if (!this.registryCache || Date.now() - this.registryLoadedAt > TTL) {
      this.registryCache = await this.opts.loadRegistry();
      this.registryLoadedAt = Date.now();
    }
    return this.registryCache;
  }

  /** Resolve which model+adapter will serve this call. */
  async resolve(ctx: { tenantId?: string; agent?: string; modelId?: string }): Promise<{ model: RegistryModel; adapter: ProviderAdapter }> {
    const registry = await this.registry();
    const usable = (m?: RegistryModel) => {
      if (!m || m.status === 'deprecated') return null;
      const a = this.adapters.get(m.provider);
      return a?.available() ? { model: m, adapter: a } : null;
    };

    if (ctx.modelId) {
      const hit = usable(registry.find((m) => m.modelId === ctx.modelId));
      if (hit) return hit;
    }
    if (ctx.tenantId && ctx.agent && this.opts.agentBinding) {
      const bound = await this.opts.agentBinding(ctx.tenantId, ctx.agent);
      const hit = usable(registry.find((m) => m.modelId === bound));
      if (hit) return hit;
    }
    const def = usable(registry.find((m) => m.modelId === (this.opts.defaultModel ?? process.env.MODEL_DEFAULT)));
    if (def) return def;
    for (const m of registry.filter((m) => m.status === 'active')) {
      const hit = usable(m);
      if (hit && hit.adapter.provider !== 'demo') return hit;
    }
    const demoModel = registry.find((m) => m.provider === 'demo')
      ?? { modelId: 'demo-engine', provider: 'demo', capabilities: [], contextWindow: 1e6, costInPerM: 0, costOutPerM: 0, status: 'active' as const };
    return { model: demoModel, adapter: this.demo };
  }

  private emit(model: RegistryModel, ctx: { tenantId?: string; agent?: string }, usage: { inputTokens: number; outputTokens: number }, start: number) {
    this.opts.onTelemetry?.({
      modelId: model.modelId, provider: model.provider,
      agent: ctx.agent, tenantId: ctx.tenantId, usage,
      costUsd: (usage.inputTokens * model.costInPerM + usage.outputTokens * model.costOutPerM) / 1_000_000,
      latencyMs: Date.now() - start,
    });
  }

  async complete(ctx: { tenantId?: string; agent?: string; modelId?: string }, req: CompleteRequest): Promise<CompleteResponse & { modelUsed: string }> {
    const { model, adapter } = await this.resolve(ctx);
    const start = Date.now();
    const res = await adapter.complete(model.modelId, req);
    this.emit(model, ctx, res.usage, start);
    return { ...res, modelUsed: model.modelId };
  }

  async stream(ctx: { tenantId?: string; agent?: string; modelId?: string }, req: CompleteRequest, onDelta: (t: string) => void): Promise<CompleteResponse & { modelUsed: string }> {
    const { model, adapter } = await this.resolve(ctx);
    const start = Date.now();
    const res = await adapter.stream(model.modelId, req, onDelta);
    this.emit(model, ctx, res.usage, start);
    return { ...res, modelUsed: model.modelId };
  }

  async toolCall(ctx: { tenantId?: string; agent?: string; modelId?: string }, req: ToolCallRequest): Promise<ToolCallResponse & { modelUsed: string }> {
    const { model, adapter } = await this.resolve(ctx);
    const start = Date.now();
    const res = await adapter.toolCall(model.modelId, req);
    this.emit(model, ctx, res.usage, start);
    return { ...res, modelUsed: model.modelId };
  }
}
