"use client";

import { useEffect } from "react";
import Link from "next/link";
import { employees } from "@/src/lib/demo-data";
import { useShiftDemo, type DemoSection } from "@/src/lib/shift-context";
import { AdminDashboard } from "./admin-dashboard";
import { AdminRequestOverview, AuditPanel, ConflictPanel, RequirementPanel } from "./admin-panels";
import { EmployeeDashboard, MyShifts } from "./employee-experience";
import { RequestCalendar } from "./request-calendar";
import { ScheduleWorkspace } from "./schedule-workspace";
import { Avatar } from "./demo-ui";
import { BrandMark, Icon, type IconName } from "./icons";

type NavItem = {
  section: DemoSection;
  label: string;
  shortLabel?: string;
  icon: IconName;
  badge?: number;
};

export function DemoApp() {
  const {
    state,
    section,
    setSection,
    setRole,
    setActiveEmployee,
    conflicts,
    coverage,
    notice,
    dismissNotice,
    resetDemo,
    backendStatus,
  } = useShiftDemo();
  const unsubmitted = state.requests.filter((request) => !request.submittedAt).length;
  const shortageCount = coverage.filter((row) => row.difference < 0).length;
  const employee = employees.find((item) => item.id === state.activeEmployeeId)!;
  const adminNav: NavItem[] = [
    { section: "admin-dashboard", label: "Dashboard", shortLabel: "ホーム", icon: "dashboard" },
    { section: "schedule", label: "シフト作成", shortLabel: "シフト", icon: "calendar", badge: shortageCount },
    { section: "requests", label: "希望提出状況", shortLabel: "希望", icon: "request", badge: unsubmitted },
    { section: "conflicts", label: "Conflict", shortLabel: "Conflict", icon: "warning", badge: conflicts.length },
    { section: "requirements", label: "必要人数設定", shortLabel: "設定", icon: "settings" },
    { section: "audit", label: "変更履歴", icon: "history" },
  ];
  const employeeNav: NavItem[] = [
    { section: "employee-dashboard", label: "Dashboard", shortLabel: "ホーム", icon: "dashboard" },
    { section: "my-shifts", label: "自分のシフト", shortLabel: "シフト", icon: "calendar" },
    { section: "requests", label: "希望シフト提出", shortLabel: "希望提出", icon: "request", badge: state.requests.find((request) => request.employeeId === state.activeEmployeeId)?.submittedAt ? undefined : 1 },
  ];
  const nav = state.role === "admin" ? adminNav : employeeNav;

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(dismissNotice, 4400);
    return () => window.clearTimeout(timeout);
  }, [dismissNotice, notice]);

  return (
    <div className="shift-demo">
      <a className="demo-skip-link" href="#demo-main">メインコンテンツへ移動</a>
      <aside className="demo-sidebar">
        <div className="demo-sidebar__brand">
          <BrandMark />
          <div><strong>シフト管理システム</strong><span><i /> Demo Mode</span></div>
        </div>

        <nav aria-label={state.role === "admin" ? "管理者メニュー" : "従業員メニュー"}>
          <span className="demo-sidebar__nav-label">{state.role === "admin" ? "管理者メニュー" : "従業員メニュー"}</span>
          {nav.map((item) => (
            <button
              aria-current={section === item.section ? "page" : undefined}
              className={section === item.section ? "is-active" : ""}
              key={item.section}
              onClick={() => setSection(item.section)}
              type="button"
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.badge ? <em>{item.badge}</em> : null}
            </button>
          ))}
        </nav>

        <div className="demo-sidebar__workflow">
          <span>現在のシフト</span>
          <strong>2026年9月</strong>
          <div><i className={`is-${state.status}`} /><span>{state.status === "draft" ? "Draft · 編集中" : state.status === "review" ? "Review · 確認中" : state.status === "confirmed" ? "Confirmed · 確定" : "Published · 公開済"}</span></div>
          <small className={`demo-backend-status is-${backendStatus}`}>
            <i />
            {backendStatus === "connected"
              ? "Server Role 接続済み"
              : backendStatus === "connecting"
                ? "Server Role 接続中"
                : "Local Demo fallback"}
          </small>
        </div>

        <div className="demo-sidebar__footer">
          <button onClick={resetDemo} type="button"><Icon name="refresh" /><span>Demoを初期化</span></button>
          <Link href="/"><Icon name="arrow-up-right" /><span>紹介ページへ戻る</span></Link>
        </div>
      </aside>

      <div className="demo-app-area">
        <header className="demo-topbar">
          <Link aria-label="シフト管理システム 紹介ページ" className="demo-topbar__mobile-brand" href="/"><BrandMark size={32} /><strong>シフト管理システム</strong></Link>
          <div className="demo-role-switch" role="group" aria-label="Demoロール切替">
            <button aria-pressed={state.role === "employee"} className={state.role === "employee" ? "is-active" : ""} onClick={() => setRole("employee")} type="button"><Icon name="people" />従業員</button>
            <button aria-pressed={state.role === "admin"} className={state.role === "admin" ? "is-active" : ""} onClick={() => setRole("admin")} type="button"><Icon name="briefcase" />管理者</button>
          </div>

          <div className="demo-topbar__tools">
            {state.role === "employee" ? (
              <label className="demo-employee-select">
                <span className="sr-only">体験する従業員を選択</span>
                <Avatar employeeId={employee.id} size="small" />
                <select onChange={(event) => setActiveEmployee(event.target.value)} value={employee.id}>
                  {employees.map((item) => <option key={item.id} value={item.id}>{item.name}（{item.job}）</option>)}
                </select>
              </label>
            ) : (
              <button aria-label="変更履歴を開く" className="demo-topbar__history-button" onClick={() => setSection("audit")} type="button"><Icon name="history" /><span>変更履歴</span></button>
            )}
            <div className="demo-user-chip">
              {state.role === "admin" ? <span className="demo-admin-avatar"><Icon name="briefcase" /></span> : <Avatar employeeId={employee.id} size="small" />}
              <span><strong>{state.role === "admin" ? "管理者 Demo" : employee.name}</strong><small>{state.role === "admin" ? "店舗管理者" : employee.job}</small></span>
            </div>
          </div>
        </header>

        <main id="demo-main" tabIndex={-1}>
          {state.role === "admin" && section === "admin-dashboard" && <AdminDashboard />}
          {state.role === "admin" && section === "schedule" && <ScheduleWorkspace />}
          {state.role === "admin" && section === "requests" && <AdminRequestOverview />}
          {state.role === "admin" && section === "conflicts" && <ConflictPanel />}
          {state.role === "admin" && section === "requirements" && <RequirementPanel />}
          {state.role === "admin" && section === "audit" && <AuditPanel />}
          {state.role === "employee" && section === "employee-dashboard" && <EmployeeDashboard />}
          {state.role === "employee" && section === "my-shifts" && <MyShifts />}
          {state.role === "employee" && section === "requests" && <RequestCalendar />}
        </main>
      </div>

      <nav className="demo-mobile-nav" aria-label="モバイルナビゲーション">
        {nav.slice(0, state.role === "admin" ? 5 : 3).map((item) => (
          <button
            aria-current={section === item.section ? "page" : undefined}
            className={section === item.section ? "is-active" : ""}
            key={item.section}
            onClick={() => setSection(item.section)}
            type="button"
          >
            <span><Icon name={item.icon} />{item.badge ? <i>{item.badge}</i> : null}</span>
            <small>{item.shortLabel ?? item.label}</small>
          </button>
        ))}
      </nav>

      {notice && (
        <div className={`demo-toast demo-toast--${notice.tone}`} key={notice.id} role="status">
          <span><Icon name={notice.tone === "warning" ? "warning" : notice.tone === "info" ? "info" : "check"} /></span>
          <p>{notice.message}</p>
          <button aria-label="通知を閉じる" onClick={dismissNotice} type="button"><Icon name="close" /></button>
        </div>
      )}
    </div>
  );
}
