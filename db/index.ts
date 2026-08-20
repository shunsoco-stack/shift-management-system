import { env } from "cloudflare:workers";
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
  const candidate = (env as unknown as { DB?: D1DatabaseLike }).DB;
  if (!candidate || typeof candidate.prepare !== "function") {
    throw new D1BindingError();
  }
  return candidate;
}

export function getDb() {
  return drizzle(getD1Database() as never, { schema });
}
