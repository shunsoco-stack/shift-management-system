import type { DomainActor, UserRole } from "./types";

export type Permission =
  | "shiftRequest:submit-own"
  | "schedule:view-own"
  | "schedule:view-all"
  | "staffingRequirement:manage"
  | "schedule:generate"
  | "schedule:edit"
  | "schedule:review"
  | "schedule:confirm"
  | "schedule:publish"
  | "auditLog:view";

const ROLE_PERMISSIONS: Record<UserRole, ReadonlySet<Permission>> = {
  employee: new Set(["shiftRequest:submit-own", "schedule:view-own"]),
  admin: new Set([
    "shiftRequest:submit-own",
    "schedule:view-own",
    "schedule:view-all",
    "staffingRequirement:manage",
    "schedule:generate",
    "schedule:edit",
    "schedule:review",
    "schedule:confirm",
    "schedule:publish",
    "auditLog:view",
  ]),
};

export class DomainAuthorizationError extends Error {
  readonly code = "FORBIDDEN";

  constructor(
    readonly actor: DomainActor,
    readonly permission: Permission,
  ) {
    super(`${actor.role} is not allowed to perform ${permission}`);
    this.name = "DomainAuthorizationError";
  }
}

export function roleHasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export function canPerform(
  actor: DomainActor,
  permission: Permission,
  resourceEmployeeId?: string,
): boolean {
  if (!roleHasPermission(actor.role, permission)) return false;
  if (actor.role === "admin") return true;
  if (!permission.endsWith("-own")) return true;
  return Boolean(actor.employeeId && actor.employeeId === resourceEmployeeId);
}

export function assertPermission(
  actor: DomainActor,
  permission: Permission,
  resourceEmployeeId?: string,
): void {
  if (!canPerform(actor, permission, resourceEmployeeId)) {
    throw new DomainAuthorizationError(actor, permission);
  }
}
