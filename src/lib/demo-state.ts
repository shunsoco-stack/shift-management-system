import {
  DEMO_WEEK_DATES,
  employees,
  parseLocalDate,
  shortDateLabel,
  weekdayOf,
  type Employee,
  type ShiftAssignment,
  type ShiftConflict,
  type ShiftRequest,
  type ShiftWorkflowStatus,
  type StaffingRequirement,
} from "./demo-data";

export type CoverageRow = {
  id: string;
  date: string;
  start: string;
  end: string;
  required: number;
  assigned: number;
  difference: number;
  employeeIds: string[];
  status: "shortage" | "balanced" | "excess";
};

export const workflowSteps: ShiftWorkflowStatus[] = [
  "draft",
  "review",
  "confirmed",
  "published",
];

export const workflowLabels: Record<ShiftWorkflowStatus, string> = {
  draft: "Draft",
  review: "Review",
  confirmed: "Confirmed",
  published: "Published",
};

export function timeToMinutes(time: string) {
  if (!/^\d{2}:\d{2}$/.test(time)) return 0;
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(minutes: number) {
  const safe = Math.max(0, Math.min(24 * 60, minutes));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function assignmentMinutes(assignment: ShiftAssignment) {
  return Math.max(0, timeToMinutes(assignment.end) - timeToMinutes(assignment.start));
}

export function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!remainder) return `${hours}時間`;
  if (!hours) return `${remainder}分`;
  return `${hours}時間${remainder}分`;
}

export function formatShift(assignment: ShiftAssignment) {
  return `${assignment.start}〜${assignment.end}`;
}

export function requirementsForDate(
  date: string,
  requirements: StaffingRequirement[],
) {
  const weekday = weekdayOf(date);
  return requirements
    .filter((requirement) => requirement.weekday === weekday)
    .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
}

function coversWholeSlot(assignment: ShiftAssignment, start: string, end: string) {
  return (
    timeToMinutes(assignment.start) <= timeToMinutes(start) &&
    timeToMinutes(assignment.end) >= timeToMinutes(end)
  );
}

export function calculateCoverage(
  assignments: ShiftAssignment[],
  requirements: StaffingRequirement[],
  dates: readonly string[] = DEMO_WEEK_DATES,
): CoverageRow[] {
  return dates.flatMap((date) =>
    requirementsForDate(date, requirements).map((requirement) => {
      const employeeIds = Array.from(
        new Set(
          assignments
            .filter(
              (assignment) =>
                assignment.date === date &&
                coversWholeSlot(assignment, requirement.start, requirement.end),
            )
            .map((assignment) => assignment.employeeId),
        ),
      );
      const assigned = employeeIds.length;
      const difference = assigned - requirement.required;
      return {
        id: `${date}-${requirement.id}`,
        date,
        start: requirement.start,
        end: requirement.end,
        required: requirement.required,
        assigned,
        difference,
        employeeIds,
        status:
          difference < 0 ? "shortage" : difference >= 2 ? "excess" : "balanced",
      };
    }),
  );
}

export function calculateShortageMinutes(rows: CoverageRow[]) {
  return rows.reduce(
    (total, row) =>
      total +
      (row.difference < 0
        ? timeToMinutes(row.end) - timeToMinutes(row.start)
        : 0),
    0,
  );
}

export function calculateUnderstaffedPersonHours(rows: CoverageRow[]) {
  return rows.reduce(
    (total, row) =>
      total +
      (row.difference < 0
        ? (timeToMinutes(row.end) - timeToMinutes(row.start)) *
          Math.abs(row.difference)
        : 0),
    0,
  );
}

function requestFor(
  requests: ShiftRequest[],
  employeeId: string,
  date: string,
) {
  return requests.find((request) => request.employeeId === employeeId)?.days[date];
}

function employeeFor(employeeId: string, staff: Employee[] = employees) {
  return staff.find((employee) => employee.id === employeeId);
}

function dateTimeMs(date: string, time: string) {
  return new Date(`${date}T${time}:00+09:00`).getTime();
}

function dayDiff(first: string, second: string) {
  return Math.round(
    (parseLocalDate(second).getTime() - parseLocalDate(first).getTime()) /
      86_400_000,
  );
}

export function detectConflicts(
  assignments: ShiftAssignment[],
  requests: ShiftRequest[],
  staff: Employee[] = employees,
): ShiftConflict[] {
  const conflicts: ShiftConflict[] = [];

  for (const assignment of assignments) {
    const employee = employeeFor(assignment.employeeId, staff);
    const preference = requestFor(requests, assignment.employeeId, assignment.date);
    if (!employee) continue;

    if (preference?.status === "off") {
      conflicts.push({
        id: `day-off-${assignment.id}`,
        kind: "day-off",
        severity: "high",
        employeeId: assignment.employeeId,
        assignmentId: assignment.id,
        date: assignment.date,
        title: "希望休への配置",
        detail: `${shortDateLabel(assignment.date)}は希望休として提出されています。`,
      });
    } else if (
      preference?.status === "available" &&
      (timeToMinutes(assignment.start) < timeToMinutes(preference.start) ||
        timeToMinutes(assignment.end) > timeToMinutes(preference.end))
    ) {
      conflicts.push({
        id: `outside-request-${assignment.id}`,
        kind: "outside-request",
        severity: "medium",
        employeeId: assignment.employeeId,
        assignmentId: assignment.id,
        date: assignment.date,
        title: "希望時間外の配置",
        detail: `希望 ${preference.start}〜${preference.end} に対し、${assignment.start}〜${assignment.end}を割り当てています。`,
      });
    }
  }

  const grouped = new Map<string, ShiftAssignment[]>();
  for (const assignment of assignments) {
    const key = `${assignment.employeeId}-${assignment.date}`;
    grouped.set(key, [...(grouped.get(key) ?? []), assignment]);
  }

  for (const [key, dailyAssignments] of grouped) {
    const sorted = [...dailyAssignments].sort(
      (a, b) => timeToMinutes(a.start) - timeToMinutes(b.start),
    );
    const employee = employeeFor(sorted[0].employeeId, staff);
    if (!employee) continue;

    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      if (timeToMinutes(current.start) < timeToMinutes(previous.end)) {
        conflicts.push({
          id: `overlap-${previous.id}-${current.id}`,
          kind: "overlap",
          severity: "high",
          employeeId: current.employeeId,
          assignmentId: current.id,
          date: current.date,
          title: "同時間帯の重複",
          detail: `${previous.start}〜${previous.end} と ${current.start}〜${current.end} が重複しています。`,
        });
      }
    }

    const workMinutes = sorted.reduce(
      (total, assignment) => total + assignmentMinutes(assignment),
      0,
    );
    if (workMinutes > employee.maxDailyMinutes) {
      conflicts.push({
        id: `max-hours-${key}`,
        kind: "max-hours",
        severity: "high",
        employeeId: employee.id,
        assignmentId: sorted[0].id,
        date: sorted[0].date,
        title: "最大勤務時間を超過",
        detail: `設定上限 ${formatMinutes(employee.maxDailyMinutes)} に対し、${formatMinutes(workMinutes)}の割当です。`,
      });
    }
    if (
      workMinutes > 360 &&
      sorted.reduce((total, assignment) => total + assignment.breakMinutes, 0) < 45
    ) {
      conflicts.push({
        id: `short-break-${key}`,
        kind: "short-break",
        severity: "medium",
        employeeId: employee.id,
        assignmentId: sorted[0].id,
        date: sorted[0].date,
        title: "休憩時間を確認",
        detail: "6時間を超える勤務に対し、登録休憩が45分未満です。最終判断は管理者が行ってください。",
      });
    }
  }

  for (const employee of staff) {
    const employeeAssignments = assignments
      .filter((assignment) => assignment.employeeId === employee.id)
      .sort(
        (a, b) =>
          dateTimeMs(a.date, a.start) - dateTimeMs(b.date, b.start),
      );

    for (let index = 1; index < employeeAssignments.length; index += 1) {
      const previous = employeeAssignments[index - 1];
      const current = employeeAssignments[index];
      if (previous.date === current.date) continue;
      const restMinutes =
        (dateTimeMs(current.date, current.start) -
          dateTimeMs(previous.date, previous.end)) /
        60_000;
      if (restMinutes < employee.minRestMinutes) {
        conflicts.push({
          id: `min-rest-${previous.id}-${current.id}`,
          kind: "min-rest",
          severity: "medium",
          employeeId: employee.id,
          assignmentId: current.id,
          date: current.date,
          title: "勤務間インターバル不足候補",
          detail: `前回勤務から${formatMinutes(Math.max(0, Math.round(restMinutes)))}です。設定は${formatMinutes(employee.minRestMinutes)}です。`,
        });
      }
    }

    const dates = Array.from(
      new Set(employeeAssignments.map((assignment) => assignment.date)),
    ).sort();
    let run = 1;
    for (let index = 1; index < dates.length; index += 1) {
      run = dayDiff(dates[index - 1], dates[index]) === 1 ? run + 1 : 1;
      if (run === employee.maxConsecutiveDays + 1) {
        conflicts.push({
          id: `consecutive-${employee.id}-${dates[index]}`,
          kind: "consecutive-days",
          severity: "medium",
          employeeId: employee.id,
          date: dates[index],
          title: "連勤日数を確認",
          detail: `${run}日連続の割当です。設定上限は${employee.maxConsecutiveDays}日です。`,
        });
      }
    }
  }

  return conflicts.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "high" ? -1 : 1;
    return a.date.localeCompare(b.date);
  });
}

type Candidate = {
  employee: Employee;
  monthlyMinutes: number;
  dailyMinutes: number;
};

function canWorkSlot(
  request: ShiftRequest | undefined,
  date: string,
  start: string,
  end: string,
) {
  const preference = request?.days[date];
  return Boolean(
    request?.submittedAt &&
      preference?.status === "available" &&
      timeToMinutes(preference.start) <= timeToMinutes(start) &&
      timeToMinutes(preference.end) >= timeToMinutes(end),
  );
}

function mergeAdjacentAssignments(assignments: ShiftAssignment[]) {
  const grouped = new Map<string, ShiftAssignment[]>();
  assignments.forEach((assignment) => {
    const key = `${assignment.employeeId}-${assignment.date}`;
    grouped.set(key, [...(grouped.get(key) ?? []), assignment]);
  });

  return Array.from(grouped.values()).flatMap((group) => {
    const sorted = [...group].sort(
      (a, b) => timeToMinutes(a.start) - timeToMinutes(b.start),
    );
    const merged: ShiftAssignment[] = [];
    for (const assignment of sorted) {
      const previous = merged.at(-1);
      if (previous && previous.end === assignment.start) {
        previous.end = assignment.end;
        previous.breakMinutes = assignmentMinutes(previous) > 360 ? 45 : 0;
      } else {
        merged.push({ ...assignment });
      }
    }
    return merged;
  });
}

export function generateDraftSchedule(
  requests: ShiftRequest[],
  requirements: StaffingRequirement[],
  dates: readonly string[] = DEMO_WEEK_DATES,
  staff: Employee[] = employees,
) {
  const assignments: ShiftAssignment[] = [];
  const totals = new Map<string, number>(staff.map((employee) => [employee.id, 0]));
  let sequence = 0;

  for (const date of dates) {
    for (const requirement of requirementsForDate(date, requirements)) {
      const slotMinutes =
        timeToMinutes(requirement.end) - timeToMinutes(requirement.start);
      const candidates: Candidate[] = staff
        .filter((employee) => {
          const request = requests.find((item) => item.employeeId === employee.id);
          if (!canWorkSlot(request, date, requirement.start, requirement.end)) {
            return false;
          }
          const dailyAssignments = assignments.filter(
            (assignment) =>
              assignment.employeeId === employee.id && assignment.date === date,
          );
          const dailyMinutes = dailyAssignments.reduce(
            (total, assignment) => total + assignmentMinutes(assignment),
            0,
          );
          const overlaps = dailyAssignments.some(
            (assignment) =>
              timeToMinutes(assignment.start) < timeToMinutes(requirement.end) &&
              timeToMinutes(assignment.end) > timeToMinutes(requirement.start),
          );
          return !overlaps && dailyMinutes + slotMinutes <= employee.maxDailyMinutes;
        })
        .map((employee) => ({
          employee,
          monthlyMinutes: totals.get(employee.id) ?? 0,
          dailyMinutes: assignments
            .filter(
              (assignment) =>
                assignment.employeeId === employee.id && assignment.date === date,
            )
            .reduce((total, assignment) => total + assignmentMinutes(assignment), 0),
        }))
        .sort(
          (a, b) =>
            a.monthlyMinutes - b.monthlyMinutes ||
            a.dailyMinutes - b.dailyMinutes ||
            a.employee.id.localeCompare(b.employee.id),
        );

      candidates.slice(0, requirement.required).forEach(({ employee }) => {
        sequence += 1;
        assignments.push({
          id: `auto-${date}-${sequence}`,
          employeeId: employee.id,
          date,
          start: requirement.start,
          end: requirement.end,
          breakMinutes: 0,
          source: "auto",
        });
        totals.set(employee.id, (totals.get(employee.id) ?? 0) + slotMinutes);
      });
    }
  }

  return mergeAdjacentAssignments(assignments).map((assignment) => ({
    ...assignment,
    breakMinutes: assignmentMinutes(assignment) > 360 ? 45 : 0,
  }));
}

export function nextWorkflowStatus(status: ShiftWorkflowStatus) {
  const index = workflowSteps.indexOf(status);
  return workflowSteps[Math.min(index + 1, workflowSteps.length - 1)];
}

export function previousWorkflowStatus(status: ShiftWorkflowStatus) {
  const index = workflowSteps.indexOf(status);
  return workflowSteps[Math.max(index - 1, 0)];
}

export function formatAuditDate(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function shiftSummaryForEmployee(
  assignments: ShiftAssignment[],
  employeeId: string,
) {
  const own = assignments
    .filter((assignment) => assignment.employeeId === employeeId)
    .sort(
      (a, b) =>
        `${a.date}-${a.start}`.localeCompare(`${b.date}-${b.start}`),
    );
  return {
    assignments: own,
    totalMinutes: own.reduce(
      (total, assignment) => total + assignmentMinutes(assignment),
      0,
    ),
    workDays: new Set(own.map((assignment) => assignment.date)).size,
  };
}
