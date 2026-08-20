import { describe, expect, it } from "vitest";
import { generateDraftSchedule } from "../../src/server/scheduler";
import type { ShiftPeriodData } from "../../src/server/shift-data";

describe("deterministic auto scheduling", () => {
  it("提出済み希望の範囲内でDraft案を生成する", () => {
    const data: ShiftPeriodData = {
      period: {
        id: "period",
        periodKey: "2026-09",
        revision: 1,
        label: "9月",
        startsOn: "2026-09-01",
        endsOn: "2026-09-01",
        requestDeadlineAt: "2026-08-20T14:59:59.000Z",
        status: "Draft",
        sourcePeriodId: null,
        publishedAt: null,
        createdBy: "manager",
        updatedBy: "manager",
        createdAt: "",
        updatedAt: "",
      },
      employees: ["emp-001", "emp-002"].map((id) => ({
        id,
        userId: `user-${id}`,
        employeeCode: id,
        displayName: id,
        employmentType: "パート",
        color: "#000",
        isActive: 1,
      })),
      requests: ["emp-001", "emp-002"].map((employeeId) => ({
        id: `request-${employeeId}`,
        periodId: "period",
        employeeId,
        workDate: "2026-09-01",
        availability: "available" as const,
        requestedStart: "09:00",
        requestedEnd: "18:00",
        note: "",
        requestStatus: "Submitted" as const,
        submittedAt: "2026-08-01",
        updatedAt: "2026-08-01",
      })),
      assignments: [],
      requirements: [
        {
          id: "requirement",
          periodId: "period",
          dayOfWeek: 2,
          startTime: "12:00",
          endTime: "15:00",
          requiredCount: 1,
        },
      ],
      constraints: [],
    };

    const result = generateDraftSchedule(data);
    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0]).toMatchObject({
      employeeId: "emp-001",
      startTime: "12:00",
      endTime: "15:00",
      source: "auto",
    });
    expect(result.unresolved).toHaveLength(0);
    expect(result.explanation).toContain("AIは使用していません");
  });
});
