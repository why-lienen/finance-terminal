// 公告栏事件类型（与后端 /api/events 返回结构对应）
export interface MarketEvent {
  id: string; // FE_CODE，稳定唯一，用于去重 / 新事件检测
  time: string; // 'YYYY-MM-DD HH:mm'
  title: string; // 事件名，如「美国:非农就业人数(报告期:2026年11月)」
  region: string; // 地区/国家，如「美国」「欧盟」
  type: string; // 类型，如「经济数据」「行业会议」
  importance: number; // 重要度（STD_TYPE_CODE，越大越重要）
  desc: string;
}

// 新事件弹窗（金十式 push）
export interface EventToast {
  id: string;
  title: string;
  region: string;
  time: string;
}

// 拉取「即将到来的重大事件」。桌面 app 走内置服务（同源 /api/events，已代理掉 CORS）；
// 纯浏览器开发模式该接口 404 时优雅返回空数组，公告栏显示空态。
export async function fetchEvents(): Promise<MarketEvent[]> {
  try {
    const r = await fetch('/api/events', { cache: 'no-store' });
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j.events) ? (j.events as MarketEvent[]) : [];
  } catch {
    return [];
  }
}
