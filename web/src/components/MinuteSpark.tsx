// 浮窗专用「最近 10 分钟 1 分钟走势」图：
// 相比卡片上的 5 秒采样曲线，这里画的是真实 1 分钟 K 线收盘价，有波动、有时间轴、有末端最新价。
import { useId } from 'react';
import { fmt } from '../utils';

interface Point {
  t: string; // "2026-11-04 17:06"
  v: number;
}

function smoothPath(pts: [number, number][]): string {
  if (pts.length < 3) return 'M ' + pts.map((p) => p.join(',')).join(' L ');
  const t = 0.16;
  let d = `M ${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) * t;
    const c1y = p1[1] + (p2[1] - p0[1]) * t;
    const c2x = p2[0] - (p3[0] - p1[0]) * t;
    const c2y = p2[1] - (p3[1] - p1[1]) * t;
    d += ` C ${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

export default function MinuteSpark({ points, height = 140 }: { points: Point[]; height?: number }) {
  const gid = useId().replace(/[:]/g, '');
  if (!points || points.length < 2) {
    return <div className="minute-empty" style={{ height }}>1分钟走势加载中…</div>;
  }
  const W = 260;
  const H = height;
  const padT = 14;
  const padB = 20;
  const vals = points.map((p) => p.v);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  // 上下留 18% 余量，避免价格波动小时贴边或全平贴底
  const raw = max - min || Math.max(0.01, Math.abs(max) * 0.0005);
  const lo = min - raw * 0.18;
  const hi = max + raw * 0.18;
  const span = hi - lo || 1;
  const n = vals.length;
  const xOf = (i: number) => 8 + (i / (n - 1)) * (W - 16);
  const yOf = (v: number) => padT + ((hi - v) / span) * (H - padT - padB);
  const up = vals[n - 1] >= vals[0];
  const stroke = up ? 'var(--up)' : 'var(--down)';
  const pts = vals.map((v, i) => [xOf(i), yOf(v)] as [number, number]);
  const line = smoothPath(pts);
  const area = `${line} L ${W - 8},${H - padB} L 8,${H - padB} Z`;
  const t0 = points[0].t.slice(11, 16);
  const t1 = points[n - 1].t.slice(11, 16);

  return (
    <svg className="minute-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.24" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* 首值基准线，方便一眼看出这 10 分钟是涨还是跌 */}
      <line x1={8} y1={yOf(vals[0])} x2={W - 8} y2={yOf(vals[0])} stroke="var(--border-strong)" strokeWidth={1} strokeDasharray="3 3" />
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth={2.2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={xOf(n - 1)} cy={yOf(vals[n - 1])} r={3.2} fill={stroke} />
      <text x={W - 8} y={Math.max(12, yOf(vals[n - 1]) - 9)} fill={stroke} fontSize="11" fontWeight="700" textAnchor="end">{fmt(vals[n - 1])}</text>
      <text x={8} y={H - 5} fill="var(--text-faint)" fontSize="10">{t0}</text>
      <text x={W - 8} y={H - 5} fill="var(--text-faint)" fontSize="10" textAnchor="end">{t1}</text>
    </svg>
  );
}
