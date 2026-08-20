import type {
  ConstraintRow,
  ShiftPeriodData,
  StaffingRequirementRow,
} from "./shift-data";

export type GeneratedAssignment = {
  employeeId: string;
  workDate: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  source: "auto";
  note: string;
};

export type AutoScheduleResult = {
  assignments: GeneratedAssignment[];
  unresolved: Array<{
    workDate: string;
    startTime: string;
    endTime: string;
    requiredCount: number;
    assignedCount: number;
    missingCount: number;
  }>;
  explanation: string;
};

function minutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
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

function configuredValue(
  constraints: ConstraintRow[],
  type: ConstraintRow["type"],
  employeeId: string,
  fallback: number,
): number {
  return (
    constraints.find(
      (constraint) => constraint.type === type && constraint.employeeId === employeeId,
    )?.value ??
    constraints.find(
      (constraint) => constraint.type === type && constraint.employeeId === null,
    )?.value ??
    fallback
  );
}

function wouldExceedConsecutiveDays(
  dates: Set<string>,
  adding: string,
  maximum: number,
): boolean {
  const combined = new Set(dates);
  combined.add(adding);
  let streak = 0;
  let previous: Date | null = null;
  for (const value of [...combined].sort()) {
    const current = new Date(`${value}T00:00:00Z`);
    streak =
      previous && current.getTime() - previous.getTime() === 86_400_000
        ? streak + 1
        : 1;
    if (streak > maximum) return true;
    previous = current;
  }
  return false;
}

function defaultBreak(startTime: string, endTime: string): number {
  return minutes(endTime) - minutes(startTime) > 360 ? 45 : 0;
}

function mergeAdjacent(assignments: GeneratedAssignment[]): GeneratedAssignment[] {
  const sorted = [...assignments].sort((left, right) =>
    `${left.employeeId}|${left.workDate}|${left.startTime}`.localeCompare(
      `${right.employeeId}|${right.workDate}|${right.startTime}`,
    ),
  );
  const merged: GeneratedAssignment[] = [];
  for (const assignment of sorted) {
    const previous = merged.at(-1);
    if (
      previous &&
      previous.employeeId === assignment.employeeId &&
      previous.workDate === assignment.workDate &&
      previous.endTime === assignment.startTime
    ) {
      previous.endTime = assignment.endTime;
      previous.breakMinutes = defaultBreak(previous.startTime, previous.endTime);
    } else {
      merged.push({ ...assignment });
    }
  }
  return merged;
}

export function generateDraftSchedule(data: ShiftPeriodData): AutoScheduleResult {
  const generated: GeneratedAssignment[] = [];
  const unresolved: AutoScheduleResult["unresolved"] = [];
  const workingMinutes = new Map<string, number>();
  const assignedDates = new Map<string, Set<string>>();
  const assignmentCount = new Map<string, number>();
  const submittedRequests = new Map(
    data.requests
      .filter((request) => request.requestStatus === "Submitted")
      .map((request) => [`${request.employeeId}|${request.workDate}`, request]),
  );

  const datedRequirements: Array<StaffingRequirementRow & { workDate: string }> = [];
  for (const workDate of datesBetween(data.period.startsOn, data.period.endsOn)) {
    const dayOfWeek = new Date(`${workDate}T00:00:00Z`).getUTCDay();
    for (const requirement of data.requirements) {
      if (requirement.dayOfWeek === dayOfWeek) {
        datedRequirements.push({ ...requirement, workDate });
      }
    }
  }
  datedRequirements.sort((left, right) =>
    `${left.workDate}|${left.startTime}`.localeCompare(
      `${right.workDate}|${right.startTime}`,
    ),
  );

  for (const requirement of datedRequirements) {
    const duration = minutes(requirement.endTime) - minutes(requirement.startTime);
    const candidates = data.employees
      .filter((employee) => {
        const request = submittedRequests.get(`${employee.id}|${requirement.workDate}`);
        if (!request || request.availability !== "available") return false;
        if (
          !request.requestedStart ||
          !request.requestedEnd ||
          request.requestedStart > requirement.startTime ||
          request.requestedEnd < requirement.endTime
        ) {
          return false;
        }

        const dailyKey = `${employee.id}|${requirement.workDate}`;
        const maxDaily = configuredValue(
          data.constraints,
          "MAX_DAILY_MINUTES",
          employee.id,
          480,
        );
        if ((workingMinutes.get(dailyKey) ?? 0) + duration > maxDaily) return false;

        const overlaps = generated.some(
          (assignment) =>
            assignment.employeeId === employee.id &&
            assignment.workDate === requirement.workDate &&
            assignment.startTime < requirement.endTime &&
            assignment.endTime > requirement.startTime,
        );
        if (overlaps) return false;

        const maximumDays = configuredValue(
          data.constraints,
          "MAX_CONSECUTIVE_DAYS",
          employee.id,
          5,
        );
        return !wouldExceedConsecutiveDays(
          assignedDates.get(employee.id) ?? new Set(),
          requirement.workDate,
          maximumDays,
        );
      })
      .sort((left, right) => {
        const leftDaily = workingMinutes.get(`${left.id}|${requirement.workDate}`) ?? 0;
        const rightDaily = workingMinutes.get(`${right.id}|${requirement.workDate}`) ?? 0;
        return (
          leftDaily - rightDaily ||
          (assignmentCount.get(left.id) ?? 0) -
            (assignmentCount.get(right.id) ?? 0) ||
          left.id.localeCompare(right.id)
        );
      });

    const selected = candidates.slice(0, requirement.requiredCount);
    for (const employee of selected) {
      generated.push({
        employeeId: employee.id,
        workDate: requirement.workDate,
        startTime: requirement.startTime,
        endTime: requirement.endTime,
        breakMinutes: 0,
        source: "auto",
        note: "希望・必要人数・勤務制約に基づく自動作成案",
      });
      const dailyKey = `${employee.id}|${requirement.workDate}`;
      workingMinutes.set(dailyKey, (workingMinutes.get(dailyKey) ?? 0) + duration);
      const dates = assignedDates.get(employee.id) ?? new Set<string>();
      dates.add(requirement.workDate);
      assignedDates.set(employee.id, dates);
      assignmentCount.set(employee.id, (assignmentCount.get(employee.id) ?? 0) + 1);
    }
    if (selected.length < requirement.requiredCount) {
      unresolved.push({
        workDate: requirement.workDate,
        startTime: requirement.startTime,
        endTime: requirement.endTime,
        requiredCount: requirement.requiredCount,
        assignedCount: selected.length,
        missingCount: requirement.requiredCount - selected.length,
      });
    }
  }

  return {
    assignments: mergeAdjacent(generated),
    unresolved,
    explanation:
      "提出済みの希望時間内で、必要人数を満たすように勤務時間と割当回数が少ない従業員を優先する決定的グリーディ法です。AIは使用していません。結果はDraftであり、Conflict確認と管理者の調整が必要です。",
  };
}
