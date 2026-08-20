PRAGMA foreign_keys = ON;
--> statement-breakpoint
CREATE TABLE `users` (
  `id` text PRIMARY KEY NOT NULL,
  `display_name` text NOT NULL,
  `role` text NOT NULL CHECK (`role` IN ('employee', 'manager')),
  `is_active` integer NOT NULL DEFAULT 1,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `users_role_active_idx` ON `users` (`role`, `is_active`);
--> statement-breakpoint
CREATE TABLE `employees` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL UNIQUE REFERENCES `users`(`id`) ON DELETE restrict,
  `employee_code` text NOT NULL UNIQUE,
  `display_name` text NOT NULL,
  `employment_type` text NOT NULL DEFAULT 'パート',
  `color` text NOT NULL DEFAULT '#2563EB',
  `is_active` integer NOT NULL DEFAULT 1,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `employees_active_idx` ON `employees` (`is_active`, `display_name`);
--> statement-breakpoint
CREATE TABLE `shift_periods` (
  `id` text PRIMARY KEY NOT NULL,
  `period_key` text NOT NULL,
  `revision` integer NOT NULL DEFAULT 1 CHECK (`revision` >= 1),
  `label` text NOT NULL,
  `starts_on` text NOT NULL,
  `ends_on` text NOT NULL,
  `request_deadline_at` text NOT NULL,
  `status` text NOT NULL DEFAULT 'Draft' CHECK (`status` IN ('Draft', 'Review', 'Confirmed', 'Published')),
  `source_period_id` text,
  `published_at` text,
  `created_by` text NOT NULL REFERENCES `users`(`id`) ON DELETE restrict,
  `updated_by` text NOT NULL REFERENCES `users`(`id`) ON DELETE restrict,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (`starts_on` <= `ends_on`),
  UNIQUE (`period_key`, `revision`)
);
--> statement-breakpoint
CREATE INDEX `shift_periods_dates_status_idx` ON `shift_periods` (`starts_on`, `ends_on`, `status`);
--> statement-breakpoint
CREATE TABLE `shift_requests` (
  `id` text PRIMARY KEY NOT NULL,
  `period_id` text NOT NULL REFERENCES `shift_periods`(`id`) ON DELETE cascade,
  `employee_id` text NOT NULL REFERENCES `employees`(`id`) ON DELETE restrict,
  `work_date` text NOT NULL,
  `availability` text NOT NULL DEFAULT 'available' CHECK (`availability` IN ('available', 'day_off')),
  `requested_start` text,
  `requested_end` text,
  `note` text NOT NULL DEFAULT '',
  `request_status` text NOT NULL DEFAULT 'Draft' CHECK (`request_status` IN ('Draft', 'Submitted')),
  `submitted_at` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (`period_id`, `employee_id`, `work_date`)
);
--> statement-breakpoint
CREATE INDEX `shift_requests_period_status_idx` ON `shift_requests` (`period_id`, `request_status`);
--> statement-breakpoint
CREATE TABLE `shift_assignments` (
  `id` text PRIMARY KEY NOT NULL,
  `period_id` text NOT NULL REFERENCES `shift_periods`(`id`) ON DELETE cascade,
  `employee_id` text NOT NULL REFERENCES `employees`(`id`) ON DELETE restrict,
  `work_date` text NOT NULL,
  `start_time` text NOT NULL,
  `end_time` text NOT NULL,
  `break_minutes` integer NOT NULL DEFAULT 0 CHECK (`break_minutes` >= 0),
  `source` text NOT NULL DEFAULT 'manual' CHECK (`source` IN ('manual', 'auto')),
  `note` text NOT NULL DEFAULT '',
  `created_by` text NOT NULL REFERENCES `users`(`id`) ON DELETE restrict,
  `updated_by` text NOT NULL REFERENCES `users`(`id`) ON DELETE restrict,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `shift_assignments_period_date_idx` ON `shift_assignments` (`period_id`, `work_date`);
--> statement-breakpoint
CREATE INDEX `shift_assignments_employee_date_idx` ON `shift_assignments` (`employee_id`, `work_date`);
--> statement-breakpoint
CREATE TABLE `staffing_requirements` (
  `id` text PRIMARY KEY NOT NULL,
  `period_id` text NOT NULL REFERENCES `shift_periods`(`id`) ON DELETE cascade,
  `day_of_week` integer NOT NULL CHECK (`day_of_week` BETWEEN 0 AND 6),
  `start_time` text NOT NULL,
  `end_time` text NOT NULL,
  `required_count` integer NOT NULL CHECK (`required_count` BETWEEN 0 AND 99),
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (`period_id`, `day_of_week`, `start_time`, `end_time`)
);
--> statement-breakpoint
CREATE INDEX `staffing_requirements_period_day_idx` ON `staffing_requirements` (`period_id`, `day_of_week`);
--> statement-breakpoint
CREATE TABLE `constraints` (
  `id` text PRIMARY KEY NOT NULL,
  `period_id` text REFERENCES `shift_periods`(`id`) ON DELETE cascade,
  `employee_id` text REFERENCES `employees`(`id`) ON DELETE cascade,
  `type` text NOT NULL CHECK (`type` IN ('MAX_DAILY_MINUTES', 'MIN_BREAK_MINUTES', 'MIN_REST_MINUTES', 'MAX_CONSECUTIVE_DAYS')),
  `value` integer NOT NULL CHECK (`value` >= 0),
  `config_json` text NOT NULL DEFAULT '{}',
  `is_active` integer NOT NULL DEFAULT 1,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `constraints_scope_idx` ON `constraints` (`period_id`, `employee_id`, `is_active`);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
  `id` text PRIMARY KEY NOT NULL,
  `correlation_id` text NOT NULL,
  `actor_user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE restrict,
  `actor_role` text NOT NULL CHECK (`actor_role` IN ('employee', 'manager', 'system')),
  `action` text NOT NULL,
  `entity_type` text NOT NULL,
  `entity_id` text NOT NULL,
  `period_id` text,
  `revision` integer,
  `before_json` text,
  `after_json` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `audit_logs_period_created_idx` ON `audit_logs` (`period_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `audit_logs_actor_created_idx` ON `audit_logs` (`actor_user_id`, `created_at`);
--> statement-breakpoint
CREATE TABLE `demo_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `token_hash` text NOT NULL UNIQUE,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE cascade,
  `role` text NOT NULL CHECK (`role` IN ('employee', 'manager')),
  `employee_id` text REFERENCES `employees`(`id`) ON DELETE cascade,
  `expires_at` text NOT NULL,
  `last_seen_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((`role` = 'manager' AND `employee_id` IS NULL) OR (`role` = 'employee' AND `employee_id` IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `demo_sessions_expiry_idx` ON `demo_sessions` (`expires_at`);
--> statement-breakpoint
CREATE TRIGGER `audit_logs_no_update`
BEFORE UPDATE ON `audit_logs`
BEGIN
  SELECT RAISE(ABORT, 'audit_logs are append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `audit_logs_no_delete`
BEFORE DELETE ON `audit_logs`
BEGIN
  SELECT RAISE(ABORT, 'audit_logs are append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `shift_periods_published_no_update`
BEFORE UPDATE ON `shift_periods`
WHEN OLD.`status` = 'Published'
BEGIN
  SELECT RAISE(ABORT, 'published revision is immutable; create a new revision');
END;
--> statement-breakpoint
CREATE TRIGGER `shift_periods_published_no_delete`
BEFORE DELETE ON `shift_periods`
WHEN OLD.`status` = 'Published'
BEGIN
  SELECT RAISE(ABORT, 'published revision is immutable; create a new revision');
END;
--> statement-breakpoint
CREATE TRIGGER `shift_periods_status_transition_check`
BEFORE UPDATE OF `status` ON `shift_periods`
WHEN OLD.`status` <> NEW.`status` AND NOT (
  (OLD.`status` = 'Draft' AND NEW.`status` = 'Review') OR
  (OLD.`status` = 'Review' AND NEW.`status` IN ('Draft', 'Confirmed')) OR
  (OLD.`status` = 'Confirmed' AND NEW.`status` IN ('Review', 'Published'))
)
BEGIN
  SELECT RAISE(ABORT, 'invalid shift period status transition');
END;
--> statement-breakpoint
CREATE TRIGGER `shift_requests_published_no_insert`
BEFORE INSERT ON `shift_requests`
WHEN EXISTS (SELECT 1 FROM `shift_periods` WHERE `id` = NEW.`period_id` AND `status` = 'Published')
BEGIN
  SELECT RAISE(ABORT, 'published revision is immutable; create a new revision');
END;
--> statement-breakpoint
CREATE TRIGGER `shift_requests_published_no_update`
BEFORE UPDATE ON `shift_requests`
WHEN EXISTS (SELECT 1 FROM `shift_periods` WHERE `id` = OLD.`period_id` AND `status` = 'Published')
BEGIN
  SELECT RAISE(ABORT, 'published revision is immutable; create a new revision');
END;
--> statement-breakpoint
CREATE TRIGGER `shift_requests_published_no_delete`
BEFORE DELETE ON `shift_requests`
WHEN EXISTS (SELECT 1 FROM `shift_periods` WHERE `id` = OLD.`period_id` AND `status` = 'Published')
BEGIN
  SELECT RAISE(ABORT, 'published revision is immutable; create a new revision');
END;
--> statement-breakpoint
CREATE TRIGGER `shift_assignments_published_no_insert`
BEFORE INSERT ON `shift_assignments`
WHEN EXISTS (SELECT 1 FROM `shift_periods` WHERE `id` = NEW.`period_id` AND `status` = 'Published')
BEGIN
  SELECT RAISE(ABORT, 'published revision is immutable; create a new revision');
END;
--> statement-breakpoint
CREATE TRIGGER `shift_assignments_published_no_update`
BEFORE UPDATE ON `shift_assignments`
WHEN EXISTS (SELECT 1 FROM `shift_periods` WHERE `id` = OLD.`period_id` AND `status` = 'Published')
BEGIN
  SELECT RAISE(ABORT, 'published revision is immutable; create a new revision');
END;
--> statement-breakpoint
CREATE TRIGGER `shift_assignments_published_no_delete`
BEFORE DELETE ON `shift_assignments`
WHEN EXISTS (SELECT 1 FROM `shift_periods` WHERE `id` = OLD.`period_id` AND `status` = 'Published')
BEGIN
  SELECT RAISE(ABORT, 'published revision is immutable; create a new revision');
END;
--> statement-breakpoint
CREATE TRIGGER `staffing_requirements_published_no_insert`
BEFORE INSERT ON `staffing_requirements`
WHEN EXISTS (SELECT 1 FROM `shift_periods` WHERE `id` = NEW.`period_id` AND `status` = 'Published')
BEGIN
  SELECT RAISE(ABORT, 'published revision is immutable; create a new revision');
END;
--> statement-breakpoint
CREATE TRIGGER `staffing_requirements_published_no_update`
BEFORE UPDATE ON `staffing_requirements`
WHEN EXISTS (SELECT 1 FROM `shift_periods` WHERE `id` = OLD.`period_id` AND `status` = 'Published')
BEGIN
  SELECT RAISE(ABORT, 'published revision is immutable; create a new revision');
END;
--> statement-breakpoint
CREATE TRIGGER `staffing_requirements_published_no_delete`
BEFORE DELETE ON `staffing_requirements`
WHEN EXISTS (SELECT 1 FROM `shift_periods` WHERE `id` = OLD.`period_id` AND `status` = 'Published')
BEGIN
  SELECT RAISE(ABORT, 'published revision is immutable; create a new revision');
END;
--> statement-breakpoint
INSERT INTO `users` (`id`, `display_name`, `role`) VALUES
  ('user-demo-manager', '佐藤 美咲', 'manager'),
  ('user-emp-001', '高橋 菜月', 'employee'),
  ('user-emp-002', '鈴木 悠真', 'employee'),
  ('user-emp-003', '伊藤 美咲', 'employee'),
  ('user-emp-004', '田中 陽斗', 'employee'),
  ('user-emp-005', '渡辺 凜', 'employee'),
  ('user-emp-006', '小林 愛', 'employee'),
  ('user-emp-007', '山本 蒼', 'employee'),
  ('user-emp-008', '中村 美月', 'employee'),
  ('user-emp-009', '加藤 蓮', 'employee'),
  ('user-emp-010', '吉田 結衣', 'employee'),
  ('user-emp-011', '山田 航', 'employee'),
  ('user-emp-012', '佐々木 葵', 'employee');
--> statement-breakpoint
INSERT INTO `employees` (`id`, `user_id`, `employee_code`, `display_name`, `employment_type`, `color`) VALUES
  ('emp-001', 'user-emp-001', 'S001', '高橋 菜月', '正社員', '#2563EB'),
  ('emp-002', 'user-emp-002', 'S002', '鈴木 悠真', '正社員', '#0F766E'),
  ('emp-003', 'user-emp-003', 'S003', '伊藤 美咲', 'パート', '#7C3AED'),
  ('emp-004', 'user-emp-004', 'S004', '田中 陽斗', 'パート', '#EA580C'),
  ('emp-005', 'user-emp-005', 'S005', '渡辺 凜', 'アルバイト', '#DB2777'),
  ('emp-006', 'user-emp-006', 'S006', '小林 愛', 'アルバイト', '#0891B2'),
  ('emp-007', 'user-emp-007', 'S007', '山本 蒼', 'パート', '#65A30D'),
  ('emp-008', 'user-emp-008', 'S008', '中村 美月', 'パート', '#D97706'),
  ('emp-009', 'user-emp-009', 'S009', '加藤 蓮', 'アルバイト', '#9333EA'),
  ('emp-010', 'user-emp-010', 'S010', '吉田 結衣', 'アルバイト', '#0284C7'),
  ('emp-011', 'user-emp-011', 'S011', '山田 航', 'パート', '#DC2626'),
  ('emp-012', 'user-emp-012', 'S012', '佐々木 葵', 'アルバイト', '#4F46E5');
--> statement-breakpoint
INSERT INTO `shift_periods` (`id`, `period_key`, `revision`, `label`, `starts_on`, `ends_on`, `request_deadline_at`, `status`, `created_by`, `updated_by`)
VALUES ('period-2026-09-r1', '2026-09', 1, '2026年9月', '2026-09-01', '2026-09-30', '2026-08-20T14:59:59.000Z', 'Draft', 'user-demo-manager', 'user-demo-manager');
--> statement-breakpoint
INSERT INTO `staffing_requirements` (`id`, `period_id`, `day_of_week`, `start_time`, `end_time`, `required_count`)
WITH days(day_of_week) AS (VALUES (0),(1),(2),(3),(4),(5),(6)),
slots(slot, start_time, end_time, required_count) AS (
  VALUES ('lunch','12:00','15:00',3), ('afternoon','15:00','18:00',2), ('evening','18:00','22:00',4)
)
SELECT 'reqstaff-' || day_of_week || '-' || slot, 'period-2026-09-r1', day_of_week, start_time, end_time,
       required_count + CASE WHEN day_of_week IN (0,6) AND slot = 'evening' THEN 1 ELSE 0 END
FROM days CROSS JOIN slots;
--> statement-breakpoint
INSERT INTO `constraints` (`id`, `period_id`, `type`, `value`, `config_json`) VALUES
  ('constraint-max-daily', 'period-2026-09-r1', 'MAX_DAILY_MINUTES', 480, '{}'),
  ('constraint-min-break', 'period-2026-09-r1', 'MIN_BREAK_MINUTES', 45, '{"afterMinutes":360}'),
  ('constraint-min-rest', 'period-2026-09-r1', 'MIN_REST_MINUTES', 660, '{}'),
  ('constraint-max-consecutive', 'period-2026-09-r1', 'MAX_CONSECUTIVE_DAYS', 5, '{}');
--> statement-breakpoint
WITH RECURSIVE dates(work_date) AS (
  VALUES ('2026-09-01')
  UNION ALL
  SELECT date(work_date, '+1 day') FROM dates WHERE work_date < '2026-09-30'
)
INSERT INTO `shift_requests` (`id`, `period_id`, `employee_id`, `work_date`, `availability`, `requested_start`, `requested_end`, `note`, `request_status`, `submitted_at`)
SELECT
  'request-' || e.id || '-' || replace(d.work_date, '-', ''),
  'period-2026-09-r1',
  e.id,
  d.work_date,
  CASE WHEN (CAST(substr(e.id, 5, 3) AS integer) + CAST(strftime('%d', d.work_date) AS integer)) % 7 = 0 THEN 'day_off' ELSE 'available' END,
  CASE WHEN (CAST(substr(e.id, 5, 3) AS integer) + CAST(strftime('%d', d.work_date) AS integer)) % 7 = 0 THEN NULL
       WHEN CAST(substr(e.id, 5, 3) AS integer) % 3 = 0 THEN '12:00'
       WHEN CAST(substr(e.id, 5, 3) AS integer) % 3 = 1 THEN '09:00' ELSE '15:00' END,
  CASE WHEN (CAST(substr(e.id, 5, 3) AS integer) + CAST(strftime('%d', d.work_date) AS integer)) % 7 = 0 THEN NULL
       WHEN CAST(substr(e.id, 5, 3) AS integer) % 3 = 0 THEN '20:00'
       WHEN CAST(substr(e.id, 5, 3) AS integer) % 3 = 1 THEN '17:00' ELSE '22:00' END,
  CASE WHEN CAST(strftime('%d', d.work_date) AS integer) IN (5, 12, 19, 26) THEN '平日より早めの退勤希望' ELSE '' END,
  CASE WHEN CAST(substr(e.id, 5, 3) AS integer) <= 8 THEN 'Submitted' ELSE 'Draft' END,
  CASE WHEN CAST(substr(e.id, 5, 3) AS integer) <= 8 THEN '2026-08-18T09:00:00.000Z' ELSE NULL END
FROM employees e CROSS JOIN dates d
WHERE e.is_active = 1;
--> statement-breakpoint
INSERT INTO `shift_assignments` (`id`, `period_id`, `employee_id`, `work_date`, `start_time`, `end_time`, `break_minutes`, `source`, `created_by`, `updated_by`)
WITH RECURSIVE dates(work_date) AS (
  VALUES ('2026-09-01')
  UNION ALL
  SELECT date(work_date, '+1 day') FROM dates WHERE work_date < '2026-09-07'
), assigned(employee_id, start_time, end_time, break_minutes) AS (
  VALUES ('emp-001','09:00','15:00',45), ('emp-002','12:00','18:00',45), ('emp-003','15:00','22:00',45), ('emp-004','17:00','22:00',0)
)
SELECT 'assignment-' || employee_id || '-' || replace(work_date, '-', ''), 'period-2026-09-r1', employee_id, work_date,
       start_time, end_time, break_minutes, 'manual', 'user-demo-manager', 'user-demo-manager'
FROM dates CROSS JOIN assigned;
--> statement-breakpoint
INSERT INTO `audit_logs` (`id`, `correlation_id`, `actor_user_id`, `actor_role`, `action`, `entity_type`, `entity_id`, `period_id`, `revision`, `after_json`)
VALUES ('audit-demo-seed', 'demo-seed', 'user-demo-manager', 'system', 'DEMO_SEEDED', 'shift_period', 'period-2026-09-r1', 'period-2026-09-r1', 1, '{"employees":12,"period":"2026-09"}');
