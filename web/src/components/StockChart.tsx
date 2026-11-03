import { useEffect, useRef, useState } from 'react';
import { getIntraday, getKline, getGoldIntraday, getGoldKline, type IntradayPoint } from '../api/market';
import { fmt } from '../utils';

type Period = '分时' | '五日' | '1分钟' | '日K' | '周K' | '月K';
const PERIODS: Period[] = ['分时', '五日', '1分钟', '日K', '周K', '月K'];

interface KP {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  vol: number;
}

// 颜色（浅色主题下清晰的金融配色）
const C = {
  up: '#e23c3c', // 涨 红
  down: '#15a35a', // 跌 绿
  avg: '#f5a623', // 均价 / MA5 橙
  ma5: '#f5a623',
  ma10: '#9b6dff', // MA10 紫
  ma20: '#2f6fed', // MA20 蓝
  grid: '#e3e8ef',
  text: '#94a1b1',
  textDim: '#5b6675',
};

function sma(values: number[], n: number): (number | null)[] {
  return values.map((_, i) => {
    if (i < n - 1) return null;
    let s = 0;
    for (let k = i - n + 1; k <= i; k++) s += values[k];
    return s / n;
  });
}

export default function StockChart({ secid, name, prevClose, gold }: { secid: string; name?: string; prevClose?: number; gold?: boolean }) {
  const [period, setPeriod] = useState<Period>('分时');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [intraday, setIntraday] = useState<IntradayPoint[]>([]);
  const [kline, setKline] = useState<KP[]>([]);
  const reqId = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const id = ++reqId.current;
    const isIntraday = period === '分时' || period === '五日';
    async function load() {
      if (cancelled || id !== reqId.current) return;
      setLoading(true);
      setErr(null);
      try {
        if (isIntraday) {
          const d = gold
            ? await getGoldIntraday(period === '五日' ? 5 : 1)
            : await getIntraday(secid, period === '五日' ? 5 : 1);
          if (!cancelled && id === reqId.current) setIntraday(d.list || []);
        } else {
          const map: Record<string, 'day' | 'week' | 'month' | '1min'> = {
            日K: 'day',
            周K: 'week',
            月K: 'month',
            '1分钟': '1min',
          };
          const d = gold ? await getGoldKline(map[period], 300) : await getKline(secid, map[period], 120);
          if (!cancelled && id === reqId.current) setKline(d.list || []);
        }
      } catch (e: any) {
        if (!cancelled && id === reqId.current) setErr(e?.message || '加载失败');
      } finally {
        if (!cancelled && id === reqId.current) setLoading(false);
      }
    }
    load();
    const ms = isIntraday ? 20000 : 60000;
    const timer = setInterval(load, ms);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [secid, period, gold]);

  const isIntraday = period === '分时' || period === '五日';

  return (
    <div>
      <div className="range-tabs" style={{ marginBottom: 8 }}>
        {PERIODS.map((p) => (
          <button key={p} className={p === period ? 'active' : ''} onClick={() => setPeriod(p)}>
            {p}
          </button>
        ))}
      </div>
      {loading && !intraday.length && !kline.length && (
        <div className="muted" style={{ padding: '40px 0', textAlign: 'center' }}>加载中…</div>
      )}
      {err && <div className="muted" style={{ padding: '40px 0', textAlign: 'center' }}>{err}</div>}
      {!loading && !err && isIntraday && <IntradayView data={intraday} prevClose={prevClose} five={period === '五日'} />}
      {!loading && !err && !isIntraday && <KlineView data={kline} />}
    </div>
  );
}

function IntradayView({ data, prevClose, five }: { data: IntradayPoint[]; prevClose?: number; five: boolean }) {
  if (!data.length) return <div className="muted" style={{ padding: 40, textAlign: 'center' }}>暂无分时数据（可能未开盘）</div>;
  const W = 680;
  const H = 300;
  const padT = 12;
  const padB = 22;
  const padL = 44;
  const padR = 52;
  const volH = 54;
  const gap = 10;
  const priceH = H - padT - padB - volH - gap;
  const innerW = W - padL - padR;
  const n = data.length;
  const prices = data.map((d) => d.price);
  const avgs = data.map((d) => d.avg).filter((v) => Number.isFinite(v));
  let lo = Math.min(...prices, ...avgs);
  let hi = Math.max(...prices, ...avgs);
  if (Number.isFinite(prevClose as number)) {
    lo = Math.min(lo, prevClose as number);
    hi = Math.max(hi, prevClose as number);
  }
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * 0.08;
  lo -= pad;
  hi += pad;
  const span = hi - lo || 1;
  const xOf = (i: number) => padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yOf = (v: number) => padT + priceH - ((v - lo) / span) * priceH;
  const hasPrev = Number.isFinite(prevClose as number);
  const ref = hasPrev ? (prevClose as number) : data[0].price;
  const up = data[n - 1].price >= ref;
  const stroke = up ? C.up : C.down;
  const pricePts = data.map((d, i) => `${xOf(i).toFixed(1)},${yOf(d.price).toFixed(1)}`).join(' ');
  const avgPts = data.map((d, i) => `${xOf(i).toFixed(1)},${yOf(d.avg).toFixed(1)}`).join(' ');
  const volMax = Math.max(...data.map((d) => d.vol), 1);
  const yVol = (v: number) => padT + priceH + gap + volH - (v / volMax) * volH;
  const pct = (v: number) => ((v - ref) / ref) * 100;
  const ticks = [0, 0.5, 1].map((k) => lo + span * k);
  const xticks = [0, Math.floor(n * 0.25), Math.floor(n * 0.5), Math.floor(n * 0.75), n - 1].filter(
    (v, i, a) => a.indexOf(v) === i,
  );
  return (
    <div className="chart-wrap chart-plot">
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="分时走势">
        <defs>
          <linearGradient id="intradayGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.18" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((tv, k) => (
          <g key={k}>
            <line x1={padL} y1={yOf(tv)} x2={padL + innerW} y2={yOf(tv)} stroke={C.grid} strokeWidth={1} strokeDasharray="3 4" />
            <text x={padL + innerW + 6} y={yOf(tv) + 4} fill={C.text} fontSize="10">{fmt(tv)}</text>
            <text x={4} y={yOf(tv) + 4} fill={C.text} fontSize="10">{pct(tv) >= 0 ? '+' : ''}{pct(tv).toFixed(2)}%</text>
          </g>
        ))}
        {hasPrev && (
          <line x1={padL} y1={yOf(ref)} x2={padL + innerW} y2={yOf(ref)} stroke={C.textDim} strokeWidth={1} strokeDasharray="5 3" />
        )}
        <polygon points={`${padL},${padT + priceH} ${pricePts} ${padL + innerW},${padT + priceH}`} fill="url(#intradayGrad)" />
        <polyline points={avgPts} fill="none" stroke={C.avg} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        <polyline
          points={pricePts}
          fill="none"
          stroke={stroke}
          strokeWidth={1.9}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx={xOf(n - 1)} cy={yOf(data[n - 1].price)} r={3} fill={stroke} />
        {data.map((d, i) => {
          const bw = Math.max(0.5, (innerW / n) * 0.62);
          const y = yVol(d.vol);
          const h = padT + priceH + gap + volH - y;
          const c = d.price >= ref ? C.up : C.down;
          return <rect key={i} x={xOf(i) - bw / 2} y={y} width={bw} height={Math.max(0, h)} fill={c} opacity={0.5} />;
        })}
        {xticks.map((i) => {
          const lab = five ? data[i].t.slice(5, 10) : data[i].t.slice(11, 16);
          return <text key={i} x={xOf(i)} y={H - 6} fill={C.text} fontSize="10" textAnchor="middle">{lab}</text>;
        })}
      </svg>
      <div className="chart-legend">
        <span><i style={{ background: C.avg }} />均价 {fmt(data[n - 1].avg)}</span>
        <span style={{ color: stroke, fontWeight: 700 }}>最新 {fmt(data[n - 1].price)}</span>
        {hasPrev && <span style={{ color: stroke }}>{up ? '▲' : '▼'} {pct(data[n - 1].price).toFixed(2)}%</span>}
      </div>
    </div>
  );
}

function KlineView({ data }: { data: KP[] }) {
  if (!data.length) return <div className="muted" style={{ padding: 40, textAlign: 'center' }}>暂无K线数据</div>;
  const W = 680;
  const H = 300;
  const padT = 12;
  const padB = 22;
  const padL = 8;
  const padR = 52;
  const volH = 54;
  const gap = 10;
  const priceH = H - padT - padB - volH - gap;
  const innerW = W - padL - padR;
  const n = data.length;
  const lo = Math.min(...data.map((d) => d.low));
  const hi = Math.max(...data.map((d) => d.high));
  const pad = (hi - lo) * 0.06;
  const L = lo - pad;
  const U = hi + pad;
  const span = U - L || 1;
  const xOf = (i: number) => padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yOf = (v: number) => padT + priceH - ((v - L) / span) * priceH;
  const closes = data.map((d) => d.close);
  const ma5 = sma(closes, 5);
  const ma10 = sma(closes, 10);
  const ma20 = sma(closes, 20);
  const linePts = (arr: (number | null)[]) =>
    arr.map((v, i) => (v == null ? null : `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`)).filter(Boolean).join(' ');
  const volMax = Math.max(...data.map((d) => d.vol), 1);
  const yVol = (v: number) => padT + priceH + gap + volH - (v / volMax) * volH;
  const up = closes[n - 1] >= closes[0];
  const stroke = up ? C.up : C.down;
  const ticks = [0, 0.5, 1].map((k) => L + span * k);
  const xticks = [0, Math.floor(n * 0.25), Math.floor(n * 0.5), Math.floor(n * 0.75), n - 1].filter(
    (v, i, a) => a.indexOf(v) === i,
  );
  const maLast = (arr: (number | null)[]) => {
    for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i] as number;
    return null;
  };
  return (
    <div className="chart-wrap chart-plot">
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="K线走势">
        {ticks.map((tv, k) => (
          <g key={k}>
            <line x1={padL} y1={yOf(tv)} x2={padL + innerW} y2={yOf(tv)} stroke={C.grid} strokeWidth={1} strokeDasharray="3 4" />
            <text x={padL + innerW + 6} y={yOf(tv) + 4} fill={C.text} fontSize="10">{fmt(tv)}</text>
          </g>
        ))}
        <polyline points={linePts(ma5)} fill="none" stroke={C.ma5} strokeWidth={1.3} vectorEffect="non-scaling-stroke" />
        <polyline points={linePts(ma10)} fill="none" stroke={C.ma10} strokeWidth={1.3} vectorEffect="non-scaling-stroke" />
        <polyline points={linePts(ma20)} fill="none" stroke={C.ma20} strokeWidth={1.3} vectorEffect="non-scaling-stroke" />
        <polyline
          points={closes.map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ')}
          fill="none"
          stroke={stroke}
          strokeWidth={1.9}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
        <circle cx={xOf(n - 1)} cy={yOf(closes[n - 1])} r={3} fill={stroke} />
        {data.map((d, i) => {
          const bw = Math.max(0.5, (innerW / n) * 0.62);
          const y = yVol(d.vol);
          const h = padT + priceH + gap + volH - y;
          const c = d.close >= d.open ? C.up : C.down;
          return <rect key={i} x={xOf(i) - bw / 2} y={y} width={bw} height={Math.max(0, h)} fill={c} opacity={0.5} />;
        })}
        {xticks.map((i) => (
          <text key={i} x={xOf(i)} y={H - 6} fill={C.text} fontSize="10" textAnchor="middle">{data[i].date.slice(5)}</text>
        ))}
      </svg>
      <div className="chart-legend">
        <span style={{ color: C.ma5 }}>MA5 {maLast(ma5) != null ? fmt(maLast(ma5) as number) : '—'}</span>
        <span style={{ color: C.ma10 }}>MA10 {maLast(ma10) != null ? fmt(maLast(ma10) as number) : '—'}</span>
        <span style={{ color: C.ma20 }}>MA20 {maLast(ma20) != null ? fmt(maLast(ma20) as number) : '—'}</span>
      </div>
    </div>
  );
}
