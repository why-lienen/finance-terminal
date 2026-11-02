import { useEffect, useId, useRef, useState } from 'react';
import type { ChartPoint } from '../types';

interface Props {
  series: ChartPoint[];
  height?: number;
  formatVal?: (n: number) => string;
  formatX?: (s: string) => string;
}

// 零依赖 SVG 折线/面积图：响应式宽度、涨红跌绿、带最大/最小与首尾标签
export default function LineChart({ series, height = 200, formatVal, formatX }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(720);
  const gid = useId().replace(/[:]/g, '');

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width;
      if (cw) setW(Math.max(280, Math.floor(cw)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!series || series.length < 2) {
    return <div className="muted" style={{ padding: '24px 0', textAlign: 'center' }}>暂无足够数据绘制走势</div>;
  }

  const W = w;
  const H = height;
  const padL = 10, padR = 10, padT = 14, padB = 20;
  const ys = series.map((s) => s.y);
  let min = Math.min(...ys);
  let max = Math.max(...ys);
  if (min === max) { min -= 1; max += 1; }
  const span = max - min || 1;
  const innerH = H - padT - padB;
  const innerW = W - padL - padR;
  const n = series.length;
  const xOf = (i: number) => padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yOf = (v: number) => padT + innerH - ((v - min) / span) * innerH;

  const linePts = series.map((s, i) => `${xOf(i).toFixed(1)},${yOf(s.y).toFixed(1)}`).join(' ');
  const areaPts = `${padL},${padT + innerH} ${linePts} ${padL + innerW},${padT + innerH}`;
  const up = series[n - 1].y >= series[0].y;
  const stroke = up ? 'var(--up)' : 'var(--down)';
  const last = series[n - 1];
  const fv = (v: number) => (formatVal ? formatVal(v) : v.toFixed(2));
  const fx = (s: string) => (formatX ? formatX(s) : s);

  return (
    <div ref={ref} className="chart-wrap">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="走势图">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.30" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={areaPts} fill={`url(#${gid})`} />
        <polyline
          points={linePts}
          fill="none"
          stroke={stroke}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx={xOf(n - 1)} cy={yOf(last.y)} r={3} fill={stroke} stroke="var(--bg-card)" strokeWidth={1.5} />
        <text x={padL} y={padT + 6} fill="var(--text-faint)" fontSize="11">{fv(max)}</text>
        <text x={padL} y={padT + innerH} fill="var(--text-faint)" fontSize="11">{fv(min)}</text>
        <text x={padL} y={H - 5} fill="var(--text-faint)" fontSize="10">{fx(series[0].x)}</text>
        <text x={padL + innerW} y={H - 5} textAnchor="end" fill="var(--text-faint)" fontSize="10">{fx(last.x)}</text>
      </svg>
    </div>
  );
}
