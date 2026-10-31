import { clsx } from 'clsx';

/**
 * The loop mark — an open circle (about 300 degrees of arc) with a small
 * arrowhead at the gap. Drawn as one SVG and reused for logo and launcher.
 */
export function LoopMark({ size = 24, className }: { size?: number; className?: string }) {
  const r = 9;
  const sweep = 300; // degrees of arc
  const c = 2 * Math.PI * r;
  const dash = (c * sweep) / 360;
  const gap = c - dash;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={clsx(className)}
      aria-hidden="true"
      style={{ flex: 'none' }}
    >
      {/* Arrowhead at the end of the arc, pointing into the gap */}
      <g transform="rotate(-25 12 12)">
        <polygon points="23.2,12 19.6,8.2 19.6,15.8" fill="currentColor" transform="rotate(300 12 12)" />
        <circle
          cx="12"
          cy="12"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${gap}`}
        />
      </g>
    </svg>
  );
}

export function Logo() {
  return (
    <span className="sidebar__brand">
      <span style={{ color: 'var(--loop)', display: 'flex' }}>
        <LoopMark size={26} />
      </span>
      <span className="sidebar__brand-name">Brightloop</span>
    </span>
  );
}
