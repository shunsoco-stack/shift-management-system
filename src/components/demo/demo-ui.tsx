import type { ReactNode } from "react";
import { employees, type ShiftWorkflowStatus } from "@/src/lib/demo-data";
import { workflowLabels } from "@/src/lib/demo-state";
import { Icon, type IconName } from "./icons";

export function Avatar({
  employeeId,
  size = "medium",
}: {
  employeeId: string;
  size?: "small" | "medium" | "large";
}) {
  const employee = employees.find((item) => item.id === employeeId);
  return (
    <span
      aria-hidden="true"
      className={`demo-avatar demo-avatar--${employee?.color ?? "slate"} demo-avatar--${size}`}
    >
      {employee?.initials ?? "?"}
    </span>
  );
}

export function StatusPill({ status }: { status: ShiftWorkflowStatus }) {
  return (
    <span className={`demo-status-pill demo-status-pill--${status}`}>
      <span aria-hidden="true" />
      {workflowLabels[status]}
    </span>
  );
}

export function MetricCard({
  label,
  value,
  supporting,
  icon,
  tone = "neutral",
  onClick,
}: {
  label: string;
  value: ReactNode;
  supporting: ReactNode;
  icon: IconName;
  tone?: "neutral" | "brand" | "danger" | "warning" | "blue";
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="metric-card__icon"><Icon name={icon} /></span>
      <span className="metric-card__label">{label}</span>
      <strong className="metric-card__value">{value}</strong>
      <span className="metric-card__supporting">{supporting}</span>
      {onClick && <Icon className="metric-card__arrow" name="chevron-right" />}
    </>
  );
  return onClick ? (
    <button className={`metric-card metric-card--${tone}`} onClick={onClick} type="button">
      {content}
    </button>
  ) : (
    <div className={`metric-card metric-card--${tone}`}>{content}</div>
  );
}

export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="demo-page-heading">
      <div>
        {eyebrow && <span className="demo-page-heading__eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="demo-page-heading__actions">{actions}</div>}
    </header>
  );
}

export function EmptyState({
  icon = "calendar",
  title,
  children,
}: {
  icon?: IconName;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="demo-empty-state">
      <span><Icon name={icon} /></span>
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}

export function ProgressRing({
  value,
  max,
  label,
}: {
  value: number;
  max: number;
  label: string;
}) {
  const percentage = Math.min(100, Math.round((value / Math.max(1, max)) * 100));
  return (
    <div
      aria-label={`${label} ${value}/${max}`}
      className="demo-progress-ring"
      role="img"
      style={{ "--progress": `${percentage * 3.6}deg` } as React.CSSProperties}
    >
      <span><b>{value}</b><small>/{max}</small></span>
    </div>
  );
}

export function InlineNotice({
  tone,
  icon,
  title,
  children,
  action,
}: {
  tone: "warning" | "danger" | "info" | "success";
  icon: IconName;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={`demo-inline-notice demo-inline-notice--${tone}`}>
      <span className="demo-inline-notice__icon"><Icon name={icon} /></span>
      <div><strong>{title}</strong><p>{children}</p></div>
      {action && <div className="demo-inline-notice__action">{action}</div>}
    </div>
  );
}

export function Card({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`demo-card ${className}`}>
      {(title || action) && (
        <header className="demo-card__header">
          <div>{title && <h2>{title}</h2>}{description && <p>{description}</p>}</div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
