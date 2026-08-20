export type ActorRole = "employee" | "manager";
export type ShiftPeriodStatus = "Draft" | "Review" | "Confirmed" | "Published";

export type Actor = {
  sessionId: string;
  userId: string;
  role: ActorRole;
  employeeId: string | null;
  displayName: string;
};

export type AuthorizationAction =
  | "period:read"
  | "period:manage"
  | "request:read"
  | "request:write"
  | "assignment:read"
  | "assignment:manage"
  | "staffing:read"
  | "staffing:manage"
  | "conflict:read"
  | "audit:read"
  | "dashboard:read";

export type AuthorizationResource = {
  employeeId?: string | null;
  periodStatus?: ShiftPeriodStatus;
};

export type AuthorizationDecision =
  | { allowed: true }
  | { allowed: false; reason: string };

const MANAGER_ACTIONS = new Set<AuthorizationAction>([
  "period:read",
  "period:manage",
  "request:read",
  "assignment:read",
  "assignment:manage",
  "staffing:read",
  "staffing:manage",
  "conflict:read",
  "audit:read",
  "dashboard:read",
]);

export function authorize(
  actor: Actor,
  action: AuthorizationAction,
  resource: AuthorizationResource = {},
): AuthorizationDecision {
  if (actor.role === "manager") {
    return MANAGER_ACTIONS.has(action)
      ? { allowed: true }
      : {
          allowed: false,
          reason: "管理者は従業員本人の希望は代理編集できません。",
        };
  }

  if (action === "period:read" || action === "dashboard:read") {
    return { allowed: true };
  }

  const ownsResource =
    Boolean(actor.employeeId) && actor.employeeId === resource.employeeId;

  if (action === "request:read" || action === "request:write") {
    return ownsResource
      ? { allowed: true }
      : {
          allowed: false,
          reason: "従業員は自分の希望シフトだけ参照・更新できます。",
        };
  }

  if (action === "assignment:read") {
    if (!ownsResource) {
      return {
        allowed: false,
        reason: "従業員は自分のシフトだけ参照できます。",
      };
    }
    if (
      resource.periodStatus !== "Confirmed" &&
      resource.periodStatus !== "Published"
    ) {
      return {
        allowed: false,
        reason: "従業員には確定または公開済みシフトだけ表示されます。",
      };
    }
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: "この操作には管理者権限が必要です。",
  };
}

export class AuthorizationError extends Error {
  readonly code = "FORBIDDEN";
  readonly status = 403;

  constructor(message: string) {
    super(message);
    this.name = "AuthorizationError";
  }
}

export function assertAuthorized(
  actor: Actor,
  action: AuthorizationAction,
  resource: AuthorizationResource = {},
): void {
  const decision = authorize(actor, action, resource);
  if (!decision.allowed) throw new AuthorizationError(decision.reason);
}

const ALLOWED_TRANSITIONS: Record<ShiftPeriodStatus, ShiftPeriodStatus[]> = {
  Draft: ["Review"],
  Review: ["Draft", "Confirmed"],
  Confirmed: ["Review", "Published"],
  Published: [],
};

export function canTransitionShiftPeriod(
  from: ShiftPeriodStatus,
  to: ShiftPeriodStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function isPublishedRevisionMutable(status: ShiftPeriodStatus): boolean {
  return status !== "Published";
}
