import { useEffect, useState } from 'react';
import type { Portfolio, Gold, Stock, WatchItem } from '../types';
import { loadHoldings, loadWatch } from '../store/local';
import { computePortfolio } from '../store/portfolio';
import { getGold, getStocks } from '../api/market';
import { fmt, fmtPct, cls } from '../utils';
import { usePolling } from '../hooks';
import PortfolioChart from '../components/PortfolioChart';

export default function Dashboard() {
  const [watch, setWatch] = useState<WatchItem[]>([]);

  const pf = usePolling<Portfolio>(() => computePortfolio(loadHoldings()), 20000, []);
  const gold = usePolling<Gold>(() => getGold(), 20000, []);
  const stocks = usePolling<Stock[]>(
    async () => {
      const secs = loadWatch().filter((x) => x.type === 'stock').map((x) => x.symbol);
      return secs.length ? getStocks(secs) : [];
    },
    20000,
    [watch.length],
  );

  // 首次载入自选列表（供计数与股票轮询依赖）
  useEffect(() => { setWatch(loadWatch()); /* eslint-disable-next-line */ }, []);

  const s = pf.data?.summary;
  const fundWatch = watch.filter((x) => x.type === 'fund').length;

  return (
    <div className="grid">
      <PortfolioChart />

      <div className="grid cols-4">
        <div className="card">
          <h3>持仓总市值</h3>
          <div className="big">{pf.data ? fmt(s?.totalMarket) : '—'}</div>
          <div className="muted">成本 {pf.data ? fmt(s?.totalCost) : '—'}</div>
        </div>
        <div className="card">
          <h3>持仓总收益</h3>
          <div className={'big ' + cls(s?.totalPnl)}>{pf.data ? fmt(s?.totalPnl) : '—'}</div>
          <div className={cls(s?.totalPnlPct)}>{pf.data ? fmtPct(s?.totalPnlPct) : '—'}</div>
        </div>
        <div className="card">
          <h3>实时金价 (元/克)</h3>
          <div className="big">{gold.data ? gold.data.price.toFixed(2) : '—'}</div>
          <div className="muted">{gold.data?.name}{gold.data?.stale ? ' · 参考价' : ''}</div>
        </div>
        <div className="card">
          <h3>自选标的</h3>
          <div className="big">{watch.length}</div>
          <div className="muted">股票 {stocks.data?.length ?? 0} · 基金 {fundWatch}</div>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h3>持仓明细 {pf.loading && <span className="muted">· 刷新中</span>}</h3>
          {pf.error && <div className="err">加载失败：{pf.error}</div>}
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>名称</th><th>现价</th><th>市值</th><th>收益</th><th>盈亏%</th></tr>
              </thead>
              <tbody>
                {pf.data?.items.map((it) => (
                  <tr key={it.code}>
                    <td>
                      {it.name}
                      <div className="muted">{it.code}{it.estimated ? ' · 估值' : ''}</div>
                    </td>
                    <td>{it.price != null ? fmt(it.price) : '—'}</td>
                    <td>{it.market != null ? fmt(it.market) : '—'}</td>
                    <td className={cls(it.pnl ?? undefined)}>{it.pnl != null ? fmt(it.pnl) : '—'}</td>
                    <td className={cls(it.pnlPct ?? undefined)}>{it.pnlPct != null ? fmtPct(it.pnlPct) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!pf.loading && pf.data && pf.data.items.length === 0 && (
            <div className="muted">尚无持仓，去「持仓」页导入或添加</div>
          )}
        </div>
        <div className="card">
          <h3>自选行情 {stocks.loading && <span className="muted">· 刷新中</span>}</h3>
          {stocks.error && <div className="err">加载失败：{stocks.error}</div>}
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>名称</th><th>最新价</th><th>涨跌幅</th></tr>
              </thead>
              <tbody>
                {stocks.data?.map((x) => (
                  <tr key={x.code}>
                    <td>{x.name}</td>
                    <td>{x.price}</td>
                    <td className={cls(x.pct)}>{fmtPct(x.pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!stocks.loading && (!stocks.data || stocks.data.length === 0) && (
            <div className="muted">去「股票」页添加自选</div>
          )}
        </div>
      </div>
    </div>
  );
}
