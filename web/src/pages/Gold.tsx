import { api } from '../api/client';
import type { Gold as GoldT, Stock } from '../types';
import { fmt, cls } from '../utils';
import { usePolling, useRealtimeMonitor } from '../hooks';
import LineChart from '../components/LineChart';

export default function Gold() {
  // 国际金价走实时引擎，拿到滚动曲线（美元/盎司）
  const { gold, series, error, lastUpdate } = useRealtimeMonitor([], { withGold: true, intervalMs: 5000 });
  const etf = usePolling<Stock | null>(
    () => api.get<Stock[]>('/market/stocks?secids=1.518880').then((r) => r.data[0] || null),
    20000,
    [],
  );

  const unit = gold?.unit || '美元/盎司';
  const goldSeries = (series['GOLD'] || []).map((y) => ({ x: '', y }));

  return (
    <div className="grid">
      <div className="grid cols-2">
        <div className="card">
          <h3>国际金价（{unit}）</h3>
          {error && <div className="err">连接异常：{error}</div>}
          <div className="big">{gold ? fmt(gold.price) : '—'}</div>
          <div className={gold ? cls(gold.pct ?? 0) : 'muted'}>
            {gold ? `${gold.name}${gold.pct != null ? `　${gold.pct >= 0 ? '+' : ''}${gold.pct}%` : ''}` : '加载中'}
            {gold?.stale ? '　· 最近值' : ''}
          </div>
          {gold?.change != null && (
            <div className={'muted ' + cls(gold.change)}>
              较昨收 {gold.change >= 0 ? '+' : ''}
              {gold.change} {unit}
            </div>
          )}
        </div>

        <div className="card">
          <h3>黄金ETF 518880（国内参考）</h3>
          {etf.error && <div className="err">加载失败：{etf.error}</div>}
          <div className="big">{etf.data ? etf.data.price : '—'}</div>
          <div className={etf.data ? cls(etf.data.pct) : 'muted'}>
            {etf.data ? `${etf.data.name} ${etf.data.pct >= 0 ? '+' : ''}${etf.data.pct}%` : '加载中'}
          </div>
          <div className="muted">国内黄金ETF，仅供参考（非国际金价换算）</div>
        </div>
      </div>

      <div className="card chart-card">
        <div className="chart-head">
          <h3>国际金价实时走势（{unit}，每 5 秒刷新）</h3>
        </div>
        {goldSeries.length < 2 && <div className="muted">实时数据累积中…（约 10 秒后出图）</div>}
        {goldSeries.length >= 2 && (
          <LineChart series={goldSeries} height={220} formatVal={(v) => fmt(v)} formatX={() => ''} />
        )}
        {lastUpdate > 0 && !error && (
          <div className="muted" style={{ marginTop: 6 }}>
            更新于 {new Date(lastUpdate).toLocaleTimeString('zh-CN', { hour12: false })}
          </div>
        )}
      </div>
    </div>
  );
}
