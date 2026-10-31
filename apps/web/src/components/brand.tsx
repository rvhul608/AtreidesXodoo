import { useEffect, useState } from 'react';

export function LoopMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="8.4"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeDasharray="43.4 9.4"
        transform="rotate(-58 12 12)"
      />
      <path
        d="M18.6 4.6 20.9 7.4 17.5 7.9Z"
        fill="currentColor"
        transform="rotate(8 19 6)"
      />
    </svg>
  );
}

interface RenewalRingProps {
  value: number;
  size?: number;
  stroke?: number;
  days?: number | null;
  tone?: 'loop' | 'warn' | 'bad';
  caption?: string;
  className?: string;
}

export function RenewalRing({
  value,
  size = 44,
  stroke = 4,
  days,
  tone = 'loop',
  caption,
  className = '',
}: RenewalRingProps) {
  const [progress, setProgress] = useState(0);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const safeValue = Math.max(0, Math.min(1, value));

  useEffect(() => {
    const timer = window.setTimeout(() => setProgress(safeValue), 80);
    return () => window.clearTimeout(timer);
  }, [safeValue]);

  const big = size >= 84;
  const toneClass = tone === 'warn' ? 'warn' : tone === 'bad' ? 'bad' : '';

  return (
    <div
      className={`ring ${big ? 'lg' : ''} ${size >= 120 ? 'xl' : ''} ${toneClass} ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={days !== null && days !== undefined ? `${days} days remaining in the billing period` : 'Billing period progress'}
    >
      <svg width={size} height={size}>
        <circle
          className="ring-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
        />
        <circle
          className="ring-value"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
        />
      </svg>
      <div className="ring-label">
        <span>
          {days ?? Math.round(safeValue * 100)}
          {caption ? <small>{caption}</small> : null}
        </span>
      </div>
    </div>
  );
}
