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

interface ViewBox {
  large: boolean;
  boxW: number;
  boxH: number;
}

export default function StockChart({
  secid,
  name,
  prevClose,
  gold,
  livePrice,
  large = false,
}: {
  secid?: string;
  name?: string;
  prevClose?: number;
  gold?: boolean;
  livePrice?: number;
  large?: boolean;
}) {
  const [period, setPeriod] = useState<Period>('分时');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [intraday, setIntraday] = useState<IntradayPoint[]>([]);
  const [kline, setKline] = useState<KP[]>([]);
  const [minuteSpan, setMinuteSpan] = useState<'recent' | 'all'>('recent'); // 1分钟默认最近30分钟
  const [zoom, setZoom] = useState(1); // 缩放：0.5~2.5，越大蜡烛/点越宽越清晰
  const reqId = useRef(0);

  // 独立大窗口模式：图表按窗口尺寸铺满（不再是小 Modal 里固定 320 高 + 横向滚动的小框）。
  // 窗口可 resize，这里监听后重算宽高，SVG 原地更新而不卸载。
  const [box, setBox] = useState(() => ({
    w: Math.max(560, (typeof window !== 'undefined' ? window.innerWidth : 1000) - 44),
    h: Math.max(360, (typeof window !== 'undefined' ? window.innerHeight : 760) - 300),
  }));
  useEffect(() => {
    if (!large) return;
    const on = () =>
      setBox({
        w: Math.max(560, window.innerWidth - 44),
        h: Math.max(360, window.innerHeight - 300),
      });
    on();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [large]);

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
  const dataLen = isIntraday ? intraday.length : kline.length;
  const vb: ViewBox = { large, boxW: box.w, boxH: box.h };

  return (
    <div>
      <div className="range-tabs" style={{ marginBottom: 8 }}>
        {PERIODS.map((p) => (
          <button key={p} className={p === period ? 'active' : ''} onClick={() => setPeriod(p)}>
            {p}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        {/* 大窗口已铺满整个窗口，无需缩放条（缩放在小 Modal 里才需要） */}
        {!large && (
          <span className="chart-tools">
            <span className="muted" style={{ fontSize: 11 }}>缩放</span>
            <button className="zoom-btn" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}>−</button>
            <span className="zoom-val">{Math.round(zoom * 100)}%</span>
            <button className="zoom-btn" onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.25).toFixed(2)))}>+</button>
            <button className="zoom-btn" title="重置" onClick={() => setZoom(1)}>↺</button>
          </span>
        )}
      </div>
      {/* 关键：只在「还没有任何数据」时显示加载态。定时刷新时保持 SVG 挂载、原地更新数据，
          否则每次 20s 刷新都会把整张图卸载成「加载中…」再重新挂载，就是用户看到的「一闪」。 */}
      {!dataLen && loading && (
        <div className="muted" style={{ padding: '40px 0', textAlign: 'center' }}>加载中…</div>
      )}
      {!dataLen && !loading && err && (
        <div className="muted" style={{ padding: '40px 0', textAlign: 'center' }}>{err}</div>
      )}
      {dataLen > 0 && isIntraday && (
        <IntradayView data={intraday} prevClose={prevClose} five={period === '五日'} zoom={zoom} livePrice={livePrice} {...vb} />
      )}
      {dataLen > 0 && !isIntraday && (
        <KlineView data={kline} period={period} minuteSpan={minuteSpan} onMinuteSpan={setMinuteSpan} zoom={zoom} {...vb} />
      )}
    </div>
  );
}

function IntradayView({
  data,
  prevClose,
  five,
  zoom,
  livePrice,
  large = false,
  boxW = 0,
  boxH = 320,
}: {
  data: IntradayPoint[];
  prevClose?: number;
  five: boolean;
  zoom: number;
  livePrice?: number;
  large?: boolean;
  boxW?: number;
  boxH?: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inited = useRef(false);
  if (!data.length) return <div className="muted" style={{ padding: 40, textAlign: 'center' }}>暂无分时数据（可能未开盘）</div>;
  const H = large ? boxH : 320;
  const padT = 12, padB = 22, padL = 46, padR = 54, volH = large ? 80 : 54, gap = 10;
  const priceH = H - padT - padB - volH - gap;
  const n = data.length;
  // 小 Modal：固定槽宽 + 缩放 + 横向滚动；大窗口：按窗口宽度均分铺满
  const innerW = large ? Math.max(400, boxW - padL - padR) : n * (3.2 * zoom);
  const slot = innerW / n;
  const plotW = padL + innerW + padR;
  // 末点用实时价覆盖，保证分时图"最新"与卡片现价完全一致（消除两者价差误导）
  const lastPrice = livePrice != null && Number.isFinite(livePrice) ? livePrice : data[n - 1].price;
  const closes = data.map((d, i) => (i === n - 1 ? lastPrice : d.price));
  const avgs = data.map((d) => d.avg).filter((v) => Number.isFinite(v));
  let lo = Math.min(...closes, ...avgs);
  let hi = Math.max(...closes, ...avgs);
  if (Number.isFinite(prevClose as number)) {
    lo = Math.min(lo, prevClose as number);
    hi = Math.max(hi, prevClose as number);
  }
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
  const span = hi - lo || 1;
  const xOf = (i: number) => padL + i * slot + slot / 2;
  const yOf = (v: number) => padT + priceH - ((v - lo) / span) * priceH;
  const hasPrev = Number.isFinite(prevClose as number);
  const ref = hasPrev ? (prevClose as number) : data[0].price;
  const up = lastPrice >= ref;
  const stroke = up ? C.up : C.down;
  const pricePts = closes.map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ');
  const avgPts = data.map((d, i) => `${xOf(i).toFixed(1)},${yOf(d.avg).toFixed(1)}`).join(' ');
  const volMax = Math.max(...data.map((d) => d.vol), 1);
  const yVol = (v: number) => padT + priceH + gap + volH - (v / volMax) * volH;
  const pct = (v: number) => ((v - ref) / ref) * 100;
  const ticks = [0, 0.5, 1].map((k) => lo + span * k);
  const stepX = Math.max(1, Math.ceil(n / 8));
  const xticks: number[] = [];
  for (let i = 0; i < n; i += stepX) xticks.push(i);
  if (xticks[xticks.length - 1] !== n - 1) xticks.push(n - 1);
  // 初次加载 / 切换 分时↔五日 时自动滚到最新处（放大后可横向滚动看历史）
  useEffect(() => { inited.current = false; }, [five]);
  useEffect(() => {
    if (!inited.current && scrollRef.current && data.length) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
      inited.current = true;
    }
  }, [data.length, five]);
  return (
    <div className="chart-wrap chart-plot">
      <div ref={scrollRef} style={{ overflowX: large ? 'hidden' : 'auto', maxWidth: '100%', paddingBottom: 4 }}>
      <svg width={plotW} height={H} viewBox={`0 0 ${plotW} ${H}`} role="img" aria-label="分时走势">
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
        <circle cx={xOf(n - 1)} cy={yOf(lastPrice)} r={3} fill={stroke} />
        {data.map((d, i) => {
          const bw = Math.max(0.5, slot * 0.62);
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
      </div>
      <div className="chart-legend">
        <span><i style={{ background: C.avg }} />均价 {fmt(data[n - 1].avg)}</span>
        <span style={{ color: stroke, fontWeight: 700 }}>最新 {fmt(lastPrice)}</span>
        {hasPrev && <span style={{ color: stroke }}>{up ? '▲' : '▼'} {pct(lastPrice).toFixed(2)}%</span>}
      </div>
    </div>
  );
}

interface KlineProps {
  data: KP[];
  period: Period;
  minuteSpan?: 'recent' | 'all';
  onMinuteSpan?: (v: 'recent' | 'all') => void;
  zoom: number;
  large?: boolean;
  boxW?: number;
  boxH?: number;
}
function KlineView({
  data,
  period,
  minuteSpan = 'recent',
  onMinuteSpan,
  zoom,
  large = false,
  boxW = 0,
  boxH = 320,
}: KlineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inited = useRef(false);
  const isMinute = period === '1分钟';
  const showAll = isMinute && minuteSpan === 'all';
  const RECENT_N = 30; // 1分钟默认最近 30 分钟
  const N = large ? 60 : 220; // 大窗口铺满时少取几根，避免蜡烛挤成一条线
  let view: KP[];
  if (isMinute) view = showAll ? data : data.length > RECENT_N ? data.slice(data.length - RECENT_N) : data;
  else view = data.length > N ? data.slice(data.length - N) : data;
  const n = view.length;
  if (!data.length) return <div className="muted" style={{ padding: 40, textAlign: 'center' }}>暂无K线数据</div>;
  const H = large ? boxH : 320;
  const padT = 12, padB = 22, padL = 8, padR = 54, volH = large ? 80 : 54, gap = 10;
  const priceH = H - padT - padB - volH - gap;
  const innerW = large ? Math.max(400, boxW - padL - padR) : n * (9 * zoom);
  const slot = innerW / n;
  const plotW = padL + innerW + padR;
  const loSrc = isMinute ? view : data;
  const allLo = Math.min(...loSrc.map((d) => d.low));
  const allHi = Math.max(...loSrc.map((d) => d.high));
  const pad = (allHi - allLo) * 0.06;
  const L = allLo - pad;
  const U = allHi + pad;
  const span = U - L || 1;
  const xOf = (i: number) => padL + i * slot + slot / 2;
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
  const stepX = Math.max(1, Math.ceil(n / 8));
  const xticks: number[] = [];
  for (let i = 0; i < n; i += stepX) xticks.push(i);
  if (xticks[xticks.length - 1] !== n - 1) xticks.push(n - 1);
  const candleW = Math.max(2, slot * 0.72);
  const labelFmt = (s: string) => (isMinute ? s.slice(11, 16) : s.slice(5));
  const maLast = (arr: (number | null)[]) => {
    for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i] as number;
    return null;
  };
  useEffect(() => { inited.current = false; }, [minuteSpan, period]);
  useEffect(() => {
    if (!inited.current && scrollRef.current && data.length) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
      inited.current = true;
    }
  }, [data.length, minuteSpan, period]);
  return (
    <div className="chart-wrap chart-plot">
      {isMinute && (
        <div className="minute-switch" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span className="muted" style={{ fontSize: 11 }}>
            {showAll ? `1分钟走势 · 全天（共 ${n} 根，可滑动）` : `1分钟走势 · 最近 ${n} 分钟（共 ${n} 根，可滑动）`}
          </span>
          <span style={{ flex: 1 }} />
          <button className={!showAll ? 'seg on' : 'seg'} onClick={() => onMinuteSpan?.('recent')}>近30分钟</button>
          <button className={showAll ? 'seg on' : 'seg'} onClick={() => onMinuteSpan?.('all')}>全天</button>
        </div>
      )}
      <div ref={scrollRef} style={{ overflowX: large ? 'hidden' : 'auto', maxWidth: '100%', paddingBottom: 4 }}>
        <svg width={plotW} height={H} viewBox={`0 0 ${plotW} ${H}`} role="img" aria-label="K线走势">
          {ticks.map((tv, k) => (
            <g key={k}>
              <line x1={padL} y1={yOf(tv)} x2={padL + innerW} y2={yOf(tv)} stroke={C.grid} strokeWidth={1} strokeDasharray="3 4" />
              <text x={padL + innerW + 6} y={yOf(tv) + 4} fill={C.text} fontSize="10">{fmt(tv)}</text>
            </g>
          ))}
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
