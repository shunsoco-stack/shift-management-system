import { getD1Database } from "@/db";
import { atomicBatch, guardedPeriodAuditInsert } from "@/src/server/audit";
import { requireActor } from "@/src/server/auth";
import {
  assertAuthorized,
  canTransitionShiftPeriod,
} from "@/src/server/authorization";
import { ApiError, handleRoute, json, readJsonObject } from "@/src/server/http";
import { getShiftPeriod } from "@/src/server/periods";
import { enumField, stringField } from "@/src/server/validation";

export async function POST(request: Request): Promise<Response> {
  return handleRoute(async () => {
    const db = getD1Database();
    const actor = await requireActor(request, db);
    assertAuthorized(actor, "period:manage");
    const body = await readJsonObject(request);
    const periodId = stringField(body, "periodId", { max: 100 })!;
    const nextStatus = enumField(body, "status", [
      "Draft",
      "Review",
      "Confirmed",
      "Published",
    ] as const);
    const period = await getShiftPeriod(db, periodId);
    if (!canTransitionShiftPeriod(period.status, nextStatus)) {
      throw new ApiError(
        409,
        "INVALID_STATUS_TRANSITION",
        `${period.status} から ${nextStatus} へは直接遷移できません。`,
        { currentStatus: period.status, requestedStatus: nextStatus },
      );
    }
    const now = new Date().toISOString();
    await atomicBatch(db, [
      guardedPeriodAuditInsert(db, actor, {
        action: `SHIFT_PERIOD_${nextStatus.toUpperCase()}`,
        entityType: "shift_period",
        entityId: periodId,
        periodId,
        before: { status: period.status },
        after: { status: nextStatus },
      }),
      db
        .prepare(
          `UPDATE shift_periods
           SET status = ?, published_at = CASE WHEN ? = 'Published' THEN ? ELSE published_at END,
               updated_by = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND status = ? AND status <> 'Published'`,
        )
        .bind(
          nextStatus,
          nextStatus,
          now,
          actor.userId,
          periodId,
          period.status,
        ),
    ]);
    return json({ period: await getShiftPeriod(db, periodId) });
  });
}
