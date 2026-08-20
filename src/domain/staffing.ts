import {
  getWeekday,
  intervalContains,
  intervalsOverlap,
  minutesToTime,
  toMinuteInterval,
  type MinuteInterval,
} from "./time";
import type {
  ISODate,
  ShiftAssignment,
  StaffingRequirement,
  StaffingSlice,
  StaffingSummary,
} from "./types";

function isRequirementApplicable(requirement: StaffingRequirement, date: ISODate): boolean {
  if (requirement.scope === "date") return requirement.date === date;
  return requirement.weekday === getWeekday(date);
}

function validRequirementInterval(
  requirement: StaffingRequirement,
): MinuteInterval | null {
  if (!Number.isInteger(requirement.requiredCount) || requirement.requiredCount < 0) return null;
  return toMinuteInterval(requirement.startTime, requirement.endTime);
}

export function getApplicableRequirements(
  date: ISODate,
  requirements: StaffingRequirement[],
): StaffingRequirement[] {
  return requirements
    .filter((requirement) => isRequirementApplicable(requirement, date))
    .filter((requirement) => validRequirementInterval(requirement) !== null)
    .sort(
      (a, b) =>
        a.startTime.localeCompare(b.startTime) ||
        a.endTime.localeCompare(b.endTime) ||
        a.id.localeCompare(b.id),
    );
}

/**
 * Date rules override weekday rules only for the interval they cover. Multiple
 * rules of the same scope resolve to the largest requirement, avoiding an
 * accidental double count when administrators enter overlapping rows.
 */
export function resolveRequiredCount(
  date: ISODate,
  interval: MinuteInterval,
  requirements: StaffingRequirement[],
): number {
  const covering = getApplicableRequirements(date, requirements).filter((requirement) => {
    const requirementInterval = validRequirementInterval(requirement);
    return requirementInterval !== null && intervalContains(requirementInterval, interval);
  });
  const dateOverrides = covering.filter((requirement) => requirement.scope === "date");
  const selected = dateOverrides.length > 0 ? dateOverrides : covering;
  return selected.reduce(
    (largest, requirement) => Math.max(largest, requirement.requiredCount),
    0,
  );
}

function assignmentIntervalsForDate(
  date: ISODate,
  assignments: ShiftAssignment[],
): Array<{ assignment: ShiftAssignment; interval: MinuteInterval }> {
  return assignments
    .filter((assignment) => assignment.date === date)
    .map((assignment) => ({
      assignment,
      interval: toMinuteInterval(assignment.startTime, assignment.endTime),
    }))
    .filter(
      (
        item,
      ): item is { assignment: ShiftAssignment; interval: MinuteInterval } =>
        item.interval !== null,
    );
}

function isEmployeeWorking(
  employeeId: string,
  segment: MinuteInterval,
  assignments: Array<{ assignment: ShiftAssignment; interval: MinuteInterval }>,
): boolean {
  return assignments.some(({ assignment, interval }) => {
    if (assignment.employeeId !== employeeId || !intervalContains(interval, segment)) return false;
    const isOnBreak = assignment.breaks.some((shiftBreak) => {
      const breakInterval = toMinuteInterval(shiftBreak.startTime, shiftBreak.endTime);
      return (
        breakInterval !== null &&
        intervalContains(interval, breakInterval) &&
        intervalsOverlap(breakInterval, segment)
      );
    });
    return !isOnBreak;
  });
}

export function calculateStaffingForDate(
  date: ISODate,
  requirements: StaffingRequirement[],
  assignments: ShiftAssignment[],
): StaffingSlice[] {
  // getWeekday also validates the ISO date before any silent empty result.
  getWeekday(date);
  const applicableRequirements = getApplicableRequirements(date, requirements);
  const datedAssignments = assignmentIntervalsForDate(date, assignments);
  const boundaries = new Set<number>();

  for (const requirement of applicableRequirements) {
    const interval = validRequirementInterval(requirement);
    if (interval) {
      boundaries.add(interval.start);
      boundaries.add(interval.end);
    }
  }

  for (const { assignment, interval } of datedAssignments) {
    boundaries.add(interval.start);
    boundaries.add(interval.end);
    for (const shiftBreak of assignment.breaks) {
      const breakInterval = toMinuteInterval(shiftBreak.startTime, shiftBreak.endTime);
      if (breakInterval && intervalContains(interval, breakInterval)) {
        boundaries.add(breakInterval.start);
        boundaries.add(breakInterval.end);
      }
    }
  }

  const orderedBoundaries = [...boundaries].sort((a, b) => a - b);
  const employeeIds = [...new Set(datedAssignments.map(({ assignment }) => assignment.employeeId))]
    .sort((a, b) => a.localeCompare(b));
  const slices: StaffingSlice[] = [];

  for (let index = 0; index < orderedBoundaries.length - 1; index += 1) {
    const interval = {
      start: orderedBoundaries[index],
      end: orderedBoundaries[index + 1],
    };
    if (interval.start === interval.end) continue;

    const requiredCount = resolveRequiredCount(date, interval, applicableRequirements);
    const workingEmployeeIds = employeeIds.filter((employeeId) =>
      isEmployeeWorking(employeeId, interval, datedAssignments),
    );
    const assignedCount = workingEmployeeIds.length;
    if (requiredCount === 0 && assignedCount === 0) continue;

    const difference = assignedCount - requiredCount;
    slices.push({
      date,
      startTime: minutesToTime(interval.start),
      endTime: minutesToTime(interval.end),
      requiredCount,
      assignedCount,
      employeeIds: workingEmployeeIds,
      difference,
      shortageCount: Math.max(0, -difference),
      surplusCount: Math.max(0, difference),
      status: difference < 0 ? "shortage" : difference > 0 ? "surplus" : "met",
    });
  }
  return slices;
}

export function summarizeStaffing(slices: StaffingSlice[]): StaffingSummary {
  let shortageMinutes = 0;
  let surplusMinutes = 0;
  let shortagePersonMinutes = 0;
  let surplusPersonMinutes = 0;

  for (const slice of slices) {
    const interval = toMinuteInterval(slice.startTime, slice.endTime);
    if (!interval) continue;
    const duration = interval.end - interval.start;
    if (slice.shortageCount > 0) {
      shortageMinutes += duration;
      shortagePersonMinutes += duration * slice.shortageCount;
    }
    if (slice.surplusCount > 0) {
      surplusMinutes += duration;
      surplusPersonMinutes += duration * slice.surplusCount;
    }
  }

  return {
    slices: [...slices],
    shortageMinutes,
    surplusMinutes,
    shortagePersonMinutes,
    surplusPersonMinutes,
  };
}

export function calculateStaffing(
  dates: ISODate[],
  requirements: StaffingRequirement[],
  assignments: ShiftAssignment[],
): StaffingSummary {
  const uniqueDates = [...new Set(dates)].sort((a, b) => a.localeCompare(b));
  return summarizeStaffing(
    uniqueDates.flatMap((date) =>
      calculateStaffingForDate(date, requirements, assignments),
    ),
  );
}
