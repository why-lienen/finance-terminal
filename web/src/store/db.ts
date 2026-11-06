// 跨来源持久化层
//
// 问题：自选股 / 预警 / 触发记录 / 持仓 原先全存 localStorage，而 localStorage 按「来源(origin)」隔离。
// 本 app 加载地址会在 Vite(localhost:5173) 与 内置服务(127.0.0.1:端口) 之间切换；
// 内置服务端口被占用时还会随机分配（api/server.js 的 listen）。来源一变，旧 localStorage 就读不到 → 记录被清空。
//
// 修法：以磁盘文件(userData/app-data.json)为权威存储，localStorage 仅作当前来源的缓存：
//   1) 每次写入：先写 localStorage（保持原有同步 API 不变），再把值镜像到磁盘（异步，不阻塞 UI）；
//   2) 启动时：从磁盘把「当前来源缺失的键」回填到 localStorage，从而与加载地址彻底解耦，重启不再丢数据。
const KEYS = ['ft_holdings_v1', 'ft_watchlist_v1', 'ft_alerts_v1', 'ft_alertlog_v1'];

type AnyObj = Record<string, unknown>;
function getShell(): AnyObj | null {
  if (typeof window === 'undefined') return null;
  const s = (window as unknown as AnyObj).appShell;
  return s && typeof s === 'object' ? (s as AnyObj) : null;
}

// 启动时调用一次：把磁盘里已有的键回填到当前来源的 localStorage（已有值不覆盖，避免误清当前来源数据）
export async function migrateFromDisk(): Promise<void> {
  const s = getShell();
  if (!s || typeof s.dbGet !== 'function') return; // 浏览器模式无磁盘存储，跳过
  for (const k of KEYS) {
    try {
      if (localStorage.getItem(k) != null) continue;
      const v = await s.dbGet(k);
      if (v !== null && v !== undefined) localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* 忽略单键失败，不影响其它键 */
    }
  }
}

// 写 localStorage 后立即镜像到磁盘（fire-and-forget，失败不影响本次 UI）
export function mirrorToDisk(key: string, value: unknown): void {
  const s = getShell();
  if (!s || typeof s.dbSet !== 'function') return;
  try {
    s.dbSet(key, value);
  } catch {
    /* 忽略 */
  }
}
