import { api } from './client';
import type { FundEst, Gold, Stock, FundRankRow } from '../types';

// 行情接口（后端无状态代理）
export function getFundEst(code: string) {
  return api.get<FundEst>('/market/fund/estimate?code=' + code).then((r) => r.data);
}

export function getGold() {
  return api.get<Gold>('/market/gold').then((r) => r.data);
}

export function getStocks(secids: string[]) {
  if (!secids.length) return Promise.resolve<Stock[]>([]);
  return api.get<Stock[]>('/market/stocks?secids=' + secids.join(',')).then((r) => r.data);
}

// 实时盯盘合并接口：一次拿回 国际金价 + 全部自选标的
export function getMonitor(secids: string[]) {
  const qs = secids.length ? '?secids=' + secids.join(',') : '';
  return api.get<{ gold: Gold | null; stocks: Stock[] }>('/market/monitor' + qs).then((r) => r.data);
}

export interface SearchResult {
  code: string;
  secid: string;
  name: string;
  type: string;
}
export function getSearch(kw: string) {
  return api.get<SearchResult[]>('/market/search?kw=' + encodeURIComponent(kw)).then((r) => r.data);
}

export function getFundRank(ft: string, pn: number) {
  return api.get<FundRankRow[]>('/market/funds/rank?ft=' + ft + '&pn=' + pn).then((r) => r.data);
}

export function getFundHistory(code: string, range = '1y') {
  return api.get<{ date: string; nav: number; acc: number }[]>('/market/fund/history?code=' + code + '&range=' + range).then((r) => r.data);
}

// 1 分钟 K 线的末端可能由「新浪实时报价自采补点」拼接而来（东财对国际商品滞后约 10 分钟）。
// realtime=true 的 bar 会在图表里用虚线/半透明区分；asOf 是序列最后一根的时间。
export interface KlineBar {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  vol: number;
  realtime?: boolean;
}
export interface KlineResult {
  code: string;
  name: string;
  period: string;
  list: KlineBar[];
  asOf?: string | null;
  realtimeCount?: number;
  realtimeFrom?: string;
  sourceNote?: string;
}

export function getKline(secid: string, period = 'day', limit = 60) {
  return api
    .get<KlineResult>('/market/stock/kline?secid=' + secid + '&period=' + period + '&limit=' + limit)
    .then((r) => r.data);
}

export interface IntradayPoint {
  t: string; // "2026-11-03 09:30"
  price: number;
  avg: number | null; // 均价（指数类标的无均价时为 null，前端须跳过，不可当作 0 参与 Y 轴）
  vol: number; // 成交量(手)
}
export interface IntradayResult {
  code: string;
  name: string;
  days: number;
  list: IntradayPoint[];
  asOf?: string | null;
}
export function getIntraday(secid: string, days = 1) {
  return api
    .get<IntradayResult>('/market/stock/intraday?secid=' + secid + '&days=' + days)
    .then((r) => r.data);
}

// 国际金价历史走势：COMEX 黄金期货连续（与伦敦金同价，美元/盎司）
export function getGoldIntraday(days = 1) {
  return api
    .get<IntradayResult>('/market/gold/intraday?days=' + days)
    .then((r) => r.data);
}
export function getGoldKline(period = 'day', limit = 120) {
  return api
    .get<KlineResult>('/market/gold/kline?period=' + period + '&limit=' + limit)
    .then((r) => r.data);
}
