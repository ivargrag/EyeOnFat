/**
 * Model Gateway contract (PRD §5.2, principle P5).
 * ALL LLM calls in the product go through ModelGateway — no provider SDKs or
 * endpoints are touched anywhere else in the codebase (CLAUDE.md invariant #7).
 * Adding a model = a model_registry row + (if a new provider) one adapter here.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ToolDef {
  name: string;
  description: string;
  /** JSON Schema for the tool input. */
  inputSchema: Record<string, unknown>;
}

export interface CompleteRequest {
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Force a JSON object response when the provider supports it. */
  json?: boolean;
}

export interface ToolCallRequest extends CompleteRequest {
  tools: ToolDef[];
  toolChoice?: 'auto' | { name: string };
}

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface CompleteResponse {
  text: string;
  usage: ModelUsage;
  stopReason: string;
}

export interface ToolCallResponse {
  text: string | null;
  toolCalls: Array<{ name: string; input: Record<string, unknown> }>;
  usage: ModelUsage;
}

export interface EmbedResponse {
  embeddings: number[][];
  usage: ModelUsage;
}

/** Normalised provider adapter — one per provider, registry-selected. */
export interface ProviderAdapter {
  readonly provider: string;
  available(): boolean;
  complete(modelId: string, req: CompleteRequest): Promise<CompleteResponse>;
  stream(modelId: string, req: CompleteRequest, onDelta: (text: string) => void): Promise<CompleteResponse>;
  toolCall(modelId: string, req: ToolCallRequest): Promise<ToolCallResponse>;
  embed(modelId: string, texts: string[]): Promise<EmbedResponse>;
}

export interface RegistryModel {
  modelId: string;
  provider: string;
  capabilities: string[];
  contextWindow: number;
  costInPerM: number;
  costOutPerM: number;
  status: 'canary' | 'active' | 'deprecated';
}

export interface GatewayTelemetry {
  modelId: string;
  provider: string;
  agent?: string;
  tenantId?: string;
  usage: ModelUsage;
  costUsd: number;
  latencyMs: number;
}
