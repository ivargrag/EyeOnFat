/**
 * Prompt loader — prompts are DATA, versioned in packages/agents/prompts/*
 * and edited via PR only (CLAUDE.md working conventions). Rendered with a
 * minimal {{var}} substitution; ingested content is neutralised first.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROMPTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts');
const cache = new Map<string, string>();

function load(file: string): string {
  if (!cache.has(file)) cache.set(file, readFileSync(join(PROMPTS_DIR, file), 'utf8'));
  return cache.get(file)!;
}

/**
 * Neutralise instruction-like content in ingested/untrusted text (invariant #9).
 * Untrusted document content is wrapped in a fenced block and common injection
 * phrasings are defanged so they read as data, not directives.
 */
export function neutraliseUntrusted(text: string): string {
  const defanged = text
    .replace(/ignore (all|any|previous|prior)/gi, '[defanged:ignore-instruction]')
    .replace(/disregard (all|any|previous|prior)/gi, '[defanged:disregard-instruction]')
    .replace(/you (are|must|should) now/gi, '[defanged:role-override]')
    .replace(/system prompt/gi, '[defanged:system-prompt]');
  return `<untrusted-document-content>\n${defanged}\n</untrusted-document-content>`;
}

export function renderPrompt(promptFile: string, vars: Record<string, string>): string {
  const shared = load('_shared_contract.md');
  let body = load(promptFile);
  for (const [k, v] of Object.entries(vars)) {
    body = body.replaceAll(`{{${k}}}`, v);
  }
  return `${shared}\n\n---\n\n${body}`;
}
