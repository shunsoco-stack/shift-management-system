import {
  daysBetween,
  intervalContains,
  intervalMinutes,
  intervalsOverlap,
  isValidISODate,
  mergeIntervals,
  subtractIntervals,
  toMinuteInterval,
  type MinuteInterval,
} from "./time";
import {
  DEFAULT_SCHEDULE_CONSTRAINTS,
  type ScheduleConflict,
  type ScheduleConstraints,
  type ShiftAssignment,
  type ShiftRequest,
  type ShiftRequestDay,
} from "./types";

function groupBy<T>(values: T[], key: (value: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const groupKey = key(value);
    const group = groups.get(groupKey);
    if (group) group.push(value);
    else groups.set(groupKey, [value]);
  }
  return groups;
}

function conflictId(type: ScheduleConflict["type"], ...parts: string[]): string {
  const normalized = parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `conflict-${type.toLowerCase().replaceAll("_", "-")}-${normalized}`;
}

function makeConflict(
  conflict: Omit<ScheduleConflict, "id"> & { idParts: string[] },
): ScheduleConflict {
  const { idParts, ...value } = conflict;
  return { id: conflictId(value.type, ...idParts), ...value };
}

interface ValidAssignment {
  assignment: ShiftAssignment;
  interval: MinuteInterval;
}

function validateAssignments(assignments: ShiftAssignment[]): {
  valid: ValidAssignment[];
  conflicts: ScheduleConflict[];
} {
  const valid: ValidAssignment[] = [];
  const conflicts: ScheduleConflict[] = [];

  for (const assignment of assignments) {
    const interval = toMinuteInterval(assignment.startTime, assignment.endTime);
    if (!isValidISODate(assignment.date) || !interval) {
      conflicts.push(
        makeConflict({
          type: "INVALID_INTERVAL",
          severity: "error",
          employeeId: assignment.employeeId,
          date: isValidISODate(assignment.date) ? assignment.date : undefined,
          assignmentIds: [assignment.id],
          message: `${assignment.startTime}〜${assignment.endTime} は不正な勤務区間です。`,
          details: { source: "assignment", startTime: assignment.startTime, endTime: assignment.endTime },
          idParts: [assignment.id],
        }),
      );
      continue;
    }

    valid.push({ assignment, interval });
    const validBreaks: Array<{ id: string; interval: MinuteInterval }> = [];
    for (const shiftBreak of assignment.breaks) {
      const breakInterval = toMinuteInterval(shiftBreak.startTime, shiftBreak.endTime);
      if (!breakInterval || !intervalContains(interval, breakInterval)) {
        conflicts.push(
          makeConflict({
            type: "INVALID_INTERVAL",
            severity: "error",
            employeeId: assignment.employeeId,
            date: assignment.date,
            assignmentIds: [assignment.id],
            message: `${shiftBreak.startTime}〜${shiftBreak.endTime} は勤務枠内の有効な休憩区間ではありません。`,
            details: {
              source: "break",
              breakId: shiftBreak.id,
              startTime: shiftBreak.startTime,
              endTime: shiftBreak.endTime,
            },
            idParts: [assignment.id, shiftBreak.id],
          }),
        );
        continue;
      }
      validBreaks.push({ id: shiftBreak.id, interval: breakInterval });
    }

    for (let first = 0; first < validBreaks.length; first += 1) {
      for (let second = first + 1; second < validBreaks.length; second += 1) {
        if (!intervalsOverlap(validBreaks[first].interval, validBreaks[second].interval)) continue;
        conflicts.push(
          makeConflict({
            type: "INVALID_INTERVAL",
            severity: "error",
            employeeId: assignment.employeeId,
            date: assignment.date,
            assignmentIds: [assignment.id],
            message: "同じ勤務枠の休憩時間が重複しています。",
            details: {
              source: "break_overlap",
              breakIds: [validBreaks[first].id, validBreaks[second].id],
            },
            idParts: [assignment.id, validBreaks[first].id, validBreaks[second].id],
          }),
        );
      }
    }
  }

  return { valid, conflicts };
}

function validateRequestedDays(requests: ShiftRequest[]): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  for (const request of requests.filter((item) => item.status === "Submitted")) {
    for (const day of request.days) {
      const hasOnlyOneTime = Boolean(day.startTime) !== Boolean(day.endTime);
      const invalidRange =
        day.startTime && day.endTime
          ? toMinuteInterval(day.startTime, day.endTime) === null
          : false;
      if (isValidISODate(day.date) && !hasOnlyOneTime && !invalidRange) continue;
      conflicts.push(
        makeConflict({
          type: "INVALID_INTERVAL",
          severity: "error",
          employeeId: request.employeeId,
          date: isValidISODate(day.date) ? day.date : undefined,
          assignmentIds: [],
          message: "希望シフトに不正な日付または希望時間があります。",
          details: {
            source: "shift_request",
            shiftRequestId: request.id,
            startTime: day.startTime,
            endTime: day.endTime,
          },
          idParts: [request.id, day.date],
        }),
      );
    }
  }
  return conflicts;
}

function requestedDayMap(requests: ShiftRequest[]): Map<string, ShiftRequestDay> {
  const map = new Map<string, ShiftRequestDay>();
  for (const request of [...requests]
    .filter((item) => item.status === "Submitted")
    .sort((a, b) => a.id.localeCompare(b.id))) {
    for (const day of request.days) {
      map.set(`${request.employeeId}|${day.date}`, day);
    }
  }
  return map;
}

function preferenceConflicts(
  validAssignments: ValidAssignment[],
  requests: ShiftRequest[],
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  const days = requestedDayMap(requests);
  for (const { assignment, interval } of validAssignments) {
    const requestedDay = days.get(`${assignment.employeeId}|${assignment.date}`);
    if (!requestedDay) continue;
    if (requestedDay.availability === "preferred_off") {
      conflicts.push(
        makeConflict({
          type: "PREFERRED_DAY_OFF",
          severity: "warning",
          employeeId: assignment.employeeId,
          date: assignment.date,
          assignmentIds: [assignment.id],
          message: "希望休に勤務が割り当てられています。",
          details: {},
          idParts: [assignment.id],
        }),
      );
      continue;
    }

    if (!requestedDay.startTime || !requestedDay.endTime) continue;
    const requestedInterval = toMinuteInterval(requestedDay.startTime, requestedDay.endTime);
    if (!requestedInterval || intervalContains(requestedInterval, interval)) continue;
    conflicts.push(
      makeConflict({
        type: "OUTSIDE_REQUESTED_HOURS",
        severity: "warning",
        employeeId: assignment.employeeId,
        date: assignment.date,
        assignmentIds: [assignment.id],
        message: `希望時間 ${requestedDay.startTime}〜${requestedDay.endTime} の範囲外です。`,
        details: {
          requestedStartTime: requestedDay.startTime,
          requestedEndTime: requestedDay.endTime,
          assignedStartTime: assignment.startTime,
          assignedEndTime: assignment.endTime,
        },
        idParts: [assignment.id],
      }),
    );
  }
  return conflicts;
}

function overlapConflicts(validAssignments: ValidAssignment[]): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  const groups = groupBy(
    validAssignments,
    ({ assignment }) => `${assignment.employeeId}|${assignment.date}`,
  );

  for (const group of groups.values()) {
    const sorted = [...group].sort(
      (a, b) => a.interval.start - b.interval.start || a.assignment.id.localeCompare(b.assignment.id),
    );
    for (let first = 0; first < sorted.length; first += 1) {
      for (let second = first + 1; second < sorted.length; second += 1) {
        if (sorted[second].interval.start >= sorted[first].interval.end) break;
        if (!intervalsOverlap(sorted[first].interval, sorted[second].interval)) continue;
        const ids = [sorted[first].assignment.id, sorted[second].assignment.id].sort();
        conflicts.push(
          makeConflict({
            type: "OVERLAPPING_ASSIGNMENTS",
            severity: "error",
            employeeId: sorted[first].assignment.employeeId,
            date: sorted[first].assignment.date,
            assignmentIds: ids,
            message: "同じ従業員の勤務時間が重複しています。",
            details: {},
            idParts: ids,
          }),
        );
      }
    }
  }
  return conflicts;
}

function validBreakIntervals(item: ValidAssignment): MinuteInterval[] {
  return item.assignment.breaks.flatMap((shiftBreak) => {
    const interval = toMinuteInterval(shiftBreak.startTime, shiftBreak.endTime);
    return interval && intervalContains(item.interval, interval) ? [interval] : [];
  });
}

function workAndBreakConflicts(
  validAssignments: ValidAssignment[],
  constraints: ScheduleConstraints,
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  const groups = groupBy(
    validAssignments,
    ({ assignment }) => `${assignment.employeeId}|${assignment.date}`,
  );

  for (const group of groups.values()) {
    const first = group[0].assignment;
    const grossIntervals = mergeIntervals(group.map(({ interval }) => interval));
    const workingIntervals = mergeIntervals(
      group.flatMap((item) => subtractIntervals([item.interval], validBreakIntervals(item))),
    );
    const spanMinutes =
      grossIntervals.length > 0
        ? grossIntervals.at(-1)!.end - grossIntervals[0].start
        : 0;
    const workingMinutes = intervalMinutes(workingIntervals);
    const actualBreakMinutes = spanMinutes - workingMinutes;
    const assignmentIds = group.map(({ assignment }) => assignment.id).sort();

    if (workingMinutes > constraints.maxDailyMinutes) {
      conflicts.push(
        makeConflict({
          type: "MAX_DAILY_MINUTES",
          severity: "warning",
          employeeId: first.employeeId,
          date: first.date,
          assignmentIds,
          message: `実勤務 ${workingMinutes}分が1日の上限 ${constraints.maxDailyMinutes}分を超えています。`,
          details: { workingMinutes, maxDailyMinutes: constraints.maxDailyMinutes },
          idParts: [first.employeeId, first.date],
        }),
      );
    }

    if (
      workingMinutes > constraints.breakRequiredAfterMinutes &&
      actualBreakMinutes < constraints.minimumBreakMinutes
    ) {
      conflicts.push(
        makeConflict({
          type: "MINIMUM_BREAK",
          severity: "warning",
          employeeId: first.employeeId,
          date: first.date,
          assignmentIds,
          message: `休憩 ${actualBreakMinutes}分が設定上の最低 ${constraints.minimumBreakMinutes}分を下回っています。`,
          details: {
            workingMinutes,
            actualBreakMinutes,
            minimumBreakMinutes: constraints.minimumBreakMinutes,
            breakRequiredAfterMinutes: constraints.breakRequiredAfterMinutes,
          },
          idParts: [first.employeeId, first.date],
        }),
      );
    }
  }
  return conflicts;
}

function consecutiveDayConflicts(
  validAssignments: ValidAssignment[],
  constraints: ScheduleConstraints,
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  const byEmployee = groupBy(validAssignments, ({ assignment }) => assignment.employeeId);

  for (const [employeeId, employeeAssignments] of byEmployee) {
    const byDate = groupBy(employeeAssignments, ({ assignment }) => assignment.date);
    const dates = [...byDate.keys()].sort((a, b) => a.localeCompare(b));
    let run: string[] = [];
    const finishRun = () => {
      if (run.length <= constraints.maxConsecutiveDays) return;
      const assignmentIds = run.flatMap((date) =>
        (byDate.get(date) ?? []).map(({ assignment }) => assignment.id),
      ).sort();
      conflicts.push(
        makeConflict({
          type: "CONSECUTIVE_DAYS",
          severity: "warning",
          employeeId,
          date: run[0],
          assignmentIds,
          message: `${run.length}日連続勤務で、設定上限 ${constraints.maxConsecutiveDays}日を超えています。`,
          details: {
            consecutiveDays: run.length,
            maxConsecutiveDays: constraints.maxConsecutiveDays,
            dates: [...run],
          },
          idParts: [employeeId, run[0], run.at(-1) ?? run[0]],
        }),
      );
    };

    for (const date of dates) {
      const previous = run.at(-1);
      if (!previous || daysBetween(previous, date) === 1) {
        run.push(date);
      } else {
        finishRun();
        run = [date];
      }
    }
    finishRun();
  }
  return conflicts;
}

export function detectConflicts(
  assignments: ShiftAssignment[],
  requests: ShiftRequest[],
  constraintOverrides: Partial<ScheduleConstraints> = {},
): ScheduleConflict[] {
  const constraints = { ...DEFAULT_SCHEDULE_CONSTRAINTS, ...constraintOverrides };
  const { valid, conflicts: invalidAssignmentConflicts } = validateAssignments(assignments);
  const conflicts = [
    ...invalidAssignmentConflicts,
    ...validateRequestedDays(requests),
    ...preferenceConflicts(valid, requests),
    ...overlapConflicts(valid),
    ...workAndBreakConflicts(valid, constraints),
    ...consecutiveDayConflicts(valid, constraints),
  ];

  return conflicts.sort(
    (a, b) =>
      (a.date ?? "").localeCompare(b.date ?? "") ||
      (a.employeeId ?? "").localeCompare(b.employeeId ?? "") ||
      a.type.localeCompare(b.type) ||
      a.id.localeCompare(b.id),
  );
}

export function hasBlockingConflicts(conflicts: ScheduleConflict[]): boolean {
  return conflicts.some((conflict) => conflict.severity === "error");
}
