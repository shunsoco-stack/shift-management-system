import { describe, expect, it } from "vitest";

import { generateAutoSchedule, type AutoScheduleInput } from "./autoSchedule";
import type {
  DomainActor,
  Employee,
  ShiftAssignment,
  ShiftRequest,
  ShiftSchedule,
  StaffingRequirement,
} from "./types";

const admin: DomainActor = { userId: "admin-1", role: "admin" };
const employees: Employee[] = [
  { id: "e1", name: "青木", active: true },
  { id: "e2", name: "石井", active: true },
  { id: "e3", name: "上田", active: true },
];

function availableRequest(employeeId: string, status: ShiftRequest["status"] = "Submitted"): ShiftRequest {
  return {
    id: `request-${employeeId}`,
    periodId: "period-9",
    employeeId,
    status,
    days: [
      {
        date: "2026-09-07",
        availability: "available",
        startTime: "12:00",
        endTime: "18:00",
      },
    ],
  };
}

function schedule(assignments: ShiftAssignment[] = []): ShiftSchedule {
  return {
    id: "schedule-9",
    periodId: "period-9",
    startDate: "2026-09-07",
    endDate: "2026-09-07",
    status: "Draft",
    revision: 1,
    assignments,
  };
}

describe("deterministic auto scheduling", () => {
  it("keeps manual/locked work, removes stale auto work and fills only submitted availability", () => {
    const existing: ShiftAssignment[] = [
      {
        id: "manual-e3",
        employeeId: "e3",
        date: "2026-09-07",
        startTime: "12:00",
        endTime: "15:00",
        breaks: [],
        source: "manual",
        locked: false,
      },
      {
        id: "locked-e2",
        employeeId: "e2",
        date: "2026-09-07",
        startTime: "18:00",
        endTime: "19:00",
        breaks: [],
        source: "auto",
        locked: true,
      },
      {
        id: "stale-auto",
        employeeId: "e2",
        date: "2026-09-07",
        startTime: "09:00",
        endTime: "10:00",
        breaks: [],
        source: "auto",
        locked: false,
      },
    ];
    const requirements: StaffingRequirement[] = [
      {
        id: "lunch",
        scope: "date",
        date: "2026-09-07",
        startTime: "12:00",
        endTime: "15:00",
        requiredCount: 2,
      },
      {
        id: "afternoon",
        scope: "date",
        date: "2026-09-07",
        startTime: "15:00",
        endTime: "18:00",
        requiredCount: 1,
      },
    ];
    const input: AutoScheduleInput = {
      schedule: schedule(existing),
      employees,
      requests: [availableRequest("e1"), availableRequest("e2", "Draft")],
      requirements,
      actor: admin,
      occurredAt: "2026-08-21T09:00:00.000Z",
    };

    const first = generateAutoSchedule(input);
    const second = generateAutoSchedule(input);

    expect(first.schedule.status).toBe("Draft");
    expect(first.schedule.assignments).toEqual(second.schedule.assignments);
    expect(first.schedule.assignments.map((item) => item.id)).toContain("manual-e3");
    expect(first.schedule.assignments.map((item) => item.id)).toContain("locked-e2");
    expect(first.schedule.assignments.map((item) => item.id)).not.toContain("stale-auto");
    expect(first.schedule.assignments).toContainEqual(
      expect.objectContaining({
        employeeId: "e1",
        startTime: "12:00",
        endTime: "18:00",
        source: "auto",
        locked: false,
      }),
    );
    expect(first.unfilled).toEqual([]);
    expect(first.staffing.slices.every((slice) => slice.shortageCount === 0)).toBe(true);
    expect(first.auditLog.action).toBe("AUTO_SCHEDULE_GENERATED");
  });

  it("honors configured working limits and deterministically hands later slots to another employee", () => {
    const result = generateAutoSchedule({
      schedule: schedule(),
      employees,
      requests: [availableRequest("e1"), availableRequest("e2"), availableRequest("e3", "Draft")],
      requirements: [
        {
          id: "day",
          scope: "date",
          date: "2026-09-07",
          startTime: "12:00",
          endTime: "18:00",
          requiredCount: 1,
        },
      ],
      actor: admin,
      occurredAt: "2026-08-21T09:00:00.000Z",
      constraints: { maxDailyMinutes: 180 },
    });

    expect(result.schedule.assignments).toEqual([
      expect.objectContaining({ employeeId: "e1", startTime: "12:00", endTime: "15:00" }),
      expect.objectContaining({ employeeId: "e2", startTime: "15:00", endTime: "18:00" }),
    ]);
    expect(result.unfilled).toEqual([]);
    expect(result.conflicts.some((conflict) => conflict.type === "MAX_DAILY_MINUTES")).toBe(false);
  });
});
