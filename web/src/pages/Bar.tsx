import { useEffect, useState } from 'react';
import type { Gold, Holding, Portfolio, Stock } from '../types';
import { loadHoldings, loadWatch } from '../store/local';
import { computePortfolio } from '../store/portfolio';
import { getGold, getStocks } from '../api/market';
import { fmt, fmtPct, cls } from '../utils';

// 菜单栏紧凑模式（Electron 加载 ?bar=1 时使用）：一条横向滚动行情条
export default function Bar() {
  const [pf, setPf] = useState<Portfolio | null>(null);
  const [gold, setGold] = useState<Gold | null>(null);
  const [stocks, setStocks] = useState<Stock[]>([]);

  useEffect(() => {
    const tick = async () => {
      try { setPf(await computePortfolio(loadHoldings())); } catch {}
      try { setGold(await getGold()); } catch {}
      try {
        const secs = loadWatch().filter((x) => x.type === 'stock').map((x) => x.symbol);
        if (secs.length) setStocks(await getStocks(secs));
      } catch {}
    };
    tick();
    const id = setInterval(tick, 15000);
    return () => clearInterval(id);
  }, []);

  const items: { nm: string; val: string; pct?: number }[] = [];
  pf?.items.forEach((it) => items.push({ nm: it.name, val: fmt(it.market ?? 0), pct: it.pnlPct ?? undefined }));
  if (gold) items.push({ nm: '金价', val: gold.price.toFixed(2) });
  stocks.forEach((s) => items.push({ nm: s.name, val: String(s.price), pct: s.pct }));

  return (
    <div className="bar-app">
      <div className="bar-ticker">
        {items.length === 0 && <div className="bar-empty">暂无持仓/自选，去网页端添加</div>}
        {items.map((it, i) => (
          <div className="item" key={i}>
            <span className="nm">{it.nm}</span>
            <span className="val">{it.val}</span>
            {it.pct != null && (
              <span className={cls(it.pct)}>{fmtPct(it.pct)}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
