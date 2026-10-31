export const DAY = 86_400_000;

export function startOfDay(date = new Date()): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(days: number, from = new Date()): string {
  return iso(new Date(startOfDay(from).getTime() + days * DAY));
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / DAY);
}

export function daysUntil(dateIso: string | null): number | null {
  if (!dateIso) return null;
  return daysBetween(iso(new Date()), dateIso);
}

export function money(value: number, opts: { decimals?: number } = {}): string {
  const decimals = opts.decimals ?? 2;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function compactMoney(value: number): string {
  if (Math.abs(value) >= 10_000_000) return `₹${(value / 10_000_000).toFixed(2)}Cr`;
  if (Math.abs(value) >= 100_000) return `₹${(value / 100_000).toFixed(2)}L`;
  if (Math.abs(value) >= 1_000) return `₹${(value / 1_000).toFixed(1)}k`;
  return `₹${Math.round(value)}`;
}

export function number(value: number): string {
  return new Intl.NumberFormat('en-IN').format(value);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtDate(dateIso: string | null | undefined, withYear = true): string {
  if (!dateIso) return '—';
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return '—';
  const base = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return withYear ? `${base} ${date.getFullYear()}` : base;
}

export function fmtDateTime(dateIso: string | null | undefined): string {
  if (!dateIso) return '—';
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return '—';
  const time = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  return `${fmtDate(dateIso)} · ${time}`;
}

export function relativeTime(dateIso: string): string {
  const diff = Date.now() - new Date(dateIso).getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return fmtDate(dateIso, false);
}

export function periodLabel(period: string): string {
  const labels: Record<string, string> = {
    daily: 'day',
    weekly: 'week',
    monthly: 'month',
    yearly: 'year',
    quarterly: 'quarter',
    annual: 'year',
  };
  return labels[period] ?? period;
}

export function periodSuffix(period: string): string {
  const labels: Record<string, string> = {
    daily: '/day',
    weekly: '/wk',
    monthly: '/mo',
    yearly: '/yr',
    quarterly: '/qtr',
    annual: '/yr',
  };
  return labels[period] ?? '';
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function titleCase(value: string): string {
  return value
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^./, (char) => char.toUpperCase())
    .trim();
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
