export interface Stock {
  code: string;
  market?: number;
  name: string;
  price: number;
  pct: number;
  change: number;
  volume?: number;
  prevClose?: number; // 昨收，用于分时图 0% 基准线
}

export interface FundEst {
  code: string;
  name: string;
  gsz: number | null;
  dwjz: number | null;
  ljjz: number | null;
  gszzl: number | null;
  price: number | null;
  pct: number | null;
  date: string | null;
  estimated: boolean;
}

export interface FundRankRow {
  code: string;
  name: string;
  type: string;
  date?: string | null;
  net: number;
  acc: number;
  day: number;
  week: number;
  month: number;
  quarter: number;
  half: number;
  year: number;
  y2: number;
  ytd: number;
  total: number;
}

export interface Gold {
  price: number;
  code?: string;
  name: string;
  source: string;
  stale: boolean;
  note?: string;
  unit?: string; // 计价单位，如 '美元/盎司'
  pct?: number; // 涨跌幅 %
  change?: number; // 涨跌金额
  prevClose?: number; // 昨收
}

export interface Holding {
  code: string; // 6 位基金代码 或 'XAU'(黄金)
  type: 'fund' | 'gold';
  name?: string;
  shares: number; // 基金份额 或 黄金克数
  cost: number; // 成本金额(元)
}

export interface PortfolioItem {
  code: string;
  name: string;
  type: string;
  shares: number;
  cost: number;
  price: number | null;
  pct: number | null;
  market: number | null;
  pnl: number | null;
  pnlPct: number | null;
  estimated?: boolean;
}

export interface PortfolioSummary {
  totalMarket: number;
  totalCost: number;
  totalPnl: number;
  totalPnlPct: number;
}

export interface Portfolio {
  items: PortfolioItem[];
  summary: PortfolioSummary;
}

export interface WatchItem {
  symbol: string;
  type: string;
  name?: string;
}

export interface ChartPoint {
  x: string;
  y: number;
}

// 盯盘卡片的数据快照：主面板卡片、浏览器版详情 Modal、独立大图表窗口共用
export interface CardData {
  key: string;
  symbol: string;
  name: string;
  isGold: boolean;
  isFixed?: boolean;
  unit?: string;
  price: number | null;
  pct: number | null;
  change: number | null;
  sub?: string;
  series: number[];
  prevClose?: number; // 昨收，用于分时图 0% 基准线
  triggered: boolean;
}
