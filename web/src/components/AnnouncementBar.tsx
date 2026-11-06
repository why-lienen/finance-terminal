import { useState } from 'react';
import type { MarketEvent, EventToast } from '../api/events';

function impClass(i: number) {
  if (i >= 2) return 'ab-imp hi'; // 黄金直接相关 → 红点
  if (i === 1) return 'ab-imp mid'; // 国际宏观 → 琥珀点
  return 'ab-imp';
}

// 顶部常驻公告栏：展示国际 / 黄金相关的实时突发快讯（新浪 7x24，已按关键词过滤）
export function AnnouncementBar({ events }: { events: MarketEvent[] }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="announce-bar">
      <span className="ab-label">📰 国际快讯</span>
      {events.length === 0 && <span className="ab-empty">暂无国际 / 黄金相关快讯</span>}
      {open &&
        events.map((e) => (
          <span className="ab-item" key={e.id} title={e.desc || e.title}>
            <span className={impClass(e.importance)} />
            <span className="ab-time">{e.time}</span>
            <span>{e.title}</span>
          </span>
        ))}
      <span className="ab-toggle" onClick={() => setOpen((o) => !o)}>
        {open ? '收起' : `展开(${events.length})`}
      </span>
    </div>
  );
}

// 新事件 Toast（金十式 push）：右上角弹出，点击消除，9 秒后自动消失
export function EventToasts({
  toasts,
  onDismiss,
}: {
  toasts: EventToast[];
  onDismiss: (id: string) => void;
}) {
  if (!toasts.length) return null;
  return (
    <div className="event-toasts">
      {toasts.map((t) => (
        <div className="etoast" key={t.id} onClick={() => onDismiss(t.id)}>
          <div className="et-title">📰 {t.title}</div>
          <div className="et-meta">
            {t.region ? t.region + ' · ' : '国际 · '}
            {t.time}
          </div>
        </div>
      ))}
    </div>
  );
}
