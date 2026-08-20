export type DemoRole = "employee" | "admin";

export type ShiftWorkflowStatus =
  | "draft"
  | "review"
  | "confirmed"
  | "published";

export type PreferenceStatus = "available" | "off" | "unset";

export type Employee = {
  id: string;
  name: string;
  nameKana: string;
  job: "ホール" | "キッチン" | "リーダー";
  employment: "社員" | "パート" | "学生アルバイト";
  initials: string;
  color: string;
  maxDailyMinutes: number;
  minRestMinutes: number;
  maxConsecutiveDays: number;
};

export type DayPreference = {
  date: string;
  status: PreferenceStatus;
  start: string;
  end: string;
  note: string;
};

export type ShiftRequest = {
  employeeId: string;
  periodId: string;
  submittedAt: string | null;
  days: Record<string, DayPreference>;
};

export type ShiftAssignment = {
  id: string;
  employeeId: string;
  date: string;
  start: string;
  end: string;
  breakMinutes: number;
  source: "manual" | "auto" | "seed";
};

export type StaffingRequirement = {
  id: string;
  weekday: number;
  start: string;
  end: string;
  required: number;
};

export type ConflictKind =
  | "day-off"
  | "outside-request"
  | "overlap"
  | "max-hours"
  | "short-break"
  | "min-rest"
  | "consecutive-days";

export type ShiftConflict = {
  id: string;
  kind: ConflictKind;
  severity: "high" | "medium";
  employeeId: string;
  assignmentId?: string;
  date: string;
  title: string;
  detail: string;
};

export type AuditLog = {
  id: string;
  at: string;
  actor: string;
  action:
    | "request.submitted"
    | "assignment.generated"
    | "assignment.updated"
    | "assignment.created"
    | "assignment.deleted"
    | "requirement.updated"
    | "status.changed"
    | "demo.reset";
  target: string;
  before?: string;
  after?: string;
};

export type DemoState = {
  role: DemoRole;
  activeEmployeeId: string;
  status: ShiftWorkflowStatus;
  requests: ShiftRequest[];
  assignments: ShiftAssignment[];
  publishedAssignments: ShiftAssignment[];
  requirements: StaffingRequirement[];
  auditLogs: AuditLog[];
};

export const DEMO_PERIOD = {
  id: "2026-09",
  label: "2026年9月",
  shortLabel: "9月",
  requestDeadline: "2026-08-20T23:59:00+09:00",
  requestDeadlineLabel: "8月20日（木）23:59",
  start: "2026-09-01",
  end: "2026-09-30",
} as const;

// The clock is fixed so every visitor sees the same, reproducible workflow.
export const DEMO_TODAY = "2026-09-08";
export const DEMO_WEEK_DATES = [
  "2026-09-07",
  "2026-09-08",
  "2026-09-09",
  "2026-09-10",
  "2026-09-11",
  "2026-09-12",
  "2026-09-13",
] as const;

export const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

export const employees: Employee[] = [
  { id: "emp-01", name: "佐藤 彩", nameKana: "さとう あや", job: "リーダー", employment: "社員", initials: "佐", color: "mint", maxDailyMinutes: 480, minRestMinutes: 660, maxConsecutiveDays: 5 },
  { id: "emp-02", name: "田中 健", nameKana: "たなか けん", job: "キッチン", employment: "社員", initials: "田", color: "blue", maxDailyMinutes: 480, minRestMinutes: 660, maxConsecutiveDays: 5 },
  { id: "emp-03", name: "鈴木 美咲", nameKana: "すずき みさき", job: "ホール", employment: "パート", initials: "鈴", color: "rose", maxDailyMinutes: 420, minRestMinutes: 660, maxConsecutiveDays: 5 },
  { id: "emp-04", name: "高橋 悠斗", nameKana: "たかはし ゆうと", job: "ホール", employment: "学生アルバイト", initials: "高", color: "violet", maxDailyMinutes: 420, minRestMinutes: 660, maxConsecutiveDays: 4 },
  { id: "emp-05", name: "伊藤 奈々", nameKana: "いとう なな", job: "キッチン", employment: "パート", initials: "伊", color: "amber", maxDailyMinutes: 480, minRestMinutes: 660, maxConsecutiveDays: 5 },
  { id: "emp-06", name: "渡辺 蓮", nameKana: "わたなべ れん", job: "ホール", employment: "学生アルバイト", initials: "渡", color: "cyan", maxDailyMinutes: 360, minRestMinutes: 660, maxConsecutiveDays: 4 },
  { id: "emp-07", name: "山本 葵", nameKana: "やまもと あおい", job: "ホール", employment: "パート", initials: "山", color: "coral", maxDailyMinutes: 420, minRestMinutes: 660, maxConsecutiveDays: 5 },
  { id: "emp-08", name: "中村 海斗", nameKana: "なかむら かいと", job: "キッチン", employment: "学生アルバイト", initials: "中", color: "indigo", maxDailyMinutes: 420, minRestMinutes: 660, maxConsecutiveDays: 4 },
  { id: "emp-09", name: "小林 結衣", nameKana: "こばやし ゆい", job: "ホール", employment: "パート", initials: "小", color: "pink", maxDailyMinutes: 360, minRestMinutes: 660, maxConsecutiveDays: 4 },
  { id: "emp-10", name: "加藤 大輝", nameKana: "かとう だいき", job: "キッチン", employment: "パート", initials: "加", color: "lime", maxDailyMinutes: 480, minRestMinutes: 660, maxConsecutiveDays: 5 },
  { id: "emp-11", name: "吉田 凛", nameKana: "よしだ りん", job: "ホール", employment: "学生アルバイト", initials: "吉", color: "sky", maxDailyMinutes: 360, minRestMinutes: 660, maxConsecutiveDays: 4 },
  { id: "emp-12", name: "山田 直樹", nameKana: "やまだ なおき", job: "キッチン", employment: "パート", initials: "山", color: "slate", maxDailyMinutes: 480, minRestMinutes: 660, maxConsecutiveDays: 5 },
];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function datesInSeptember() {
  return Array.from({ length: 30 }, (_, index) => `2026-09-${pad(index + 1)}`);
}

export function parseLocalDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

export function weekdayOf(date: string) {
  return parseLocalDate(date).getDay();
}

export function shortDateLabel(date: string) {
  const parsed = parseLocalDate(date);
  return `${parsed.getMonth() + 1}/${parsed.getDate()}（${WEEKDAY_LABELS[parsed.getDay()]}）`;
}

function makePreference(employeeIndex: number, day: number): DayPreference {
  const date = `2026-09-${pad(day)}`;
  const weekday = weekdayOf(date);
  const preferredOff = (day + employeeIndex * 2) % 7 === 0 || (weekday === 0 && employeeIndex % 4 === 1);
  const pattern = employeeIndex % 3;
  return {
    date,
    status: preferredOff ? "off" : "available",
    start: pattern === 0 ? "10:00" : pattern === 1 ? "12:00" : "15:00",
    end: pattern === 0 ? "18:00" : pattern === 1 ? "22:00" : "22:00",
    note: preferredOff ? (day % 2 === 0 ? "私用のため" : "終日予定あり") : day % 11 === 0 ? "開始時間は相談可能です" : "",
  };
}

function buildRequests(): ShiftRequest[] {
  return employees.map((employee, employeeIndex) => {
    const days = Object.fromEntries(
      datesInSeptember().map((date, index) => [date, makePreference(employeeIndex, index + 1)]),
    );

    // Seed a few understandable conflicts in the review workspace.
    if (employee.id === "emp-03") {
      days["2026-09-11"] = { date: "2026-09-11", status: "off", start: "", end: "", note: "学校行事" };
    }
    if (employee.id === "emp-01") {
      days["2026-09-12"] = { date: "2026-09-12", status: "available", start: "10:00", end: "17:00", note: "17時まで希望" };
    }
    if (employee.id === "emp-06") {
      days["2026-09-08"] = { date: "2026-09-08", status: "available", start: "18:00", end: "22:00", note: "授業後に勤務可能" };
    }

    return {
      employeeId: employee.id,
      periodId: DEMO_PERIOD.id,
      submittedAt: employeeIndex < 10 ? `2026-08-${pad(14 + (employeeIndex % 6))}T${pad(9 + (employeeIndex % 7))}:20:00+09:00` : null,
      days,
    };
  });
}

export const initialRequests = buildRequests();

const slotTemplates = [
  ["12:00", "15:00"],
  ["15:00", "18:00"],
  ["18:00", "22:00"],
] as const;

export const initialRequirements: StaffingRequirement[] = WEEKDAY_LABELS.flatMap((_, weekday) => {
  const isWeekend = weekday === 0 || weekday === 6;
  const isFriday = weekday === 5;
  const counts = isWeekend ? [3, 3, 4] : isFriday ? [3, 2, 4] : [2, 2, 3];
  return slotTemplates.map(([start, end], index) => ({
    id: `req-${weekday}-${index}`,
    weekday,
    start,
    end,
    required: counts[index],
  }));
});

type SeedShift = [employeeId: string, start: string, end: string, breakMinutes?: number];

const seededWeek: Record<string, SeedShift[]> = {
  "2026-09-07": [["emp-01", "10:00", "18:00", 45], ["emp-02", "12:00", "22:00", 45], ["emp-03", "18:00", "22:00"]],
  "2026-09-08": [["emp-01", "10:00", "18:00", 45], ["emp-04", "12:00", "22:00", 45], ["emp-05", "18:00", "22:00"], ["emp-06", "18:00", "22:00"]],
  "2026-09-09": [["emp-02", "12:00", "18:00"], ["emp-03", "12:00", "18:00"], ["emp-04", "12:00", "18:00"], ["emp-07", "15:00", "22:00", 45], ["emp-08", "18:00", "22:00"]],
  "2026-09-10": [["emp-01", "12:00", "22:00", 45], ["emp-05", "12:00", "18:00"], ["emp-09", "18:00", "22:00"]],
  "2026-09-11": [["emp-02", "12:00", "22:00", 45], ["emp-03", "12:00", "18:00"], ["emp-04", "12:00", "18:00"], ["emp-06", "18:00", "22:00"], ["emp-07", "18:00", "22:00"]],
  "2026-09-12": [["emp-01", "12:00", "20:00", 45], ["emp-05", "12:00", "22:00", 30], ["emp-08", "12:00", "18:00"], ["emp-09", "18:00", "22:00"], ["emp-10", "18:00", "22:00"]],
  "2026-09-13": [["emp-02", "12:00", "22:00", 45], ["emp-03", "12:00", "22:00", 45], ["emp-04", "12:00", "18:00"], ["emp-06", "18:00", "22:00"]],
};

export const initialAssignments: ShiftAssignment[] = Object.entries(seededWeek).flatMap(
  ([date, shifts]) => shifts.map(([employeeId, start, end, breakMinutes = 0], index) => ({
    id: `seed-${date}-${employeeId}-${index}`,
    employeeId,
    date,
    start,
    end,
    breakMinutes,
    source: "seed" as const,
  })),
);

export const initialAuditLogs: AuditLog[] = [
  { id: "audit-1", at: "2026-08-20T17:42:00+09:00", actor: "管理者 Demo", action: "assignment.generated", target: "2026年9月シフト", after: "希望・必要人数・勤務制約をもとにDraft 32件を作成" },
  { id: "audit-2", at: "2026-08-20T16:08:00+09:00", actor: "鈴木 美咲", action: "request.submitted", target: "2026年9月 希望シフト", after: "希望休 5日・出勤可能 25日" },
  { id: "audit-3", at: "2026-08-19T11:30:00+09:00", actor: "管理者 Demo", action: "requirement.updated", target: "土曜 18:00〜22:00", before: "必要3名", after: "必要4名" },
];

export function cloneDemoState(): DemoState {
  return {
    role: "admin",
    activeEmployeeId: "emp-01",
    status: "draft",
    requests: JSON.parse(JSON.stringify(initialRequests)) as ShiftRequest[],
    assignments: JSON.parse(JSON.stringify(initialAssignments)) as ShiftAssignment[],
    publishedAssignments: JSON.parse(JSON.stringify(initialAssignments)) as ShiftAssignment[],
    requirements: JSON.parse(JSON.stringify(initialRequirements)) as StaffingRequirement[],
    auditLogs: JSON.parse(JSON.stringify(initialAuditLogs)) as AuditLog[],
  };
}
