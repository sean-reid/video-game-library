import { CATEGORIES } from '../../data/constants.js';
import type { Rating, RatingCategory } from '../../types/index.js';

interface SpiderChartProps {
  rating: Rating;
  color?: string;
  size?: number;
}

export function SpiderChart({ rating, color = '#d4a574', size = 280 }: SpiderChartProps) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.32;
  const N = CATEGORIES.length;
  const labelR = radius + size * 0.085;
  const padX = 56;
  const padY = 16;

  const point = (i: number, value: number): [number, number] => {
    const angle = (Math.PI * 2 * i) / N - Math.PI / 2;
    const r = (value / 10) * radius;
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
  };

  const dataPoints = CATEGORIES.map((c, i) => point(i, rating[c.key as RatingCategory]));
  const polyStr = dataPoints.map((p) => p.join(',')).join(' ');
  const rings = [2, 4, 6, 8, 10];

  return (
    <svg
      viewBox={`${String(-padX)} ${String(-padY)} ${String(size + padX * 2)} ${String(size + padY * 2)}`}
      className="w-full h-auto"
    >
      {rings.map((v) => {
        const pts = Array.from({ length: N }, (_, i) => point(i, v));
        return (
          <polygon
            key={v}
            points={pts.map((p) => p.join(',')).join(' ')}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="1"
          />
        );
      })}
      {CATEGORIES.map((c, i) => {
        const [x, y] = point(i, 10);
        return (
          <line
            key={c.key}
            x1={cx}
            y1={cy}
            x2={x}
            y2={y}
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="1"
          />
        );
      })}
      <polygon
        points={polyStr}
        fill={color}
        fillOpacity="0.18"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {dataPoints.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.5" fill={color} />
      ))}
      {CATEGORIES.map((c, i) => {
        const angle = (Math.PI * 2 * i) / N - Math.PI / 2;
        const lx = cx + Math.cos(angle) * labelR;
        const ly = cy + Math.sin(angle) * labelR;
        const anchor =
          Math.abs(Math.cos(angle)) < 0.3 ? 'middle' : Math.cos(angle) > 0 ? 'start' : 'end';
        return (
          <text
            key={c.key}
            x={lx}
            y={ly}
            textAnchor={anchor}
            dominantBaseline="middle"
            fontSize="10"
            fontFamily="Inter"
            fontWeight="500"
            letterSpacing="0.5"
            fill="rgba(255,255,255,0.5)"
            style={{ textTransform: 'uppercase' }}
          >
            {c.label}
          </text>
        );
      })}
    </svg>
  );
}
