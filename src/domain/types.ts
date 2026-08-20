export type ISODate = string;
export type LocalTime = string;
export type ISODateTime = string;

export type UserRole = "employee" | "admin";

export interface DomainActor {
  userId: string;
  role: UserRole;
  employeeId?: string;
}

export interface User {
  id: string;
  displayName: string;
  role: UserRole;
  employeeId?: string;
}

export interface Employee {
  id: string;
  name: string;
  userId?: string;
  active: boolean;
  color?: string;
}

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type ScheduleStatus = "Draft" | "Review" | "Confirmed" | "Published";
export type ShiftRequestStatus = "Draft" | "Submitted";
export type ShiftAvailability = "available" | "preferred_off";

export interface ShiftPeriod {
  id: string;
  label: string;
  startDate: ISODate;
  endDate: ISODate;
  requestDeadline: ISODate;
}

export interface ShiftRequestDay {
  date: ISODate;
  availability: ShiftAvailability;
  startTime?: LocalTime;
  endTime?: LocalTime;
  note?: string;
}

export interface ShiftRequest {
  id: string;
  periodId: string;
  employeeId: string;
  status: ShiftRequestStatus;
  days: ShiftRequestDay[];
  submittedAt?: ISODateTime;
  updatedAt?: ISODateTime;
}

export interface ShiftBreak {
  id: string;
  startTime: LocalTime;
  endTime: LocalTime;
}

export type AssignmentSource = "manual" | "auto";

export interface ShiftAssignment {
  id: string;
  employeeId: string;
  date: ISODate;
  startTime: LocalTime;
  endTime: LocalTime;
  breaks: ShiftBreak[];
  source: AssignmentSource;
  locked: boolean;
  note?: string;
}

export interface ShiftSchedule {
  id: string;
  periodId: string;
  startDate: ISODate;
  endDate: ISODate;
  status: ScheduleStatus;
  revision: number;
  assignments: ShiftAssignment[];
  supersedesRevision?: number;
  confirmedAt?: ISODateTime;
  confirmedBy?: string;
  publishedAt?: ISODateTime;
  publishedBy?: string;
  updatedAt?: ISODateTime;
  updatedBy?: string;
}

export type StaffingRequirementScope = "weekday" | "date";

export interface StaffingRequirement {
  id: string;
  scope: StaffingRequirementScope;
  weekday?: Weekday;
  date?: ISODate;
  startTime: LocalTime;
  endTime: LocalTime;
  requiredCount: number;
}

export interface StaffingSlice {
  date: ISODate;
  startTime: LocalTime;
  endTime: LocalTime;
  requiredCount: number;
  assignedCount: number;
  employeeIds: string[];
  /** assignedCount - requiredCount. Negative means understaffing. */
  difference: number;
  shortageCount: number;
  surplusCount: number;
  status: "shortage" | "met" | "surplus";
}

export interface StaffingSummary {
  slices: StaffingSlice[];
  shortageMinutes: number;
  surplusMinutes: number;
  shortagePersonMinutes: number;
  surplusPersonMinutes: number;
}

export interface ScheduleConstraints {
  maxDailyMinutes: number;
  breakRequiredAfterMinutes: number;
  minimumBreakMinutes: number;
  maxConsecutiveDays: number;
}

export const DEFAULT_SCHEDULE_CONSTRAINTS: Readonly<ScheduleConstraints> = {
  maxDailyMinutes: 8 * 60,
  breakRequiredAfterMinutes: 6 * 60,
  minimumBreakMinutes: 45,
  maxConsecutiveDays: 5,
};

export type ConflictType =
  | "PREFERRED_DAY_OFF"
  | "OUTSIDE_REQUESTED_HOURS"
  | "OVERLAPPING_ASSIGNMENTS"
  | "MAX_DAILY_MINUTES"
  | "MINIMUM_BREAK"
  | "CONSECUTIVE_DAYS"
  | "INVALID_INTERVAL";

export interface ScheduleConflict {
  id: string;
  type: ConflictType;
  severity: "warning" | "error";
  employeeId?: string;
  date?: ISODate;
  assignmentIds: string[];
  message: string;
  details: Record<string, string | number | boolean | string[] | undefined>;
}

export type AuditAction =
  | "SHIFT_REQUEST_SUBMITTED"
  | "AUTO_SCHEDULE_GENERATED"
  | "ASSIGNMENT_CREATED"
  | "ASSIGNMENT_UPDATED"
  | "ASSIGNMENT_REMOVED"
  | "STATUS_CHANGED";

export interface AuditLogEntry {
  id: string;
  scheduleId?: string;
  shiftRequestId?: string;
  revision?: number;
  action: AuditAction;
  actorId: string;
  actorRole: UserRole;
  occurredAt: ISODateTime;
  entityType: "schedule" | "assignment" | "shiftRequest";
  entityId: string;
  description: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, string | number | boolean | string[] | undefined>;
}

export interface AutoScheduleUnfilledSlot {
  date: ISODate;
  startTime: LocalTime;
  endTime: LocalTime;
  missingCount: number;
  reason: "NO_ELIGIBLE_EMPLOYEE";
}

export interface AutoScheduleResult {
  schedule: ShiftSchedule;
  staffing: StaffingSummary;
  conflicts: ScheduleConflict[];
  unfilled: AutoScheduleUnfilledSlot[];
  auditLog: AuditLogEntry;
}

