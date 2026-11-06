// 已见事件 ID 持久化：配合公告栏的「新事件弹窗」，避免同一事件重复提醒。
// 复用 db.ts 的磁盘镜像，使已见记录跨来源/重启稳定保存。
import { mirrorToDisk } from './db';

const KEY = 'ft_seen_events_v1';

export function loadSeenEvents(): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return new Set(Array.isArray(v) ? v : []);
  } catch {
    return new Set();
  }
}

export function saveSeenEvents(s: Set<string>): void {
  const arr = Array.from(s).slice(-500); // 限制大小，避免无限增长
  localStorage.setItem(KEY, JSON.stringify(arr));
  mirrorToDisk(KEY, arr);
}
