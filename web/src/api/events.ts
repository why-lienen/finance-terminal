// 公告栏事件类型（与后端 /api/events 返回结构对应）
// 数据源：新浪 7x24 财经快讯（已按国际 / 黄金关键词过滤）
export interface MarketEvent {
  id: string; // docid，稳定唯一，用于去重 / 新事件检测
  time: string; // 'MM-DD HH:mm'，真实发布时间（不再有 00:00 假时间）
  title: string; // 快讯标题，如「光大期货1106黄金点评：非农定价窗口开启，现货黄金考验4100美元关口」
  region: string; // 新浪快讯无地区字段，留空（靠关键词保证国际/黄金相关性）
  type: string;
  importance: number; // 2=黄金直接相关(红点) / 1=国际宏观(琥珀点)
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
