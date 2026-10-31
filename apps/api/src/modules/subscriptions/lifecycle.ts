import { AppError } from '../../common/errors.js';
import type { LockedSubscriptionRow, PlanPeriod, StatusChange, SubscriptionStatus } from './repository.js';

// Pure lifecycle rules: no database access, so every rule is unit-testable and the
// single transition function in service.ts stays a thin lock -> decide -> write.

export type TransitionTarget = SubscriptionStatus | 'renew';

export interface TransitionDecision {
  from: SubscriptionStatus;
  to: SubscriptionStatus;
  action: string;
  change: StatusChange;
}

const allowedMoves: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  Draft: ['Quotation'],
  Quotation: ['Draft', 'Confirmed'],
  Confirmed: ['Active'],
  Active: ['Paused', 'Closed'],
  Paused: ['Active', 'Closed'],
  Closed: [],
};

const actionNames: Record<string, string> = {
  'Draft->Quotation': 'send_quotation',
  'Quotation->Draft': 'revise',
  'Quotation->Confirmed': 'confirm',
  'Confirmed->Active': 'activate',
  'Active->Paused': 'pause',
  'Paused->Active': 'resume',
  'Active->Closed': 'close',
  'Paused->Closed': 'close',
};

export function todayIso(now = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function parseIso(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatIso(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addMonthsClamped(value: Date, months: number): Date {
  const target = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(value.getUTCDate(), lastDay));
  return target;
}

// Jan 31 + 1 month = Feb 28/29: clamp to the month end instead of spilling into March.
export function addPeriod(date: string, period: PlanPeriod): string {
  const value = parseIso(date);
  if (period === 'daily') value.setUTCDate(value.getUTCDate() + 1);
  if (period === 'weekly') value.setUTCDate(value.getUTCDate() + 7);
  if (period === 'monthly') return formatIso(addMonthsClamped(value, 1));
  if (period === 'yearly') return formatIso(addMonthsClamped(value, 12));
  return formatIso(value);
}

export function addDays(date: string, days: number): string {
  const value = parseIso(date);
  value.setUTCDate(value.getUTCDate() + days);
  return formatIso(value);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseIso(to).getTime() - parseIso(from).getTime()) / 86_400_000);
}

function laterOf(first: string, second: string): string {
  return first > second ? first : second;
}

function disallowed(message: string): AppError {
  return new AppError(409, 'PLAN_DISALLOWS', message);
}

function decideRenewal(current: LockedSubscriptionRow, today: string): TransitionDecision {
  if (current.status !== 'Active') {
    throw new AppError(409, 'INVALID_TRANSITION', `A ${current.status} subscription cannot be renewed`);
  }
  if (!current.allow_renew) throw disallowed('This plan does not allow renewal');
  if (!current.expiry_date) {
    throw new AppError(409, 'INVALID_TRANSITION', 'An open-ended subscription has no term to renew');
  }
  // Extend from the current expiry so terms stay contiguous; if it already lapsed, start from today.
  const base = laterOf(current.expiry_date, today);
  return {
    from: 'Active',
    to: 'Active',
    action: 'renew',
    change: {
      status: 'Active',
      expiryDate: addPeriod(base, current.period),
      nextBillingDate: current.next_billing_date ?? today,
      pausedAt: null,
      closed: false,
    },
  };
}

function nextBillingAfterResume(current: LockedSubscriptionRow, today: string): string {
  if (!current.next_billing_date) return today;
  // The billing date was frozen while paused; shift it by the paused days so no period is skipped
  // or double billed, but never schedule billing in the past.
  const pausedDays = current.paused_at ? Math.max(daysBetween(current.paused_at, today), 0) : 0;
  return laterOf(addDays(current.next_billing_date, pausedDays), today);
}

export function decideTransition(
  current: LockedSubscriptionRow,
  target: TransitionTarget,
  today: string,
): TransitionDecision {
  if (target === 'renew') return decideRenewal(current, today);

  const from = current.status;
  if (!allowedMoves[from].includes(target)) {
    throw new AppError(409, 'INVALID_TRANSITION', `Cannot move a subscription from ${from} to ${target}`);
  }

  const change: StatusChange = {
    status: target,
    expiryDate: current.expiry_date,
    nextBillingDate: current.next_billing_date,
    pausedAt: current.paused_at,
    closed: false,
  };
  let action = actionNames[`${from}->${target}`];

  if (target === 'Active' && from === 'Confirmed') {
    change.nextBillingDate = laterOf(current.start_date, today);
  }
  if (target === 'Paused') {
    if (!current.allow_pause) throw disallowed('This plan does not allow pausing');
    change.pausedAt = today;
  }
  if (target === 'Active' && from === 'Paused') {
    change.nextBillingDate = nextBillingAfterResume(current, today);
    change.pausedAt = null;
  }
  if (target === 'Closed') {
    const early = current.expiry_date !== null && today < current.expiry_date;
    if (early && !current.allow_early_close) throw disallowed('This plan does not allow closing before expiry');
    if (early) action = 'early_close';
    change.nextBillingDate = null;
    change.pausedAt = null;
    change.closed = true;
  }
  return { from, to: target, action, change };
}
