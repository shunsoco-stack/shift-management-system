import { describe, expect, it } from "vitest";

import { calculateStaffing } from "./staffing";
import type { ShiftAssignment, StaffingRequirement } from "./types";

describe("staffing coverage", () => {
  it("uses date overrides, unique employees and break exclusions for shortage/surplus", () => {
    const requirements: StaffingRequirement[] = [
      {
        id: "monday-day",
        scope: "weekday",
        weekday: 1,
        startTime: "12:00",
        endTime: "18:00",
        requiredCount: 1,
      },
      {
        id: "special-lunch",
        scope: "date",
        date: "2026-09-07",
        startTime: "12:00",
        endTime: "15:00",
        requiredCount: 2,
      },
    ];
    const assignments: ShiftAssignment[] = [
      {
        id: "a-e1",
        employeeId: "e1",
        date: "2026-09-07",
        startTime: "12:00",
        endTime: "18:00",
        breaks: [{ id: "b-e1", startTime: "13:00", endTime: "14:00" }],
        source: "manual",
        locked: false,
      },
      {
        id: "a-e2",
        employeeId: "e2",
        date: "2026-09-07",
        startTime: "12:00",
        endTime: "15:00",
        breaks: [],
        source: "manual",
        locked: false,
      },
      {
        id: "a-e3-first",
        employeeId: "e3",
        date: "2026-09-07",
        startTime: "15:00",
        endTime: "18:00",
        breaks: [],
        source: "manual",
        locked: false,
      },
      {
        id: "a-e3-overlap",
        employeeId: "e3",
        date: "2026-09-07",
        startTime: "15:00",
        endTime: "18:00",
        breaks: [],
        source: "manual",
        locked: false,
      },
    ];

    const result = calculateStaffing(["2026-09-07"], requirements, assignments);

    expect(result.slices).toEqual([
      expect.objectContaining({
        startTime: "12:00",
        endTime: "13:00",
        requiredCount: 2,
        assignedCount: 2,
        difference: 0,
      }),
      expect.objectContaining({
        startTime: "13:00",
        endTime: "14:00",
        requiredCount: 2,
        assignedCount: 1,
        shortageCount: 1,
        status: "shortage",
      }),
      expect.objectContaining({
        startTime: "14:00",
        endTime: "15:00",
        requiredCount: 2,
        assignedCount: 2,
      }),
      expect.objectContaining({
        startTime: "15:00",
        endTime: "18:00",
        requiredCount: 1,
        assignedCount: 2,
        employeeIds: ["e1", "e3"],
        surplusCount: 1,
        status: "surplus",
      }),
    ]);
    expect(result.shortageMinutes).toBe(60);
    expect(result.shortagePersonMinutes).toBe(60);
    expect(result.surplusMinutes).toBe(180);
    expect(result.surplusPersonMinutes).toBe(180);
  });
});

