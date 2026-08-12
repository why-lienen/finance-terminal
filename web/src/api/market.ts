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

export function getFundRank(ft: string, pn: number) {
  return api.get<FundRankRow[]>('/market/funds/rank?ft=' + ft + '&pn=' + pn).then((r) => r.data);
}
