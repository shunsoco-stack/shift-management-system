import { getD1Database } from "@/db";
import { atomicBatch, auditInsert, guardedPeriodAuditInsert } from "@/src/server/audit";
import { requireActor } from "@/src/server/auth";
import { assertAuthorized } from "@/src/server/authorization";
import { ApiError, handleRoute, json, readJsonObject } from "@/src/server/http";
import {
  assertMutablePeriod,
  getShiftPeriod,
  listShiftPeriods,
} from "@/src/server/periods";
import {
  assertIsoDate,
  assertIsoDateTime,
  integerField,
  stringField,
} from "@/src/server/validation";

export async function GET(request: Request): Promise<Response> {
  return handleRoute(async () => {
    const db = getD1Database();
    const actor = await requireActor(request, db);
    assertAuthorized(actor, "period:read");
    return json({ periods: await listShiftPeriods(db) });
  });
}

export async function POST(request: Request): Promise<Response> {
  return handleRoute(async () => {
    const db = getD1Database();
    const actor = await requireActor(request, db);
    assertAuthorized(actor, "period:manage");
    const body = await readJsonObject(request);
    const periodKey = stringField(body, "periodKey", { max: 7 })!;
    const label = stringField(body, "label", { max: 80 })!;
    const startsOn = stringField(body, "startsOn", { max: 10 })!;
    const endsOn = stringField(body, "endsOn", { max: 10 })!;
    const requestDeadlineAt = stringField(body, "requestDeadlineAt", { max: 40 })!;
    const revision = integerField(body, "revision", {
      optional: true,
      min: 1,
      max: 999,
    }) ?? 1;
    if (!/^\d{4}-\d{2}$/.test(periodKey)) {
      throw new ApiError(400, "VALIDATION_ERROR", "periodKeyはYYYY-MM形式にしてください。");
    }
    assertIsoDate(startsOn, "startsOn");
    assertIsoDate(endsOn, "endsOn");
    assertIsoDateTime(requestDeadlineAt, "requestDeadlineAt");
    if (startsOn > endsOn) {
      throw new ApiError(400, "VALIDATION_ERROR", "startsOnはendsOn以前にしてください。");
    }
    const periodId = `period-${periodKey}-r${revision}-${crypto.randomUUID().slice(0, 8)}`;
    const after = {
      id: periodId,
      periodKey,
      revision,
      label,
      startsOn,
      endsOn,
      requestDeadlineAt,
      status: "Draft",
    };
    await atomicBatch(db, [
      auditInsert(db, actor, {
        action: "SHIFT_PERIOD_CREATED",
        entityType: "shift_period",
        entityId: periodId,
        periodId,
        revision,
        after,
      }),
      db
        .prepare(
          `INSERT INTO shift_periods
           (id, period_key, revision, label, starts_on, ends_on,
            request_deadline_at, status, created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'Draft', ?, ?)`,
        )
        .bind(
          periodId,
          periodKey,
          revision,
          label,
          startsOn,
          endsOn,
          requestDeadlineAt,
          actor.userId,
          actor.userId,
        ),
    ]);
    return json({ period: await getShiftPeriod(db, periodId) }, { status: 201 });
  });
}

export async function PATCH(request: Request): Promise<Response> {
  return handleRoute(async () => {
    const db = getD1Database();
    const actor = await requireActor(request, db);
    assertAuthorized(actor, "period:manage");
    const body = await readJsonObject(request);
    const periodId = stringField(body, "periodId", { max: 100 })!;
    const period = await getShiftPeriod(db, periodId);
    assertMutablePeriod(period);
    const label = stringField(body, "label", { optional: true, max: 80 });
    const requestDeadlineAt = stringField(body, "requestDeadlineAt", {
      optional: true,
      max: 40,
    });
    if (requestDeadlineAt) assertIsoDateTime(requestDeadlineAt, "requestDeadlineAt");
    if (label === undefined && requestDeadlineAt === undefined) {
      throw new ApiError(400, "NO_CHANGES", "更新するlabelまたはrequestDeadlineAtを指定してください。");
    }
    const after = {
      ...period,
      label: label ?? period.label,
      requestDeadlineAt: requestDeadlineAt ?? period.requestDeadlineAt,
    };
    await atomicBatch(db, [
      guardedPeriodAuditInsert(db, actor, {
        action: "SHIFT_PERIOD_UPDATED",
        entityType: "shift_period",
        entityId: periodId,
        periodId,
        before: period,
        after,
      }),
      db
        .prepare(
          `UPDATE shift_periods
           SET label = COALESCE(?, label),
               request_deadline_at = COALESCE(?, request_deadline_at),
               updated_by = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND status <> 'Published'`,
        )
        .bind(label ?? null, requestDeadlineAt ?? null, actor.userId, periodId),
    ]);
    return json({ period: await getShiftPeriod(db, periodId) });
  });
}
