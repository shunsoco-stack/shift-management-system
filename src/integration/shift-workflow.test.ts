import { describe, expect, it } from "vitest";

import {
  DomainAuthorizationError,
  calculateStaffing,
  changeAssignment,
  detectConflicts,
  generateAutoSchedule,
  submitShiftRequest,
  transitionScheduleStatus,
  type AuditLogEntry,
  type DomainActor,
  type Employee,
  type ShiftPeriod,
  type ShiftRequest,
  type ShiftSchedule,
  type StaffingRequirement,
} from "../domain";

const date = "2026-09-07";
const admin: DomainActor = { userId: "admin-1", role: "admin" };
const employeeActors: Record<string, DomainActor> = {
  e1: { userId: "user-e1", role: "employee", employeeId: "e1" },
  e2: { userId: "user-e2", role: "employee", employeeId: "e2" },
  e3: { userId: "user-e3", role: "employee", employeeId: "e3" },
};

const period: ShiftPeriod = {
  id: "period-2026-09",
  label: "9月シフト",
  startDate: "2026-09-01",
  endDate: "2026-09-30",
  requestDeadline: "2026-08-20",
};

const employees: Employee[] = [
  { id: "e1", name: "青木 葵", active: true },
  { id: "e2", name: "石井 蓮", active: true },
  { id: "e3", name: "上田 凛", active: true },
];

const requirements: StaffingRequirement[] = [
  {
    id: "requirement-lunch-to-evening",
    scope: "date",
    date,
    startTime: "12:00",
    endTime: "18:00",
    requiredCount: 3,
  },
];

function requestFor(employeeId: string): ShiftRequest {
  return {
    id: `request-${employeeId}`,
    periodId: period.id,
    employeeId,
    status: "Draft",
    days: [
      {
        date,
        availability: "available",
        startTime: "12:00",
        endTime: "18:00",
        note: "この時間帯で勤務可能",
      },
    ],
  };
}

function emptySchedule(): ShiftSchedule {
  return {
    id: "schedule-2026-09",
    periodId: period.id,
    startDate: date,
    endDate: date,
    status: "Draft",
    revision: 1,
    assignments: [],
  };
}

describe("shift management workflow integration", () => {
  it("connects request submission, staffing, conflicts, adjustment, auto scheduling, roles, audit, confirmation and publication", () => {
    const draftRequests = employees.map((employee) => requestFor(employee.id));

    // Role is enforced at the domain boundary: an employee cannot submit for a colleague.
    expect(() =>
      submitShiftRequest({
        request: draftRequests[1],
        period,
        actor: employeeActors.e1,
        occurredAt: "2026-08-21T08:55:00.000Z",
      }),
    ).toThrowError(DomainAuthorizationError);

    const submissions = draftRequests.map((request, index) =>
      submitShiftRequest({
        request,
        period,
        actor: employeeActors[request.employeeId],
        occurredAt: `2026-08-21T09:0${index}:00.000Z`,
      }),
    );
    const submittedRequests = submissions.map((result) => result.request);
    const auditTrail: AuditLogEntry[] = submissions.map((result) => result.auditLog);

    expect(submittedRequests.every((request) => request.status === "Submitted")).toBe(true);
    expect(submissions.every((result) => result.late)).toBe(true);
    expect(
      submissions.every((result) =>
        result.warnings.some((warning) => warning.code === "DEADLINE_PASSED"),
      ),
    ).toBe(true);
    expect(draftRequests.every((request) => request.status === "Draft")).toBe(true);

    const schedule = emptySchedule();
    const staffingBeforeScheduling = calculateStaffing(
      [date],
      requirements,
      schedule.assignments,
    );
    expect(staffingBeforeScheduling.slices).toEqual([
      expect.objectContaining({
        date,
        startTime: "12:00",
        endTime: "18:00",
        requiredCount: 3,
        assignedCount: 0,
        difference: -3,
        shortageCount: 3,
        status: "shortage",
      }),
    ]);
    expect(staffingBeforeScheduling.shortageMinutes).toBe(360);
    expect(staffingBeforeScheduling.shortagePersonMinutes).toBe(1_080);

    // The same public operation rejects an employee and accepts an administrator.
    expect(() =>
      generateAutoSchedule({
        schedule,
        employees,
        requests: submittedRequests,
        requirements,
        actor: employeeActors.e1,
        occurredAt: "2026-08-22T08:59:00.000Z",
      }),
    ).toThrowError(DomainAuthorizationError);

    const generated = generateAutoSchedule({
      schedule,
      employees,
      requests: submittedRequests,
      requirements,
      actor: admin,
      occurredAt: "2026-08-22T09:00:00.000Z",
    });
    auditTrail.push(generated.auditLog);

    expect(generated.schedule.status).toBe("Draft");
    expect(generated.schedule.assignments).toHaveLength(3);
    expect(generated.schedule.assignments.map((assignment) => assignment.employeeId)).toEqual([
      "e1",
      "e2",
      "e3",
    ]);
    expect(
      generated.schedule.assignments.every(
        (assignment) =>
          assignment.startTime === "12:00" &&
          assignment.endTime === "18:00" &&
          assignment.source === "auto",
      ),
    ).toBe(true);
    expect(generated.staffing.slices).toEqual([
      expect.objectContaining({
        requiredCount: 3,
        assignedCount: 3,
        difference: 0,
        shortageCount: 0,
        status: "met",
      }),
    ]);
    expect(generated.unfilled).toEqual([]);
    expect(generated.conflicts).toEqual([]);
    expect(generated.auditLog).toEqual(
      expect.objectContaining({
        action: "AUTO_SCHEDULE_GENERATED",
        actorId: admin.userId,
        before: schedule,
        after: generated.schedule,
      }),
    );

    const originalE1 = generated.schedule.assignments.find(
      (assignment) => assignment.employeeId === "e1",
    );
    if (!originalE1) throw new Error("Auto scheduling did not assign e1");

    // Simulate an administrator adjustment that creates a visible conflict and shortage.
    const outsideRequestedHours = {
      ...originalE1,
      startTime: "11:00",
      endTime: "17:00",
    };
    const conflicted = changeAssignment({
      schedule: generated.schedule,
      mutation: { type: "upsert", assignment: outsideRequestedHours },
      actor: admin,
      occurredAt: "2026-08-23T10:30:00.000Z",
    });
    auditTrail.push(conflicted.auditLog);

    const conflicts = detectConflicts(conflicted.schedule.assignments, submittedRequests);
    expect(conflicts).toContainEqual(
      expect.objectContaining({
        type: "OUTSIDE_REQUESTED_HOURS",
        employeeId: "e1",
        assignmentIds: [originalE1.id],
      }),
    );
    expect(
      calculateStaffing([date], requirements, conflicted.schedule.assignments).slices,
    ).toContainEqual(
      expect.objectContaining({
        startTime: "17:00",
        endTime: "18:00",
        shortageCount: 1,
        difference: -1,
      }),
    );
    expect(conflicted.auditLog).toEqual(
      expect.objectContaining({
        action: "ASSIGNMENT_UPDATED",
        actorId: admin.userId,
        occurredAt: "2026-08-23T10:30:00.000Z",
        entityType: "assignment",
        entityId: originalE1.id,
        before: originalE1,
        after: outsideRequestedHours,
      }),
    );

    const repaired = changeAssignment({
      schedule: conflicted.schedule,
      mutation: { type: "upsert", assignment: originalE1 },
      actor: admin,
      occurredAt: "2026-08-24T10:30:00.000Z",
    });
    auditTrail.push(repaired.auditLog);

    expect(detectConflicts(repaired.schedule.assignments, submittedRequests)).toEqual([]);
    expect(
      calculateStaffing([date], requirements, repaired.schedule.assignments).slices.every(
        (slice) => slice.shortageCount === 0,
      ),
    ).toBe(true);

    expect(() =>
      transitionScheduleStatus({
        schedule: repaired.schedule,
        to: "Review",
        actor: employeeActors.e1,
        occurredAt: "2026-08-25T08:59:00.000Z",
      }),
    ).toThrowError(DomainAuthorizationError);

    const review = transitionScheduleStatus({
      schedule: repaired.schedule,
      to: "Review",
      actor: admin,
      occurredAt: "2026-08-25T09:00:00.000Z",
    });
    const confirmed = transitionScheduleStatus({
      schedule: review.schedule,
      to: "Confirmed",
      actor: admin,
      occurredAt: "2026-08-26T09:00:00.000Z",
    });
    const published = transitionScheduleStatus({
      schedule: confirmed.schedule,
      to: "Published",
      actor: admin,
      occurredAt: "2026-08-27T09:00:00.000Z",
    });
    auditTrail.push(review.auditLog, confirmed.auditLog, published.auditLog);

    expect(review.schedule.status).toBe("Review");
    expect(confirmed.schedule).toEqual(
      expect.objectContaining({
        status: "Confirmed",
        confirmedBy: admin.userId,
        confirmedAt: "2026-08-26T09:00:00.000Z",
      }),
    );
    expect(published.schedule).toEqual(
      expect.objectContaining({
        status: "Published",
        publishedBy: admin.userId,
        publishedAt: "2026-08-27T09:00:00.000Z",
      }),
    );

    const originalE2 = published.schedule.assignments.find(
      (assignment) => assignment.employeeId === "e2",
    );
    if (!originalE2) throw new Error("Published schedule did not contain e2");
    const shortenedE2 = { ...originalE2, startTime: "13:00" };

    // A published schedule is never silently overwritten: it becomes a new Review revision.
    const changedAfterPublication = changeAssignment({
      schedule: published.schedule,
      mutation: { type: "upsert", assignment: shortenedE2 },
      actor: admin,
      occurredAt: "2026-08-28T10:30:00.000Z",
    });
    auditTrail.push(changedAfterPublication.auditLog);

    expect(changedAfterPublication.schedule).toEqual(
      expect.objectContaining({
        status: "Review",
        revision: 2,
        supersedesRevision: 1,
        updatedBy: admin.userId,
      }),
    );
    expect(changedAfterPublication.schedule.confirmedAt).toBeUndefined();
    expect(changedAfterPublication.schedule.publishedAt).toBeUndefined();
    expect(changedAfterPublication.auditLog).toEqual(
      expect.objectContaining({
        action: "ASSIGNMENT_UPDATED",
        actorId: admin.userId,
        occurredAt: "2026-08-28T10:30:00.000Z",
        revision: 2,
        entityId: originalE2.id,
        before: originalE2,
        after: shortenedE2,
        metadata: expect.objectContaining({
          previousStatus: "Published",
          nextStatus: "Review",
          revisionCreated: true,
        }),
      }),
    );
    expect(
      calculateStaffing(
        [date],
        requirements,
        changedAfterPublication.schedule.assignments,
      ).slices,
    ).toContainEqual(
      expect.objectContaining({
        startTime: "12:00",
        endTime: "13:00",
        shortageCount: 1,
      }),
    );

    const repairedRevision = changeAssignment({
      schedule: changedAfterPublication.schedule,
      mutation: { type: "upsert", assignment: originalE2 },
      actor: admin,
      occurredAt: "2026-08-29T10:30:00.000Z",
    });
    auditTrail.push(repairedRevision.auditLog);
    expect(repairedRevision.schedule).toEqual(
      expect.objectContaining({ status: "Review", revision: 2 }),
    );
    expect(
      calculateStaffing([date], requirements, repairedRevision.schedule.assignments).slices.every(
        (slice) => slice.status === "met",
      ),
    ).toBe(true);

    const reconfirmed = transitionScheduleStatus({
      schedule: repairedRevision.schedule,
      to: "Confirmed",
      actor: admin,
      occurredAt: "2026-08-30T09:00:00.000Z",
    });
    const republished = transitionScheduleStatus({
      schedule: reconfirmed.schedule,
      to: "Published",
      actor: admin,
      occurredAt: "2026-08-31T09:00:00.000Z",
    });
    auditTrail.push(reconfirmed.auditLog, republished.auditLog);

    expect(republished.schedule).toEqual(
      expect.objectContaining({
        status: "Published",
        revision: 2,
        confirmedBy: admin.userId,
        publishedBy: admin.userId,
      }),
    );

    expect(auditTrail).toHaveLength(13);
    expect(new Set(auditTrail.map((entry) => entry.id)).size).toBe(auditTrail.length);
    expect(new Set(auditTrail.map((entry) => entry.action))).toEqual(
      new Set([
        "SHIFT_REQUEST_SUBMITTED",
        "AUTO_SCHEDULE_GENERATED",
        "ASSIGNMENT_UPDATED",
        "STATUS_CHANGED",
      ]),
    );
    expect(auditTrail.slice(0, 3).map((entry) => entry.actorRole)).toEqual([
      "employee",
      "employee",
      "employee",
    ]);
    expect(auditTrail.slice(3).every((entry) => entry.actorRole === "admin")).toBe(true);
  });
});
