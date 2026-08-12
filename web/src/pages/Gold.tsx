import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Gold } from '../types';
import { fmt, cls } from '../utils';

export default function Gold() {
  const [gold, setGold] = useState<Gold | null>(null);
  const [etf, setEtf] = useState<any>(null);
  const [grams, setGrams] = useState(45);

  useEffect(() => {
    api.get<Gold>('/market/gold').then((r) => setGold(r.data));
    api.get<any[]>('/market/stocks?secids=1.518880').then((r) => setEtf(r.data[0] || null));
  }, []);

  const value = gold ? gold.price * grams : 0;

  return (
    <div className="grid cols-3">
      <div className="card">
        <h3>实时金价 (元/克)</h3>
        <div className="big">{gold ? gold.price.toFixed(2) : '-'}</div>
        <div className="muted">{gold?.name}{gold?.stale ? ' · 参考价' : ''}</div>
      </div>
      <div className="card">
        <h3>黄金ETF(518880) 实时价</h3>
        <div className="big">{etf ? etf.price : '-'}</div>
        <div className={etf ? cls(etf.pct) : 'muted'}>
          {etf ? `${etf.name} ${etf.pct >= 0 ? '+' : ''}${etf.pct}%` : '加载中'}
        </div>
      </div>
      <div className="card">
        <h3>积存金估值</h3>
        <div className="form">
          <span>克数</span>
          <input type="number" value={grams} onChange={(e) => setGrams(Number(e.target.value) || 0)} style={{ width: 100 }} />
        </div>
        <div className="big">{fmt(value)}</div>
        <div className="muted">按金价参考价计算</div>
      </div>
    </div>
  );
}
