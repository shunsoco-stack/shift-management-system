import { getD1Database } from "@/db";
import { requireActor } from "@/src/server/auth";
import { assertAuthorized } from "@/src/server/authorization";
import { ApiError, handleRoute, json } from "@/src/server/http";

type AuditRow = {
  id: string;
  correlationId: string;
  actorUserId: string;
  actorRole: string;
  actorDisplayName: string;
  action: string;
  entityType: string;
  entityId: string;
  periodId: string | null;
  revision: number | null;
  beforeJson: string | null;
  afterJson: string | null;
  createdAt: string;
};

function parseJson(value: string | null): unknown {
  if (value === null) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export async function GET(request: Request): Promise<Response> {
  return handleRoute(async () => {
    const db = getD1Database();
    const actor = await requireActor(request, db);
    assertAuthorized(actor, "audit:read");
    const search = new URL(request.url).searchParams;
    const periodId = search.get("periodId")?.trim() || null;
    const rawLimit = Number(search.get("limit") ?? "100");
    if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 200) {
      throw new ApiError(400, "VALIDATION_ERROR", "limitは1〜200の整数にしてください。");
    }
    const select = `
      SELECT a.id, a.correlation_id AS correlationId,
             a.actor_user_id AS actorUserId, a.actor_role AS actorRole,
             u.display_name AS actorDisplayName, a.action,
             a.entity_type AS entityType, a.entity_id AS entityId,
             a.period_id AS periodId, a.revision,
             a.before_json AS beforeJson, a.after_json AS afterJson,
             a.created_at AS createdAt
      FROM audit_logs a JOIN users u ON u.id = a.actor_user_id`;
    const statement = periodId
      ? db
          .prepare(
            `${select} WHERE a.period_id = ? ORDER BY a.created_at DESC, a.id DESC LIMIT ?`,
          )
          .bind(periodId, rawLimit)
      : db
          .prepare(`${select} ORDER BY a.created_at DESC, a.id DESC LIMIT ?`)
          .bind(rawLimit);
    const rows = (await statement.all<AuditRow>()).results;
    return json({
      auditLogs: rows.map(({ beforeJson, afterJson, ...row }) => ({
        ...row,
        before: parseJson(beforeJson),
        after: parseJson(afterJson),
      })),
      appendOnly: true,
    });
  });
}
