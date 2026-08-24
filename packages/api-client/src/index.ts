/**
 * Typed API client — the ONLY place fetch calls to the Eye on Fat API live
 * (apps/web never hand-writes fetch). Shapes come from @eof/domain; the full
 * OpenAPI type surface can be regenerated with `pnpm --filter @eof/api-client gen`
 * after `pnpm gen:openapi`.
 */
export interface ApiError extends Error {
  status: number;
  code?: string;
}

export type Query = Record<string, string | number | boolean | undefined>;

export class ApiClient {
  private accessToken: string | null = null;
  onUnauthorized: (() => void) | null = null;

  constructor(private base = '/api') {}

  setToken(token: string | null): void { this.accessToken = token; }
  getToken(): string | null { return this.accessToken; }

  private async request<T>(method: string, path: string, opts: { body?: unknown; query?: Query; retry?: boolean } = {}): Promise<T> {
    const qs = opts.query
      ? '?' + Object.entries(opts.query)
          .filter(([, v]) => v !== undefined && v !== '')
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
          .join('&')
      : '';
    const res = await fetch(`${this.base}${path}${qs}`, {
      method,
      credentials: 'include',
      headers: {
        ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(this.accessToken ? { authorization: `Bearer ${this.accessToken}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    if (res.status === 401 && opts.retry !== false && !path.startsWith('/auth/')) {
      const refreshed = await this.tryRefresh();
      if (refreshed) return this.request<T>(method, path, { ...opts, retry: false });
      this.onUnauthorized?.();
    }
    if (!res.ok) {
      let message = res.statusText, code: string | undefined;
      try {
        const data = await res.json();
        message = data.error ?? message; code = data.code;
      } catch { /* non-JSON error */ }
      const err = new Error(message) as ApiError;
      err.status = res.status; err.code = code;
      throw err;
    }
    return res.json() as Promise<T>;
  }

  async tryRefresh(): Promise<boolean> {
    try {
      const res = await fetch(`${this.base}/auth/refresh`, { method: 'POST', credentials: 'include' });
      if (!res.ok) return false;
      const data = await res.json();
      this.accessToken = data.accessToken;
      return true;
    } catch { return false; }
  }

  get = <T>(path: string, query?: Query) => this.request<T>('GET', path, { query });
  post = <T>(path: string, body?: unknown) => this.request<T>('POST', path, { body: body ?? {} });
  patch = <T>(path: string, body?: unknown) => this.request<T>('PATCH', path, { body: body ?? {} });
  del = <T>(path: string) => this.request<T>('DELETE', path, {});

  /* ── auth ── */
  login(body: { email: string; password: string; totp?: string }) {
    return this.request<{
      accessToken?: string; mfaRequired?: boolean; mfaSetupRequired?: boolean;
      user?: { id: string; name: string; email: string; roles: string[]; awardAuthority: boolean };
      tenant?: { slug: string; name: string; settings: Record<string, unknown> };
    }>('POST', '/auth/login', { body, retry: false });
  }
  logout() { return this.request('POST', '/auth/logout', { retry: false }); }
  me() { return this.get<{ user: { userId: string; name: string; email: string; roles: string[]; awardAuthority: boolean }; tenant: { slug: string; name: string; settings: Record<string, unknown> } }>('/auth/me'); }

  /* ── uploads (multipart) ── */
  async uploadSpendFile(file: File) {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${this.base}/connectors/upload`, {
      method: 'POST', credentials: 'include',
      headers: this.accessToken ? { authorization: `Bearer ${this.accessToken}` } : {},
      body: fd,
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({ error: res.statusText }))).error);
    return res.json() as Promise<{ fileId: string; rows: number; inserted: number; deduped: number; classifiedPct: number }>;
  }

  /** Authenticated binary download (Excel export etc.) → browser save. */
  async download(path: string, filename: string) {
    const res = await fetch(`${this.base}${path}`, {
      credentials: 'include',
      headers: this.accessToken ? { authorization: `Bearer ${this.accessToken}` } : {},
    });
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }
}

export const api = new ApiClient();
