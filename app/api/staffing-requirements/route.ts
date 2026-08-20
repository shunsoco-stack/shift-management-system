import { getD1Database } from "@/db";
import { atomicBatch, guardedPeriodAuditInsert } from "@/src/server/audit";
import { requireActor } from "@/src/server/auth";
import { assertAuthorized } from "@/src/server/authorization";
import { ApiError, handleRoute, json, readJsonObject, requiredQuery } from "@/src/server/http";
import { newId } from "@/src/server/ids";
import { assertMutablePeriod, getShiftPeriod } from "@/src/server/periods";
import { listRequirements } from "@/src/server/shift-data";
import {
  arrayField,
  integerField,
  recordValue,
  stringField,
  timeToMinutes,
} from "@/src/server/validation";

type RequirementInput = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  requiredCount: number;
};

function parseRequirements(body: Record<string, unknown>): RequirementInput[] {
  const values = arrayField(body, "requirements");
  if (values.length > 100) {
    throw new ApiError(400, "VALIDATION_ERROR", "必要人数設定は100件以内にしてください。");
  }
  const parsed = values.map((value, index) => {
    const item = recordValue(value, `requirements[${index}]`);
    const dayOfWeek = integerField(item, "dayOfWeek", { min: 0, max: 6 })!;
    const startTime = stringField(item, "startTime", { max: 5 })!;
    const endTime = stringField(item, "endTime", { max: 5 })!;
    const requiredCount = integerField(item, "requiredCount", {
      min: 0,
      max: 99,
    })!;
    if (timeToMinutes(startTime, "startTime") >= timeToMinutes(endTime, "endTime")) {
      throw new ApiError(400, "INVALID_TIME_RANGE", `requirements[${index}]の終了時刻は開始時刻より後にしてください。`);
    }
    return { dayOfWeek, startTime, endTime, requiredCount };
  });

  for (let day = 0; day <= 6; day += 1) {
    const slots = parsed
      .filter((item) => item.dayOfWeek === day)
      .sort((left, right) => left.startTime.localeCompare(right.startTime));
    for (let index = 1; index < slots.length; index += 1) {
      if (slots[index].startTime < slots[index - 1].endTime) {
        throw new ApiError(
          400,
          "OVERLAPPING_REQUIREMENTS",
          `曜日${day}の必要人数時間帯が重複しています。`,
        );
      }
    }
  }
  return parsed;
}

export async function GET(request: Request): Promise<Response> {
  return handleRoute(async () => {
    const db = getD1Database();
    const actor = await requireActor(request, db);
    assertAuthorized(actor, "staffing:read");
    const periodId = requiredQuery(request, "periodId");
    const period = await getShiftPeriod(db, periodId);
    return json({ period, requirements: await listRequirements(db, periodId) });
  });
}

export async function PUT(request: Request): Promise<Response> {
  return handleRoute(async () => {
    const db = getD1Database();
    const actor = await requireActor(request, db);
    assertAuthorized(actor, "staffing:manage");
    const body = await readJsonObject(request);
    const periodId = stringField(body, "periodId", { max: 100 })!;
    const period = await getShiftPeriod(db, periodId);
    assertMutablePeriod(period);
    const requirements = parseRequirements(body);
    const before = await listRequirements(db, periodId);
    await atomicBatch(db, [
      guardedPeriodAuditInsert(db, actor, {
        action: "STAFFING_REQUIREMENTS_REPLACED",
        entityType: "staffing_requirement_set",
        entityId: periodId,
        periodId,
        before,
        after: requirements,
      }),
      db.prepare("DELETE FROM staffing_requirements WHERE period_id = ?").bind(periodId),
      ...requirements.map((item) =>
        db
          .prepare(
            `INSERT INTO staffing_requirements
             (id, period_id, day_of_week, start_time, end_time, required_count)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            newId("requirement"),
            periodId,
            item.dayOfWeek,
            item.startTime,
            item.endTime,
            item.requiredCount,
          ),
      ),
    ]);
    return json({ requirements: await listRequirements(db, periodId) });
  });
}
