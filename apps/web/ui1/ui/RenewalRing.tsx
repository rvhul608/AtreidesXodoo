import { clsx } from 'clsx';
import { useEffect, useState } from 'react';

interface Props {
  /** Days remaining in the current billing period. */
  daysLeft: number;
  /** Length of the period in days. */
  periodDays: number;
  size?: 'md' | 'lg';
}

/**
 * The renewal ring — the signature element. A thin circular progress ring
 * showing how far a subscription is through its billing period. Draws in
 * once on first view; respects prefers-reduced-motion via CSS transition.
 */
export function RenewalRing({ daysLeft, periodDays, size = 'md' }: Props) {
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const clamped = Math.max(0, daysLeft);
  const elapsed = Math.min(Math.max(periodDays - daysLeft, 0), periodDays);
  const r = size === 'lg' ? 25 : 19;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - elapsed / Math.max(periodDays, 1));

  const state =
    clamped === 0 ? 'ring--bad' : clamped < 5 ? 'ring--warn' : undefined;

  return (
    <div className={clsx('ring', size === 'lg' && 'ring--lg', state)} role="img"
      aria-label={`${clamped} of ${periodDays} days left in period`}>
      <svg className="ring__svg" viewBox={`0 0 ${r * 2 + 6} ${r * 2 + 6}`}>
        <circle
          className="ring__track"
          cx={r + 3}
          cy={r + 3}
          r={r}
          fill="none"
          strokeWidth={4}
        />
        <circle
          className="ring__progress"
          cx={r + 3}
          cy={r + 3}
          r={r}
          fill="none"
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={animate ? offset : c}
        />
      </svg>
      <span className="ring__centre">{clamped}</span>
    </div>
  );
}
