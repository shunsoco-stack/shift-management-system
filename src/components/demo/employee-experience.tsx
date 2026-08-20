"use client";

import { useMemo, useState } from "react";
import {
  DEMO_TODAY,
  DEMO_WEEK_DATES,
  WEEKDAY_LABELS,
  datesInSeptember,
  employees,
  parseLocalDate,
  shortDateLabel,
  type ShiftAssignment,
} from "@/src/lib/demo-data";
import {
  assignmentMinutes,
  formatMinutes,
  formatShift,
  shiftSummaryForEmployee,
} from "@/src/lib/demo-state";
import { useShiftDemo } from "@/src/lib/shift-context";
import { Card, EmptyState, InlineNotice, MetricCard, PageHeading } from "./demo-ui";
import { Icon } from "./icons";

function assignmentDateTime(assignment: ShiftAssignment) {
  return `${assignment.date}-${assignment.start}`;
}

export function EmployeeDashboard() {
  const { state, setSection } = useShiftDemo();
  const employee = employees.find((item) => item.id === state.activeEmployeeId)!;
  const ownSchedule = useMemo(
    () =>
      state.publishedAssignments
        .filter((assignment) => assignment.employeeId === state.activeEmployeeId)
        .sort((a, b) => assignmentDateTime(a).localeCompare(assignmentDateTime(b))),
    [state.activeEmployeeId, state.publishedAssignments],
  );
  const nextShift = ownSchedule.find((assignment) => assignment.date >= DEMO_TODAY);
  const weekAssignments = ownSchedule.filter((assignment) =>
    DEMO_WEEK_DATES.includes(assignment.date as (typeof DEMO_WEEK_DATES)[number]),
  );
  const weeklyMinutes = weekAssignments.reduce(
    (total, assignment) => total + assignmentMinutes(assignment),
    0,
  );
  const request = state.requests.find(
    (item) => item.employeeId === state.activeEmployeeId,
  );

  return (
    <div className="demo-page employee-dashboard">
      <PageHeading
        eyebrow="EMPLOYEE DASHBOARD"
        title={`${employee.name.split(" ")[0]}さん、おはようございます`}
        description="公開済みの勤務予定と、希望提出状況を確認できます。"
        actions={<span className="demo-date-chip"><Icon name="calendar" />2026年9月8日（火）</span>}
      />

      <div className="employee-metrics">
        <MetricCard
          icon="clock"
          label="次回勤務"
          onClick={() => setSection("my-shifts")}
          supporting={nextShift ? shortDateLabel(nextShift.date) : "予定なし"}
          tone="brand"
          value={nextShift ? formatShift(nextShift) : "—"}
        />
        <MetricCard
          icon="briefcase"
          label="今週の勤務"
          onClick={() => setSection("my-shifts")}
          supporting={`${weekAssignments.length}回の勤務`}
          tone="blue"
          value={formatMinutes(weeklyMinutes)}
        />
        <MetricCard
          icon="request"
          label="9月の希望"
          onClick={() => setSection("requests")}
          supporting={request?.submittedAt ? "8月14日に提出" : "入力内容を確認してください"}
          tone={request?.submittedAt ? "neutral" : "warning"}
          value={request?.submittedAt ? "提出済み" : "未提出"}
        />
      </div>

      <div className="employee-dashboard-grid">
        <Card className="next-shift-card" title="次回の勤務">
          {nextShift ? (
            <div className="next-shift">
              <div className="next-shift__date">
                <span>{WEEKDAY_LABELS[parseLocalDate(nextShift.date).getDay()]}</span>
                <strong>{parseLocalDate(nextShift.date).getDate()}</strong>
                <small>9月</small>
              </div>
              <div className="next-shift__detail">
                <span className="next-shift__label"><i /> 公開済み</span>
                <strong>{formatShift(nextShift)}</strong>
                <p><Icon name="briefcase" />{employee.job} · デモ店舗</p>
                <p><Icon name="clock" />休憩 {nextShift.breakMinutes || 0}分</p>
              </div>
              <button className="demo-button demo-button--secondary" onClick={() => setSection("my-shifts")} type="button">
                詳細を見る <Icon name="chevron-right" />
              </button>
            </div>
          ) : (
            <EmptyState title="次回勤務はありません">公開済みのシフトが入るとここに表示されます。</EmptyState>
          )}
        </Card>

        <Card
          action={<button className="demo-text-button" onClick={() => setSection("my-shifts")} type="button">すべて見る <Icon name="chevron-right" /></button>}
          className="week-overview-card"
          title="今週の予定"
        >
          <div className="week-strip" aria-label="今週の公開シフト">
            {DEMO_WEEK_DATES.map((date) => {
              const assignment = weekAssignments.find((item) => item.date === date);
              const day = parseLocalDate(date);
              return (
                <div className={`${assignment ? "has-shift" : ""} ${date === DEMO_TODAY ? "is-today" : ""}`} key={date}>
                  <span>{WEEKDAY_LABELS[day.getDay()]}</span>
                  <strong>{day.getDate()}</strong>
                  <i />
                  <small>{assignment ? `${assignment.start}〜` : "休"}</small>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {!request?.submittedAt && (
        <InlineNotice
          action={<button className="demo-button demo-button--warning" onClick={() => setSection("requests")} type="button">希望を入力</button>}
          icon="warning"
          title="9月の希望シフトが未提出です"
          tone="warning"
        >
          提出期限を過ぎています。管理者へ共有するため、内容を確認して提出してください。
        </InlineNotice>
      )}
    </div>
  );
}

type ScheduleRange = "today" | "week" | "month";

export function MyShifts() {
  const { state } = useShiftDemo();
  const [range, setRange] = useState<ScheduleRange>("week");
  const employee = employees.find((item) => item.id === state.activeEmployeeId)!;
  const summary = useMemo(
    () => shiftSummaryForEmployee(state.publishedAssignments, state.activeEmployeeId),
    [state.activeEmployeeId, state.publishedAssignments],
  );
  const visibleAssignments = summary.assignments.filter((assignment) => {
    if (range === "today") return assignment.date === DEMO_TODAY;
    if (range === "week") {
      return DEMO_WEEK_DATES.includes(assignment.date as (typeof DEMO_WEEK_DATES)[number]);
    }
    return assignment.date.startsWith("2026-09");
  });

  return (
    <div className="demo-page my-shifts-page">
      <PageHeading
        eyebrow="PUBLISHED SCHEDULE"
        title="自分のシフト"
        description="管理者が公開した確定シフトだけを表示しています。"
        actions={
          <div className="demo-segmented" role="group" aria-label="表示期間">
            {(["today", "week", "month"] as const).map((item) => (
              <button
                aria-pressed={range === item}
                className={range === item ? "is-active" : ""}
                key={item}
                onClick={() => setRange(item)}
                type="button"
              >
                {item === "today" ? "今日" : item === "week" ? "今週" : "今月"}
              </button>
            ))}
          </div>
        }
      />

      <div className="published-banner">
        <span><Icon name="check" /></span>
        <div><strong>公開済み · 2026年9月シフト</strong><p>最終公開 8月25日 18:30 · 管理者 Demo</p></div>
      </div>

      {range === "month" ? (
        <Card className="employee-month-card">
          <div className="employee-month-summary">
            <div><span>勤務日数</span><strong>{summary.workDays}<small>日</small></strong></div>
            <div><span>合計勤務</span><strong>{formatMinutes(summary.totalMinutes)}</strong></div>
            <div><span>所属</span><strong>{employee.job}</strong></div>
          </div>
          <div className="employee-month-grid" role="grid" aria-label="9月の公開シフト">
            {WEEKDAY_LABELS.map((label) => <div className="employee-month-weekday" key={label} role="columnheader">{label}</div>)}
            {Array.from({ length: parseLocalDate("2026-09-01").getDay() }, (_, index) => <div aria-hidden="true" key={`blank-${index}`} />)}
            {datesInSeptember().map((date) => {
              const assignment = visibleAssignments.find((item) => item.date === date);
              return (
                <div className={`employee-month-day ${assignment ? "has-shift" : ""}`} key={date} role="gridcell">
                  <span>{parseLocalDate(date).getDate()}</span>
                  {assignment ? <strong>{assignment.start}<br />{assignment.end}</strong> : <small>—</small>}
                </div>
              );
            })}
          </div>
        </Card>
      ) : (
        <Card className="published-list-card">
          <div className="published-list-heading">
            <div><span>{range === "today" ? "今日" : "9月7日〜13日"}</span><strong>{visibleAssignments.length}件の勤務</strong></div>
            <span>勤務合計 {formatMinutes(visibleAssignments.reduce((total, item) => total + assignmentMinutes(item), 0))}</span>
          </div>
          {visibleAssignments.length ? (
            <div className="published-shift-list">
              {visibleAssignments.map((assignment) => {
                const date = parseLocalDate(assignment.date);
                return (
                  <article className={assignment.date === DEMO_TODAY ? "is-today" : ""} key={assignment.id}>
                    <div className="published-shift-date"><span>{WEEKDAY_LABELS[date.getDay()]}</span><strong>{date.getDate()}</strong></div>
                    <div className="published-shift-main">
                      <span>{assignment.date === DEMO_TODAY ? "今日の勤務" : "勤務シフト"}</span>
                      <strong>{formatShift(assignment)}</strong>
                      <p>{employee.job} · デモ店舗</p>
                    </div>
                    <div className="published-shift-meta"><Icon name="clock" /><span>休憩<strong>{assignment.breakMinutes || 0}分</strong></span></div>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState icon="clock" title="勤務予定はありません">この期間に公開されているシフトはありません。</EmptyState>
          )}
        </Card>
      )}

      <div className="employee-disclaimer"><Icon name="info" /><p>この画面は公開済みシフトのみ表示します。勤務条件に関する判定は確認候補であり、法令準拠を保証するものではありません。</p></div>
    </div>
  );
}
