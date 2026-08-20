"use client";

import { useState } from "react";
import {
  DEMO_PERIOD,
  WEEKDAY_LABELS,
  employees,
  shortDateLabel,
  type ConflictKind,
} from "@/src/lib/demo-data";
import { formatAuditDate } from "@/src/lib/demo-state";
import { useShiftDemo } from "@/src/lib/shift-context";
import { Avatar, Card, EmptyState, InlineNotice, PageHeading } from "./demo-ui";
import { Icon } from "./icons";

const conflictKindLabels: Record<ConflictKind, string> = {
  "day-off": "希望休",
  "outside-request": "希望時間外",
  overlap: "重複",
  "max-hours": "勤務時間",
  "short-break": "休憩",
  "min-rest": "勤務間隔",
  "consecutive-days": "連勤",
};

export function ConflictPanel() {
  const { conflicts, setSection } = useShiftDemo();
  const [filter, setFilter] = useState<"all" | "high" | "medium">("all");
  const visible = conflicts.filter(
    (conflict) => filter === "all" || conflict.severity === filter,
  );

  return (
    <div className="demo-page conflicts-page">
      <PageHeading
        eyebrow="ADMIN · CONFLICT CHECK"
        title="Conflict一覧"
        description="希望・勤務条件との不一致候補です。自動修正せず、管理者が確認して判断します。"
        actions={<button className="demo-button demo-button--secondary" onClick={() => setSection("schedule")} type="button"><Icon name="calendar" />シフト表を開く</button>}
      />

      <InlineNotice icon="info" title="確認候補として表示しています" tone="info">
        このチェックは管理判断を支援するもので、法令準拠を完全に保証するものではありません。店舗ルールと実態を確認してください。
      </InlineNotice>

      <Card className="conflicts-card">
        <div className="conflict-toolbar">
          <div className="demo-segmented" role="group" aria-label="Conflictの重要度">
            <button aria-pressed={filter === "all"} className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")} type="button">すべて <span>{conflicts.length}</span></button>
            <button aria-pressed={filter === "high"} className={filter === "high" ? "is-active" : ""} onClick={() => setFilter("high")} type="button">重要 <span>{conflicts.filter((item) => item.severity === "high").length}</span></button>
            <button aria-pressed={filter === "medium"} className={filter === "medium" ? "is-active" : ""} onClick={() => setFilter("medium")} type="button">確認 <span>{conflicts.filter((item) => item.severity === "medium").length}</span></button>
          </div>
          <span className="conflict-updated"><i />割当変更時に自動再計算</span>
        </div>

        {visible.length ? (
          <div className="conflict-list">
            {visible.map((conflict) => {
              const employee = employees.find((item) => item.id === conflict.employeeId)!;
              return (
                <article className={`conflict-item conflict-item--${conflict.severity}`} key={conflict.id}>
                  <span className="conflict-item__indicator"><Icon name="warning" /></span>
                  <div className="conflict-item__main">
                    <div><span className={`conflict-severity conflict-severity--${conflict.severity}`}>{conflict.severity === "high" ? "重要" : "確認"}</span><span className="conflict-kind">{conflictKindLabels[conflict.kind]}</span></div>
                    <h2>{conflict.title}</h2>
                    <p>{conflict.detail}</p>
                    <div className="conflict-person"><Avatar employeeId={employee.id} size="small" /><strong>{employee.name}</strong><span>{employee.job}</span><i /> <span><Icon name="calendar" />{shortDateLabel(conflict.date)}</span></div>
                  </div>
                  <button className="demo-button demo-button--secondary" onClick={() => setSection("schedule")} type="button">シフト表で調整 <Icon name="chevron-right" /></button>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState icon="check" title="該当するConflictはありません">割当を変更すると自動で再計算されます。</EmptyState>
        )}
      </Card>
    </div>
  );
}

export function RequirementPanel() {
  const { state, updateRequirement, coverage } = useShiftDemo();
  const sampleDatesByWeekday = ["2026-09-13", "2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12"];

  return (
    <div className="demo-page requirements-page">
      <PageHeading
        eyebrow="ADMIN · STAFFING REQUIREMENTS"
        title="必要人数設定"
        description="曜日・時間帯ごとの必要人数を設定します。変更はシフト表の不足・過剰表示へ即時反映されます。"
      />

      <div className="requirements-summary">
        <div><span><Icon name="people" /></span><p><strong>3つの時間帯</strong><small>12:00〜22:00</small></p></div>
        <div><span><Icon name="calendar" /></span><p><strong>曜日別ルール</strong><small>毎週繰り返し</small></p></div>
        <div><span><Icon name="warning" /></span><p><strong>{coverage.filter((row) => row.difference < 0).length}件の不足</strong><small>現在の割当との比較</small></p></div>
      </div>

      <Card className="requirements-card">
        <div className="requirements-table-wrap">
          <table className="requirements-table">
            <caption className="sr-only">曜日と時間帯ごとの必要人数</caption>
            <thead><tr><th scope="col">曜日</th><th scope="col">12:00〜15:00</th><th scope="col">15:00〜18:00</th><th scope="col">18:00〜22:00</th><th scope="col">現在の状況</th></tr></thead>
            <tbody>
              {WEEKDAY_LABELS.map((weekday, weekdayIndex) => {
                const requirements = state.requirements.filter((item) => item.weekday === weekdayIndex).sort((a, b) => a.start.localeCompare(b.start));
                const sampleDate = sampleDatesByWeekday[weekdayIndex];
                const dateCoverage = coverage.filter((row) => row.date === sampleDate);
                const shortageCount = dateCoverage.filter((row) => row.difference < 0).length;
                return (
                  <tr key={weekday}>
                    <th scope="row"><span className={weekdayIndex === 0 ? "is-sunday" : weekdayIndex === 6 ? "is-saturday" : ""}>{weekday}</span><small>{weekdayIndex === 0 || weekdayIndex === 6 ? "週末" : "平日"}</small></th>
                    {requirements.map((requirement) => (
                      <td key={requirement.id}>
                        <div className="requirement-stepper">
                          <button aria-label={`${weekday}曜 ${requirement.start} 必要人数を減らす`} disabled={requirement.required <= 0} onClick={() => updateRequirement(requirement.id, requirement.required - 1)} type="button">−</button>
                          <output aria-label={`必要${requirement.required}名`}>{requirement.required}<small>名</small></output>
                          <button aria-label={`${weekday}曜 ${requirement.start} 必要人数を増やす`} disabled={requirement.required >= 12} onClick={() => updateRequirement(requirement.id, requirement.required + 1)} type="button">＋</button>
                        </div>
                      </td>
                    ))}
                    <td><span className={`requirement-result ${shortageCount ? "has-shortage" : "is-clear"}`}><i />{shortageCount ? `${shortageCount}時間帯で不足` : "すべて充足"}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <footer className="requirements-footer"><Icon name="info" /><p>人数を増減すると不足・過剰配置が即時再計算されます。過剰配置は可視化のみ行い、自動削除はしません。</p></footer>
      </Card>

      <InlineNotice icon="settings" title="自動作成での扱い" tone="success">
        自動作成は、提出済み希望の範囲内で各時間帯の必要人数を満たすよう順番に割り当てます。勤務上限を超える候補は除外し、足りない場合は不足のままDraftへ残します。
      </InlineNotice>
    </div>
  );
}

export function AdminRequestOverview() {
  const { state, setActiveEmployee, setRole } = useShiftDemo();
  const [selectedId, setSelectedId] = useState("emp-11");
  const selectedRequest = state.requests.find((request) => request.employeeId === selectedId)!;
  const selectedEmployee = employees.find((employee) => employee.id === selectedId)!;
  const submitted = state.requests.filter((request) => request.submittedAt).length;
  const selectedDays = Object.values(selectedRequest.days);

  return (
    <div className="demo-page admin-requests-page">
      <PageHeading eyebrow="ADMIN · REQUEST STATUS" title="希望提出状況" description={`${DEMO_PERIOD.label} · 提出内容と未提出者を確認できます。`} />
      <InlineNotice action={<span className="demo-deadline-chip">提出済 {submitted}/{employees.length}名</span>} icon="warning" title="希望提出期限を過ぎています" tone="warning">
        期限は{DEMO_PERIOD.requestDeadlineLabel}でした。未提出者が{employees.length - submitted}名います。
      </InlineNotice>

      <div className="admin-request-layout">
        <Card className="request-status-list-card" title="スタッフ一覧" description="選択すると提出内容を確認できます。">
          <div className="request-status-list">
            {employees.map((employee) => {
              const request = state.requests.find((item) => item.employeeId === employee.id)!;
              return (
                <button className={selectedId === employee.id ? "is-selected" : ""} key={employee.id} onClick={() => setSelectedId(employee.id)} type="button">
                  <Avatar employeeId={employee.id} size="small" />
                  <span><strong>{employee.name}</strong><small>{employee.job}</small></span>
                  <em className={request.submittedAt ? "is-submitted" : "is-missing"}>{request.submittedAt ? "提出済" : "未提出"}</em>
                  <Icon name="chevron-right" />
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="request-preview-card">
          <div className="request-preview-person"><Avatar employeeId={selectedId} size="large" /><div><h2>{selectedEmployee.name}</h2><p>{selectedEmployee.job} · {selectedEmployee.employment}</p></div><span className={selectedRequest.submittedAt ? "is-submitted" : "is-missing"}>{selectedRequest.submittedAt ? "提出済み" : "未提出"}</span></div>
          <div className="request-preview-stats"><div><span>出勤可能</span><strong>{selectedDays.filter((day) => day.status === "available").length}<small>日</small></strong></div><div><span>希望休</span><strong>{selectedDays.filter((day) => day.status === "off").length}<small>日</small></strong></div><div><span>備考あり</span><strong>{selectedDays.filter((day) => day.note).length}<small>日</small></strong></div></div>
          <h3>第2週の希望</h3>
          <div className="request-preview-week">
            {["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13"].map((date) => {
              const day = selectedRequest.days[date];
              return <div className={`request-preview-day request-preview-day--${day.status}`} key={date}><span>{shortDateLabel(date)}</span><strong>{day.status === "off" ? "希望休" : day.status === "available" ? `${day.start}〜${day.end}` : "未設定"}</strong>{day.note && <small>{day.note}</small>}</div>;
            })}
          </div>
          <footer><button className="demo-button demo-button--secondary" onClick={() => { setActiveEmployee(selectedId); setRole("employee"); }} type="button"><Icon name="arrow-up-right" />従業員Demoで確認</button></footer>
        </Card>
      </div>
    </div>
  );
}

const auditActionLabels = {
  "request.submitted": "希望提出",
  "assignment.generated": "自動作成",
  "assignment.updated": "シフト変更",
  "assignment.created": "割当追加",
  "assignment.deleted": "割当削除",
  "requirement.updated": "必要人数変更",
  "status.changed": "状態変更",
  "demo.reset": "Demo初期化",
} as const;

export function AuditPanel() {
  const { state } = useShiftDemo();
  return (
    <div className="demo-page audit-page">
      <PageHeading eyebrow="ADMIN · AUDIT LOG" title="変更履歴" description="確定後の変更を含め、誰が・いつ・どこを・どう変更したかを記録します。" />
      <Card className="audit-card">
        <div className="audit-table-wrap">
          <table className="audit-table">
            <caption className="sr-only">シフト管理の変更履歴</caption>
            <thead><tr><th scope="col">日時</th><th scope="col">担当者</th><th scope="col">操作</th><th scope="col">対象</th><th scope="col">変更内容</th></tr></thead>
            <tbody>
              {state.auditLogs.map((log) => (
                <tr key={log.id}>
                  <td><span>{formatAuditDate(log.at)}</span></td>
                  <td><strong>{log.actor}</strong></td>
                  <td><span className={`audit-action audit-action--${log.action.split(".")[0]}`}>{auditActionLabels[log.action]}</span></td>
                  <td><strong>{log.target}</strong></td>
                  <td><div className="audit-change">{log.before && <span><small>変更前</small>{log.before}</span>}<Icon name={log.before ? "chevron-right" : "check"} />{log.after && <span><small>変更後</small>{log.after}</span>}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="audit-security-note"><span><Icon name="history" /></span><p><strong>監査ログについて</strong><small>Demoではブラウザ内に保存されます。本番想定ではBackend側で追記専用として記録し、Roleによる閲覧権限を適用します。</small></p></div>
    </div>
  );
}
