import { getD1Database } from "@/db";
import { atomicBatch, auditInsert } from "@/src/server/audit";
import { requireActor } from "@/src/server/auth";
import { assertAuthorized } from "@/src/server/authorization";
import { ApiError, handleRoute, json, readJsonObject } from "@/src/server/http";
import { getShiftPeriod } from "@/src/server/periods";
import { stringField } from "@/src/server/validation";

export async function POST(request: Request): Promise<Response> {
  return handleRoute(async () => {
    const db = getD1Database();
    const actor = await requireActor(request, db);
    assertAuthorized(actor, "period:manage");
    const body = await readJsonObject(request);
    const sourcePeriodId = stringField(body, "periodId", { max: 100 })!;
    const source = await getShiftPeriod(db, sourcePeriodId);
    if (source.status !== "Published") {
      throw new ApiError(
        409,
        "SOURCE_NOT_PUBLISHED",
        "新しいrevisionは公開済み期間から作成してください。公開前は現在のrevisionを編集できます。",
      );
    }
    const row = await db
      .prepare("SELECT COALESCE(MAX(revision), 0) AS maxRevision FROM shift_periods WHERE period_key = ?")
      .bind(source.periodKey)
      .first<{ maxRevision: number }>();
    const revision = (row?.maxRevision ?? source.revision) + 1;
    const periodId = `period-${source.periodKey}-r${revision}-${crypto.randomUUID().slice(0, 8)}`;
    await atomicBatch(db, [
      auditInsert(db, actor, {
        action: "SHIFT_PERIOD_REVISION_CREATED",
        entityType: "shift_period",
        entityId: periodId,
        periodId,
        revision,
        before: { sourcePeriodId, sourceRevision: source.revision },
        after: { periodId, revision, status: "Draft" },
      }),
      db
        .prepare(
          `INSERT INTO shift_periods
           (id, period_key, revision, label, starts_on, ends_on,
            request_deadline_at, status, source_period_id,
            created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'Draft', ?, ?, ?)`,
        )
        .bind(
          periodId,
          source.periodKey,
          revision,
          source.label,
          source.startsOn,
          source.endsOn,
          source.requestDeadlineAt,
          sourcePeriodId,
          actor.userId,
          actor.userId,
        ),
      db
        .prepare(
          `INSERT INTO shift_requests
           (id, period_id, employee_id, work_date, availability,
            requested_start, requested_end, note, request_status, submitted_at)
           SELECT ? || ':' || id, ?, employee_id, work_date, availability,
                  requested_start, requested_end, note, request_status, submitted_at
           FROM shift_requests WHERE period_id = ?`,
        )
        .bind(periodId, periodId, sourcePeriodId),
      db
        .prepare(
          `INSERT INTO staffing_requirements
           (id, period_id, day_of_week, start_time, end_time, required_count)
           SELECT ? || ':' || id, ?, day_of_week, start_time, end_time, required_count
           FROM staffing_requirements WHERE period_id = ?`,
        )
        .bind(periodId, periodId, sourcePeriodId),
      db
        .prepare(
          `INSERT INTO shift_assignments
           (id, period_id, employee_id, work_date, start_time, end_time,
            break_minutes, source, note, created_by, updated_by)
           SELECT ? || ':' || id, ?, employee_id, work_date, start_time, end_time,
                  break_minutes, source, note, ?, ?
           FROM shift_assignments WHERE period_id = ?`,
        )
        .bind(periodId, periodId, actor.userId, actor.userId, sourcePeriodId),
      db
        .prepare(
          `INSERT INTO constraints
           (id, period_id, employee_id, type, value, config_json, is_active)
           SELECT ? || ':' || id, ?, employee_id, type, value, config_json, is_active
           FROM constraints WHERE period_id = ?`,
        )
        .bind(periodId, periodId, sourcePeriodId),
    ]);
    return json(
      {
        period: await getShiftPeriod(db, periodId),
        copiedFrom: { periodId: sourcePeriodId, revision: source.revision },
      },
      { status: 201 },
    );
  });
}
