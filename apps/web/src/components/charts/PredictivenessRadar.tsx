import { CATEGORIES } from '../../data/constants.js';
import type { RatingCategory } from '../../types/index.js';

interface PredictivenessRadarProps {
  predictiveness: Record<RatingCategory, number>;
  masterpiecesCount: number;
  otherCount: number;
}

// "What you value" predictiveness radar. For each rubric category, plots
// the lift (avg score among Masterpieces minus avg among other Top 50).
// Max observed lift reaches the outer ring; 0 sits at centre.
export function PredictivenessRadar({
  predictiveness,
  masterpiecesCount,
  otherCount,
}: PredictivenessRadarProps) {
  if (masterpiecesCount === 0 || otherCount === 0) {
    return (
      <div className="text-sm text-zinc-500 text-center py-6">
        Need both Masterpieces and non-Masterpiece Top 50 games to compare.
      </div>
    );
  }
  const size = 320;
  const padX = 64;
  const padY = 18;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.32;
  const labelR = radius + size * 0.085;
  const N = CATEGORIES.length;
  const values = CATEGORIES.map((c) => predictiveness[c.key as RatingCategory]);
  const maxLift = Math.max(0.01, ...values);

  const point = (i: number, norm: number): [number, number] => {
    const angle = (Math.PI * 2 * i) / N - Math.PI / 2;
    const r = (norm / 10) * radius;
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
  };

  const pts = CATEGORIES.map((c, i) => {
    const lift = predictiveness[c.key as RatingCategory];
    const norm = Math.max(0, lift / maxLift) * 10;
    return point(i, norm);
  });
  const rings = [2, 4, 6, 8, 10];
  const color = '#e2b878';

  return (
    <svg
      viewBox={`${String(-padX)} ${String(-padY)} ${String(size + padX * 2)} ${String(size + padY * 2)}`}
      className="w-full h-auto"
    >
      {rings.map((v) => {
        const ringPts = Array.from({ length: N }, (_, i) => point(i, v));
        return (
          <polygon
            key={v}
            points={ringPts.map((p) => p.join(',')).join(' ')}
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
        points={pts.map((p) => p.join(',')).join(' ')}
        fill={color}
        fillOpacity="0.18"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.5" fill={color} />
      ))}
      {CATEGORIES.map((c, i) => {
        const angle = (Math.PI * 2 * i) / N - Math.PI / 2;
        const lx = cx + Math.cos(angle) * labelR;
        const ly = cy + Math.sin(angle) * labelR;
        const anchor =
          Math.abs(Math.cos(angle)) < 0.3 ? 'middle' : Math.cos(angle) > 0 ? 'start' : 'end';
        const lift = predictiveness[c.key as RatingCategory];
        const liftLabel = lift > 0 ? `+${lift.toFixed(1)}` : lift.toFixed(1);
        return (
          <g key={c.key}>
            <text
              x={lx}
              y={ly - 5}
              textAnchor={anchor}
              fontSize="10"
              fontFamily="Inter"
              fontWeight="500"
              letterSpacing="0.5"
              fill="rgba(255,255,255,0.5)"
              style={{ textTransform: 'uppercase' }}
            >
              {c.label}
            </text>
            <text
              x={lx}
              y={ly + 7}
              textAnchor={anchor}
              fontSize="11"
              fontFamily="Inter"
              fontWeight="600"
              fill={color}
            >
              {liftLabel}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
