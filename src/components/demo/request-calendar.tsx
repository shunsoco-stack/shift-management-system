"use client";

import { useMemo, useState } from "react";
import {
  DEMO_PERIOD,
  WEEKDAY_LABELS,
  datesInSeptember,
  parseLocalDate,
  shortDateLabel,
  type PreferenceStatus,
} from "@/src/lib/demo-data";
import { useShiftDemo } from "@/src/lib/shift-context";
import { Icon } from "./icons";
import { Card, InlineNotice, PageHeading } from "./demo-ui";

const statusLabels: Record<PreferenceStatus, string> = {
  available: "出勤可能",
  off: "希望休",
  unset: "未設定",
};

export function RequestCalendar() {
  const {
    state,
    updatePreference,
    submitRequest,
  } = useShiftDemo();
  const [selectedDate, setSelectedDate] = useState("2026-09-08");
  const request = state.requests.find(
    (item) => item.employeeId === state.activeEmployeeId,
  );
  const preference = request?.days[selectedDate];
  const dates = datesInSeptember();
  const firstWeekday = parseLocalDate(dates[0]).getDay();
  const stats = useMemo(() => {
    const days = Object.values(request?.days ?? {});
    return {
      available: days.filter((day) => day.status === "available").length,
      off: days.filter((day) => day.status === "off").length,
      unset: days.filter((day) => day.status === "unset").length,
    };
  }, [request]);

  if (!request || !preference) return null;

  const setStatus = (status: PreferenceStatus) => {
    updatePreference(state.activeEmployeeId, selectedDate, {
      status,
      start: status === "available" ? preference.start || "12:00" : "",
      end: status === "available" ? preference.end || "18:00" : "",
    });
  };

  return (
    <div className="demo-page request-page">
      <PageHeading
        eyebrow="EMPLOYEE · SHIFT REQUEST"
        title="希望シフトを提出"
        description="出勤できる日と時間、希望休を月ごとに登録します。日付を選ぶと詳細を編集できます。"
        actions={
          <button
            className="demo-button demo-button--primary"
            onClick={() => submitRequest(state.activeEmployeeId)}
            type="button"
          >
            <Icon name="publish" />
            {request.submittedAt ? "変更を提出" : "希望を提出"}
          </button>
        }
      />

      <InlineNotice
        action={<span className="demo-deadline-chip">期限超過</span>}
        icon="warning"
        title={`${DEMO_PERIOD.shortLabel}シフト希望の提出期限を過ぎています`}
        tone="warning"
      >
        提出期限は{DEMO_PERIOD.requestDeadlineLabel}でした。提出内容は管理者に「期限後」として共有されます。
      </InlineNotice>

      <div className="request-layout">
        <Card className="request-calendar-card">
          <div className="request-calendar__toolbar">
            <div>
              <span>希望シフト</span>
              <h2>2026年9月</h2>
            </div>
            <div className="request-calendar__legend" aria-label="入力状況">
              <span><i className="legend-dot legend-dot--available" />出勤可能 {stats.available}</span>
              <span><i className="legend-dot legend-dot--off" />希望休 {stats.off}</span>
              <span><i className="legend-dot legend-dot--unset" />未設定 {stats.unset}</span>
            </div>
          </div>

          <div className="request-month-grid" role="grid" aria-label="2026年9月 希望シフト">
            {WEEKDAY_LABELS.map((weekday, index) => (
              <div
                className={`request-weekday ${index === 0 ? "is-sunday" : ""} ${index === 6 ? "is-saturday" : ""}`}
                key={weekday}
                role="columnheader"
              >
                {weekday}
              </div>
            ))}
            {Array.from({ length: firstWeekday }, (_, index) => (
              <div aria-hidden="true" className="request-day request-day--empty" key={`blank-${index}`} />
            ))}
            {dates.map((date) => {
              const day = request.days[date];
              const dayNumber = parseLocalDate(date).getDate();
              const weekend = parseLocalDate(date).getDay();
              return (
                <button
                  aria-label={`${shortDateLabel(date)} ${statusLabels[day.status]}`}
                  aria-selected={selectedDate === date}
                  className={`request-day request-day--${day.status} ${selectedDate === date ? "is-selected" : ""} ${weekend === 0 ? "is-sunday" : ""} ${weekend === 6 ? "is-saturday" : ""}`}
                  key={date}
                  onClick={() => setSelectedDate(date)}
                  role="gridcell"
                  type="button"
                >
                  <span className="request-day__number">{dayNumber}</span>
                  <span className="request-day__state">
                    {day.status === "available" && <Icon name="check" />}
                    {day.status === "off" && <span aria-hidden="true">休</span>}
                    {day.status === "unset" && <span aria-hidden="true">—</span>}
                  </span>
                  {day.status === "available" && (
                    <small>{day.start}<br />{day.end}</small>
                  )}
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="request-editor-card">
          <div className="request-editor__heading">
            <span className="request-editor__date-icon"><Icon name="calendar" /></span>
            <div><span>選択中</span><h2>{shortDateLabel(selectedDate)}</h2></div>
          </div>

          <fieldset className="request-status-picker">
            <legend>勤務希望</legend>
            <div>
              <button
                aria-pressed={preference.status === "available"}
                className={preference.status === "available" ? "is-active is-available" : ""}
                onClick={() => setStatus("available")}
                type="button"
              ><Icon name="check" /><span>出勤可能<small>勤務できる日</small></span></button>
              <button
                aria-pressed={preference.status === "off"}
                className={preference.status === "off" ? "is-active is-off" : ""}
                onClick={() => setStatus("off")}
                type="button"
              ><Icon name="close" /><span>希望休<small>勤務できない日</small></span></button>
            </div>
          </fieldset>

          <div className={`request-time-fields ${preference.status !== "available" ? "is-disabled" : ""}`}>
            <label>
              <span>開始希望時間</span>
              <input
                disabled={preference.status !== "available"}
                onChange={(event) => updatePreference(state.activeEmployeeId, selectedDate, { start: event.target.value })}
                type="time"
                value={preference.start}
              />
            </label>
            <span aria-hidden="true">〜</span>
            <label>
              <span>終了希望時間</span>
              <input
                disabled={preference.status !== "available"}
                onChange={(event) => updatePreference(state.activeEmployeeId, selectedDate, { end: event.target.value })}
                type="time"
                value={preference.end}
              />
            </label>
          </div>

          <label className="request-note-field">
            <span>備考 <small>任意</small></span>
            <textarea
              maxLength={120}
              onChange={(event) => updatePreference(state.activeEmployeeId, selectedDate, { note: event.target.value })}
              placeholder="例：授業のため18時以降を希望"
              rows={4}
              value={preference.note}
            />
            <small>{preference.note.length}/120</small>
          </label>

          <div className="request-editor__hint">
            <Icon name="info" />
            <p>入力は自動保存されます。「希望を提出」で管理者へ共有されます。</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
