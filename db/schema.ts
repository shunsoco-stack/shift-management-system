import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const createdAt = () =>
  text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`);
const updatedAt = () =>
  text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`);

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    displayName: text("display_name").notNull(),
    role: text("role", { enum: ["employee", "manager"] }).notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("users_role_active_idx").on(table.role, table.isActive),
    check("users_role_check", sql`${table.role} IN ('employee', 'manager')`),
  ],
);

export const employees = sqliteTable(
  "employees",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    employeeCode: text("employee_code").notNull(),
    displayName: text("display_name").notNull(),
    employmentType: text("employment_type").notNull().default("パート"),
    color: text("color").notNull().default("#2563EB"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("employees_user_unique").on(table.userId),
    uniqueIndex("employees_code_unique").on(table.employeeCode),
    index("employees_active_idx").on(table.isActive, table.displayName),
  ],
);

export const shiftPeriods = sqliteTable(
  "shift_periods",
  {
    id: text("id").primaryKey(),
    periodKey: text("period_key").notNull(),
    revision: integer("revision").notNull().default(1),
    label: text("label").notNull(),
    startsOn: text("starts_on").notNull(),
    endsOn: text("ends_on").notNull(),
    requestDeadlineAt: text("request_deadline_at").notNull(),
    status: text("status", {
      enum: ["Draft", "Review", "Confirmed", "Published"],
    })
      .notNull()
      .default("Draft"),
    sourcePeriodId: text("source_period_id"),
    publishedAt: text("published_at"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("shift_periods_key_revision_unique").on(
      table.periodKey,
      table.revision,
    ),
    index("shift_periods_dates_status_idx").on(
      table.startsOn,
      table.endsOn,
      table.status,
    ),
    check(
      "shift_periods_status_check",
      sql`${table.status} IN ('Draft', 'Review', 'Confirmed', 'Published')`,
    ),
    check("shift_periods_revision_check", sql`${table.revision} >= 1`),
    check("shift_periods_date_check", sql`${table.startsOn} <= ${table.endsOn}`),
  ],
);

export const shiftRequests = sqliteTable(
  "shift_requests",
  {
    id: text("id").primaryKey(),
    periodId: text("period_id")
      .notNull()
      .references(() => shiftPeriods.id, { onDelete: "cascade" }),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    workDate: text("work_date").notNull(),
    availability: text("availability", { enum: ["available", "day_off"] })
      .notNull()
      .default("available"),
    requestedStart: text("requested_start"),
    requestedEnd: text("requested_end"),
    note: text("note").notNull().default(""),
    requestStatus: text("request_status", { enum: ["Draft", "Submitted"] })
      .notNull()
      .default("Draft"),
    submittedAt: text("submitted_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("shift_requests_period_employee_date_unique").on(
      table.periodId,
      table.employeeId,
      table.workDate,
    ),
    index("shift_requests_period_status_idx").on(
      table.periodId,
      table.requestStatus,
    ),
    check(
      "shift_requests_availability_check",
      sql`${table.availability} IN ('available', 'day_off')`,
    ),
    check(
      "shift_requests_status_check",
      sql`${table.requestStatus} IN ('Draft', 'Submitted')`,
    ),
  ],
);

export const shiftAssignments = sqliteTable(
  "shift_assignments",
  {
    id: text("id").primaryKey(),
    periodId: text("period_id")
      .notNull()
      .references(() => shiftPeriods.id, { onDelete: "cascade" }),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    workDate: text("work_date").notNull(),
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
    breakMinutes: integer("break_minutes").notNull().default(0),
    source: text("source", { enum: ["manual", "auto"] })
      .notNull()
      .default("manual"),
    note: text("note").notNull().default(""),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("shift_assignments_period_date_idx").on(
      table.periodId,
      table.workDate,
    ),
    index("shift_assignments_employee_date_idx").on(
      table.employeeId,
      table.workDate,
    ),
    check("shift_assignments_break_check", sql`${table.breakMinutes} >= 0`),
    check(
      "shift_assignments_source_check",
      sql`${table.source} IN ('manual', 'auto')`,
    ),
  ],
);

export const staffingRequirements = sqliteTable(
  "staffing_requirements",
  {
    id: text("id").primaryKey(),
    periodId: text("period_id")
      .notNull()
      .references(() => shiftPeriods.id, { onDelete: "cascade" }),
    dayOfWeek: integer("day_of_week").notNull(),
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
    requiredCount: integer("required_count").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("staffing_requirements_period_slot_unique").on(
      table.periodId,
      table.dayOfWeek,
      table.startTime,
      table.endTime,
    ),
    index("staffing_requirements_period_day_idx").on(
      table.periodId,
      table.dayOfWeek,
    ),
    check(
      "staffing_requirements_day_check",
      sql`${table.dayOfWeek} BETWEEN 0 AND 6`,
    ),
    check(
      "staffing_requirements_count_check",
      sql`${table.requiredCount} BETWEEN 0 AND 99`,
    ),
  ],
);

export const constraints = sqliteTable(
  "constraints",
  {
    id: text("id").primaryKey(),
    periodId: text("period_id").references(() => shiftPeriods.id, {
      onDelete: "cascade",
    }),
    employeeId: text("employee_id").references(() => employees.id, {
      onDelete: "cascade",
    }),
    type: text("type", {
      enum: [
        "MAX_DAILY_MINUTES",
        "MIN_BREAK_MINUTES",
        "MIN_REST_MINUTES",
        "MAX_CONSECUTIVE_DAYS",
      ],
    }).notNull(),
    value: integer("value").notNull(),
    configJson: text("config_json").notNull().default("{}"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("constraints_scope_idx").on(
      table.periodId,
      table.employeeId,
      table.isActive,
    ),
    check("constraints_value_check", sql`${table.value} >= 0`),
  ],
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    correlationId: text("correlation_id").notNull(),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    actorRole: text("actor_role", { enum: ["employee", "manager", "system"] })
      .notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    periodId: text("period_id"),
    revision: integer("revision"),
    beforeJson: text("before_json"),
    afterJson: text("after_json"),
    createdAt: createdAt(),
  },
  (table) => [
    index("audit_logs_period_created_idx").on(table.periodId, table.createdAt),
    index("audit_logs_actor_created_idx").on(
      table.actorUserId,
      table.createdAt,
    ),
  ],
);

export const demoSessions = sqliteTable(
  "demo_sessions",
  {
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["employee", "manager"] }).notNull(),
    employeeId: text("employee_id").references(() => employees.id, {
      onDelete: "cascade",
    }),
    expiresAt: text("expires_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("demo_sessions_token_hash_unique").on(table.tokenHash),
    index("demo_sessions_expiry_idx").on(table.expiresAt),
    check(
      "demo_sessions_role_employee_check",
      sql`(${table.role} = 'manager' AND ${table.employeeId} IS NULL) OR (${table.role} = 'employee' AND ${table.employeeId} IS NOT NULL)`,
    ),
  ],
);
