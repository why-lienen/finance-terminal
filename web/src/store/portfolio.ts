import type { Holding, Portfolio, PortfolioItem, ChartPoint } from '../types';
import { getFundEst, getGold, getFundHistory, getKline } from '../api/market';

// 根据本地持仓 + 实时行情计算组合（市值/收益/盈亏%），纯前端计算
export async function computePortfolio(holdings: Holding[]): Promise<Portfolio> {
  const items: PortfolioItem[] = [];
  let totalMarket = 0;
  let totalCost = 0;

  await Promise.all(
    holdings.map(async (h) => {
      let price: number | null = null;
      let pct: number | null = null;
      let estimated = false;
      let name = h.name || h.code;

      if (h.type === 'gold') {
        const g = await getGold();
        price = g.price;
        name = h.name || '积存金';
      } else {
        const f = await getFundEst(h.code);
        if (f) {
          price = f.price;
          pct = f.pct;
          estimated = f.estimated;
          name = f.name || h.name || h.code;
        }
      }

      const market = price != null ? price * h.shares : null;
      const pnl = market != null ? market - h.cost : null;
      const pnlPct = market != null && h.cost ? (pnl! / h.cost) * 100 : null;

      items.push({
        code: h.code,
        name,
        type: h.type,
        shares: h.shares,
        cost: h.cost,
        price,
        pct,
        market,
        pnl,
        pnlPct,
        estimated,
      });

      if (market != null) {
        totalMarket += market;
        totalCost += h.cost;
      }
    }),
  );

  return {
    items,
    summary: {
      totalMarket,
      totalCost,
      totalPnl: totalMarket - totalCost,
      totalPnlPct: totalCost ? ((totalMarket - totalCost) / totalCost) * 100 : 0,
    },
  };
}

// 组合历史市值曲线：拉取各持仓（基金净值历史 / 黄金 K 线），按日期对齐并加权求和。
// 缺失日期用最近已知值向前填充（carry-forward），返回 [{x:日期, y:市值}]。
export async function buildPortfolioSeries(holdings: Holding[], range = '1y'): Promise<ChartPoint[]> {
  const GOLD_SECID = '113.Au99.99';
  const results = await Promise.all(
    holdings.map(async (h) => {
      try {
        if (h.type === 'gold') {
          const k = await getKline(GOLD_SECID, 'day', 365);
          const map: Record<string, number> = {};
          (k?.list || []).forEach((p) => { map[p.date.slice(0, 10)] = (p.close || 0) * (h.shares || 0); });
          return { code: h.code, map };
        }
        const hist = await getFundHistory(h.code, range);
        const map: Record<string, number> = {};
        (hist || []).forEach((p) => { map[p.date] = (p.nav || 0) * (h.shares || 0); });
        return { code: h.code, map };
      } catch {
        return { code: h.code, map: {} as Record<string, number> };
      }
    }),
  );

  const dateSet = new Set<string>();
  results.forEach((r) => Object.keys(r.map).forEach((d) => dateSet.add(d)));
  const dates = [...dateSet].sort();
  if (!dates.length) return [];

  const last: Record<string, number> = {};
  return dates.map((d) => {
    let total = 0;
    results.forEach((r) => {
      if (r.map[d] != null) last[r.code] = r.map[d];
      if (last[r.code] != null) total += last[r.code];
    });
    return { x: d, y: Math.round(total * 100) / 100 };
  });
}
