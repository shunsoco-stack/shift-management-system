import type {
  ConstraintRow,
  ConstraintType,
  ShiftAssignmentRow,
  ShiftPeriodData,
  ShiftRequestRow,
} from "./shift-data";

export type ConflictKind =
  | "STAFF_SHORTAGE"
  | "STAFF_OVERAGE"
  | "DAY_OFF_REQUEST"
  | "OUTSIDE_REQUESTED_TIME"
  | "OVERLAPPING_ASSIGNMENT"
  | "MAX_DAILY_MINUTES"
  | "MIN_BREAK_MINUTES"
  | "MIN_REST_MINUTES"
  | "MAX_CONSECUTIVE_DAYS";

export type ShiftConflict = {
  id: string;
  kind: ConflictKind;
  severity: "high" | "medium" | "low";
  employeeId: string | null;
  workDate: string;
  startTime?: string;
  endTime?: string;
  requiredCount?: number;
  assignedCount?: number;
  delta?: number;
  message: string;
  assignmentIds: string[];
};

export type StaffingCoverage = {
  workDate: string;
  startTime: string;
  endTime: string;
  requiredCount: number;
  assignedCount: number;
  delta: number;
};

export type ConflictReport = {
  conflicts: ShiftConflict[];
  coverage: StaffingCoverage[];
  summary: {
    conflictCount: number;
    highCount: number;
    shortageMinutes: number;
    shortagePersonMinutes: number;
    overstaffedMinutes: number;
  };
  disclaimer: string;
};

function minutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function hhmm(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function datesBetween(start: string, end: string): string[] {
  const result: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last) {
    result.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

function constraintValue(
  constraints: ConstraintRow[],
  type: ConstraintType,
  employeeId: string,
  fallback: number,
): ConstraintRow {
  return (
    constraints.find(
      (constraint) => constraint.type === type && constraint.employeeId === employeeId,
    ) ??
    constraints.find(
      (constraint) => constraint.type === type && constraint.employeeId === null,
    ) ?? {
      id: `fallback-${type}`,
      periodId: null,
      employeeId: null,
      type,
      value: fallback,
      configJson: "{}",
      isActive: 1,
    }
  );
}

function assignmentDuration(assignment: ShiftAssignmentRow): number {
  return Math.max(
    0,
    minutes(assignment.endTime) -
      minutes(assignment.startTime) -
      assignment.breakMinutes,
  );
}

function requestKey(employeeId: string, workDate: string): string {
  return `${employeeId}|${workDate}`;
}

function conflictId(kind: string, ...parts: Array<string | number>): string {
  return [kind.toLowerCase(), ...parts].join(":");
}

function calculateCoverage(data: ShiftPeriodData): StaffingCoverage[] {
  const raw: StaffingCoverage[] = [];
  for (const workDate of datesBetween(data.period.startsOn, data.period.endsOn)) {
    const dayOfWeek = new Date(`${workDate}T00:00:00Z`).getUTCDay();
    for (const requirement of data.requirements.filter(
      (item) => item.dayOfWeek === dayOfWeek,
    )) {
      const requirementStart = minutes(requirement.startTime);
      const requirementEnd = minutes(requirement.endTime);
      for (let start = requirementStart; start < requirementEnd; start += 30) {
        const end = Math.min(start + 30, requirementEnd);
        const covering = data.assignments.filter(
          (assignment) =>
            assignment.workDate === workDate &&
            minutes(assignment.startTime) <= start &&
            minutes(assignment.endTime) >= end,
        );
        raw.push({
          workDate,
          startTime: hhmm(start),
          endTime: hhmm(end),
          requiredCount: requirement.requiredCount,
          assignedCount: new Set(covering.map((assignment) => assignment.employeeId)).size,
          delta:
            new Set(covering.map((assignment) => assignment.employeeId)).size -
            requirement.requiredCount,
        });
      }
    }
  }

  const merged: StaffingCoverage[] = [];
  for (const slot of raw) {
    const previous = merged.at(-1);
    if (
      previous &&
      previous.workDate === slot.workDate &&
      previous.endTime === slot.startTime &&
      previous.requiredCount === slot.requiredCount &&
      previous.assignedCount === slot.assignedCount
    ) {
      previous.endTime = slot.endTime;
    } else {
      merged.push({ ...slot });
    }
  }
  return merged;
}

function staffingConflicts(coverage: StaffingCoverage[]): ShiftConflict[] {
  const conflicts: ShiftConflict[] = [];
  for (const slot of coverage) {
    if (slot.delta < 0) {
      conflicts.push({
        id: conflictId("shortage", slot.workDate, slot.startTime, slot.endTime),
        kind: "STAFF_SHORTAGE",
        severity: "high",
        employeeId: null,
        workDate: slot.workDate,
        startTime: slot.startTime,
        endTime: slot.endTime,
        requiredCount: slot.requiredCount,
        assignedCount: slot.assignedCount,
        delta: slot.delta,
        message: `${slot.startTime}〜${slot.endTime}は${Math.abs(slot.delta)}名不足しています。`,
        assignmentIds: [],
      });
      continue;
    }
    const substantialOverage = Math.max(2, Math.ceil(slot.requiredCount * 0.5));
    if (slot.delta >= substantialOverage) {
      conflicts.push({
        id: conflictId("overage", slot.workDate, slot.startTime, slot.endTime),
        kind: "STAFF_OVERAGE",
        severity: "low",
        employeeId: null,
        workDate: slot.workDate,
        startTime: slot.startTime,
        endTime: slot.endTime,
        requiredCount: slot.requiredCount,
        assignedCount: slot.assignedCount,
        delta: slot.delta,
        message: `${slot.startTime}〜${slot.endTime}は必要人数より${slot.delta}名多い配置です。自動削除はしません。`,
        assignmentIds: [],
      });
    }
  }
  return conflicts;
}

function preferenceConflicts(data: ShiftPeriodData): ShiftConflict[] {
  const requests = new Map<string, ShiftRequestRow>(
    data.requests.map((request) => [
      requestKey(request.employeeId, request.workDate),
      request,
    ]),
  );
  const conflicts: ShiftConflict[] = [];
  for (const assignment of data.assignments) {
    const request = requests.get(requestKey(assignment.employeeId, assignment.workDate));
    if (!request) continue;
    if (request.availability === "day_off") {
      conflicts.push({
        id: conflictId("day-off", assignment.id),
        kind: "DAY_OFF_REQUEST",
        severity: "high",
        employeeId: assignment.employeeId,
        workDate: assignment.workDate,
        startTime: assignment.startTime,
        endTime: assignment.endTime,
        message: "希望休の日にシフトが配置されています。",
        assignmentIds: [assignment.id],
      });
      continue;
    }
    if (
      (request.requestedStart && assignment.startTime < request.requestedStart) ||
      (request.requestedEnd && assignment.endTime > request.requestedEnd)
    ) {
      conflicts.push({
        id: conflictId("outside-request", assignment.id),
        kind: "OUTSIDE_REQUESTED_TIME",
        severity: "medium",
        employeeId: assignment.employeeId,
        workDate: assignment.workDate,
        startTime: assignment.startTime,
        endTime: assignment.endTime,
        message: `希望時間 ${request.requestedStart ?? "--:--"}〜${request.requestedEnd ?? "--:--"} の範囲外です。`,
        assignmentIds: [assignment.id],
      });
    }
  }
  return conflicts;
}

function employeeConstraintConflicts(data: ShiftPeriodData): ShiftConflict[] {
  const conflicts: ShiftConflict[] = [];
  for (const employee of data.employees) {
    const assignments = data.assignments
      .filter((assignment) => assignment.employeeId === employee.id)
      .sort((left, right) =>
        `${left.workDate}T${left.startTime}`.localeCompare(
          `${right.workDate}T${right.startTime}`,
        ),
      );
    const byDate = new Map<string, ShiftAssignmentRow[]>();
    for (const assignment of assignments) {
      const current = byDate.get(assignment.workDate) ?? [];
      current.push(assignment);
      byDate.set(assignment.workDate, current);
    }

    for (const [workDate, dayAssignments] of byDate) {
      dayAssignments.sort((left, right) => left.startTime.localeCompare(right.startTime));
      for (let index = 1; index < dayAssignments.length; index += 1) {
        const previous = dayAssignments[index - 1];
        const current = dayAssignments[index];
        if (current.startTime < previous.endTime) {
          conflicts.push({
            id: conflictId("overlap", previous.id, current.id),
            kind: "OVERLAPPING_ASSIGNMENT",
            severity: "high",
            employeeId: employee.id,
            workDate,
            startTime: current.startTime,
            endTime: previous.endTime,
            message: "同じ従業員の勤務時間が重複しています。",
            assignmentIds: [previous.id, current.id],
          });
        }
      }

      const maxDaily = constraintValue(
        data.constraints,
        "MAX_DAILY_MINUTES",
        employee.id,
        480,
      ).value;
      const totalMinutes = dayAssignments.reduce(
        (sum, assignment) => sum + assignmentDuration(assignment),
        0,
      );
      if (totalMinutes > maxDaily) {
        conflicts.push({
          id: conflictId("max-daily", employee.id, workDate),
          kind: "MAX_DAILY_MINUTES",
          severity: "high",
          employeeId: employee.id,
          workDate,
          message: `実労${totalMinutes}分で、設定上限${maxDaily}分を超えています。`,
          assignmentIds: dayAssignments.map((assignment) => assignment.id),
        });
      }

      const breakConstraint = constraintValue(
        data.constraints,
        "MIN_BREAK_MINUTES",
        employee.id,
        45,
      );
      let breakAfterMinutes = 360;
      try {
        const config = JSON.parse(breakConstraint.configJson) as {
          afterMinutes?: unknown;
        };
        if (typeof config.afterMinutes === "number") {
          breakAfterMinutes = config.afterMinutes;
        }
      } catch {
        // Invalid optional config falls back to the conservative demo default.
      }
      for (const assignment of dayAssignments) {
        const elapsed = minutes(assignment.endTime) - minutes(assignment.startTime);
        if (
          elapsed > breakAfterMinutes &&
          assignment.breakMinutes < breakConstraint.value
        ) {
          conflicts.push({
            id: conflictId("min-break", assignment.id),
            kind: "MIN_BREAK_MINUTES",
            severity: "medium",
            employeeId: employee.id,
            workDate,
            startTime: assignment.startTime,
            endTime: assignment.endTime,
            message: `休憩${assignment.breakMinutes}分で、設定値${breakConstraint.value}分を下回っています。`,
            assignmentIds: [assignment.id],
          });
        }
      }
    }

    const minRest = constraintValue(
      data.constraints,
      "MIN_REST_MINUTES",
      employee.id,
      660,
    ).value;
    for (let index = 1; index < assignments.length; index += 1) {
      const previous = assignments[index - 1];
      const current = assignments[index];
      if (previous.workDate === current.workDate) continue;
      const previousEnd = Date.parse(
        `${previous.workDate}T${previous.endTime}:00Z`,
      );
      const currentStart = Date.parse(`${current.workDate}T${current.startTime}:00Z`);
      const restMinutes = Math.round((currentStart - previousEnd) / 60_000);
      if (restMinutes < minRest) {
        conflicts.push({
          id: conflictId("min-rest", previous.id, current.id),
          kind: "MIN_REST_MINUTES",
          severity: "medium",
          employeeId: employee.id,
          workDate: current.workDate,
          startTime: current.startTime,
          message: `前回勤務からの間隔が${restMinutes}分で、設定値${minRest}分を下回っています。`,
          assignmentIds: [previous.id, current.id],
        });
      }
    }

    const maxConsecutive = constraintValue(
      data.constraints,
      "MAX_CONSECUTIVE_DAYS",
      employee.id,
      5,
    ).value;
    const dates = [...byDate.keys()].sort();
    let streak = 0;
    let previousDate: Date | null = null;
    for (const date of dates) {
      const currentDate = new Date(`${date}T00:00:00Z`);
      if (
        previousDate &&
        currentDate.getTime() - previousDate.getTime() === 86_400_000
      ) {
        streak += 1;
      } else {
        streak = 1;
      }
      if (streak > maxConsecutive) {
        conflicts.push({
          id: conflictId("consecutive", employee.id, date),
          kind: "MAX_CONSECUTIVE_DAYS",
          severity: "medium",
          employeeId: employee.id,
          workDate: date,
          message: `${streak}日連続勤務で、設定値${maxConsecutive}日を超えています。`,
          assignmentIds: (byDate.get(date) ?? []).map((assignment) => assignment.id),
        });
      }
      previousDate = currentDate;
    }
  }
  return conflicts;
}

export function evaluateConflicts(data: ShiftPeriodData): ConflictReport {
  const coverage = calculateCoverage(data);
  const conflicts = [
    ...staffingConflicts(coverage),
    ...preferenceConflicts(data),
    ...employeeConstraintConflicts(data),
  ];
  let shortageMinutes = 0;
  let shortagePersonMinutes = 0;
  let overstaffedMinutes = 0;
  for (const slot of coverage) {
    const duration = minutes(slot.endTime) - minutes(slot.startTime);
    if (slot.delta < 0) {
      shortageMinutes += duration;
      shortagePersonMinutes += duration * Math.abs(slot.delta);
    } else if (slot.delta >= Math.max(2, Math.ceil(slot.requiredCount * 0.5))) {
      overstaffedMinutes += duration;
    }
  }
  return {
    conflicts,
    coverage,
    summary: {
      conflictCount: conflicts.length,
      highCount: conflicts.filter((conflict) => conflict.severity === "high").length,
      shortageMinutes,
      shortagePersonMinutes,
      overstaffedMinutes,
    },
    disclaimer:
      "Conflictは勤務条件の違反候補です。法令適合性を保証する判定ではなく、最終判断は管理者が行ってください。",
  };
}
