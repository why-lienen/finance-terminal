import { useEffect, useState } from 'react';
import type { Portfolio, Gold, Stock, WatchItem } from '../types';
import { loadHoldings, loadWatch } from '../store/local';
import { computePortfolio } from '../store/portfolio';
import { getGold, getStocks } from '../api/market';
import { fmt, fmtPct, cls } from '../utils';

export default function Dashboard() {
  const [pf, setPf] = useState<Portfolio | null>(null);
  const [gold, setGold] = useState<Gold | null>(null);
  const [watch, setWatch] = useState<WatchItem[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);

  useEffect(() => {
    computePortfolio(loadHoldings()).then(setPf);
    getGold().then(setGold);
    const w = loadWatch();
    setWatch(w);
    const secs = w.filter((x) => x.type === 'stock').map((x) => x.symbol);
    if (secs.length) getStocks(secs).then(setStocks);
  }, []);

  const s = pf?.summary;
  return (
    <div className="grid">
      <div className="grid cols-4">
        <div className="card">
          <h3>持仓总市值</h3>
          <div className="big">{fmt(s?.totalMarket)}</div>
          <div className="muted">成本 {fmt(s?.totalCost)}</div>
        </div>
        <div className="card">
          <h3>持仓总收益</h3>
          <div className={'big ' + cls(s?.totalPnl)}>{fmt(s?.totalPnl)}</div>
          <div className={cls(s?.totalPnlPct)}>{fmtPct(s?.totalPnlPct)}</div>
        </div>
        <div className="card">
          <h3>实时金价 (元/克)</h3>
          <div className="big">{gold ? gold.price.toFixed(2) : '-'}</div>
          <div className="muted">{gold?.name}{gold?.stale ? ' · 参考价' : ''}</div>
        </div>
        <div className="card">
          <h3>自选标的</h3>
          <div className="big">{watch.length}</div>
          <div className="muted">股票 {stocks.length}</div>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h3>持仓明细</h3>
          {pf && pf.items.length === 0 && <div className="muted">尚无持仓，去「持仓」页导入或添加</div>}
          <table>
            <thead>
              <tr><th>名称</th><th>现价</th><th>市值</th><th>收益</th><th>盈亏%</th></tr>
            </thead>
            <tbody>
              {pf?.items.map((it) => (
                <tr key={it.code}>
                  <td>
                    {it.name}
                    <div className="muted">{it.code}{it.estimated ? ' · 估值' : ''}</div>
                  </td>
                  <td>{it.price != null ? fmt(it.price) : '-'}</td>
                  <td>{it.market != null ? fmt(it.market) : '-'}</td>
                  <td className={cls(it.pnl ?? undefined)}>{it.pnl != null ? fmt(it.pnl) : '-'}</td>
                  <td className={cls(it.pnlPct ?? undefined)}>{it.pnlPct != null ? fmtPct(it.pnlPct) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3>自选行情</h3>
          {stocks.length === 0 && <div className="muted">去「股票」页添加自选</div>}
          <table>
            <thead>
              <tr><th>名称</th><th>最新价</th><th>涨跌幅</th></tr>
            </thead>
            <tbody>
              {stocks.map((x) => (
                <tr key={x.code}>
                  <td>{x.name}</td>
                  <td>{x.price}</td>
                  <td className={cls(x.pct)}>{fmtPct(x.pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
