// 零依赖迷你走势线：自适应宽度、涨红跌绿、柔和面积填充 + 平滑曲线，用于卡片实时预览
import { useId } from 'react';

interface Props {
  values: number[];
  height?: number;
}

// Catmull-Rom 转三次贝塞尔，得到平滑曲线（避免原折线锯齿感）
function smoothPath(pts: [number, number][]): string {
  if (pts.length < 3) return 'M ' + pts.map((p) => p.join(',')).join(' L ');
  const t = 0.16; // 平滑张力
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

export default function Sparkline({ values, height = 46 }: Props) {
  if (!values || values.length < 2) return <div className="spark-empty" style={{ height }} />;
  const W = 240;
  const H = height;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const n = values.length;
  const xOf = (i: number) => (i / (n - 1)) * W;
  const yOf = (v: number) => H - ((v - min) / span) * H;
  const up = values[n - 1] >= values[0];
  const stroke = up ? 'var(--up)' : 'var(--down)';
  const gid = useId().replace(/[:]/g, '');
  const pts = values.map((v, i) => [xOf(i), yOf(v)] as [number, number]);
  const linePath = smoothPath(pts);
  const areaPath = `${linePath} L ${W},${H} L 0,${H} Z`;
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.20" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gid})`} />
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={xOf(n - 1)} cy={yOf(values[n - 1])} r={2.6} fill={stroke} />
    </svg>
  );
}
