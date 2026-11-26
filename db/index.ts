import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export type D1RunResult = {
  success: boolean;
  error?: string;
  meta?: { changes?: number; last_row_id?: number };
  results?: unknown[];
};

export type D1PreparedStatementLike = {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{
    success: boolean;
    results: T[];
    error?: string;
    meta?: Record<string, unknown>;
  }>;
  run(): Promise<D1RunResult>;
};

export type D1DatabaseLike = {
  prepare(query: string): D1PreparedStatementLike;
  batch<T extends D1PreparedStatementLike = D1PreparedStatementLike>(
    statements: T[],
  ): Promise<D1RunResult[]>;
};

export class D1BindingError extends Error {
  readonly code = "DB_BINDING_MISSING";

  constructor() {
    super(
      "Cloudflare D1 binding `DB` is unavailable. Configure `.openai/hosting.json` with `{ \"d1\": \"DB\" }` and run through Vinext/Cloudflare rather than importing a route in a plain Node runtime.",
    );
    this.name = "D1BindingError";
  }
}

export function getD1Database(): D1DatabaseLike {
  // Vercel/Node has no Cloudflare D1 binding. Keep a lazy proxy so API
  // modules may call this at import time without failing the Next.js build.
  // The demo UI already falls back to localStorage when these APIs return 503.
  const candidate = readCloudflareDbBinding();
  if (candidate && typeof candidate.prepare === "function") {
    return candidate;
  }
  return new Proxy({} as D1DatabaseLike, {
    get() {
      throw new D1BindingError();
    },
  });
}

function readCloudflareDbBinding(): D1DatabaseLike | undefined {
  try {
    const requireFn = (0, eval)("typeof require === 'function' ? require : undefined") as
      | ((id: string) => { env?: { DB?: D1DatabaseLike } })
      | undefined;
    const workerEnv = requireFn?.("cloudflare:workers")?.env;
    return workerEnv?.DB;
  } catch {
    return undefined;
  }
}

export function getDb() {
  return drizzle(getD1Database() as never, { schema });
}
