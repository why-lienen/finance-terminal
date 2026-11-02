import { useCallback, useEffect, useRef, useState } from 'react';
import { getMonitor } from './api/market';
import type { Gold, Stock } from './types';
import { loadAlerts, pushAlertLog } from './store/alerts';
import { playAlertSound } from './alertAudio';
import { sendNotify } from './alertNotify';
import { fmt } from './utils';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

// 一次性加载 + 手动刷新
export function useAsync<T>(fn: () => Promise<T>, deps: React.DependencyList = []) {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null });
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const run = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fnRef.current();
      setState({ data, loading: false, error: null });
    } catch (e: any) {
      setState({ data: null, loading: false, error: e?.message || '加载失败' });
    }
  }, []);
  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { ...state, reload: run };
}

// 定时轮询（默认 20s）；intervalMs<=0 关闭轮询
export function usePolling<T>(fn: () => Promise<T>, intervalMs = 20000, deps: React.DependencyList = []) {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null });
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const run = useCallback(async () => {
    try {
      const data = await fnRef.current();
      setState((s) => ({ ...s, data, loading: false, error: null }));
    } catch (e: any) {
      setState((s) => ({ ...s, loading: false, error: e?.message || '加载失败' }));
    }
  }, []);
  useEffect(() => {
    run();
    if (intervalMs > 0) {
      const id = setInterval(run, intervalMs);
      return () => clearInterval(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, ...deps]);
  return { ...state, reload: run };
}

export interface ToastItem {
  id: number;
  title: string;
  body: string;
  kind: 'up' | 'down';
}

export interface RealtimeState {
  gold: Gold | null;
  stocks: Record<string, Stock>; // 以 code 为键
  series: Record<string, number[]>; // 滚动价格窗口，键同 stocks 或 'GOLD'
  triggered: Record<string, boolean>; // 当前是否处于触发态（用于闪烁）
  loading: boolean;
  error: string | null;
  lastUpdate: number;
  toasts: ToastItem[];
  dismissToast: (id: number) => void;
}

const MAX_POINTS = 120; // 约 10 分钟（5s 轮询）

function pushPoint(arr: number[] | undefined, v: number): number[] {
  const next = arr ? arr.slice() : [];
  next.push(v);
  if (next.length > MAX_POINTS) next.splice(0, next.length - MAX_POINTS);
  return next;
}

function keyByCode(list: Stock[]): Record<string, Stock> {
  const m: Record<string, Stock> = {};
  for (const s of list) m[s.code] = s;
  return m;
}

// 实时盯盘引擎：每 intervalMs 拉一次合并接口，维护滚动曲线 + 触发阈值提醒
export function useRealtimeMonitor(
  symbols: string[],
  opts?: { withGold?: boolean; intervalMs?: number },
): RealtimeState {
  const withGold = opts?.withGold ?? true;
  const intervalMs = opts?.intervalMs ?? 5000;
  const symbolsKey = symbols.filter(Boolean).join(',');

  const [gold, setGold] = useState<Gold | null>(null);
  const [stocks, setStocks] = useState<Record<string, Stock>>({});
  const [series, setSeries] = useState<Record<string, number[]>>({});
  const [triggered, setTriggered] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState(0);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const seriesRef = useRef<Record<string, number[]>>({});
  const latestRef = useRef<{ gold: Gold | null; stocks: Record<string, Stock> }>({ gold: null, stocks: {} });
  const triggeredRef = useRef<Record<string, boolean>>({});
  const toastId = useRef(1);

  const dismissToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const fireAlert = useCallback(
    (symbol: string, name: string, dir: 'up' | 'down', price: number, threshold: number) => {
      const id = toastId.current++;
      const title = `⚠ ${name} ${dir === 'up' ? '突破上限' : '跌破下限'}`;
      const body = `现价 ${fmt(price)}（预警线 ${fmt(threshold)}）`;
      playAlertSound();
      sendNotify(title, body);
      setToasts((t) => [...t, { id, title, body, kind: dir }]);
      pushAlertLog({ symbol, name, dir, price, threshold, time: Date.now() });
      setTimeout(() => dismissToast(id), 8000);
    },
    [dismissToast],
  );

  const checkAlerts = useCallback(() => {
    const { gold: g, stocks: st } = latestRef.current;
    const alerts = loadAlerts();
    const snap: { symbol: string; price: number; name: string }[] = [];
    if (g) snap.push({ symbol: 'GOLD', price: g.price, name: '国际金价' });
    for (const code in st) snap.push({ symbol: code, price: st[code].price, name: st[code].name });
    for (const item of snap) {
      const rule = alerts[item.symbol];
      if (!rule || !rule.enabled) {
        triggeredRef.current[item.symbol] = false;
        continue;
      }
      let hit = false;
      let dir: 'up' | 'down' = 'up';
      let thr = 0;
      if (rule.upper != null && item.price >= rule.upper) {
        hit = true;
        dir = 'up';
        thr = rule.upper;
      } else if (rule.lower != null && item.price <= rule.lower) {
        hit = true;
        dir = 'down';
        thr = rule.lower;
      }
      const was = triggeredRef.current[item.symbol];
      if (hit && !was) {
        triggeredRef.current[item.symbol] = true;
        setTriggered((prev) => ({ ...prev, [item.symbol]: true }));
        fireAlert(item.symbol, item.name, dir, item.price, thr);
      } else if (!hit && was) {
        triggeredRef.current[item.symbol] = false;
        setTriggered((prev) => ({ ...prev, [item.symbol]: false }));
      }
    }
  }, [fireAlert]);

  const tick = useCallback(async () => {
    const secids = symbolsKey ? symbolsKey.split(',') : [];
    try {
      const data = await getMonitor(secids);
      const newSeries = { ...seriesRef.current };
      if (withGold && data.gold) newSeries['GOLD'] = pushPoint(newSeries['GOLD'], data.gold.price);
      const map = keyByCode(data.stocks);
      for (const code in map) newSeries[code] = pushPoint(newSeries[code], map[code].price);
      seriesRef.current = newSeries;
      latestRef.current = { gold: withGold ? data.gold : null, stocks: map };
      setSeries(newSeries);
      setGold(withGold ? data.gold : null);
      setStocks(map);
      setError(null);
      setLastUpdate(Date.now());
    } catch (e: any) {
      setError(e?.message || '行情刷新失败');
    } finally {
      setLoading(false);
    }
    checkAlerts();
  }, [symbolsKey, withGold, checkAlerts]);

  useEffect(() => {
    tick();
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [tick, intervalMs]);

  return { gold, stocks, series, triggered, loading, error, lastUpdate, toasts, dismissToast };
}
