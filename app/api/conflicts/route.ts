import { getD1Database } from "@/db";
import { requireActor } from "@/src/server/auth";
import { assertAuthorized } from "@/src/server/authorization";
import { evaluateConflicts } from "@/src/server/conflicts";
import { handleRoute, json, requiredQuery } from "@/src/server/http";
import { loadShiftPeriodData } from "@/src/server/shift-data";

export async function GET(request: Request): Promise<Response> {
  return handleRoute(async () => {
    const db = getD1Database();
    const actor = await requireActor(request, db);
    assertAuthorized(actor, "conflict:read");
    const periodId = requiredQuery(request, "periodId");
    const data = await loadShiftPeriodData(db, periodId);
    return json({ period: data.period, ...evaluateConflicts(data) });
  });
}
