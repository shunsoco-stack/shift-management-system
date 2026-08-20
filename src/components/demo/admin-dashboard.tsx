"use client";

import { useMemo } from "react";
import {
  DEMO_PERIOD,
  employees,
  shortDateLabel,
  type ShiftWorkflowStatus,
} from "@/src/lib/demo-data";
import {
  formatAuditDate,
  formatMinutes,
  workflowLabels,
  workflowSteps,
} from "@/src/lib/demo-state";
import { useShiftDemo } from "@/src/lib/shift-context";
import { Avatar, Card, MetricCard, PageHeading, ProgressRing, StatusPill } from "./demo-ui";
import { Icon } from "./icons";

const actionLabels = {
  "request.submitted": "希望シフトを提出",
  "assignment.generated": "シフト案を自動作成",
  "assignment.updated": "シフトを変更",
  "assignment.created": "シフト枠を追加",
  "assignment.deleted": "シフト枠を削除",
  "requirement.updated": "必要人数を更新",
  "status.changed": "ステータスを変更",
  "demo.reset": "Demoを初期化",
} as const;

function nextActionLabel(status: ShiftWorkflowStatus) {
  switch (status) {
    case "draft": return "Reviewへ進む";
    case "review": return "シフトを確定";
    case "confirmed": return "従業員へ公開";
    case "published": return "公開済み";
  }
}

export function WorkflowRail({ compact = false }: { compact?: boolean }) {
  const { state, advanceStatus, returnToDraft } = useShiftDemo();
  const activeIndex = workflowSteps.indexOf(state.status);
  return (
    <div className={`workflow-rail ${compact ? "workflow-rail--compact" : ""}`}>
      <div className="workflow-rail__steps" aria-label="シフト確定状況">
        {workflowSteps.map((step, index) => (
          <div
            aria-current={state.status === step ? "step" : undefined}
            className={`${index < activeIndex ? "is-complete" : ""} ${index === activeIndex ? "is-active" : ""}`}
            key={step}
          >
            <span>{index < activeIndex ? <Icon name="check" /> : index + 1}</span>
            <div><strong>{workflowLabels[step]}</strong><small>{step === "draft" ? "編集中" : step === "review" ? "確認" : step === "confirmed" ? "確定" : "共有"}</small></div>
            {index < workflowSteps.length - 1 && <i aria-hidden="true" />}
          </div>
        ))}
      </div>
      {!compact && (
        <div className="workflow-rail__actions">
          {state.status !== "draft" && (
            <button className="demo-button demo-button--ghost" onClick={returnToDraft} type="button">Draftへ戻す</button>
          )}
          <button
            className="demo-button demo-button--primary"
            disabled={state.status === "published"}
            onClick={advanceStatus}
            type="button"
          >
            {state.status === "confirmed" && <Icon name="publish" />}
            {state.status !== "confirmed" && state.status !== "published" && <Icon name="chevron-right" />}
            {nextActionLabel(state.status)}
          </button>
        </div>
      )}
    </div>
  );
}

export function AdminDashboard() {
  const {
    state,
    coverage,
    conflicts,
    shortageMinutes,
    setSection,
    autoGenerate,
  } = useShiftDemo();
  const submitted = state.requests.filter((request) => request.submittedAt).length;
  const shortageRows = coverage.filter((row) => row.difference < 0);
  const recentSubmissions = useMemo(
    () =>
      state.requests
        .filter((request) => request.submittedAt)
        .sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""))
        .slice(0, 5),
    [state.requests],
  );

  return (
    <div className="demo-page admin-dashboard">
      <PageHeading
        eyebrow="ADMIN DASHBOARD"
        title="シフト作成状況"
        description={`${DEMO_PERIOD.label} · 希望、必要人数、Conflictを確認して公開まで進めます。`}
        actions={
          <>
            <StatusPill status={state.status} />
            <button className="demo-button demo-button--primary" onClick={() => { autoGenerate(); setSection("schedule"); }} type="button">
              <Icon name="sparkles" />シフト案を自動作成
            </button>
          </>
        }
      />

      <div className="admin-metrics">
        <MetricCard
          icon="request"
          label="希望提出"
          onClick={() => setSection("requests")}
          supporting={`未提出 ${employees.length - submitted}名`}
          tone="brand"
          value={<>{submitted}<small> / {employees.length}名</small></>}
        />
        <MetricCard
          icon="warning"
          label="人員不足時間"
          onClick={() => setSection("schedule")}
          supporting={`${shortageRows.length}時間帯で不足`}
          tone="danger"
          value={formatMinutes(shortageMinutes)}
        />
        <MetricCard
          icon="warning"
          label="Conflict"
          onClick={() => setSection("conflicts")}
          supporting={`重要 ${conflicts.filter((item) => item.severity === "high").length}件`}
          tone="warning"
          value={<>{conflicts.length}<small>件</small></>}
        />
        <MetricCard
          icon="publish"
          label="確定状況"
          onClick={() => setSection("schedule")}
          supporting="9月 第2週"
          tone="blue"
          value={workflowLabels[state.status]}
        />
      </div>

      <Card className="dashboard-workflow-card" title="公開までのWorkflow" description="各段階で人が内容を確認してから次へ進みます。">
        <WorkflowRail />
      </Card>

      <div className="admin-dashboard-grid">
        <Card
          action={<button className="demo-text-button" onClick={() => setSection("schedule")} type="button">シフト表で確認 <Icon name="chevron-right" /></button>}
          className="shortage-card"
          title="人員不足"
          description="必要人数に対する不足を通常コードで算出"
        >
          {shortageRows.length ? (
            <div className="shortage-list">
              {shortageRows.slice(0, 5).map((row) => (
                <button key={row.id} onClick={() => setSection("schedule")} type="button">
                  <span className="shortage-list__date"><strong>{shortDateLabel(row.date)}</strong><small>{row.start}〜{row.end}</small></span>
                  <span className="shortage-list__bar"><i style={{ width: `${Math.min(100, (row.assigned / Math.max(1, row.required)) * 100)}%` }} /></span>
                  <span className="shortage-list__count"><small>{row.assigned}/{row.required}名</small><strong>{row.difference}名</strong></span>
                  <Icon name="chevron-right" />
                </button>
              ))}
            </div>
          ) : (
            <div className="dashboard-all-clear"><Icon name="check" /><strong>すべての時間帯で必要人数を満たしています</strong></div>
          )}
        </Card>

        <Card
          action={<button className="demo-text-button" onClick={() => setSection("requests")} type="button">一覧を見る <Icon name="chevron-right" /></button>}
          className="submission-card"
          title="希望提出状況"
          description={`期限 ${DEMO_PERIOD.requestDeadlineLabel}`}
        >
          <div className="submission-summary">
            <ProgressRing label="提出済み" max={employees.length} value={submitted} />
            <div><strong>{Math.round((submitted / employees.length) * 100)}%</strong><span>提出済み</span><small>未提出者へ確認が必要です</small></div>
          </div>
          <div className="submission-avatars">
            {recentSubmissions.map((request) => {
              const employee = employees.find((item) => item.id === request.employeeId)!;
              return <div key={request.employeeId}><Avatar employeeId={employee.id} size="small" /><span>{employee.name}<small>提出済み</small></span><Icon name="check" /></div>;
            })}
          </div>
        </Card>

        <Card
          action={<button className="demo-text-button" onClick={() => setSection("audit")} type="button">すべての履歴 <Icon name="chevron-right" /></button>}
          className="activity-card"
          title="最近の変更"
          description="誰が・いつ・どこを・どう変更したか"
        >
          <div className="activity-list">
            {state.auditLogs.slice(0, 5).map((log) => (
              <div key={log.id}>
                <span className={`activity-list__icon activity-list__icon--${log.action.split(".")[0]}`}><Icon name={log.action === "request.submitted" ? "request" : log.action === "requirement.updated" ? "settings" : log.action === "status.changed" ? "publish" : "edit"} /></span>
                <p><strong>{log.actor}</strong><span>{actionLabels[log.action]}</span><small>{log.target} · {formatAuditDate(log.at)}</small></p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
