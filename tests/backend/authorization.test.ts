import { describe, expect, it } from "vitest";
import {
  authorize,
  canTransitionShiftPeriod,
  isPublishedRevisionMutable,
  type Actor,
} from "../../src/server/authorization";

const employee: Actor = {
  sessionId: "session-employee",
  userId: "user-emp-001",
  role: "employee",
  employeeId: "emp-001",
  displayName: "高橋 菜月",
};

const manager: Actor = {
  sessionId: "session-manager",
  userId: "user-demo-manager",
  role: "manager",
  employeeId: null,
  displayName: "佐藤 美咲",
};

describe("server-side authorization", () => {
  it("従業員は自分の希望だけ参照・更新できる", () => {
    expect(authorize(employee, "request:read", { employeeId: "emp-001" })).toEqual({
      allowed: true,
    });
    expect(authorize(employee, "request:write", { employeeId: "emp-001" })).toEqual({
      allowed: true,
    });
    expect(
      authorize(employee, "request:write", { employeeId: "emp-002" }).allowed,
    ).toBe(false);
  });

  it("従業員には自分の確定済みシフトだけ表示する", () => {
    expect(
      authorize(employee, "assignment:read", {
        employeeId: "emp-001",
        periodStatus: "Draft",
      }).allowed,
    ).toBe(false);
    expect(
      authorize(employee, "assignment:read", {
        employeeId: "emp-001",
        periodStatus: "Confirmed",
      }).allowed,
    ).toBe(true);
    expect(
      authorize(employee, "assignment:read", {
        employeeId: "emp-002",
        periodStatus: "Published",
      }).allowed,
    ).toBe(false);
  });

  it("管理者だけが必要人数・割当・監査を操作できる", () => {
    for (const action of [
      "staffing:manage",
      "assignment:manage",
      "period:manage",
      "audit:read",
      "conflict:read",
    ] as const) {
      expect(authorize(manager, action).allowed).toBe(true);
      expect(authorize(employee, action).allowed).toBe(false);
    }
  });

  it("管理者も従業員本人の希望は代理編集できない", () => {
    expect(
      authorize(manager, "request:read", { employeeId: "emp-001" }).allowed,
    ).toBe(true);
    expect(
      authorize(manager, "request:write", { employeeId: "emp-001" }).allowed,
    ).toBe(false);
  });
});

describe("shift period lifecycle", () => {
  it("Draft → Review → Confirmed → Publishedの段階を飛ばさない", () => {
    expect(canTransitionShiftPeriod("Draft", "Review")).toBe(true);
    expect(canTransitionShiftPeriod("Draft", "Confirmed")).toBe(false);
    expect(canTransitionShiftPeriod("Review", "Confirmed")).toBe(true);
    expect(canTransitionShiftPeriod("Confirmed", "Published")).toBe(true);
    expect(canTransitionShiftPeriod("Published", "Draft")).toBe(false);
  });

  it("公開済みrevisionは直接変更不可", () => {
    expect(isPublishedRevisionMutable("Confirmed")).toBe(true);
    expect(isPublishedRevisionMutable("Published")).toBe(false);
  });
});
