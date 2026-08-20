import { D1BindingError } from "@/db";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > 1_000_000) {
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", "リクエスト本文が大きすぎます。");
  }

  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new ApiError(400, "INVALID_JSON", "JSON形式のリクエスト本文が必要です。");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "INVALID_BODY", "リクエスト本文はJSONオブジェクトにしてください。");
  }
  return value as Record<string, unknown>;
}

export function requiredQuery(request: Request, key: string): string {
  const value = new URL(request.url).searchParams.get(key)?.trim();
  if (!value) {
    throw new ApiError(400, "MISSING_QUERY", `クエリパラメーター \`${key}\` が必要です。`);
  }
  return value;
}

function databaseError(error: Error): ApiError | null {
  const message = `${error.message}\n${error.cause instanceof Error ? error.cause.message : ""}`;
  if (error instanceof D1BindingError || message.includes("DB_BINDING_MISSING")) {
    return new ApiError(503, "DB_BINDING_MISSING", error.message);
  }
  if (
    message.includes("no such table") ||
    message.includes("D1_ERROR: no such table")
  ) {
    return new ApiError(
      503,
      "DB_NOT_INITIALIZED",
      "D1は接続済みですがテーブルがありません。`drizzle/0000_shift_management.sql` をローカルD1に適用するか、Sitesへデプロイしてmigrationを適用してください。",
    );
  }
  if (message.includes("published revision is immutable")) {
    return new ApiError(
      409,
      "PUBLISHED_REVISION_IMMUTABLE",
      "公開済みrevisionは直接変更できません。新しいrevisionを作成してください。",
    );
  }
  if (message.includes("UNIQUE constraint failed")) {
    return new ApiError(409, "CONFLICT", "同じ識別子または同じ期間のrevisionが既に存在します。");
  }
  return null;
}

export function errorResponse(error: unknown): Response {
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    "code" in error &&
    typeof (error as { status?: unknown }).status === "number" &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    const known = error as {
      status: number;
      code: string;
      message?: string;
      details?: unknown;
    };
    return json(
      {
        error: {
          code: known.code,
          message: known.message ?? "リクエストを完了できませんでした。",
          ...(known.details === undefined ? {} : { details: known.details }),
        },
      },
      { status: known.status },
    );
  }

  if (error instanceof Error) {
    const mapped = databaseError(error);
    if (mapped) return errorResponse(mapped);
  }

  console.error("Unhandled shift API error", error);
  return json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "シフト管理APIで予期しないエラーが発生しました。",
      },
    },
    { status: 500 },
  );
}

export async function handleRoute(operation: () => Promise<Response>): Promise<Response> {
  try {
    return await operation();
  } catch (error) {
    return errorResponse(error);
  }
}
