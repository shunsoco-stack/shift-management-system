import type { D1DatabaseLike, D1PreparedStatementLike, D1RunResult } from "@/db";
import type { Actor } from "./authorization";
import { ApiError } from "./http";
import { newId } from "./ids";

type AuditInput = {
  action: string;
  entityType: string;
  entityId: string;
  periodId?: string | null;
  revision?: number | null;
  before?: unknown;
  after?: unknown;
  correlationId?: string;
};

function jsonValue(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

export function auditInsert(
  db: D1DatabaseLike,
  actor: Actor,
  input: AuditInput,
): D1PreparedStatementLike {
  return db
    .prepare(
      `INSERT INTO audit_logs
       (id, correlation_id, actor_user_id, actor_role, action, entity_type,
        entity_id, period_id, revision, before_json, after_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      newId("audit"),
      input.correlationId ?? newId("corr"),
      actor.userId,
      actor.role,
      input.action,
      input.entityType,
      input.entityId,
      input.periodId ?? null,
      input.revision ?? null,
      jsonValue(input.before),
      jsonValue(input.after),
    );
}

export function guardedPeriodAuditInsert(
  db: D1DatabaseLike,
  actor: Actor,
  input: AuditInput & { periodId: string },
): D1PreparedStatementLike {
  return db
    .prepare(
      `INSERT INTO audit_logs
       (id, correlation_id, actor_user_id, actor_role, action, entity_type,
        entity_id, period_id, revision, before_json, after_json)
       SELECT ?, ?, ?, ?, ?, ?, ?, p.id, p.revision, ?, ?
       FROM shift_periods p
       WHERE p.id = ? AND p.status <> 'Published'`,
    )
    .bind(
      newId("audit"),
      input.correlationId ?? newId("corr"),
      actor.userId,
      actor.role,
      input.action,
      input.entityType,
      input.entityId,
      jsonValue(input.before),
      jsonValue(input.after),
      input.periodId,
    );
}

export function changedRows(result: D1RunResult | undefined): number {
  return result?.meta?.changes ?? 0;
}

export async function atomicBatch(
  db: D1DatabaseLike,
  statements: D1PreparedStatementLike[],
): Promise<D1RunResult[]> {
  if (statements.length === 0) {
    throw new ApiError(500, "EMPTY_BATCH", "内部更新batchが空です。");
  }
  const results = await db.batch(statements);
  const failed = results.find((result) => result && result.success === false);
  if (failed) {
    throw new Error(failed.error ?? "D1 batch failed");
  }
  return results;
}
