"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import {
  cloneDemoState,
  employees,
  type AuditLog,
  type DayPreference,
  type DemoRole,
  type DemoState,
  type ShiftAssignment,
} from "./demo-data";
import {
  calculateCoverage,
  calculateShortageMinutes,
  detectConflicts,
  generateDraftSchedule,
  nextWorkflowStatus,
} from "./demo-state";

export type DemoSection =
  | "employee-dashboard"
  | "my-shifts"
  | "requests"
  | "admin-dashboard"
  | "schedule"
  | "conflicts"
  | "requirements"
  | "audit";

type Notice = {
  id: number;
  tone: "success" | "warning" | "info";
  message: string;
} | null;

type ShiftContextValue = {
  state: DemoState;
  section: DemoSection;
  notice: Notice;
  conflicts: ReturnType<typeof detectConflicts>;
  coverage: ReturnType<typeof calculateCoverage>;
  shortageMinutes: number;
  backendStatus: "connecting" | "connected" | "local";
  setSection: (section: DemoSection) => void;
  setRole: (role: DemoRole) => void;
  setActiveEmployee: (employeeId: string) => void;
  updatePreference: (
    employeeId: string,
    date: string,
    patch: Partial<DayPreference>,
  ) => void;
  submitRequest: (employeeId: string) => void;
  updateRequirement: (id: string, required: number) => void;
  autoGenerate: () => void;
  updateAssignment: (
    assignmentId: string,
    patch: Partial<Pick<ShiftAssignment, "start" | "end" | "breakMinutes">>,
  ) => boolean;
  createAssignment: (employeeId: string, date: string) => string;
  deleteAssignment: (assignmentId: string) => void;
  advanceStatus: () => void;
  returnToDraft: () => void;
  resetDemo: () => void;
  dismissNotice: () => void;
};

const ShiftContext = createContext<ShiftContextValue | null>(null);
const STORAGE_KEY = "shift-management-system-demo-v2";
const BACKEND_PERIOD_ID = "period-2026-09-r1";

function backendEmployeeId(employeeId: string) {
  const numeric = employeeId.match(/\d+$/)?.[0] ?? "1";
  return `emp-${numeric.padStart(3, "0")}`;
}

function isDemoState(value: unknown): value is DemoState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<DemoState>;
  return (
    (state.role === "employee" || state.role === "admin") &&
    typeof state.activeEmployeeId === "string" &&
    ["draft", "review", "confirmed", "published"].includes(state.status ?? "") &&
    Array.isArray(state.requests) &&
    Array.isArray(state.assignments) &&
    Array.isArray(state.publishedAssignments) &&
    Array.isArray(state.requirements) &&
    Array.isArray(state.auditLogs)
  );
}

function addAudit(
  logs: AuditLog[],
  log: Omit<AuditLog, "id" | "at" | "actor"> & { actor?: string },
) {
  return [
    {
      ...log,
      id: `audit-${Date.now()}-${logs.length}`,
      at: new Date().toISOString(),
      actor: log.actor ?? "管理者 Demo",
    },
    ...logs,
  ];
}

function employeeName(employeeId: string) {
  return employees.find((employee) => employee.id === employeeId)?.name ?? "従業員";
}

export function ShiftProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<DemoState>(() => cloneDemoState());
  const [section, setSection] = useState<DemoSection>("admin-dashboard");
  const [notice, setNotice] = useState<Notice>(null);
  const [hydrated, setHydrated] = useState(false);
  const [backendStatus, setBackendStatus] = useState<
    "connecting" | "connected" | "local"
  >("connecting");
  const backendActorKey = useRef<string | null>(null);
  const backendStatusRef = useRef<"connecting" | "connected" | "local">(
    "connecting",
  );
  const backendSessionPromise = useRef<Promise<boolean> | null>(null);
  const lastBackendDataSignature = useRef<string | null>(null);

  useEffect(() => {
    let restored: DemoState | null = null;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (isDemoState(parsed)) restored = parsed;
      }
    } catch {
      // A corrupt or unavailable browser store falls back to the known demo seed.
    }
    queueMicrotask(() => {
      if (restored) setState(restored);
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage is an enhancement, not a requirement for the demo.
    }
  }, [hydrated, state]);

  const ensureBackendSession = useCallback(
    (role: DemoRole, employeeId: string): Promise<boolean> => {
      const actorKey = role === "admin" ? "manager" : `employee:${employeeId}`;
      if (
        backendActorKey.current === actorKey &&
        backendStatusRef.current === "connected"
      ) {
        return Promise.resolve(true);
      }
      if (backendActorKey.current === actorKey && backendSessionPromise.current) {
        return backendSessionPromise.current;
      }
      const previousPromise = backendSessionPromise.current;
      backendActorKey.current = actorKey;
      backendStatusRef.current = "connecting";
      setBackendStatus("connecting");
      const operation = (async () => {
        try {
          if (previousPromise) await previousPromise.catch(() => false);
          await fetch("/api/demo/session", { method: "DELETE" }).catch(
            () => undefined,
          );
          const response = await fetch("/api/demo/session", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(
              role === "admin"
                ? { role: "manager" }
                : { role: "employee", employeeId: backendEmployeeId(employeeId) },
            ),
          });
          if (!response.ok) throw new Error(`Demo session: ${response.status}`);
          if (backendActorKey.current === actorKey) {
            backendStatusRef.current = "connected";
            setBackendStatus("connected");
          }
          return true;
        } catch {
          if (backendActorKey.current === actorKey) {
            backendActorKey.current = null;
            backendSessionPromise.current = null;
            backendStatusRef.current = "local";
            setBackendStatus("local");
          }
          return false;
        } finally {
          if (backendActorKey.current === actorKey) {
            backendSessionPromise.current = null;
          }
        }
      })();
      backendSessionPromise.current = operation;
      return operation;
    },
    [],
  );

  useEffect(() => {
    if (!hydrated) return;
    queueMicrotask(() => {
      void ensureBackendSession(state.role, state.activeEmployeeId);
    });
  }, [ensureBackendSession, hydrated, state.activeEmployeeId, state.role]);

  useEffect(() => {
    if (!hydrated || state.role !== "admin" || backendStatus !== "connected") return;
    const signature = JSON.stringify({
      assignments: state.assignments,
      requirements: state.requirements,
    });
    if (lastBackendDataSignature.current === signature) return;
    const timeout = window.setTimeout(() => {
      void (async () => {
        try {
          const [assignmentsResponse, requirementsResponse] = await Promise.all([
            fetch("/api/shift-assignments", {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                periodId: BACKEND_PERIOD_ID,
                assignments: state.assignments.map((assignment) => ({
                  id: assignment.id,
                  employeeId: backendEmployeeId(assignment.employeeId),
                  workDate: assignment.date,
                  startTime: assignment.start,
                  endTime: assignment.end,
                  breakMinutes: assignment.breakMinutes,
                  note: `${assignment.source} assignment`,
                })),
              }),
            }),
            fetch("/api/staffing-requirements", {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                periodId: BACKEND_PERIOD_ID,
                requirements: state.requirements.map((requirement) => ({
                  dayOfWeek: requirement.weekday,
                  startTime: requirement.start,
                  endTime: requirement.end,
                  requiredCount: requirement.required,
                })),
              }),
            }),
          ]);
          if (!assignmentsResponse.ok || !requirementsResponse.ok) {
            throw new Error("Backend demo sync failed");
          }
          lastBackendDataSignature.current = signature;
        } catch {
          setBackendStatus("local");
          backendActorKey.current = null;
        }
      })();
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [backendStatus, hydrated, state.assignments, state.requirements, state.role]);

  const showNotice = useCallback(
    (message: string, tone: NonNullable<Notice>["tone"] = "success") => {
      setNotice({ id: Date.now(), message, tone });
    },
    [],
  );

  const dismissNotice = useCallback(() => setNotice(null), []);

  const setRole = useCallback((role: DemoRole) => {
    setState((current) => ({ ...current, role }));
    setSection(role === "admin" ? "admin-dashboard" : "employee-dashboard");
  }, []);

  const setActiveEmployee = useCallback((employeeId: string) => {
    setState((current) => ({ ...current, activeEmployeeId: employeeId }));
  }, []);

  const updatePreference = useCallback(
    (employeeId: string, date: string, patch: Partial<DayPreference>) => {
      setState((current) => ({
        ...current,
        requests: current.requests.map((request) =>
          request.employeeId === employeeId
            ? {
                ...request,
                submittedAt: null,
                days: {
                  ...request.days,
                  [date]: { ...request.days[date], ...patch, date },
                },
              }
            : request,
        ),
      }));
    },
    [],
  );

  const submitRequest = useCallback(
    (employeeId: string) => {
      const now = new Date().toISOString();
      const backendRequest = state.requests.find(
        (request) => request.employeeId === employeeId,
      );
      setState((current) => ({
        ...current,
        requests: current.requests.map((request) =>
          request.employeeId === employeeId
            ? { ...request, submittedAt: now }
            : request,
        ),
        auditLogs: addAudit(current.auditLogs, {
          actor: employeeName(employeeId),
          action: "request.submitted",
          target: "2026年9月 希望シフト",
          after: "月間希望を提出",
        }),
      }));
      if (backendRequest) {
        void (async () => {
          const connected = await ensureBackendSession("employee", employeeId);
          if (!connected) return;
          const days = Object.values(backendRequest.days)
            .filter((day) => day.status !== "unset")
            .map((day) => ({
              workDate: day.date,
              availability: day.status === "off" ? "day_off" : "available",
              requestedStart: day.status === "off" ? null : day.start,
              requestedEnd: day.status === "off" ? null : day.end,
              note: day.note,
            }));
          try {
            const draftResponse = await fetch("/api/shift-requests", {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ periodId: BACKEND_PERIOD_ID, days }),
            });
            if (!draftResponse.ok) throw new Error("Request draft sync failed");
            const submitResponse = await fetch("/api/shift-requests", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ periodId: BACKEND_PERIOD_ID }),
            });
            if (!submitResponse.ok) throw new Error("Request submit sync failed");
          } catch {
            setBackendStatus("local");
            backendActorKey.current = null;
          }
        })();
      }
      showNotice("9月の希望シフトを提出しました");
    },
    [ensureBackendSession, showNotice, state.requests],
  );

  const updateRequirement = useCallback(
    (id: string, required: number) => {
      const safeRequired = Math.max(0, Math.min(12, Math.round(required)));
      setState((current) => {
        const target = current.requirements.find((item) => item.id === id);
        return {
          ...current,
          requirements: current.requirements.map((item) =>
            item.id === id ? { ...item, required: safeRequired } : item,
          ),
          auditLogs: target
            ? addAudit(current.auditLogs, {
                action: "requirement.updated",
                target: `${target.start}〜${target.end}`,
                before: `必要${target.required}名`,
                after: `必要${safeRequired}名`,
              })
            : current.auditLogs,
        };
      });
      showNotice("必要人数を更新しました");
    },
    [showNotice],
  );

  const autoGenerate = useCallback(() => {
    setState((current) => {
      const assignments = generateDraftSchedule(
        current.requests,
        current.requirements,
      );
      return {
        ...current,
        status: "draft",
        assignments,
        auditLogs: addAudit(current.auditLogs, {
          action: "assignment.generated",
          target: "2026年9月 第2週",
          after: `希望・必要人数・勤務制約からDraft ${assignments.length}件を作成`,
        }),
      };
    });
    showNotice("通常の割当アルゴリズムでDraftを作成しました");
  }, [showNotice]);

  const updateAssignment = useCallback(
    (
      assignmentId: string,
      patch: Partial<Pick<ShiftAssignment, "start" | "end" | "breakMinutes">>,
    ) => {
      let valid = true;
      setState((current) => {
        const target = current.assignments.find(
          (assignment) => assignment.id === assignmentId,
        );
        if (!target) {
          valid = false;
          return current;
        }
        const updated = { ...target, ...patch, source: "manual" as const };
        const [startHour, startMinute] = updated.start.split(":").map(Number);
        const [endHour, endMinute] = updated.end.split(":").map(Number);
        if (
          startHour * 60 + startMinute >= endHour * 60 + endMinute ||
          Number.isNaN(startHour) ||
          Number.isNaN(endHour)
        ) {
          valid = false;
          return current;
        }
        return {
          ...current,
          status:
            current.status === "confirmed" || current.status === "published"
              ? "review"
              : current.status,
          assignments: current.assignments.map((assignment) =>
            assignment.id === assignmentId ? updated : assignment,
          ),
          auditLogs: addAudit(current.auditLogs, {
            action: "assignment.updated",
            target: `${employeeName(target.employeeId)} ${target.date}`,
            before: `${target.start}〜${target.end} / 休憩${target.breakMinutes}分`,
            after: `${updated.start}〜${updated.end} / 休憩${updated.breakMinutes}分`,
          }),
        };
      });
      if (valid) showNotice("シフトを更新し、Conflictを再計算しました");
      else showNotice("終了時刻は開始時刻より後にしてください", "warning");
      return valid;
    },
    [showNotice],
  );

  const createAssignment = useCallback(
    (employeeId: string, date: string) => {
      const id = `manual-${Date.now()}-${employeeId}`;
      setState((current) => {
        const preference = current.requests.find(
          (request) => request.employeeId === employeeId,
        )?.days[date];
        const start =
          preference?.status === "available" ? preference.start : "12:00";
        const end = preference?.status === "available" ? preference.end : "18:00";
        const assignment: ShiftAssignment = {
          id,
          employeeId,
          date,
          start: start || "12:00",
          end: end || "18:00",
          breakMinutes: 0,
          source: "manual",
        };
        return {
          ...current,
          status:
            current.status === "confirmed" || current.status === "published"
              ? "review"
              : current.status,
          assignments: [...current.assignments, assignment],
          auditLogs: addAudit(current.auditLogs, {
            action: "assignment.created",
            target: `${employeeName(employeeId)} ${date}`,
            after: `${assignment.start}〜${assignment.end}`,
          }),
        };
      });
      showNotice("シフト枠を追加しました");
      return id;
    },
    [showNotice],
  );

  const deleteAssignment = useCallback(
    (assignmentId: string) => {
      setState((current) => {
        const target = current.assignments.find(
          (assignment) => assignment.id === assignmentId,
        );
        if (!target) return current;
        return {
          ...current,
          status:
            current.status === "confirmed" || current.status === "published"
              ? "review"
              : current.status,
          assignments: current.assignments.filter(
            (assignment) => assignment.id !== assignmentId,
          ),
          auditLogs: addAudit(current.auditLogs, {
            action: "assignment.deleted",
            target: `${employeeName(target.employeeId)} ${target.date}`,
            before: `${target.start}〜${target.end}`,
            after: "割当を削除",
          }),
        };
      });
      showNotice("シフト枠を削除しました", "info");
    },
    [showNotice],
  );

  const conflicts = useMemo(
    () => detectConflicts(state.assignments, state.requests),
    [state.assignments, state.requests],
  );
  const coverage = useMemo(
    () => calculateCoverage(state.assignments, state.requirements),
    [state.assignments, state.requirements],
  );
  const shortageMinutes = useMemo(
    () => calculateShortageMinutes(coverage),
    [coverage],
  );

  const advanceStatus = useCallback(() => {
    const nextStatus = nextWorkflowStatus(state.status);
    setState((current) => {
      const next = nextWorkflowStatus(current.status);
      if (next === current.status) return current;
      return {
        ...current,
        status: next,
        publishedAssignments:
          next === "published"
            ? JSON.parse(JSON.stringify(current.assignments)) as ShiftAssignment[]
            : current.publishedAssignments,
        auditLogs: addAudit(current.auditLogs, {
          action: "status.changed",
          target: "2026年9月シフト",
          before: current.status,
          after: next,
        }),
      };
    });
    showNotice(
      state.status === "confirmed"
        ? "シフトを従業員へ公開しました"
        : "シフトの状態を更新しました",
    );
    if (nextStatus !== state.status) {
      void (async () => {
        const connected = await ensureBackendSession("admin", state.activeEmployeeId);
        if (!connected) return;
        const status = {
          draft: "Draft",
          review: "Review",
          confirmed: "Confirmed",
          published: "Published",
        }[nextStatus];
        try {
          const response = await fetch("/api/shift-periods/transition", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ periodId: BACKEND_PERIOD_ID, status }),
          });
          if (!response.ok) throw new Error("Status sync failed");
        } catch {
          setBackendStatus("local");
          backendActorKey.current = null;
        }
      })();
    }
  }, [ensureBackendSession, showNotice, state.activeEmployeeId, state.status]);

  const returnToDraft = useCallback(() => {
    setState((current) => ({
      ...current,
      status: "draft",
      auditLogs: addAudit(current.auditLogs, {
        action: "status.changed",
        target: "2026年9月シフト",
        before: current.status,
        after: "draft",
      }),
    }));
    showNotice("Draftに戻しました", "info");
  }, [showNotice]);

  const resetDemo = useCallback(() => {
    const fresh = cloneDemoState();
    fresh.auditLogs = addAudit(fresh.auditLogs, {
      action: "demo.reset",
      target: "Demoデータ",
      after: "初期状態へ復元",
    });
    setState(fresh);
    setSection("admin-dashboard");
    showNotice("Demoデータを初期状態に戻しました", "info");
  }, [showNotice]);

  const value = useMemo<ShiftContextValue>(
    () => ({
      state,
      section,
      notice,
      conflicts,
      coverage,
      shortageMinutes,
      backendStatus,
      setSection,
      setRole,
      setActiveEmployee,
      updatePreference,
      submitRequest,
      updateRequirement,
      autoGenerate,
      updateAssignment,
      createAssignment,
      deleteAssignment,
      advanceStatus,
      returnToDraft,
      resetDemo,
      dismissNotice,
    }),
    [
      state,
      section,
      notice,
      conflicts,
      coverage,
      shortageMinutes,
      backendStatus,
      setRole,
      setActiveEmployee,
      updatePreference,
      submitRequest,
      updateRequirement,
      autoGenerate,
      updateAssignment,
      createAssignment,
      deleteAssignment,
      advanceStatus,
      returnToDraft,
      resetDemo,
      dismissNotice,
    ],
  );

  return <ShiftContext.Provider value={value}>{children}</ShiftContext.Provider>;
}

export function useShiftDemo() {
  const context = useContext(ShiftContext);
  if (!context) {
    throw new Error("useShiftDemo must be used within ShiftProvider");
  }
  return context;
}
