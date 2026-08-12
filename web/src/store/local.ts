import type { Holding, WatchItem } from '../types';

const H_KEY = 'ft_holdings_v1';
const W_KEY = 'ft_watchlist_v1';

export function loadHoldings(): Holding[] {
  try {
    const v = JSON.parse(localStorage.getItem(H_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function saveHoldings(h: Holding[]) {
  localStorage.setItem(H_KEY, JSON.stringify(h));
}

export function loadWatch(): WatchItem[] {
  try {
    const v = JSON.parse(localStorage.getItem(W_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function saveWatch(w: WatchItem[]) {
  localStorage.setItem(W_KEY, JSON.stringify(w));
}
