import { useState } from 'react';
import type { MarketEvent, EventToast } from '../api/events';

function impClass(i: number) {
  if (i >= 2) return 'ab-imp hi'; // 较高重要度（经济数据等）
  if (i === 1) return 'ab-imp mid';
  return 'ab-imp';
}

// 顶部常驻公告栏：展示未来 14 天内的全球重大事件（央行决议 / 经济数据 / 重大会议）
export function AnnouncementBar({ events }: { events: MarketEvent[] }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="announce-bar">
      <span className="ab-label">📰 重大事件</span>
      {events.length === 0 && <span className="ab-empty">暂无即将到来的重大事件</span>}
      {open &&
        events.map((e) => (
          <span className="ab-item" key={e.id} title={e.desc || e.title}>
            <span className={impClass(e.importance)} />
            <span className="ab-time">{e.time.slice(5, 16)}</span>
            {e.region && <span className="ab-region">{e.region}</span>}
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
            {t.region ? t.region + ' · ' : ''}
            {t.time}
          </div>
        </div>
      ))}
    </div>
  );
}
