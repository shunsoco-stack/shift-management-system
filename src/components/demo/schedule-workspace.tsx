"use client";

import { useEffect, useState } from "react";
import {
  DEMO_WEEK_DATES,
  WEEKDAY_LABELS,
  employees,
  parseLocalDate,
  shortDateLabel,
} from "@/src/lib/demo-data";
import {
  formatShift,
  requirementsForDate,
  timeToMinutes,
} from "@/src/lib/demo-state";
import { useShiftDemo } from "@/src/lib/shift-context";
import { Avatar, Card, PageHeading, StatusPill } from "./demo-ui";
import { Icon } from "./icons";
import { WorkflowRail } from "./admin-dashboard";

export function ScheduleWorkspace() {
  const {
    state,
    coverage,
    conflicts,
    autoGenerate,
    createAssignment,
    updateAssignment,
    deleteAssignment,
    setSection,
  } = useShiftDemo();
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const selectedAssignment = state.assignments.find(
    (assignment) => assignment.id === selectedAssignmentId,
  );
  const shortageRows = coverage.filter((row) => row.difference < 0);
  const excessRows = coverage.filter((row) => row.status === "excess");

  const openNewAssignment = (employeeId: string, date: string) => {
    const id = createAssignment(employeeId, date);
    setSelectedAssignmentId(id);
  };

  return (
    <div className="demo-page schedule-page">
      <PageHeading
        eyebrow="ADMIN · SCHEDULE BUILDER"
        title="週間シフト表"
        description="従業員の希望と必要人数を見比べ、セルを選択して勤務時間を調整できます。"
        actions={
          <>
            <StatusPill status={state.status} />
            <button className="demo-button demo-button--secondary" onClick={autoGenerate} type="button"><Icon name="sparkles" />自動作成</button>
          </>
        }
      />

      <Card className="schedule-workflow-card">
        <WorkflowRail compact />
      </Card>

      <div className="schedule-alerts" aria-label="配置チェック結果">
        <button className="schedule-alert schedule-alert--danger" onClick={() => setSection("schedule")} type="button">
          <span><Icon name="warning" /></span><div><strong>{shortageRows.length}<small>時間帯</small></strong><p>人員不足</p></div><Icon name="chevron-right" />
        </button>
        <button className="schedule-alert schedule-alert--warning" onClick={() => setSection("schedule")} type="button">
          <span><Icon name="people" /></span><div><strong>{excessRows.length}<small>時間帯</small></strong><p>過剰配置</p></div><Icon name="chevron-right" />
        </button>
        <button className="schedule-alert schedule-alert--neutral" onClick={() => setSection("conflicts")} type="button">
          <span><Icon name="warning" /></span><div><strong>{conflicts.length}<small>件</small></strong><p>Conflict</p></div><Icon name="chevron-right" />
        </button>
        <div className="schedule-algorithm-note">
          <span><Icon name="sparkles" /></span><p><strong>通常コードで自動作成</strong><small>希望時間 → 必要人数 → 勤務上限の順で候補を割当。結果は必ずDraftです。</small></p>
        </div>
      </div>

      <section className="schedule-board-card" aria-labelledby="schedule-board-title">
        <header className="schedule-board-toolbar">
          <div>
            <button aria-label="前の週" className="demo-icon-button" disabled type="button"><Icon name="chevron-left" /></button>
            <div><span>2026年9月</span><h2 id="schedule-board-title">9月7日 — 9月13日</h2></div>
            <button aria-label="次の週" className="demo-icon-button" disabled type="button"><Icon name="chevron-right" /></button>
          </div>
          <div className="schedule-board-legend">
            <span><i className="legend-dot legend-dot--shift" />割当</span>
            <span><i className="legend-dot legend-dot--shortage" />不足</span>
            <span><i className="legend-dot legend-dot--excess" />過剰</span>
            <span><i className="legend-dot legend-dot--conflict" />Conflict</span>
          </div>
        </header>

        <div className="schedule-board-scroll" aria-label="横にスクロールできる週間シフト表">
          <div className="schedule-board" role="table" aria-label="従業員別週間シフト">
            <div className="schedule-board__head schedule-board__row" role="row">
              <div className="schedule-staff-cell" role="columnheader"><span>スタッフ</span><small>12名</small></div>
              {DEMO_WEEK_DATES.map((date) => {
                const parsed = parseLocalDate(date);
                return (
                  <div className={`${parsed.getDay() === 0 ? "is-sunday" : ""} ${parsed.getDay() === 6 ? "is-saturday" : ""}`} key={date} role="columnheader">
                    <span>{WEEKDAY_LABELS[parsed.getDay()]}</span><strong>{parsed.getDate()}</strong><small>9月</small>
                  </div>
                );
              })}
            </div>

            <div className="schedule-board__body">
              {employees.map((employee) => (
                <div className="schedule-board__row schedule-employee-row" key={employee.id} role="row">
                  <div className="schedule-staff-cell" role="rowheader">
                    <Avatar employeeId={employee.id} size="small" />
                    <p><strong>{employee.name}</strong><small>{employee.job} · {employee.employment}</small></p>
                  </div>
                  {DEMO_WEEK_DATES.map((date) => {
                    const assignments = state.assignments.filter(
                      (assignment) => assignment.employeeId === employee.id && assignment.date === date,
                    );
                    const preference = state.requests.find((request) => request.employeeId === employee.id)?.days[date];
                    return (
                      <div
                        className={`schedule-assignment-cell ${preference?.status === "off" ? "is-requested-off" : ""}`}
                        key={date}
                        role="cell"
                      >
                        {assignments.map((assignment) => {
                          const assignmentConflicts = conflicts.filter((conflict) => conflict.assignmentId === assignment.id);
                          return (
                            <button
                              aria-label={`${employee.name} ${shortDateLabel(date)} ${formatShift(assignment)}を編集`}
                              className={`shift-block ${assignmentConflicts.length ? "has-conflict" : ""}`}
                              key={assignment.id}
                              onClick={() => setSelectedAssignmentId(assignment.id)}
                              type="button"
                            >
                              <span>{assignment.start}<i>—</i>{assignment.end}</span>
                              <small>{assignment.source === "auto" ? "AUTO" : assignment.source === "manual" ? "EDIT" : employee.job}</small>
                              {assignmentConflicts.length > 0 && <b title={`${assignmentConflicts.length}件のConflict`}><Icon name="warning" /></b>}
                            </button>
                          );
                        })}
                        {!assignments.length && (
                          <button
                            aria-label={`${employee.name} ${shortDateLabel(date)}にシフトを追加`}
                            className="add-shift-button"
                            onClick={() => openNewAssignment(employee.id, date)}
                            type="button"
                          >
                            <Icon name="plus" /><span>{preference?.status === "off" ? "希望休" : "追加"}</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="schedule-coverage" role="rowgroup">
              <div className="schedule-coverage__title schedule-board__row" role="row">
                <div className="schedule-staff-cell" role="rowheader"><span><Icon name="people" />必要人数との差</span><small>割当人数 / 必要人数</small></div>
                {DEMO_WEEK_DATES.map((date) => <div key={date} role="cell"><small>{requirementsForDate(date, state.requirements).length}つの時間帯</small></div>)}
              </div>
              {["12:00", "15:00", "18:00"].map((start) => (
                <div className="schedule-board__row coverage-time-row" key={start} role="row">
                  <div className="schedule-staff-cell" role="rowheader"><strong>{start}〜</strong><small>必要人数</small></div>
                  {DEMO_WEEK_DATES.map((date) => {
                    const row = coverage.find((item) => item.date === date && item.start === start);
                    if (!row) return <div key={date} role="cell">—</div>;
                    return (
                      <button
                        aria-label={`${shortDateLabel(date)} ${row.start}から${row.end} 割当${row.assigned}名 必要${row.required}名 ${row.difference < 0 ? `${Math.abs(row.difference)}名不足` : row.difference >= 2 ? `${row.difference}名過剰` : "充足"}`}
                        className={`coverage-cell coverage-cell--${row.status}`}
                        key={date}
                        onClick={() => row.status === "shortage" ? setSection("schedule") : undefined}
                        type="button"
                      >
                        <span><strong>{row.assigned}</strong> / {row.required}名</span>
                        <small>{row.difference < 0 ? `${row.difference}名` : row.status === "excess" ? `+${row.difference}名` : "充足"}</small>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
        <footer className="schedule-board-footer"><Icon name="info" /><p>セルを選択して時間を編集できます。希望休・希望時間・勤務上限などはConflict候補として表示し、最終判断は管理者が行います。</p></footer>
      </section>

      {selectedAssignment && (
        <AssignmentEditor
          assignmentId={selectedAssignment.id}
          onClose={() => setSelectedAssignmentId(null)}
          onDelete={() => { deleteAssignment(selectedAssignment.id); setSelectedAssignmentId(null); }}
          onSave={(start, end, breakMinutes) => {
            updateAssignment(selectedAssignment.id, { start, end, breakMinutes });
            setSelectedAssignmentId(null);
          }}
        />
      )}
    </div>
  );
}

function AssignmentEditor({
  assignmentId,
  onClose,
  onDelete,
  onSave,
}: {
  assignmentId: string;
  onClose: () => void;
  onDelete: () => void;
  onSave: (start: string, end: string, breakMinutes: number) => void;
}) {
  const { state, conflicts } = useShiftDemo();
  const assignment = state.assignments.find((item) => item.id === assignmentId)!;
  const employee = employees.find((item) => item.id === assignment.employeeId)!;
  const preference = state.requests.find((request) => request.employeeId === employee.id)?.days[assignment.date];
  const assignmentConflicts = conflicts.filter((conflict) => conflict.assignmentId === assignment.id);
  const [start, setStart] = useState(assignment.start);
  const [end, setEnd] = useState(assignment.end);
  const [breakMinutes, setBreakMinutes] = useState(assignment.breakMinutes);
  const [error, setError] = useState("");

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleSave = () => {
    if (timeToMinutes(start) >= timeToMinutes(end)) {
      setError("終了時刻は開始時刻より後にしてください。 ");
      return;
    }
    onSave(start, end, breakMinutes);
  };

  return (
    <div
      aria-labelledby="assignment-editor-title"
      aria-modal="true"
      className="assignment-editor-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
    >
      <aside className="assignment-editor-panel">
        <header>
          <div><span>SHIFT EDITOR</span><h2 id="assignment-editor-title">シフトを編集</h2></div>
          <button aria-label="編集を閉じる" className="demo-icon-button" onClick={onClose} type="button"><Icon name="close" /></button>
        </header>

        <div className="assignment-editor-person">
          <Avatar employeeId={employee.id} size="large" />
          <div><strong>{employee.name}</strong><span>{employee.job} · {employee.employment}</span></div>
          <span>{shortDateLabel(assignment.date)}</span>
        </div>

        <div className={`assignment-request-summary ${preference?.status === "off" ? "is-off" : ""}`}>
          <span><Icon name={preference?.status === "off" ? "warning" : "request"} /></span>
          <div><small>提出された希望</small><strong>{preference?.status === "off" ? "希望休" : preference?.status === "available" ? `${preference.start}〜${preference.end}` : "未設定"}</strong>{preference?.note && <p>{preference.note}</p>}</div>
        </div>

        <div className="assignment-time-form">
          <label><span>開始時刻</span><input onChange={(event) => { setStart(event.target.value); setError(""); }} type="time" value={start} /></label>
          <span aria-hidden="true">〜</span>
          <label><span>終了時刻</span><input onChange={(event) => { setEnd(event.target.value); setError(""); }} type="time" value={end} /></label>
        </div>
        <label className="assignment-break-field"><span>休憩時間</span><select onChange={(event) => setBreakMinutes(Number(event.target.value))} value={breakMinutes}><option value={0}>なし</option><option value={30}>30分</option><option value={45}>45分</option><option value={60}>60分</option></select></label>
        {error && <p className="demo-field-error" role="alert"><Icon name="warning" />{error}</p>}

        <div className="assignment-checks">
          <h3>リアルタイムチェック</h3>
          {assignmentConflicts.length ? assignmentConflicts.map((conflict) => (
            <div className={`assignment-check assignment-check--${conflict.severity}`} key={conflict.id}>
              <Icon name="warning" /><p><strong>{conflict.title}</strong><span>{conflict.detail}</span></p>
            </div>
          )) : (
            <div className="assignment-check assignment-check--clear"><Icon name="check" /><p><strong>現在の割当にはConflictがありません</strong><span>保存後に全体を再計算します。</span></p></div>
          )}
        </div>

        <footer>
          <button className="demo-button demo-button--danger-ghost" onClick={onDelete} type="button"><Icon name="trash" />削除</button>
          <div><button className="demo-button demo-button--ghost" onClick={onClose} type="button">キャンセル</button><button className="demo-button demo-button--primary" onClick={handleSave} type="button"><Icon name="check" />変更を保存</button></div>
        </footer>
      </aside>
    </div>
  );
}
