import { clsx } from 'clsx';
import type { ReactNode } from 'react';

export type PillTone = 'neutral' | 'info' | 'good' | 'warn' | 'bad';

/** Status colours carry meaning only — always pair with a text label. */
export function Pill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  return (
    <span className={clsx('pill', `pill--${tone}`)}>
      <span className="pill__dot" aria-hidden="true" />
      {children}
    </span>
  );
}

const statusTone: Record<string, { tone: PillTone; label: string }> = {
  draft: { tone: 'neutral', label: 'Draft' },
  closed: { tone: 'neutral', label: 'Closed' },
  quotation: { tone: 'info', label: 'Quotation' },
  confirmed: { tone: 'info', label: 'Confirmed' },
  pending: { tone: 'info', label: 'Pending' },
  active: { tone: 'good', label: 'Active' },
  paid: { tone: 'good', label: 'Paid' },
  published: { tone: 'good', label: 'Active' },
  succeeded: { tone: 'good', label: 'Paid' },
  'due soon': { tone: 'warn', label: 'Due soon' },
  paused: { tone: 'warn', label: 'Paused' },
  expiring: { tone: 'warn', label: 'Expiring' },
  partially_paid: { tone: 'warn', label: 'Part paid' },
  overdue: { tone: 'bad', label: 'Overdue' },
  failed: { tone: 'bad', label: 'Failed' },
  cancelled: { tone: 'bad', label: 'Cancelled' },
};

export type StatusKey = keyof typeof statusTone;

export function statusPill(status: string): { tone: PillTone; label: string } {
  if (status === 'partially_paid') return statusTone['partially_paid'];
  return statusTone[status] ?? statusTone.draft;
}
