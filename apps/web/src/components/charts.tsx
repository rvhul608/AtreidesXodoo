import { useState } from 'react';
import { compactMoney, money } from '../lib/format';

interface BarDatum {
  label: string;
  value: number;
}

export function BarChart({
  data,
  height = 220,
  highlightLast = true,
}: {
  data: BarDatum[];
  height?: number;
  highlightLast?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 640;
  const top = 14;
  const bottom = 188;
  const left = 12;
  const right = 628;
  const plotHeight = bottom - top;
  const plotWidth = right - left;
  const rawMax = Math.max(...data.map((item) => item.value), 1);
  const step = Math.pow(10, Math.floor(Math.log10(rawMax)));
  const max = Math.ceil(rawMax / step) * step;
  const slot = plotWidth / data.length;
  const barWidth = Math.min(34, slot * 0.44);

  return (
    <div className="chart-wrap">
      <svg
        className="bar-chart"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Revenue by month"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = bottom - plotHeight * ratio;
          return <line key={ratio} className="gridline" x1={left} x2={right} y1={y} y2={y} />;
        })}
        {data.map((item, index) => {
          const barHeight = Math.max(2, (item.value / max) * plotHeight);
          const x = left + slot * index + (slot - barWidth) / 2;
          const y = bottom - barHeight;
          const isMuted = highlightLast && index !== data.length - 1;
          return (
            <g key={item.label}>
              <rect
                className={`bar ${isMuted ? 'muted' : ''}`}
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={3}
                onMouseEnter={() => setHover(index)}
                onMouseLeave={() => setHover(null)}
              />
              <text className="axis-label" x={x + barWidth / 2} y={bottom + 18} textAnchor="middle">
                {item.label}
              </text>
              {hover === index ? (
                <text className="value-label" x={x + barWidth / 2} y={y - 6} textAnchor="middle">
                  {compactMoney(item.value)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {hover !== null ? (
        <div
          className="chart-tip"
          style={{
            left: `${((left + slot * hover + slot / 2) / width) * 100}%`,
            top: `${((bottom - (data[hover].value / max) * plotHeight) / height) * 100}%`,
          }}
        >
          {data[hover].label} · {money(data[hover].value, { decimals: 0 })}
        </div>
      ) : null}
    </div>
  );
}

export function Sparkline({
  values,
  width = 96,
  height = 42,
  tone = 'loop',
}: {
  values: number[];
  width?: number;
  height?: number;
  tone?: 'loop' | 'good' | 'bad';
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const points = values.map((value, index) => {
    const x = index * step;
    const y = height - 4 - ((value - min) / range) * (height - 10);
    return `${x},${y}`;
  });
  const color = tone === 'good' ? 'var(--good-fg)' : tone === 'bad' ? 'var(--bad-fg)' : 'var(--loop)';
  const last = values.length - 1;
  const lastY = height - 4 - ((values[last] - min) / range) * (height - 10);

  return (
    <svg className="spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
      <circle cx={width} cy={lastY} r="2.6" fill={color} />
    </svg>
  );
}
