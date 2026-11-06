// 预警规则 + 触发日志（仅存本地，专属/私密）
import { mirrorToDisk } from './db';

export interface AlertRule {
  upper?: number; // 价格 >= upper 触发（突破上限）
  lower?: number; // 价格 <= lower 触发（跌破下限）
  enabled: boolean;
  name?: string; // 标的名称（创建预警时一并保存，列表展示优先用，避免标的被移出监控后只显示代码）
}

export interface AlertLogEntry {
  symbol: string;
  name: string;
  dir: 'up' | 'down';
  price: number;
  threshold: number;
  time: number;
}

const KEY = 'ft_alerts_v1';
const LOG_KEY = 'ft_alertlog_v1';

export function loadAlerts(): Record<string, AlertRule> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

export function saveAlerts(a: Record<string, AlertRule>) {
  localStorage.setItem(KEY, JSON.stringify(a));
  mirrorToDisk(KEY, a);
}

export function getAlert(symbol: string): AlertRule | undefined {
  return loadAlerts()[symbol];
}

export function setAlert(symbol: string, rule: AlertRule) {
  const a = loadAlerts();
  a[symbol] = rule;
  saveAlerts(a);
}

export function removeAlert(symbol: string) {
  const a = loadAlerts();
  delete a[symbol];
  saveAlerts(a);
}

export function loadAlertLog(): AlertLogEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function pushAlertLog(e: AlertLogEntry) {
  const list = loadAlertLog();
  list.unshift(e);
  if (list.length > 5) list.length = 5; // 只保留最近 5 条触发记录，避免无限增长
  localStorage.setItem(LOG_KEY, JSON.stringify(list));
  mirrorToDisk(LOG_KEY, list);
}
