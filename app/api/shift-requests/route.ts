import { getD1Database } from "@/db";
import { atomicBatch, guardedPeriodAuditInsert } from "@/src/server/audit";
import { requireActor } from "@/src/server/auth";
import { assertAuthorized } from "@/src/server/authorization";
import { ApiError, handleRoute, json, readJsonObject, requiredQuery } from "@/src/server/http";
import { newId } from "@/src/server/ids";
import {
  assertDateInsidePeriod,
  assertMutablePeriod,
  getShiftPeriod,
  isPastDeadline,
} from "@/src/server/periods";
import { listRequests } from "@/src/server/shift-data";
import {
  arrayField,
  assertIsoDate,
  enumField,
  recordValue,
  stringField,
  timeToMinutes,
} from "@/src/server/validation";

type RequestDay = {
  workDate: string;
  availability: "available" | "day_off";
  requestedStart: string | null;
  requestedEnd: string | null;
  note: string;
};

function parseDays(body: Record<string, unknown>): RequestDay[] {
  const values = arrayField(body, "days");
  if (values.length === 0 || values.length > 62) {
    throw new ApiError(400, "VALIDATION_ERROR", "daysは1〜62件にしてください。");
  }
  const seen = new Set<string>();
  return values.map((value, index) => {
    const day = recordValue(value, `days[${index}]`);
    const workDate = stringField(day, "workDate", { max: 10 })!;
    const availability = enumField(day, "availability", [
      "available",
      "day_off",
    ] as const);
    assertIsoDate(workDate, `days[${index}].workDate`);
    if (seen.has(workDate)) {
      throw new ApiError(400, "DUPLICATE_DATE", `${workDate}が重複しています。`);
    }
    seen.add(workDate);
    const rawStart = stringField(day, "requestedStart", {
      optional: true,
      max: 5,
    });
    const rawEnd = stringField(day, "requestedEnd", {
      optional: true,
      max: 5,
    });
    const note = stringField(day, "note", {
      optional: true,
      max: 300,
      trim: true,
    }) ?? "";
    if (availability === "available" && (!rawStart || !rawEnd)) {
      throw new ApiError(
        400,
        "TIME_REQUIRED",
        `${workDate}の出勤可能時間を入力してください。`,
      );
    }
    if (rawStart && rawEnd && timeToMinutes(rawStart) >= timeToMinutes(rawEnd)) {
      throw new ApiError(400, "INVALID_TIME_RANGE", `${workDate}の終了時刻は開始時刻より後にしてください。`);
    }
    return {
      workDate,
      availability,
      requestedStart: availability === "day_off" ? null : rawStart ?? null,
      requestedEnd: availability === "day_off" ? null : rawEnd ?? null,
      note,
    };
  });
}

export async function GET(request: Request): Promise<Response> {
  return handleRoute(async () => {
    const db = getD1Database();
    const actor = await requireActor(request, db);
    const periodId = requiredQuery(request, "periodId");
    const period = await getShiftPeriod(db, periodId);
    const requestedEmployeeId = new URL(request.url).searchParams.get("employeeId") ?? undefined;
    const employeeId = actor.role === "employee" ? actor.employeeId! : requestedEmployeeId;
    assertAuthorized(actor, "request:read", { employeeId });
    const requests = await listRequests(db, periodId, employeeId);
    const late = isPastDeadline(period);
    return json({
      period,
      employeeId: employeeId ?? null,
      requests,
      submission: {
        status:
          requests.length > 0 && requests.every((item) => item.requestStatus === "Submitted")
            ? "Submitted"
            : "Draft",
        submittedAt:
          requests.find((item) => item.submittedAt)?.submittedAt ?? null,
        late,
        warning: late
          ? `希望提出期限（${period.requestDeadlineAt}）を過ぎています。変更内容は管理者の確認が必要です。`
          : null,
      },
    });
  });
}

export async function PUT(request: Request): Promise<Response> {
  return handleRoute(async () => {
    const db = getD1Database();
    const actor = await requireActor(request, db);
    if (!actor.employeeId) {
      throw new ApiError(403, "FORBIDDEN", "従業員だけが希望シフトを更新できます。");
    }
    assertAuthorized(actor, "request:write", { employeeId: actor.employeeId });
    const body = await readJsonObject(request);
    const periodId = stringField(body, "periodId", { max: 100 })!;
    const period = await getShiftPeriod(db, periodId);
    assertMutablePeriod(period);
    const days = parseDays(body);
    for (const day of days) assertDateInsidePeriod(period, day.workDate);
    const before = await listRequests(db, periodId, actor.employeeId);
    const statements = [
      guardedPeriodAuditInsert(db, actor, {
        action: "SHIFT_REQUEST_DRAFT_SAVED",
        entityType: "shift_request_month",
        entityId: `${periodId}:${actor.employeeId}`,
        periodId,
        before,
        after: days,
      }),
      ...days.map((day) =>
        db
          .prepare(
            `INSERT INTO shift_requests
             (id, period_id, employee_id, work_date, availability,
              requested_start, requested_end, note, request_status,
              submitted_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Draft', NULL, CURRENT_TIMESTAMP)
             ON CONFLICT(period_id, employee_id, work_date) DO UPDATE SET
               availability = excluded.availability,
               requested_start = excluded.requested_start,
               requested_end = excluded.requested_end,
               note = excluded.note,
               request_status = 'Draft',
               submitted_at = NULL,
               updated_at = CURRENT_TIMESTAMP`,
          )
          .bind(
            newId("request"),
            periodId,
            actor.employeeId,
            day.workDate,
            day.availability,
            day.requestedStart,
            day.requestedEnd,
            day.note,
          ),
      ),
    ];
    await atomicBatch(db, statements);
    return json({
      requests: await listRequests(db, periodId, actor.employeeId),
      submission: {
        status: "Draft",
        late: isPastDeadline(period),
        warning: isPastDeadline(period)
          ? "提出期限後の変更です。保存はされましたが、管理者への確認が必要です。"
          : null,
      },
    });
  });
}

export async function POST(request: Request): Promise<Response> {
  return handleRoute(async () => {
    const db = getD1Database();
    const actor = await requireActor(request, db);
    if (!actor.employeeId) {
      throw new ApiError(403, "FORBIDDEN", "従業員だけが希望シフトを提出できます。");
    }
    assertAuthorized(actor, "request:write", { employeeId: actor.employeeId });
    const body = await readJsonObject(request);
    const periodId = stringField(body, "periodId", { max: 100 })!;
    const period = await getShiftPeriod(db, periodId);
    assertMutablePeriod(period);
    const before = await listRequests(db, periodId, actor.employeeId);
    if (before.length === 0) {
      throw new ApiError(409, "NO_REQUEST_DRAFT", "希望シフトを入力してから提出してください。");
    }
    const submittedAt = new Date().toISOString();
    await atomicBatch(db, [
      guardedPeriodAuditInsert(db, actor, {
        action: "SHIFT_REQUEST_SUBMITTED",
        entityType: "shift_request_month",
        entityId: `${periodId}:${actor.employeeId}`,
        periodId,
        before: { status: "Draft" },
        after: { status: "Submitted", submittedAt },
      }),
      db
        .prepare(
          `UPDATE shift_requests
           SET request_status = 'Submitted', submitted_at = ?, updated_at = CURRENT_TIMESTAMP
           WHERE period_id = ? AND employee_id = ?`,
        )
        .bind(submittedAt, periodId, actor.employeeId),
    ]);
    return json({
      requests: await listRequests(db, periodId, actor.employeeId),
      submission: {
        status: "Submitted",
        submittedAt,
        late: isPastDeadline(period),
        warning: isPastDeadline(period)
          ? "期限後の提出です。管理者へ連絡してください。"
          : null,
      },
    });
  });
}
