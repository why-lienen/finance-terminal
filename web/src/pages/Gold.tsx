import { useState } from 'react';
import { api } from '../api/client';
import type { Gold as GoldT, Stock } from '../types';
import { fmt, cls } from '../utils';
import { usePolling } from '../hooks';
import { getKline } from '../api/market';
import LineChart from '../components/LineChart';

export default function Gold() {
  const [grams, setGrams] = useState(45);

  const gold = usePolling<GoldT>(() => api.get<GoldT>('/market/gold').then((r) => r.data), 20000, []);
  const etf = usePolling<Stock | null>(
    () => api.get<Stock[]>('/market/stocks?secids=1.518880').then((r) => r.data[0] || null),
    20000,
    [],
  );
  const trend = usePolling(
    () => getKline('1.518880', 'day', 60).then((k) => (k.list || []).map((p) => ({ x: p.date.slice(0, 10), y: Math.round(p.close * 100 * 100) / 100 }))),
    60000,
    [],
  );

  const price = gold.data?.price ?? 0;
  const value = price * grams;

  return (
    <div className="grid">
      <div className="grid cols-3">
        <div className="card">
          <h3>实时金价 (元/克)</h3>
          {gold.error && <div className="err">加载失败：{gold.error}</div>}
          <div className="big">{gold.data ? price.toFixed(2) : '—'}</div>
          <div className="muted">{gold.data?.name}{gold.data?.stale ? ' · 参考价' : ''}</div>
        </div>
        <div className="card">
          <h3>黄金ETF(518880) 实时价</h3>
          {etf.error && <div className="err">加载失败：{etf.error}</div>}
          <div className="big">{etf.data ? etf.data.price : '—'}</div>
          <div className={etf.data ? cls(etf.data.pct) : 'muted'}>
            {etf.data ? `${etf.data.name} ${etf.data.pct >= 0 ? '+' : ''}${etf.data.pct}%` : '加载中'}
          </div>
        </div>
        <div className="card">
          <h3>积存金估值</h3>
          <div className="form" style={{ marginTop: 6 }}>
            <span>克数</span>
            <input type="number" value={grams} onChange={(e) => setGrams(Number(e.target.value) || 0)} style={{ width: 100 }} />
          </div>
          <div className="big">{fmt(value)}</div>
          <div className="muted">按实时金价计算（{fmt(price)} 元/克 × {grams} 克）</div>
        </div>
      </div>

      <div className="card chart-card">
        <div className="chart-head">
          <h3>金价走势（近 60 交易日）</h3>
        </div>
        {trend.loading && !trend.data && <div className="muted">加载走势中…</div>}
        {trend.data && <LineChart series={trend.data} height={220} formatVal={(v) => v.toFixed(2)} formatX={(s) => s.slice(5)} />}
      </div>
    </div>
  );
}
