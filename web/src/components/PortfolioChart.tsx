import { usePolling } from '../hooks';
import { buildPortfolioSeries } from '../store/portfolio';
import { loadHoldings } from '../store/local';
import LineChart from './LineChart';
import { fmt, fmtPct, cls } from '../utils';

export default function PortfolioChart() {
  const { data, loading } = usePolling(() => buildPortfolioSeries(loadHoldings(), '1y'), 60000, []);
  const last = data?.[data.length - 1]?.y ?? 0;
  const first = data?.[0]?.y ?? 0;
  const chg = last - first;
  const chgPct = first ? (chg / first) * 100 : 0;

  return (
    <div className="card chart-card">
      <div className="chart-head">
        <h3>组合市值走势（近 1 年 · 按份额加权）</h3>
        <div>
          <span className="big" style={{ fontSize: 18 }}>{fmt(last)}</span>
          <span className={cls(chg)} style={{ marginLeft: 8, fontWeight: 700 }}>
            {chg >= 0 ? '+' : ''}{fmt(chg)}（{chg >= 0 ? '+' : ''}{fmtPct(chgPct)}）
          </span>
        </div>
      </div>
      {loading && !data && <div className="muted">加载走势中…</div>}
      {data && <LineChart series={data} height={220} formatVal={(v) => fmt(v)} formatX={(s) => s.slice(5)} />}
    </div>
  );
}
