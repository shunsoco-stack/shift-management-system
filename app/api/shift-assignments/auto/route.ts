import { getD1Database } from "@/db";
import { atomicBatch, guardedPeriodAuditInsert } from "@/src/server/audit";
import { requireActor } from "@/src/server/auth";
import { assertAuthorized } from "@/src/server/authorization";
import { evaluateConflicts } from "@/src/server/conflicts";
import { ApiError, handleRoute, json, readJsonObject } from "@/src/server/http";
import { newId } from "@/src/server/ids";
import { assertMutablePeriod, getShiftPeriod } from "@/src/server/periods";
import { generateDraftSchedule } from "@/src/server/scheduler";
import {
  listAssignments,
  loadShiftPeriodData,
} from "@/src/server/shift-data";
import { stringField } from "@/src/server/validation";

export async function POST(request: Request): Promise<Response> {
  return handleRoute(async () => {
    const db = getD1Database();
    const actor = await requireActor(request, db);
    assertAuthorized(actor, "assignment:manage");
    const body = await readJsonObject(request);
    const periodId = stringField(body, "periodId", { max: 100 })!;
    const data = await loadShiftPeriodData(db, periodId);
    assertMutablePeriod(data.period);
    if (data.period.status === "Confirmed") {
      throw new ApiError(
        409,
        "REVIEW_REQUIRED",
        "確定済みシフトを自動再作成する場合は、先にReviewへ戻してください。",
      );
    }
    const generated = generateDraftSchedule(data);
    const assignments = generated.assignments.map((assignment) => ({
      ...assignment,
      id: newId("assignment"),
    }));
    await atomicBatch(db, [
      guardedPeriodAuditInsert(db, actor, {
        action: "AUTO_SCHEDULE_DRAFT_GENERATED",
        entityType: "shift_assignment_set",
        entityId: periodId,
        periodId,
        before: data.assignments,
        after: { assignments, unresolved: generated.unresolved },
      }),
      db.prepare("DELETE FROM shift_assignments WHERE period_id = ?").bind(periodId),
      ...assignments.map((assignment) =>
        db
          .prepare(
            `INSERT INTO shift_assignments
             (id, period_id, employee_id, work_date, start_time, end_time,
              break_minutes, source, note, created_by, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'auto', ?, ?, ?)`,
          )
          .bind(
            assignment.id,
            periodId,
            assignment.employeeId,
            assignment.workDate,
            assignment.startTime,
            assignment.endTime,
            assignment.breakMinutes,
            assignment.note,
            actor.userId,
            actor.userId,
          ),
      ),
      ...(data.period.status === "Review"
        ? [
            db
              .prepare(
                `UPDATE shift_periods
                 SET status = 'Draft', updated_by = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ? AND status = 'Review'`,
              )
              .bind(actor.userId, periodId),
          ]
        : []),
    ]);
    const refreshed = await loadShiftPeriodData(db, periodId);
    return json({
      period: await getShiftPeriod(db, periodId),
      draft: true,
      assignments: await listAssignments(db, periodId),
      unresolved: generated.unresolved,
      explanation: generated.explanation,
      conflictReport: evaluateConflicts(refreshed),
    });
  });
}
