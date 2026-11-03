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
  const [minuteSpan, setMinuteSpan] = useState<'recent' | 'all'>('recent'); // 1分钟默认近1.5h
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
      {!loading && !err && !isIntraday && <KlineView data={kline} period={period} minuteSpan={minuteSpan} onMinuteSpan={setMinuteSpan} />}
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

interface KlineProps {
  data: KP[];
  period: Period;
  minuteSpan?: 'recent' | 'all';
  onMinuteSpan?: (v: 'recent' | 'all') => void;
}
function KlineView({ data, period, minuteSpan = 'recent', onMinuteSpan }: KlineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inited = useRef(false);
  const isMinute = period === '1分钟';
  const showAll = isMinute && minuteSpan === 'all';
  const fixed = isMinute; // 1分钟一律固定宽度 + 横向滚动
  // 切换 近1.5h/全天 时重新滚动到最新；日常刷新(数据更新)不抢走用户已滚动的位置
  useEffect(() => {
    inited.current = false;
  }, [minuteSpan]);
  useEffect(() => {
    if (fixed && scrollRef.current && !inited.current && data.length) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
      inited.current = true;
    }
  }, [fixed, minuteSpan, data.length]);
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
  // 分钟级：固定宽度蜡烛 + 横向滚动（每根足够宽才看得清走势）。
  // 默认近 1.5 小时（90 根），点"全天"保留全部；其它周期自适应取最近 N 根填满宽度。
  const RECENT_N = 90;
  const N = 220; // 日/周/月 自适应取最近 N 根
  const STRIDE = 9; // 每根蜡烛占宽(px)
  let view: KP[];
  if (isMinute) view = showAll ? data : data.length > RECENT_N ? data.slice(data.length - RECENT_N) : data;
  else view = data.length > N ? data.slice(data.length - N) : data;
  const n = view.length;
  // 分钟级（固定滚动）按当前可见窗口缩放Y轴，避免最近1.5h被压在全天高低点中间看不清；其它周期 view≈data 无影响
  const loSrc = fixed ? view : data;
  const allLo = Math.min(...loSrc.map((d) => d.low));
  const allHi = Math.max(...loSrc.map((d) => d.high));
  const pad = (allHi - allLo) * 0.06;
  const L = allLo - pad;
  const U = allHi + pad;
  const span = U - L || 1;
  const innerW = fixed ? n * STRIDE : W - padL - padR;
  const plotW = fixed ? padL + innerW + padR : W;
  const xOf = (i: number) =>
    fixed ? padL + i * STRIDE + STRIDE / 2 : padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yOf = (v: number) => padT + priceH - ((v - L) / span) * priceH;
  const closes = data.map((d) => d.close);
  const ma5 = sma(closes, 5);
  const ma10 = sma(closes, 10);
  const ma20 = sma(closes, 20);
  const ma5v = ma5.slice(ma5.length - n);
  const ma10v = ma10.slice(ma10.length - n);
  const ma20v = ma20.slice(ma20.length - n);
  const linePts = (arr: (number | null)[]) =>
    arr.map((v, i) => (v == null ? null : `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`)).filter(Boolean).join(' ');
  const volMax = Math.max(...view.map((d) => d.vol), 1);
  const yVol = (v: number) => padT + priceH + gap + volH - (v / volMax) * volH;
  const up = view[n - 1].close >= view[0].close;
  const stroke = up ? C.up : C.down;
  const ticks = [0, 0.5, 1].map((k) => L + span * k);
  let xticks: number[];
  if (fixed) {
    const step = Math.max(1, Math.ceil(n / 9));
    xticks = [];
    for (let i = 0; i < n; i += step) xticks.push(i);
    if (xticks[xticks.length - 1] !== n - 1) xticks.push(n - 1);
  } else {
    xticks = [0, Math.floor(n * 0.25), Math.floor(n * 0.5), Math.floor(n * 0.75), n - 1].filter(
      (v, i, a) => a.indexOf(v) === i,
    );
  }
  const candleW = fixed ? Math.max(3, STRIDE * 0.7) : Math.max(1.8, (innerW / n) * 0.72);
  const labelFmt = (s: string) => (isMinute ? s.slice(11, 16) : s.slice(5));
  const maLast = (arr: (number | null)[]) => {
    for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i] as number;
    return null;
  };
  return (
    <div className="chart-wrap chart-plot">
      {isMinute && (
        <div className="minute-switch" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span className="muted" style={{ fontSize: 11 }}>
            {showAll ? `1分钟走势 · 全天（共 ${n} 根，可滑动）` : `1分钟走势 · 近 ${Math.round((n / 60) * 10) / 10} 小时（共 ${n} 根，可滑动）`}
          </span>
          <span style={{ flex: 1 }} />
          <button className={!showAll ? 'seg on' : 'seg'} onClick={() => onMinuteSpan?.('recent')}>近1.5h</button>
          <button className={showAll ? 'seg on' : 'seg'} onClick={() => onMinuteSpan?.('all')}>全天</button>
        </div>
      )}
      <div ref={scrollRef} style={fixed ? { overflowX: 'auto', maxWidth: '100%', paddingBottom: 4 } : undefined}>
        <svg width={fixed ? plotW : '100%'} viewBox={`0 0 ${plotW} ${H}`} role="img" aria-label="K线走势">
          {ticks.map((tv, k) => (
            <g key={k}>
              <line x1={padL} y1={yOf(tv)} x2={padL + innerW} y2={yOf(tv)} stroke={C.grid} strokeWidth={1} strokeDasharray="3 4" />
              <text x={padL + innerW + 6} y={yOf(tv) + 4} fill={C.text} fontSize="10">{fmt(tv)}</text>
            </g>
          ))}
          {/* 蜡烛：实体 open→close，影线 high→low（A股：涨红跌绿） */}
          {view.map((d, i) => {
            const x = xOf(i);
            const yO = yOf(d.open);
            const yC = yOf(d.close);
            const yH = yOf(d.high);
            const yL = yOf(d.low);
            const isUp = d.close >= d.open;
            const col = isUp ? C.up : C.down;
            const top = Math.min(yO, yC);
            const h = Math.max(1, Math.abs(yC - yO));
            return (
              <g key={i}>
                <line x1={x} y1={yH} x2={x} y2={yL} stroke={col} strokeWidth={1} />
                <rect x={x - candleW / 2} y={top} width={candleW} height={h} fill={col} />
              </g>
            );
          })}
          <polyline points={linePts(ma5v)} fill="none" stroke={C.ma5} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
          <polyline points={linePts(ma10v)} fill="none" stroke={C.ma10} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
          <polyline points={linePts(ma20v)} fill="none" stroke={C.ma20} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
          {view.map((d, i) => {
            const x = xOf(i);
            const y = yVol(d.vol);
            const hgt = padT + priceH + gap + volH - y;
            const col = d.close >= d.open ? C.up : C.down;
            return <rect key={i} x={x - candleW / 2} y={y} width={candleW} height={Math.max(0, hgt)} fill={col} opacity={0.45} />;
          })}
          {xticks.map((i) => (
            <text key={i} x={xOf(i)} y={H - 6} fill={C.text} fontSize="10" textAnchor="middle">{labelFmt(view[i].date)}</text>
          ))}
        </svg>
      </div>
      <div className="chart-legend">
        <span style={{ color: C.ma5 }}>MA5 {maLast(ma5v) != null ? fmt(maLast(ma5v) as number) : '—'}</span>
        <span style={{ color: C.ma10 }}>MA10 {maLast(ma10v) != null ? fmt(maLast(ma10v) as number) : '—'}</span>
        <span style={{ color: C.ma20 }}>MA20 {maLast(ma20v) != null ? fmt(maLast(ma20v) as number) : '—'}</span>
        <span className="muted">（蜡烛图：涨红跌绿）</span>
      </div>
    </div>
  );
}
