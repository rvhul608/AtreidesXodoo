import type { ReactNode } from 'react';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Breadcrumbs({ items }: { items: Array<{ label: string; to?: string }> }) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="row" style={{ gap: 6 }}>
          {index > 0 ? <ChevronRight aria-hidden="true" /> : null}
          {item.to ? <Link to={item.to}>{item.label}</Link> : <span>{item.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  crumbs,
  meta,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  crumbs?: Array<{ label: string; to?: string }>;
  meta?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div className="titles">
        {crumbs?.length ? <Breadcrumbs items={crumbs} /> : null}
        <h1>{title}</h1>
        {subtitle ? <p className="page-sub">{subtitle}</p> : null}
        {meta}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function Kpi({
  label,
  value,
  foot,
  icon: Icon,
  spark,
  tone,
}: {
  label: string;
  value: ReactNode;
  foot?: ReactNode;
  icon?: LucideIcon;
  spark?: ReactNode;
  tone?: 'good' | 'warn' | 'bad' | 'info';
}) {
  return (
    <div className="kpi">
      <div className="kpi-label">
        <span>{label}</span>
        {Icon ? (
          <span className={`stat-icon ${tone ?? ''}`} style={{ width: 28, height: 28 }}>
            <Icon aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <div className="kpi-value">{value}</div>
      {foot ? <div className="kpi-foot">{foot}</div> : null}
      {spark}
    </div>
  );
}

export function SectionHead({
  title,
  action,
  description,
}: {
  title: ReactNode;
  action?: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div className="section-head">
      <div>
        <h2>{title}</h2>
        {description ? <p className="caption">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
