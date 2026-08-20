import { describe, expect, it } from "vitest";

import {
  DomainAuthorizationError,
  canPerform,
  roleHasPermission,
} from "./permissions";
import {
  DomainValidationError,
  changeAssignment,
  submitShiftRequest,
  transitionScheduleStatus,
} from "./workflow";
import type {
  DomainActor,
  ShiftAssignment,
  ShiftPeriod,
  ShiftRequest,
  ShiftSchedule,
} from "./types";

const admin: DomainActor = { userId: "admin-1", role: "admin" };
const employee: DomainActor = {
  userId: "user-e1",
  role: "employee",
  employeeId: "e1",
};
const assignment: ShiftAssignment = {
  id: "assignment-1",
  employeeId: "e1",
  date: "2026-09-07",
  startTime: "12:00",
  endTime: "16:00",
  breaks: [],
  source: "manual",
  locked: false,
};

function draftSchedule(): ShiftSchedule {
  return {
    id: "schedule-1",
    periodId: "period-1",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    status: "Draft",
    revision: 1,
    assignments: [structuredClone(assignment)],
  };
}

describe("role and workflow", () => {
  it("enforces employee ownership and administrator permissions", () => {
    expect(canPerform(employee, "shiftRequest:submit-own", "e1")).toBe(true);
    expect(canPerform(employee, "shiftRequest:submit-own", "e2")).toBe(false);
    expect(roleHasPermission("employee", "schedule:publish")).toBe(false);
    expect(roleHasPermission("admin", "schedule:publish")).toBe(true);
    expect(() =>
      changeAssignment({
        schedule: draftSchedule(),
        mutation: { type: "remove", assignmentId: assignment.id },
        actor: employee,
        occurredAt: "2026-08-21T09:00:00.000Z",
      }),
    ).toThrowError(DomainAuthorizationError);
  });

  it("submits a request and returns a deadline warning plus audit evidence", () => {
    const period: ShiftPeriod = {
      id: "period-1",
      label: "9月シフト",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      requestDeadline: "2026-08-20",
    };
    const request: ShiftRequest = {
      id: "request-1",
      periodId: period.id,
      employeeId: "e1",
      status: "Draft",
      days: [
        {
          date: "2026-09-07",
          availability: "available",
          startTime: "12:00",
          endTime: "18:00",
          note: "夕方まで可",
        },
      ],
    };

    const result = submitShiftRequest({
      request,
      period,
      actor: employee,
      occurredAt: "2026-08-21T09:00:00.000Z",
    });

    expect(result.request.status).toBe("Submitted");
    expect(result.late).toBe(true);
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: "DEADLINE_PASSED" }),
    ]);
    expect(result.auditLog).toEqual(
      expect.objectContaining({
        action: "SHIFT_REQUEST_SUBMITTED",
        actorId: employee.userId,
        before: request,
        after: result.request,
      }),
    );
    expect(request.status).toBe("Draft");
  });

  it("moves Draft → Review → Confirmed → Published and rejects skipped states", () => {
    const draft = draftSchedule();
    expect(() =>
      transitionScheduleStatus({
        schedule: draft,
        to: "Confirmed",
        actor: admin,
        occurredAt: "2026-08-21T09:00:00.000Z",
      }),
    ).toThrowError(DomainValidationError);

    const review = transitionScheduleStatus({
      schedule: draft,
      to: "Review",
      actor: admin,
      occurredAt: "2026-08-21T09:00:00.000Z",
    });
    const confirmed = transitionScheduleStatus({
      schedule: review.schedule,
      to: "Confirmed",
      actor: admin,
      occurredAt: "2026-08-22T09:00:00.000Z",
    });
    const published = transitionScheduleStatus({
      schedule: confirmed.schedule,
      to: "Published",
      actor: admin,
      occurredAt: "2026-08-23T09:00:00.000Z",
    });

    expect(review.schedule.status).toBe("Review");
    expect(confirmed.schedule.status).toBe("Confirmed");
    expect(confirmed.schedule.confirmedBy).toBe(admin.userId);
    expect(published.schedule.status).toBe("Published");
    expect(published.schedule.publishedAt).toBe("2026-08-23T09:00:00.000Z");
    expect(published.auditLog.before).toEqual({ status: "Confirmed" });
    expect(published.auditLog.after).toEqual({ status: "Published" });
  });

  it("creates a Review revision with who/when/before/after after publication", () => {
    const published: ShiftSchedule = {
      ...draftSchedule(),
      status: "Published",
      confirmedAt: "2026-08-22T09:00:00.000Z",
      confirmedBy: admin.userId,
      publishedAt: "2026-08-23T09:00:00.000Z",
      publishedBy: admin.userId,
    };
    const changedAssignment: ShiftAssignment = {
      ...assignment,
      startTime: "13:00",
      endTime: "17:00",
    };

    const result = changeAssignment({
      schedule: published,
      mutation: { type: "upsert", assignment: changedAssignment },
      actor: admin,
      occurredAt: "2026-08-24T10:30:00.000Z",
    });

    expect(result.schedule).toEqual(
      expect.objectContaining({
        status: "Review",
        revision: 2,
        supersedesRevision: 1,
        updatedBy: admin.userId,
      }),
    );
    expect(result.schedule.publishedAt).toBeUndefined();
    expect(result.schedule.confirmedAt).toBeUndefined();
    expect(result.auditLog).toEqual(
      expect.objectContaining({
        action: "ASSIGNMENT_UPDATED",
        actorId: admin.userId,
        occurredAt: "2026-08-24T10:30:00.000Z",
        revision: 2,
        before: assignment,
        after: changedAssignment,
      }),
    );
  });
});

