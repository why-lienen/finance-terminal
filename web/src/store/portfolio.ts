import type { Holding, Portfolio, PortfolioItem } from '../types';
import { getFundEst, getGold } from '../api/market';

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
