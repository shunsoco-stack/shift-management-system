import type { D1DatabaseLike } from "@/db";
import type { ShiftPeriodStatus } from "./authorization";
import { ApiError } from "./http";

export type ShiftPeriodRow = {
  id: string;
  periodKey: string;
  revision: number;
  label: string;
  startsOn: string;
  endsOn: string;
  requestDeadlineAt: string;
  status: ShiftPeriodStatus;
  sourcePeriodId: string | null;
  publishedAt: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

const PERIOD_SELECT = `
  SELECT id, period_key AS periodKey, revision, label,
         starts_on AS startsOn, ends_on AS endsOn,
         request_deadline_at AS requestDeadlineAt, status,
         source_period_id AS sourcePeriodId, published_at AS publishedAt,
         created_by AS createdBy, updated_by AS updatedBy,
         created_at AS createdAt, updated_at AS updatedAt
  FROM shift_periods`;

export async function getShiftPeriod(
  db: D1DatabaseLike,
  periodId: string,
): Promise<ShiftPeriodRow> {
  const period = await db
    .prepare(`${PERIOD_SELECT} WHERE id = ?`)
    .bind(periodId)
    .first<ShiftPeriodRow>();
  if (!period) {
    throw new ApiError(404, "PERIOD_NOT_FOUND", "指定されたシフト期間が見つかりません。");
  }
  return period;
}

export async function listShiftPeriods(db: D1DatabaseLike): Promise<ShiftPeriodRow[]> {
  const result = await db
    .prepare(`${PERIOD_SELECT} ORDER BY starts_on DESC, revision DESC`)
    .all<ShiftPeriodRow>();
  return result.results;
}

export function assertMutablePeriod(period: ShiftPeriodRow): void {
  if (period.status === "Published") {
    throw new ApiError(
      409,
      "PUBLISHED_REVISION_IMMUTABLE",
      "公開済みrevisionは直接変更できません。`/api/shift-periods/revise` で新しいDraft revisionを作成してください。",
    );
  }
}

export function isPastDeadline(period: ShiftPeriodRow, now = new Date()): boolean {
  return now.getTime() > Date.parse(period.requestDeadlineAt);
}

export function assertDateInsidePeriod(
  period: ShiftPeriodRow,
  workDate: string,
): void {
  if (workDate < period.startsOn || workDate > period.endsOn) {
    throw new ApiError(
      400,
      "DATE_OUTSIDE_PERIOD",
      `${workDate}は${period.label}の期間外です。`,
    );
  }
}
