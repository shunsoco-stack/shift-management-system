import { createAuditLogEntry } from "./audit";
import { assertPermission } from "./permissions";
import { datePart, isValidISODate, toMinuteInterval } from "./time";
import type {
  AuditLogEntry,
  DomainActor,
  ISODateTime,
  ScheduleStatus,
  ShiftAssignment,
  ShiftPeriod,
  ShiftRequest,
  ShiftSchedule,
} from "./types";

export class DomainValidationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DomainValidationError";
  }
}

export interface ShiftRequestSubmissionWarning {
  code: "DEADLINE_PASSED";
  message: string;
}

export interface ShiftRequestSubmissionResult {
  request: ShiftRequest;
  late: boolean;
  warnings: ShiftRequestSubmissionWarning[];
  auditLog: AuditLogEntry;
}

export function isSubmissionLate(period: ShiftPeriod, now: ISODateTime | Date): boolean {
  return datePart(now) > period.requestDeadline;
}

export function submitShiftRequest(input: {
  request: ShiftRequest;
  period: ShiftPeriod;
  actor: DomainActor;
  occurredAt: ISODateTime;
}): ShiftRequestSubmissionResult {
  const { request, period, actor, occurredAt } = input;
  assertPermission(actor, "shiftRequest:submit-own", request.employeeId);
  if (request.periodId !== period.id) {
    throw new DomainValidationError("PERIOD_MISMATCH", "希望シフトと対象期間が一致しません。");
  }
  if (
    !isValidISODate(period.startDate) ||
    !isValidISODate(period.endDate) ||
    !isValidISODate(period.requestDeadline)
  ) {
    throw new DomainValidationError("INVALID_PERIOD", "シフト期間の日付が不正です。");
  }
  const duplicateDates = request.days
    .map((day) => day.date)
    .filter((date, index, dates) => dates.indexOf(date) !== index);
  if (duplicateDates.length > 0) {
    throw new DomainValidationError("DUPLICATE_REQUEST_DATE", "同じ日の希望が重複しています。");
  }
  if (
    request.days.some(
      (day) => day.date < period.startDate || day.date > period.endDate,
    )
  ) {
    throw new DomainValidationError("REQUEST_OUTSIDE_PERIOD", "対象期間外の希望日が含まれています。");
  }

  const late = isSubmissionLate(period, occurredAt);
  const submitted: ShiftRequest = {
    ...request,
    status: "Submitted",
    submittedAt: occurredAt,
    updatedAt: occurredAt,
    days: request.days.map((day) => ({ ...day })),
  };
  const warnings: ShiftRequestSubmissionWarning[] = late
    ? [
        {
          code: "DEADLINE_PASSED",
          message: `${period.label}の希望提出期限（${period.requestDeadline}）を過ぎています。`,
        },
      ]
    : [];

  return {
    request: submitted,
    late,
    warnings,
    auditLog: createAuditLogEntry({
      shiftRequestId: request.id,
      action: "SHIFT_REQUEST_SUBMITTED",
      actorId: actor.userId,
      actorRole: actor.role,
      occurredAt,
      entityType: "shiftRequest",
      entityId: request.id,
      description: `${request.employeeId}が${period.label}の希望シフトを提出しました。`,
      before: request,
      after: submitted,
      metadata: { employeeId: request.employeeId, late },
    }),
  };
}

const NEXT_STATUS: Partial<Record<ScheduleStatus, ScheduleStatus>> = {
  Draft: "Review",
  Review: "Confirmed",
  Confirmed: "Published",
};

const TRANSITION_PERMISSION: Record<Exclude<ScheduleStatus, "Draft">, Parameters<typeof assertPermission>[1]> = {
  Review: "schedule:review",
  Confirmed: "schedule:confirm",
  Published: "schedule:publish",
};

export interface ScheduleWorkflowResult {
  schedule: ShiftSchedule;
  auditLog: AuditLogEntry;
}

export function transitionScheduleStatus(input: {
  schedule: ShiftSchedule;
  to: Exclude<ScheduleStatus, "Draft">;
  actor: DomainActor;
  occurredAt: ISODateTime;
}): ScheduleWorkflowResult {
  const { schedule, to, actor, occurredAt } = input;
  assertPermission(actor, TRANSITION_PERMISSION[to]);
  if (NEXT_STATUS[schedule.status] !== to) {
    throw new DomainValidationError(
      "INVALID_STATUS_TRANSITION",
      `${schedule.status} から ${to} へは遷移できません。`,
    );
  }

  const next: ShiftSchedule = {
    ...schedule,
    assignments: schedule.assignments.map((assignment) => ({
      ...assignment,
      breaks: assignment.breaks.map((shiftBreak) => ({ ...shiftBreak })),
    })),
    status: to,
    updatedAt: occurredAt,
    updatedBy: actor.userId,
    ...(to === "Confirmed"
      ? { confirmedAt: occurredAt, confirmedBy: actor.userId }
      : {}),
    ...(to === "Published"
      ? { publishedAt: occurredAt, publishedBy: actor.userId }
      : {}),
  };

  return {
    schedule: next,
    auditLog: createAuditLogEntry({
      scheduleId: schedule.id,
      revision: schedule.revision,
      action: "STATUS_CHANGED",
      actorId: actor.userId,
      actorRole: actor.role,
      occurredAt,
      entityType: "schedule",
      entityId: schedule.id,
      description: `シフトを ${schedule.status} から ${to} に変更しました。`,
      before: { status: schedule.status },
      after: { status: to },
    }),
  };
}

export type AssignmentMutation =
  | { type: "upsert"; assignment: ShiftAssignment }
  | { type: "remove"; assignmentId: string };

export function changeAssignment(input: {
  schedule: ShiftSchedule;
  mutation: AssignmentMutation;
  actor: DomainActor;
  occurredAt: ISODateTime;
}): ScheduleWorkflowResult {
  const { schedule, mutation, actor, occurredAt } = input;
  assertPermission(actor, "schedule:edit");

  const existing =
    mutation.type === "upsert"
      ? schedule.assignments.find((assignment) => assignment.id === mutation.assignment.id)
      : schedule.assignments.find((assignment) => assignment.id === mutation.assignmentId);

  if (mutation.type === "remove" && !existing) {
    throw new DomainValidationError("ASSIGNMENT_NOT_FOUND", "変更対象の勤務枠がありません。");
  }
  if (mutation.type === "upsert") {
    const { assignment } = mutation;
    if (
      !isValidISODate(assignment.date) ||
      assignment.date < schedule.startDate ||
      assignment.date > schedule.endDate ||
      !toMinuteInterval(assignment.startTime, assignment.endTime)
    ) {
      throw new DomainValidationError("INVALID_ASSIGNMENT", "勤務枠の日付または時間が不正です。");
    }
  }

  const assignments =
    mutation.type === "remove"
      ? schedule.assignments.filter((assignment) => assignment.id !== mutation.assignmentId)
      : existing
        ? schedule.assignments.map((assignment) =>
            assignment.id === mutation.assignment.id
              ? {
                  ...mutation.assignment,
                  breaks: mutation.assignment.breaks.map((shiftBreak) => ({ ...shiftBreak })),
                }
              : assignment,
          )
        : [
            ...schedule.assignments,
            {
              ...mutation.assignment,
              breaks: mutation.assignment.breaks.map((shiftBreak) => ({ ...shiftBreak })),
            },
          ];

  const protectedRevision = schedule.status === "Confirmed" || schedule.status === "Published";
  const nextRevision = protectedRevision ? schedule.revision + 1 : schedule.revision;
  const nextStatus: ScheduleStatus = protectedRevision ? "Review" : schedule.status;
  const scheduleWithoutCommitMetadata = { ...schedule };
  delete scheduleWithoutCommitMetadata.confirmedAt;
  delete scheduleWithoutCommitMetadata.confirmedBy;
  delete scheduleWithoutCommitMetadata.publishedAt;
  delete scheduleWithoutCommitMetadata.publishedBy;
  const keepCommitMetadata = !protectedRevision
    ? {
        confirmedAt: schedule.confirmedAt,
        confirmedBy: schedule.confirmedBy,
        publishedAt: schedule.publishedAt,
        publishedBy: schedule.publishedBy,
      }
    : {};
  const next: ShiftSchedule = {
    ...scheduleWithoutCommitMetadata,
    ...keepCommitMetadata,
    assignments: assignments.sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.startTime.localeCompare(b.startTime) ||
        a.employeeId.localeCompare(b.employeeId) ||
        a.id.localeCompare(b.id),
    ),
    status: nextStatus,
    revision: nextRevision,
    ...(protectedRevision ? { supersedesRevision: schedule.revision } : {}),
    updatedAt: occurredAt,
    updatedBy: actor.userId,
  };

  const entityId =
    mutation.type === "upsert" ? mutation.assignment.id : mutation.assignmentId;
  const action =
    mutation.type === "remove"
      ? "ASSIGNMENT_REMOVED"
      : existing
        ? "ASSIGNMENT_UPDATED"
        : "ASSIGNMENT_CREATED";
  const after =
    mutation.type === "remove"
      ? undefined
      : assignments.find((assignment) => assignment.id === mutation.assignment.id);

  return {
    schedule: next,
    auditLog: createAuditLogEntry({
      scheduleId: schedule.id,
      revision: nextRevision,
      action,
      actorId: actor.userId,
      actorRole: actor.role,
      occurredAt,
      entityType: "assignment",
      entityId,
      description:
        action === "ASSIGNMENT_REMOVED"
          ? `勤務枠 ${entityId} を削除しました。`
          : action === "ASSIGNMENT_CREATED"
            ? `勤務枠 ${entityId} を追加しました。`
            : `勤務枠 ${entityId} を変更しました。`,
      before: existing,
      after,
      metadata: {
        previousStatus: schedule.status,
        nextStatus,
        revisionCreated: protectedRevision,
      },
    }),
  };
}
