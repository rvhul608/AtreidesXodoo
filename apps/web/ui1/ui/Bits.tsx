import { clsx } from 'clsx';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';
import { Pill, type PillTone } from './Pill';
import { Button } from './Button';

/* ---------- Formatting helpers (one place, consistently) ---------- */

export function money(v: string | number): string {
  const n = typeof v === 'string' ? Number(v) : v;
  if (!Number.isFinite(n)) return '—';
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function moneyShort(v: string | number): string {
  const n = typeof v === 'string' ? Number(v) : v;
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 100000) return `₹${(n / 100000).toLocaleString('en-IN', { maximumFractionDigits: 1 })}L`;
  if (Math.abs(n) >= 1000) return `₹${(n / 1000).toLocaleString('en-IN', { maximumFractionDigits: 0 })}k`;
  return money(n);
}

export function dateUs(iso: string): string {
  if (!iso) return '—';
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function daysUntil(iso: string, today = new Date('2026-10-31')): number {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

/* ---------- KPI card ---------- */

interface KpiProps {
  label: string;
  value: string;
  pill?: { tone: PillTone; label: string };
  hint?: ReactNode;
  loading?: boolean;
}

export function Kpi({ label, value, pill, hint, loading }: KpiProps) {
  if (loading) {
    return (
      <div className="kpi">
        <span className="kpi__label">{label}</span>
        <span className="skeleton" style={{ height: 32, width: '60%' }} />
        <span className="skeleton" style={{ height: 14, width: '40%' }} />
      </div>
    );
  }
  return (
    <div className="kpi">
      <span className="kpi__label">{label}</span>
      <span className="kpi__value">
        {value}
        {pill && <Pill tone={pill.tone}>{pill.label}</Pill>}
      </span>
      <span className="kpi__hint">{hint}</span>
    </div>
  );
}

/* ---------- Empty state ---------- */

export function Empty({
  icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  const Icon = icon;
  return (
    <div className="empty">
      <Icon size={36} strokeWidth={1.75} />
      <strong>{title}</strong>
      <span className="caption" style={{ maxWidth: 380 }}>{body}</span>
      {action}
    </div>
  );
}

/* ---------- Tabs ---------- */

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={t.id === active}
          className={clsx('tabs__tab', t.id === active && 'is-active')}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Revenue bar chart (one colour, border gridlines) ---------- */

export function BarChart({ series, height = 180 }: { series: { label: string; value: number }[]; height?: number }) {
  const max = Math.max(...series.map((s) => s.value), 1);
  const w = 560;
  const pad = { l: 8, r: 8, t: 12, b: 22 };
  const iw = w - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const bw = iw / series.length;

  return (
    <svg
      className="barchart"
      viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio="none"
      style={{ height }}
      role="img"
      aria-label="Revenue by month"
    >
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <line
          key={f}
          x1={pad.l}
          x2={w - pad.r}
          y1={pad.t + ih * f}
          y2={pad.t + ih * f}
          stroke="var(--border)"
          strokeWidth={1}
        />
      ))}
      {series.map((s, i) => {
        const h = Math.max(2, (s.value / max) * (ih - 4));
        return (
          <g key={s.label}>
            <rect
              className="barchart__bar"
              x={pad.l + i * bw + bw * 0.22}
              y={pad.t + ih - h}
              width={bw * 0.56}
              height={h}
              rx={3}
            >
              <title>{`${s.label}: ${money(s.value)}`}</title>
            </rect>
            <text
              x={pad.l + i * bw + bw / 2}
              y={height - 6}
              textAnchor="middle"
              fontSize={10}
              fill="var(--ink-muted)"
            >
              {s.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ---------- Status timeline (Draft → Active → Closed) ---------- */

export function Timeline({
  steps,
}: {
  steps: { label: string; date?: string; state: 'done' | 'current' | 'todo' }[];
}) {
  return (
    <div className="timeline">
      {steps.map((s) => (
        <div key={s.label} className={clsx('timeline__step', s.state === 'done' && 'is-done', s.state === 'current' && 'is-current')}>
          <span className="timeline__node" />
          <div>
            <div className="timeline__label">{s.label}</div>
            {s.date && <div className="caption num">{dateUs(s.date)}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Pagination (server-driven shape) ---------- */

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="row row--between" style={{ padding: '12px 16px' }}>
      <span className="caption num">
        {from}–{to} of {total}
      </span>
      <div className="row" style={{ gap: 6 }}>
        <Button size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <span className="caption num" style={{ padding: '0 4px' }}>
          Page {page} of {pages}
        </span>
        <Button size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

/* ---------- Progress bar ---------- */

export function ProgressBar({ value, tone }: { value: number; tone?: 'loop' | 'warn' | 'bad' }) {
  const bg = tone === 'warn' ? 'var(--warn-fg)' : tone === 'bad' ? 'var(--bad-fg)' : 'var(--loop)';
  return (
    <div className="progressbar">
      <div className="progressbar__fill" style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: bg }} />
    </div>
  );
}

/* ---------- Delay helper for the mock API ---------- */

export function useTicker(ms = 1000) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return tick;
}
