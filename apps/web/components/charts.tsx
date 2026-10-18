import { DOMAINS } from '@cognicare/shared';

/** HTML sparklinePointsFrom */
export function sparklinePoints(arr: number[], w: number, h: number): string {
  const max = Math.max(...arr), min = Math.min(...arr), range = max - min || 1;
  return arr.map((v, i) => `${((i / (arr.length - 1)) * w).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`).join(' ');
}

/** HTML sparkline: points computed on a 100 x height viewBox; `width` is the rendered CSS width (56 in lists, "100%" in report boxes). */
export function Sparkline({ points, width = 56, height = 24, color = 'var(--c-primary)' }: { points: number[]; width?: number | string; height?: number; color?: string }) {
  if (points.length < 2) return null;
  return (
    <svg width={width} height={height} viewBox={`0 0 100 ${height}`} preserveAspectRatio={width === '100%' ? 'none' : undefined} aria-hidden="true">
      <polyline points={sparklinePoints(points, 100, height)} fill="none" stroke={color} strokeWidth="2" />
    </svg>
  );
}

function polar(index: number, total: number, radius: number, cx: number, cy: number) {
  const angle = -Math.PI / 2 + index * ((2 * Math.PI) / total);
  return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
}
function polygonPoints(scores: number[], cx: number, cy: number, maxR: number): string {
  return scores.map((sc, i) => {
    const p = polar(i, scores.length, (sc / 100) * maxR, cx, cy);
    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  }).join(' ');
}

const ANCHORS = ['middle', 'start', 'start', 'middle', 'end', 'end'] as const;

/** buildRadar + radarSvg. baseline/current are 6 values in DOMAINS order. */
export function Radar({ baseline, current }: { baseline: number[]; current: number[] }) {
  const cx = 110, cy = 110, maxR = 78;
  const rings = [0.25, 0.5, 0.75, 1].map((f) => polygonPoints(Array(6).fill(100 * f), cx, cy, maxR));
  const axes = DOMAINS.map((d, i) => ({
    name: d.th, out: polar(i, 6, maxR + 26, cx, cy), line: polar(i, 6, maxR, cx, cy), anchor: ANCHORS[i],
  }));
  return (
    <svg width="320" height="244" viewBox="-50 -12 320 244" style={{ maxWidth: '100%', height: 'auto' }} role="img" aria-label="กราฟเรดาร์ผลการฝึกสมองรายด้าน">
      {rings.map((r, i) => <polygon key={i} points={r} fill="none" stroke="var(--c-border)" strokeWidth="1" />)}
      {axes.map((a) => <line key={a.name} x1={cx} y1={cy} x2={a.line.x.toFixed(1)} y2={a.line.y.toFixed(1)} stroke="var(--c-border)" strokeWidth="1" />)}
      {axes.map((a) => <text key={a.name} x={a.out.x.toFixed(1)} y={a.out.y.toFixed(1)} fontSize="12" fill="var(--c-muted)" textAnchor={a.anchor}>{a.name}</text>)}
      <polygon points={polygonPoints(baseline, cx, cy, maxR)} fill="none" stroke="var(--c-muted)" strokeWidth="2" strokeDasharray="4,3" />
      <polygon points={polygonPoints(current, cx, cy, maxR)} fill="rgba(26,86,219,0.15)" stroke="var(--c-primary)" strokeWidth="2.5" />
    </svg>
  );
}
