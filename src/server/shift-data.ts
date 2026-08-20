import type { D1DatabaseLike } from "@/db";
import type { ShiftPeriodRow } from "./periods";
import { getShiftPeriod } from "./periods";

export type EmployeeRow = {
  id: string;
  userId: string;
  employeeCode: string;
  displayName: string;
  employmentType: string;
  color: string;
  isActive: number;
};

export type ShiftRequestRow = {
  id: string;
  periodId: string;
  employeeId: string;
  workDate: string;
  availability: "available" | "day_off";
  requestedStart: string | null;
  requestedEnd: string | null;
  note: string;
  requestStatus: "Draft" | "Submitted";
  submittedAt: string | null;
  updatedAt: string;
};

export type ShiftAssignmentRow = {
  id: string;
  periodId: string;
  employeeId: string;
  workDate: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  source: "manual" | "auto";
  note: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type StaffingRequirementRow = {
  id: string;
  periodId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  requiredCount: number;
};

export type ConstraintType =
  | "MAX_DAILY_MINUTES"
  | "MIN_BREAK_MINUTES"
  | "MIN_REST_MINUTES"
  | "MAX_CONSECUTIVE_DAYS";

export type ConstraintRow = {
  id: string;
  periodId: string | null;
  employeeId: string | null;
  type: ConstraintType;
  value: number;
  configJson: string;
  isActive: number;
};

export type ShiftPeriodData = {
  period: ShiftPeriodRow;
  employees: EmployeeRow[];
  requests: ShiftRequestRow[];
  assignments: ShiftAssignmentRow[];
  requirements: StaffingRequirementRow[];
  constraints: ConstraintRow[];
};

const EMPLOYEE_SELECT = `
  SELECT id, user_id AS userId, employee_code AS employeeCode,
         display_name AS displayName, employment_type AS employmentType,
         color, is_active AS isActive
  FROM employees`;
const REQUEST_SELECT = `
  SELECT id, period_id AS periodId, employee_id AS employeeId,
         work_date AS workDate, availability,
         requested_start AS requestedStart, requested_end AS requestedEnd,
         note, request_status AS requestStatus, submitted_at AS submittedAt,
         updated_at AS updatedAt
  FROM shift_requests`;
const ASSIGNMENT_SELECT = `
  SELECT id, period_id AS periodId, employee_id AS employeeId,
         work_date AS workDate, start_time AS startTime, end_time AS endTime,
         break_minutes AS breakMinutes, source, note,
         created_by AS createdBy, updated_by AS updatedBy,
         created_at AS createdAt, updated_at AS updatedAt
  FROM shift_assignments`;
const REQUIREMENT_SELECT = `
  SELECT id, period_id AS periodId, day_of_week AS dayOfWeek,
         start_time AS startTime, end_time AS endTime,
         required_count AS requiredCount
  FROM staffing_requirements`;
const CONSTRAINT_SELECT = `
  SELECT id, period_id AS periodId, employee_id AS employeeId,
         type, value, config_json AS configJson, is_active AS isActive
  FROM constraints`;

export async function listEmployees(db: D1DatabaseLike): Promise<EmployeeRow[]> {
  const result = await db
    .prepare(`${EMPLOYEE_SELECT} WHERE is_active = 1 ORDER BY employee_code`)
    .all<EmployeeRow>();
  return result.results;
}

export async function listRequests(
  db: D1DatabaseLike,
  periodId: string,
  employeeId?: string,
): Promise<ShiftRequestRow[]> {
  const statement = employeeId
    ? db
        .prepare(
          `${REQUEST_SELECT} WHERE period_id = ? AND employee_id = ? ORDER BY work_date`,
        )
        .bind(periodId, employeeId)
    : db
        .prepare(`${REQUEST_SELECT} WHERE period_id = ? ORDER BY employee_id, work_date`)
        .bind(periodId);
  return (await statement.all<ShiftRequestRow>()).results;
}

export async function listAssignments(
  db: D1DatabaseLike,
  periodId: string,
  employeeId?: string,
): Promise<ShiftAssignmentRow[]> {
  const statement = employeeId
    ? db
        .prepare(
          `${ASSIGNMENT_SELECT} WHERE period_id = ? AND employee_id = ? ORDER BY work_date, start_time`,
        )
        .bind(periodId, employeeId)
    : db
        .prepare(
          `${ASSIGNMENT_SELECT} WHERE period_id = ? ORDER BY work_date, start_time, employee_id`,
        )
        .bind(periodId);
  return (await statement.all<ShiftAssignmentRow>()).results;
}

export async function listRequirements(
  db: D1DatabaseLike,
  periodId: string,
): Promise<StaffingRequirementRow[]> {
  return (
    await db
      .prepare(
        `${REQUIREMENT_SELECT} WHERE period_id = ? ORDER BY day_of_week, start_time`,
      )
      .bind(periodId)
      .all<StaffingRequirementRow>()
  ).results;
}

export async function listConstraints(
  db: D1DatabaseLike,
  periodId: string,
): Promise<ConstraintRow[]> {
  return (
    await db
      .prepare(
        `${CONSTRAINT_SELECT}
         WHERE is_active = 1 AND (period_id = ? OR period_id IS NULL)
         ORDER BY employee_id IS NULL DESC`,
      )
      .bind(periodId)
      .all<ConstraintRow>()
  ).results;
}

export async function loadShiftPeriodData(
  db: D1DatabaseLike,
  periodId: string,
): Promise<ShiftPeriodData> {
  const period = await getShiftPeriod(db, periodId);
  const [employees, requests, assignments, requirements, constraints] =
    await Promise.all([
      listEmployees(db),
      listRequests(db, periodId),
      listAssignments(db, periodId),
      listRequirements(db, periodId),
      listConstraints(db, periodId),
    ]);
  return { period, employees, requests, assignments, requirements, constraints };
}
