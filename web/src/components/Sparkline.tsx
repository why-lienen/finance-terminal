// 零依赖迷你走势线：自适应宽度、涨红跌绿、无坐标轴，用于卡片实时预览
interface Props {
  values: number[];
  height?: number;
}

export default function Sparkline({ values, height = 40 }: Props) {
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
  const pts = values.map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ');
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H}>
      <polyline
        points={pts}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
