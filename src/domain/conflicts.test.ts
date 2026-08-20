import { describe, expect, it } from "vitest";

import { detectConflicts } from "./conflicts";
import type { ShiftAssignment, ShiftRequest } from "./types";

function assignment(
  id: string,
  employeeId: string,
  date: string,
  startTime: string,
  endTime: string,
  breaks: ShiftAssignment["breaks"] = [],
): ShiftAssignment {
  return {
    id,
    employeeId,
    date,
    startTime,
    endTime,
    breaks,
    source: "manual",
    locked: false,
  };
}

describe("conflict detection", () => {
  it("lists every required conflict candidate without changing assignments", () => {
    const assignments: ShiftAssignment[] = [
      assignment("off", "e-off", "2026-09-01", "10:00", "14:00"),
      assignment("outside", "e-out", "2026-09-01", "09:00", "15:00"),
      assignment("overlap-1", "e-overlap", "2026-09-01", "10:00", "14:00"),
      assignment("overlap-2", "e-overlap", "2026-09-01", "13:00", "16:00"),
      assignment("long", "e-long", "2026-09-01", "09:00", "18:00"),
      assignment("bad", "e-bad", "2026-09-01", "18:00", "12:00"),
      assignment(
        "bad-break",
        "e-break",
        "2026-09-01",
        "10:00",
        "14:00",
        [{ id: "outside-break", startTime: "09:00", endTime: "10:30" }],
      ),
      ...Array.from({ length: 6 }, (_, index) =>
        assignment(
          `streak-${index + 1}`,
          "e-streak",
          `2026-09-0${index + 1}`,
          "10:00",
          "14:00",
        ),
      ),
    ];
    const requests: ShiftRequest[] = [
      {
        id: "r-off",
        periodId: "p1",
        employeeId: "e-off",
        status: "Submitted",
        days: [{ date: "2026-09-01", availability: "preferred_off" }],
      },
      {
        id: "r-out",
        periodId: "p1",
        employeeId: "e-out",
        status: "Submitted",
        days: [
          {
            date: "2026-09-01",
            availability: "available",
            startTime: "10:00",
            endTime: "14:00",
          },
        ],
      },
    ];
    const original = structuredClone(assignments);

    const conflicts = detectConflicts(assignments, requests);
    const types = new Set(conflicts.map((conflict) => conflict.type));

    expect(types).toEqual(
      new Set([
        "PREFERRED_DAY_OFF",
        "OUTSIDE_REQUESTED_HOURS",
        "OVERLAPPING_ASSIGNMENTS",
        "MAX_DAILY_MINUTES",
        "MINIMUM_BREAK",
        "CONSECUTIVE_DAYS",
        "INVALID_INTERVAL",
      ]),
    );
    expect(conflicts.filter((conflict) => conflict.type === "INVALID_INTERVAL")).toHaveLength(2);
    expect(assignments).toEqual(original);
  });

  it("counts a gap between split assignments as a break", () => {
    const conflicts = detectConflicts(
      [
        assignment("morning", "e1", "2026-09-01", "09:00", "13:00"),
        assignment("afternoon", "e1", "2026-09-01", "14:00", "18:00"),
      ],
      [],
      { maxDailyMinutes: 9 * 60, minimumBreakMinutes: 60 },
    );

    expect(conflicts.some((conflict) => conflict.type === "MINIMUM_BREAK")).toBe(false);
  });
});

