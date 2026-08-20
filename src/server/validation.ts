import { ApiError } from "./http";

export function stringField(
  object: Record<string, unknown>,
  key: string,
  options: { max?: number; optional?: boolean; trim?: boolean } = {},
): string | undefined {
  const raw = object[key];
  if (raw === undefined || raw === null) {
    if (options.optional) return undefined;
    throw new ApiError(400, "VALIDATION_ERROR", `\`${key}\` は必須です。`);
  }
  if (typeof raw !== "string") {
    throw new ApiError(400, "VALIDATION_ERROR", `\`${key}\` は文字列にしてください。`);
  }
  const value = options.trim === false ? raw : raw.trim();
  if (!value && !options.optional) {
    throw new ApiError(400, "VALIDATION_ERROR", `\`${key}\` は必須です。`);
  }
  if (options.max && value.length > options.max) {
    throw new ApiError(400, "VALIDATION_ERROR", `\`${key}\` は${options.max}文字以内にしてください。`);
  }
  return value;
}

export function integerField(
  object: Record<string, unknown>,
  key: string,
  options: { min?: number; max?: number; optional?: boolean } = {},
): number | undefined {
  const raw = object[key];
  if (raw === undefined || raw === null) {
    if (options.optional) return undefined;
    throw new ApiError(400, "VALIDATION_ERROR", `\`${key}\` は必須です。`);
  }
  if (!Number.isInteger(raw)) {
    throw new ApiError(400, "VALIDATION_ERROR", `\`${key}\` は整数にしてください。`);
  }
  const value = raw as number;
  if (options.min !== undefined && value < options.min) {
    throw new ApiError(400, "VALIDATION_ERROR", `\`${key}\` は${options.min}以上にしてください。`);
  }
  if (options.max !== undefined && value > options.max) {
    throw new ApiError(400, "VALIDATION_ERROR", `\`${key}\` は${options.max}以下にしてください。`);
  }
  return value;
}

export function arrayField(object: Record<string, unknown>, key: string): unknown[] {
  const value = object[key];
  if (!Array.isArray(value)) {
    throw new ApiError(400, "VALIDATION_ERROR", `\`${key}\` は配列にしてください。`);
  }
  return value;
}

export function recordValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "VALIDATION_ERROR", `${label}はJSONオブジェクトにしてください。`);
  }
  return value as Record<string, unknown>;
}

export function enumField<const T extends readonly string[]>(
  object: Record<string, unknown>,
  key: string,
  values: T,
): T[number] {
  const value = stringField(object, key);
  if (!values.includes(value as T[number])) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      `\`${key}\` は ${values.join(" / ")} のいずれかにしてください。`,
    );
  }
  return value as T[number];
}

export function assertIsoDate(value: string, label: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new ApiError(400, "VALIDATION_ERROR", `${label}はYYYY-MM-DD形式にしてください。`);
  }
}

export function assertIsoDateTime(value: string, label: string): void {
  if (Number.isNaN(Date.parse(value))) {
    throw new ApiError(400, "VALIDATION_ERROR", `${label}はISO 8601形式にしてください。`);
  }
}

export function timeToMinutes(value: string, label = "time"): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    throw new ApiError(400, "VALIDATION_ERROR", `${label}はHH:mm形式にしてください。`);
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    throw new ApiError(400, "VALIDATION_ERROR", `${label}が有効な時刻ではありません。`);
  }
  return hours * 60 + minutes;
}
