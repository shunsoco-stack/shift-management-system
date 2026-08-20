import { createAuditLogEntry } from "./audit";
import { detectConflicts } from "./conflicts";
import { assertPermission } from "./permissions";
import { calculateStaffing, calculateStaffingForDate } from "./staffing";
import {
  daysBetween,
  enumerateDates,
  intervalMinutes,
  intervalsOverlap,
  mergeIntervals,
  minutesToTime,
  subtractIntervals,
  toMinuteInterval,
  type MinuteInterval,
} from "./time";
import {
  DEFAULT_SCHEDULE_CONSTRAINTS,
  type AutoScheduleResult,
  type AutoScheduleUnfilledSlot,
  type DomainActor,
  type Employee,
  type ISODate,
  type ISODateTime,
  type ScheduleConstraints,
  type ShiftAssignment,
  type ShiftRequest,
  type ShiftRequestDay,
  type ShiftSchedule,
  type StaffingRequirement,
  type StaffingSlice,
} from "./types";
import { DomainValidationError } from "./workflow";

export interface AutoScheduleInput {
  schedule: ShiftSchedule;
  employees: Employee[];
  requests: ShiftRequest[];
  requirements: StaffingRequirement[];
  actor: DomainActor;
  occurredAt: ISODateTime;
  constraints?: Partial<ScheduleConstraints>;
  dates?: ISODate[];
  /** Smaller values increase precision. The deterministic default is 60 minutes. */
  slotMinutes?: number;
}

function cloneAssignment(assignment: ShiftAssignment): ShiftAssignment {
  return {
    ...assignment,
    breaks: assignment.breaks.map((shiftBreak) => ({ ...shiftBreak })),
  };
}

function requestDayMap(
  schedule: ShiftSchedule,
  requests: ShiftRequest[],
): Map<string, ShiftRequestDay> {
  const map = new Map<string, ShiftRequestDay>();
  for (const request of [...requests]
    .filter(
      (item) => item.periodId === schedule.periodId && item.status === "Submitted",
    )
    .sort((a, b) => a.id.localeCompare(b.id))) {
    for (const day of request.days) {
      map.set(`${request.employeeId}|${day.date}`, day);
    }
  }
  return map;
}

function splitSlice(slice: StaffingSlice, slotMinutes: number): StaffingSlice[] {
  const interval = toMinuteInterval(slice.startTime, slice.endTime);
  if (!interval) return [];
  const split: StaffingSlice[] = [];
  for (let start = interval.start; start < interval.end; start += slotMinutes) {
    split.push({
      ...slice,
      startTime: minutesToTime(start),
      endTime: minutesToTime(Math.min(interval.end, start + slotMinutes)),
    });
  }
  return split;
}

function workingEmployeeIdsForSlice(
  slice: StaffingSlice,
  requirements: StaffingRequirement[],
  assignments: ShiftAssignment[],
): string[] {
  const expected = toMinuteInterval(slice.startTime, slice.endTime);
  if (!expected) return [];
  const current = calculateStaffingForDate(slice.date, requirements, assignments);
  return [
    ...new Set(
      current
        .filter((candidate) => {
          const interval = toMinuteInterval(candidate.startTime, candidate.endTime);
          return interval !== null && intervalsOverlap(interval, expected);
        })
        .flatMap((candidate) => candidate.employeeIds),
    ),
  ].sort((a, b) => a.localeCompare(b));
}

function employeeWorkingIntervals(
  employeeId: string,
  date: ISODate,
  assignments: ShiftAssignment[],
): MinuteInterval[] {
  return mergeIntervals(
    assignments
      .filter(
        (assignment) =>
          assignment.employeeId === employeeId && assignment.date === date,
      )
      .flatMap((assignment) => {
        const interval = toMinuteInterval(assignment.startTime, assignment.endTime);
        if (!interval) return [];
        const breaks = assignment.breaks.flatMap((shiftBreak) => {
          const breakInterval = toMinuteInterval(shiftBreak.startTime, shiftBreak.endTime);
          return breakInterval ? [breakInterval] : [];
        });
        return subtractIntervals([interval], breaks);
      }),
  );
}

function employeeGrossIntervals(
  employeeId: string,
  date: ISODate,
  assignments: ShiftAssignment[],
): MinuteInterval[] {
  return mergeIntervals(
    assignments
      .filter(
        (assignment) =>
          assignment.employeeId === employeeId && assignment.date === date,
      )
      .flatMap((assignment) => {
        const interval = toMinuteInterval(assignment.startTime, assignment.endTime);
        return interval ? [interval] : [];
      }),
  );
}

function hasTooManyConsecutiveDays(
  employeeId: string,
  candidateDate: ISODate,
  assignments: ShiftAssignment[],
  maxConsecutiveDays: number,
): boolean {
  const dates = [
    ...new Set([
      ...assignments
        .filter((assignment) => assignment.employeeId === employeeId)
        .map((assignment) => assignment.date),
      candidateDate,
    ]),
  ].sort((a, b) => a.localeCompare(b));
  let run = 0;
  let previous: ISODate | undefined;
  for (const date of dates) {
    run = previous && daysBetween(previous, date) === 1 ? run + 1 : 1;
    if (run > maxConsecutiveDays) return true;
    previous = date;
  }
  return false;
}

function candidateAssignments(
  employeeId: string,
  date: ISODate,
  interval: MinuteInterval,
  assignments: ShiftAssignment[],
): ShiftAssignment[] | null {
  const proposed: ShiftAssignment = {
    id: "candidate",
    employeeId,
    date,
    startTime: minutesToTime(interval.start),
    endTime: minutesToTime(interval.end),
    breaks: [],
    source: "auto",
    locked: false,
  };
  const sameEmployee = assignments.filter(
    (assignment) => assignment.employeeId === employeeId && assignment.date === date,
  );
  if (
    sameEmployee.some((assignment) => {
      const existing = toMinuteInterval(assignment.startTime, assignment.endTime);
      return existing !== null && intervalsOverlap(existing, interval);
    })
  ) {
    return null;
  }
  return [...assignments, proposed];
}

function eligibleForSlice(input: {
  employeeId: string;
  slice: StaffingSlice;
  requestDay: ShiftRequestDay;
  assignments: ShiftAssignment[];
  constraints: ScheduleConstraints;
}): boolean {
  const { employeeId, slice, requestDay, assignments, constraints } = input;
  if (requestDay.availability !== "available") return false;
  const interval = toMinuteInterval(slice.startTime, slice.endTime);
  if (!interval) return false;
  if (requestDay.startTime || requestDay.endTime) {
    if (!requestDay.startTime || !requestDay.endTime) return false;
    const requested = toMinuteInterval(requestDay.startTime, requestDay.endTime);
    if (!requested || requested.start > interval.start || requested.end < interval.end) return false;
  }

  const proposed = candidateAssignments(employeeId, slice.date, interval, assignments);
  if (!proposed) return false;
  const working = employeeWorkingIntervals(employeeId, slice.date, proposed);
  const gross = employeeGrossIntervals(employeeId, slice.date, proposed);
  const workingMinutes = intervalMinutes(working);
  const spanMinutes = gross.length > 0 ? gross.at(-1)!.end - gross[0].start : 0;
  const actualBreakMinutes = spanMinutes - workingMinutes;
  if (workingMinutes > constraints.maxDailyMinutes) return false;
  if (
    workingMinutes > constraints.breakRequiredAfterMinutes &&
    actualBreakMinutes < constraints.minimumBreakMinutes
  ) {
    return false;
  }
  return !hasTooManyConsecutiveDays(
    employeeId,
    slice.date,
    assignments,
    constraints.maxConsecutiveDays,
  );
}

function hasAdjacentAssignment(
  employeeId: string,
  slice: StaffingSlice,
  assignments: ShiftAssignment[],
): boolean {
  return assignments.some(
    (assignment) =>
      assignment.employeeId === employeeId &&
      assignment.date === slice.date &&
      (assignment.endTime === slice.startTime || assignment.startTime === slice.endTime),
  );
}

function totalAssignedMinutes(employeeId: string, assignments: ShiftAssignment[]): number {
  const dates = [
    ...new Set(
      assignments
        .filter((assignment) => assignment.employeeId === employeeId)
        .map((assignment) => assignment.date),
    ),
  ];
  return dates.reduce(
    (total, date) => total + intervalMinutes(employeeWorkingIntervals(employeeId, date, assignments)),
    0,
  );
}

function autoAssignmentId(
  schedule: ShiftSchedule,
  revision: number,
  employeeId: string,
  slice: StaffingSlice,
): string {
  return [
    "auto",
    schedule.id,
    `r${revision}`,
    slice.date,
    slice.startTime,
    slice.endTime,
    employeeId,
  ]
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-");
}

function addAutoAssignment(
  schedule: ShiftSchedule,
  revision: number,
  employeeId: string,
  slice: StaffingSlice,
  assignments: ShiftAssignment[],
): ShiftAssignment[] {
  const left = assignments.find(
    (assignment) =>
      assignment.employeeId === employeeId &&
      assignment.date === slice.date &&
      assignment.source === "auto" &&
      !assignment.locked &&
      assignment.endTime === slice.startTime,
  );
  const right = assignments.find(
    (assignment) =>
      assignment.employeeId === employeeId &&
      assignment.date === slice.date &&
      assignment.source === "auto" &&
      !assignment.locked &&
      assignment.startTime === slice.endTime,
  );

  if (left && right && left.id !== right.id) {
    return assignments
      .filter((assignment) => assignment.id !== right.id)
      .map((assignment) =>
        assignment.id === left.id
          ? { ...assignment, endTime: right.endTime }
          : assignment,
      );
  }
  if (left) {
    return assignments.map((assignment) =>
      assignment.id === left.id
        ? { ...assignment, endTime: slice.endTime }
        : assignment,
    );
  }
  if (right) {
    return assignments.map((assignment) =>
      assignment.id === right.id
        ? { ...assignment, startTime: slice.startTime }
        : assignment,
    );
  }
  return [
    ...assignments,
    {
      id: autoAssignmentId(schedule, revision, employeeId, slice),
      employeeId,
      date: slice.date,
      startTime: slice.startTime,
      endTime: slice.endTime,
      breaks: [],
      source: "auto",
      locked: false,
    },
  ];
}

function sortAssignments(assignments: ShiftAssignment[]): ShiftAssignment[] {
  return [...assignments].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.startTime.localeCompare(b.startTime) ||
      a.employeeId.localeCompare(b.employeeId) ||
      a.id.localeCompare(b.id),
  );
}

function coalesceUnfilled(slots: AutoScheduleUnfilledSlot[]): AutoScheduleUnfilledSlot[] {
  const result: AutoScheduleUnfilledSlot[] = [];
  for (const slot of slots.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.startTime.localeCompare(b.startTime) ||
      a.missingCount - b.missingCount,
  )) {
    const previous = result.at(-1);
    if (
      previous &&
      previous.date === slot.date &&
      previous.endTime === slot.startTime &&
      previous.missingCount === slot.missingCount
    ) {
      previous.endTime = slot.endTime;
    } else {
      result.push({ ...slot });
    }
  }
  return result;
}

export function generateAutoSchedule(input: AutoScheduleInput): AutoScheduleResult {
  const {
    schedule,
    employees,
    requests,
    requirements,
    actor,
    occurredAt,
  } = input;
  assertPermission(actor, "schedule:generate");
  const constraints = { ...DEFAULT_SCHEDULE_CONSTRAINTS, ...input.constraints };
  const slotMinutes = input.slotMinutes ?? 60;
  if (!Number.isInteger(slotMinutes) || slotMinutes < 15 || slotMinutes > 24 * 60) {
    throw new DomainValidationError(
      "INVALID_SLOT_MINUTES",
      "自動割当の時間単位は15〜1440分の整数で指定してください。",
    );
  }

  const allScheduleDates = enumerateDates(schedule.startDate, schedule.endDate);
  const dates = [...new Set(input.dates ?? allScheduleDates)].sort((a, b) => a.localeCompare(b));
  if (dates.some((date) => !allScheduleDates.includes(date))) {
    throw new DomainValidationError("DATE_OUTSIDE_SCHEDULE", "対象期間外の日付があります。");
  }
  const targetDates = new Set(dates);
  const protectedRevision = schedule.status === "Confirmed" || schedule.status === "Published";
  const revision = protectedRevision ? schedule.revision + 1 : schedule.revision;
  let assignments = schedule.assignments
    .filter(
      (assignment) =>
        !targetDates.has(assignment.date) ||
        assignment.source === "manual" ||
        assignment.locked,
    )
    .map(cloneAssignment);
  const days = requestDayMap(schedule, requests);
  const activeEmployees = employees
    .filter((employee) => employee.active)
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const date of dates) {
    const requirementSlices = calculateStaffingForDate(date, requirements, assignments)
      .filter((slice) => slice.requiredCount > 0)
      .flatMap((slice) => splitSlice(slice, slotMinutes));

    for (const slice of requirementSlices) {
      let working = workingEmployeeIdsForSlice(slice, requirements, assignments);
      while (working.length < slice.requiredCount) {
        const candidates = activeEmployees
          .filter((employee) => !working.includes(employee.id))
          .filter((employee) => {
            const requestDay = days.get(`${employee.id}|${date}`);
            return Boolean(
              requestDay &&
                eligibleForSlice({
                  employeeId: employee.id,
                  slice,
                  requestDay,
                  assignments,
                  constraints,
                }),
            );
          })
          .sort((a, b) => {
            const adjacencyDifference =
              Number(!hasAdjacentAssignment(a.id, slice, assignments)) -
              Number(!hasAdjacentAssignment(b.id, slice, assignments));
            return (
              adjacencyDifference ||
              totalAssignedMinutes(a.id, assignments) -
                totalAssignedMinutes(b.id, assignments) ||
              a.id.localeCompare(b.id)
            );
          });
        const selected = candidates[0];
        if (!selected) break;
        assignments = addAutoAssignment(
          schedule,
          revision,
          selected.id,
          slice,
          assignments,
        );
        working = workingEmployeeIdsForSlice(slice, requirements, assignments);
      }
    }
  }

  assignments = sortAssignments(assignments);
  const staffing = calculateStaffing(dates, requirements, assignments);
  const unfilled = coalesceUnfilled(
    staffing.slices
      .filter((slice) => slice.shortageCount > 0)
      .map((slice) => ({
        date: slice.date,
        startTime: slice.startTime,
        endTime: slice.endTime,
        missingCount: slice.shortageCount,
        reason: "NO_ELIGIBLE_EMPLOYEE" as const,
      })),
  );
  const scheduleWithoutCommitMetadata = { ...schedule };
  delete scheduleWithoutCommitMetadata.confirmedAt;
  delete scheduleWithoutCommitMetadata.confirmedBy;
  delete scheduleWithoutCommitMetadata.publishedAt;
  delete scheduleWithoutCommitMetadata.publishedBy;
  const draft: ShiftSchedule = {
    ...scheduleWithoutCommitMetadata,
    status: "Draft",
    revision,
    assignments,
    ...(protectedRevision ? { supersedesRevision: schedule.revision } : {}),
    updatedAt: occurredAt,
    updatedBy: actor.userId,
  };

  return {
    schedule: draft,
    staffing,
    conflicts: detectConflicts(assignments, requests, constraints),
    unfilled,
    auditLog: createAuditLogEntry({
      scheduleId: schedule.id,
      revision,
      action: "AUTO_SCHEDULE_GENERATED",
      actorId: actor.userId,
      actorRole: actor.role,
      occurredAt,
      entityType: "schedule",
      entityId: schedule.id,
      description: `希望・必要人数・勤務制約からDraftシフトを自動生成しました。`,
      before: schedule,
      after: draft,
      metadata: {
        generatedAssignmentCount: assignments.filter(
          (assignment) => assignment.source === "auto" && !assignment.locked,
        ).length,
        unfilledSlotCount: unfilled.length,
      },
    }),
  };
}
