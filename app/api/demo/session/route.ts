import { getD1Database } from "@/db";
import {
  clearSessionCookie,
  createDemoSession,
  deleteDemoSession,
  optionalActor,
} from "@/src/server/auth";
import { handleRoute, json, readJsonObject } from "@/src/server/http";
import { enumField, stringField } from "@/src/server/validation";

export async function GET(request: Request): Promise<Response> {
  return handleRoute(async () => {
    const db = getD1Database();
    const [actor, employees] = await Promise.all([
      optionalActor(request, db),
      db
        .prepare(
          `SELECT id, employee_code AS employeeCode, display_name AS displayName,
                  employment_type AS employmentType, color
           FROM employees WHERE is_active = 1 ORDER BY employee_code`,
        )
        .all(),
    ]);
    return json({
      actor,
      demoActors: {
        manager: { role: "manager", displayName: "佐藤 美咲" },
        employees: employees.results,
      },
    });
  });
}

export async function POST(request: Request): Promise<Response> {
  return handleRoute(async () => {
    const body = await readJsonObject(request);
    const role = enumField(body, "role", ["employee", "manager"] as const);
    const employeeId = stringField(body, "employeeId", {
      optional: true,
      max: 80,
    });
    const db = getD1Database();
    const session = await createDemoSession(db, role, employeeId);
    const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
    return json(
      { actor: session.actor, expiresInSeconds: 7 * 86_400 },
      {
        status: 201,
        headers: { "set-cookie": `${session.cookie}${secure}` },
      },
    );
  });
}

export async function DELETE(request: Request): Promise<Response> {
  return handleRoute(async () => {
    const db = getD1Database();
    await deleteDemoSession(request, db);
    const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
    return json(
      { signedOut: true },
      { headers: { "set-cookie": `${clearSessionCookie()}${secure}` } },
    );
  });
}
