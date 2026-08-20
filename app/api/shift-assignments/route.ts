import { getD1Database } from "@/db";
import { atomicBatch, guardedPeriodAuditInsert } from "@/src/server/audit";
import { requireActor } from "@/src/server/auth";
import { assertAuthorized } from "@/src/server/authorization";
import { ApiError, handleRoute, json, readJsonObject, requiredQuery } from "@/src/server/http";
import { newId } from "@/src/server/ids";
import {
  assertDateInsidePeriod,
  assertMutablePeriod,
  getShiftPeriod,
} from "@/src/server/periods";
import {
  listAssignments,
  listEmployees,
  type ShiftAssignmentRow,
} from "@/src/server/shift-data";
import {
  arrayField,
  assertIsoDate,
  integerField,
  recordValue,
  stringField,
  timeToMinutes,
} from "@/src/server/validation";

type AssignmentInput = {
  id: string;
  employeeId: string;
  workDate: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  note: string;
};

function parseAssignment(
  value: unknown,
  index: number,
  employeeIds: Set<string>,
): AssignmentInput {
  const item = recordValue(value, `assignments[${index}]`);
  const id =
    stringField(item, "id", { optional: true, max: 100 }) ?? newId("assignment");
  const employeeId = stringField(item, "employeeId", { max: 80 })!;
  const workDate = stringField(item, "workDate", { max: 10 })!;
  const startTime = stringField(item, "startTime", { max: 5 })!;
  const endTime = stringField(item, "endTime", { max: 5 })!;
  const breakMinutes =
    integerField(item, "breakMinutes", { optional: true, min: 0, max: 480 }) ?? 0;
  const note = stringField(item, "note", {
    optional: true,
    max: 300,
  }) ?? "";
  if (!employeeIds.has(employeeId)) {
    throw new ApiError(400, "EMPLOYEE_NOT_FOUND", `従業員 ${employeeId} が存在しません。`);
  }
  assertIsoDate(workDate, "workDate");
  const duration = timeToMinutes(endTime, "endTime") - timeToMinutes(startTime, "startTime");
  if (duration <= 0) {
    throw new ApiError(400, "INVALID_TIME_RANGE", "終了時刻は開始時刻より後にしてください。");
  }
  if (breakMinutes >= duration) {
    throw new ApiError(400, "INVALID_BREAK", "休憩時間はシフトの長さより短くしてください。");
  }
  return { id, employeeId, workDate, startTime, endTime, breakMinutes, note };
}

async function assignmentById(
  db: ReturnType<typeof getD1Database>,
  assignmentId: string,
): Promise<ShiftAssignmentRow> {
  const row = await db
    .prepare(
      `SELECT id, period_id AS periodId, employee_id AS employeeId,
              work_date AS workDate, start_time AS startTime, end_time AS endTime,
              break_minutes AS breakMinutes, source, note,
              created_by AS createdBy, updated_by AS updatedBy,
              created_at AS createdAt, updated_at AS updatedAt
       FROM shift_assignments WHERE id = ?`,
    )
    .bind(assignmentId)
    .first<ShiftAssignmentRow>();
  if (!row) {
    throw new ApiError(404, "ASSIGNMENT_NOT_FOUND", "指定されたシフト枠が見つかりません。");
  }
  return row;
}

export async function GET(request: Request): Promise<Response> {
  return handleRoute(async () => {
    const db = getD1Database();
    const actor = await requireActor(request, db);
    const periodId = requiredQuery(request, "periodId");
    const period = await getShiftPeriod(db, periodId);
    const employeeId = actor.role === "employee" ? actor.employeeId! : undefined;
    assertAuthorized(actor, "assignment:read", {
      employeeId,
      periodStatus: period.status,
    });
    return json({
      period,
      employeeId: employeeId ?? null,
      assignments: await listAssignments(db, periodId, employeeId),
    });
  });
}

export async function PUT(request: Request): Promise<Response> {
  return handleRoute(async () => {
    const db = getD1Database();
    const actor = await requireActor(request, db);
    assertAuthorized(actor, "assignment:manage");
    const body = await readJsonObject(request);
    const periodId = stringField(body, "periodId", { max: 100 })!;
    const period = await getShiftPeriod(db, periodId);
    assertMutablePeriod(period);
    const values = arrayField(body, "assignments");
    if (values.length > 1000) {
      throw new ApiError(400, "VALIDATION_ERROR", "assignmentsは1000件以内にしてください。");
    }
    const employeeIds = new Set((await listEmployees(db)).map((employee) => employee.id));
    const assignments = values.map((value, index) =>
      parseAssignment(value, index, employeeIds),
    );
    const ids = new Set<string>();
    for (const assignment of assignments) {
      if (ids.has(assignment.id)) {
        throw new ApiError(400, "DUPLICATE_ASSIGNMENT_ID", `assignment id ${assignment.id} が重複しています。`);
      }
      ids.add(assignment.id);
      assertDateInsidePeriod(period, assignment.workDate);
    }
    const before = await listAssignments(db, periodId);
    await atomicBatch(db, [
      guardedPeriodAuditInsert(db, actor, {
        action: "SHIFT_ASSIGNMENTS_REPLACED",
        entityType: "shift_assignment_set",
        entityId: periodId,
        periodId,
        before,
        after: assignments,
      }),
      db.prepare("DELETE FROM shift_assignments WHERE period_id = ?").bind(periodId),
      ...assignments.map((assignment) =>
        db
          .prepare(
            `INSERT INTO shift_assignments
             (id, period_id, employee_id, work_date, start_time, end_time,
              break_minutes, source, note, created_by, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?, ?)`,
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
    ]);
    return json({ assignments: await listAssignments(db, periodId) });
  });
}

export async function PATCH(request: Request): Promise<Response> {
  return handleRoute(async () => {
    const db = getD1Database();
    const actor = await requireActor(request, db);
    assertAuthorized(actor, "assignment:manage");
    const body = await readJsonObject(request);
    const assignmentId = stringField(body, "assignmentId", { max: 100 })!;
    const existing = await assignmentById(db, assignmentId);
    const period = await getShiftPeriod(db, existing.periodId);
    assertMutablePeriod(period);
    const employees = new Set((await listEmployees(db)).map((employee) => employee.id));
    const merged = parseAssignment(
      {
        id: assignmentId,
        employeeId: body.employeeId ?? existing.employeeId,
        workDate: body.workDate ?? existing.workDate,
        startTime: body.startTime ?? existing.startTime,
        endTime: body.endTime ?? existing.endTime,
        breakMinutes: body.breakMinutes ?? existing.breakMinutes,
        note: body.note ?? existing.note,
      },
      0,
      employees,
    );
    assertDateInsidePeriod(period, merged.workDate);
    await atomicBatch(db, [
      guardedPeriodAuditInsert(db, actor, {
        action: "SHIFT_ASSIGNMENT_UPDATED",
        entityType: "shift_assignment",
        entityId: assignmentId,
        periodId: existing.periodId,
        before: existing,
        after: merged,
      }),
      db
        .prepare(
          `UPDATE shift_assignments
           SET employee_id = ?, work_date = ?, start_time = ?, end_time = ?,
               break_minutes = ?, note = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND period_id = ?`,
        )
        .bind(
          merged.employeeId,
          merged.workDate,
          merged.startTime,
          merged.endTime,
          merged.breakMinutes,
          merged.note,
          actor.userId,
          assignmentId,
          existing.periodId,
        ),
    ]);
    return json({ assignment: await assignmentById(db, assignmentId) });
  });
}

export async function DELETE(request: Request): Promise<Response> {
  return handleRoute(async () => {
    const db = getD1Database();
    const actor = await requireActor(request, db);
    assertAuthorized(actor, "assignment:manage");
    const body = await readJsonObject(request);
    const assignmentId = stringField(body, "assignmentId", { max: 100 })!;
    const existing = await assignmentById(db, assignmentId);
    const period = await getShiftPeriod(db, existing.periodId);
    assertMutablePeriod(period);
    await atomicBatch(db, [
      guardedPeriodAuditInsert(db, actor, {
        action: "SHIFT_ASSIGNMENT_DELETED",
        entityType: "shift_assignment",
        entityId: assignmentId,
        periodId: existing.periodId,
        before: existing,
        after: null,
      }),
      db
        .prepare("DELETE FROM shift_assignments WHERE id = ? AND period_id = ?")
        .bind(assignmentId, existing.periodId),
    ]);
    return json({ deleted: true, assignmentId });
  });
}
