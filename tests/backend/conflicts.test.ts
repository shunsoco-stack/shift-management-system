import { describe, expect, it } from "vitest";
import { evaluateConflicts } from "../../src/server/conflicts";
import type { ShiftPeriodData } from "../../src/server/shift-data";

function fixture(): ShiftPeriodData {
  return {
    period: {
      id: "period",
      periodKey: "2026-09",
      revision: 1,
      label: "2026年9月",
      startsOn: "2026-09-01",
      endsOn: "2026-09-01",
      requestDeadlineAt: "2026-08-20T14:59:59.000Z",
      status: "Draft",
      sourcePeriodId: null,
      publishedAt: null,
      createdBy: "manager",
      updatedBy: "manager",
      createdAt: "2026-08-01",
      updatedAt: "2026-08-01",
    },
    employees: [
      {
        id: "emp-001",
        userId: "user-001",
        employeeCode: "S001",
        displayName: "従業員1",
        employmentType: "パート",
        color: "#000",
        isActive: 1,
      },
    ],
    requests: [
      {
        id: "request",
        periodId: "period",
        employeeId: "emp-001",
        workDate: "2026-09-01",
        availability: "day_off",
        requestedStart: null,
        requestedEnd: null,
        note: "",
        requestStatus: "Submitted",
        submittedAt: "2026-08-01",
        updatedAt: "2026-08-01",
      },
    ],
    assignments: [
      {
        id: "assignment",
        periodId: "period",
        employeeId: "emp-001",
        workDate: "2026-09-01",
        startTime: "12:00",
        endTime: "13:00",
        breakMinutes: 0,
        source: "manual",
        note: "",
        createdBy: "manager",
        updatedBy: "manager",
        createdAt: "2026-08-01",
        updatedAt: "2026-08-01",
      },
    ],
    requirements: [
      {
        id: "requirement",
        periodId: "period",
        dayOfWeek: 2,
        startTime: "12:00",
        endTime: "14:00",
        requiredCount: 2,
      },
    ],
    constraints: [],
  };
}

describe("conflict calculation", () => {
  it("必要人数vs割当人数と希望休配置を通常コードで検出する", () => {
    const report = evaluateConflicts(fixture());
    expect(report.conflicts.some((item) => item.kind === "STAFF_SHORTAGE")).toBe(
      true,
    );
    expect(report.conflicts.some((item) => item.kind === "DAY_OFF_REQUEST")).toBe(
      true,
    );
    expect(report.summary.shortageMinutes).toBe(120);
    expect(report.summary.shortagePersonMinutes).toBe(180);
  });
});
