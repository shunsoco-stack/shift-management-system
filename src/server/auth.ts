import type { D1DatabaseLike } from "@/db";
import type { Actor, ActorRole } from "./authorization";
import { ApiError } from "./http";
import { newId, newOpaqueToken, sha256Hex } from "./ids";

export const SESSION_COOKIE = "shift_demo_session";
const SESSION_DAYS = 7;

type SessionRow = {
  sessionId: string;
  userId: string;
  role: ActorRole;
  employeeId: string | null;
  displayName: string;
};

function cookieMap(request: Request): Map<string, string> {
  const values = new Map<string, string>();
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key) values.set(key, value);
  }
  return values;
}

function sessionCredential(request: Request): { sessionId: string; token: string } | null {
  const raw = cookieMap(request).get(SESSION_COOKIE);
  if (!raw) return null;
  const decoded = decodeURIComponent(raw);
  const separator = decoded.indexOf(".");
  if (separator <= 0) return null;
  const sessionId = decoded.slice(0, separator);
  const token = decoded.slice(separator + 1);
  if (!sessionId || !/^[a-f0-9]{64}$/.test(token)) return null;
  return { sessionId, token };
}

async function resolveActor(
  db: D1DatabaseLike,
  credential: { sessionId: string; token: string },
): Promise<Actor | null> {
  const tokenHash = await sha256Hex(credential.token);
  const row = await db
    .prepare(
      `SELECT s.id AS sessionId, s.user_id AS userId, s.role,
              s.employee_id AS employeeId, u.display_name AS displayName
       FROM demo_sessions s
       JOIN users u ON u.id = s.user_id AND u.is_active = 1 AND u.role = s.role
       LEFT JOIN employees e
         ON e.id = s.employee_id AND e.user_id = s.user_id AND e.is_active = 1
       WHERE s.id = ? AND s.token_hash = ? AND s.expires_at > ?
         AND ((s.role = 'manager' AND s.employee_id IS NULL)
           OR (s.role = 'employee' AND e.id IS NOT NULL))`,
    )
    .bind(credential.sessionId, tokenHash, new Date().toISOString())
    .first<SessionRow>();
  if (!row || (row.role !== "employee" && row.role !== "manager")) return null;
  return row;
}

export async function optionalActor(
  request: Request,
  db: D1DatabaseLike,
): Promise<Actor | null> {
  const credential = sessionCredential(request);
  return credential ? resolveActor(db, credential) : null;
}

export async function requireActor(request: Request, db: D1DatabaseLike): Promise<Actor> {
  const actor = await optionalActor(request, db);
  if (!actor) {
    throw new ApiError(
      401,
      "UNAUTHENTICATED",
      "Demoセッションが無効または期限切れです。従業員または管理者としてDemo Modeを開始してください。",
    );
  }
  return actor;
}

export async function createDemoSession(
  db: D1DatabaseLike,
  role: ActorRole,
  employeeId?: string,
): Promise<{ actor: Actor; cookie: string }> {
  let user: { userId: string; employeeId: string | null; displayName: string } | null;
  if (role === "manager") {
    user = await db
      .prepare(
        `SELECT id AS userId, NULL AS employeeId, display_name AS displayName
         FROM users WHERE id = 'user-demo-manager' AND role = 'manager' AND is_active = 1`,
      )
      .first();
  } else {
    if (!employeeId) {
      throw new ApiError(400, "EMPLOYEE_REQUIRED", "従業員DemoにはemployeeIdが必要です。");
    }
    user = await db
      .prepare(
        `SELECT u.id AS userId, e.id AS employeeId, e.display_name AS displayName
         FROM employees e JOIN users u ON u.id = e.user_id
         WHERE e.id = ? AND e.is_active = 1 AND u.is_active = 1 AND u.role = 'employee'`,
      )
      .bind(employeeId)
      .first();
  }
  if (!user) {
    throw new ApiError(404, "DEMO_ACTOR_NOT_FOUND", "選択されたDemoユーザーが見つかりません。");
  }

  const sessionId = newId("session");
  const token = newOpaqueToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  await db
    .prepare(
      `INSERT INTO demo_sessions (id, token_hash, user_id, role, employee_id, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(sessionId, tokenHash, user.userId, role, user.employeeId, expiresAt)
    .run();

  const actor: Actor = {
    sessionId,
    userId: user.userId,
    role,
    employeeId: user.employeeId,
    displayName: user.displayName,
  };
  const maxAge = SESSION_DAYS * 86_400;
  const cookie = `${SESSION_COOKIE}=${encodeURIComponent(`${sessionId}.${token}`)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
  return { actor, cookie };
}

export async function deleteDemoSession(
  request: Request,
  db: D1DatabaseLike,
): Promise<void> {
  const credential = sessionCredential(request);
  if (!credential) return;
  const tokenHash = await sha256Hex(credential.token);
  await db
    .prepare("DELETE FROM demo_sessions WHERE id = ? AND token_hash = ?")
    .bind(credential.sessionId, tokenHash)
    .run();
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
