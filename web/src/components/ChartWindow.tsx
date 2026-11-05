// 独立「放大图表」窗口的内容：?chart=1&secid=...&name=...&code=...&kind=...
// 由主进程新开一个约 1000x760 的 BrowserWindow 承载，不经过 Layout / Modal，
// 因此图表可以真正铺满整个窗口（不再是主窗口 500x720 里的小框）。
import { useMemo } from 'react';
import { useRealtimeMonitor } from '../hooks';
import { cls, fmt, fmtPct } from '../utils';
import type { CardData } from '../types';
import DetailPanel from './DetailPanel';

interface Props {
  secid: string;
  name: string;
  code: string;
  kind: 'gold' | 'stock' | 'fixed';
  prevClose?: number;
  unit?: string;
  sub?: string;
}

export default function ChartWindow({ secid, name, code, kind, prevClose, unit, sub }: Props) {
  const isGold = kind === 'gold';
  const { gold, stocks } = useRealtimeMonitor(isGold ? [] : [secid], {
    withGold: isGold,
    intervalMs: 5000,
    silent: true, // 大窗口只展示，不重复触发报警
  });
  const price = isGold ? gold?.price : stocks[code]?.price;
  const pct = isGold ? gold?.pct : stocks[code]?.pct;

  const card: CardData = useMemo(
    () => ({
      key: code,
      symbol: secid,
      name,
      isGold,
      isFixed: kind === 'fixed',
      unit,
      sub,
      price: price ?? null,
      pct: pct ?? null,
      change: null,
      series: [],
      prevClose,
      triggered: false,
    }),
    [code, secid, name, isGold, kind, unit, sub, price, pct, prevClose],
  );

  const close = () => {
    const shell = (window as any).appShell;
    // app:float-close 是通用的「关掉发消息的这个窗口」，图表窗口复用它
    if (shell && shell.closeFloat) shell.closeFloat();
  };

  return (
    <div className="chart-window">
      <div className="chart-head">
        <div className="chart-head-left">
          <span className="chart-title">{name}</span>
          <span className="muted chart-sub">
            {isGold ? 'COMEX 黄金（国际金价）' : kind === 'fixed' ? sub || '全球/期货' : code}
          </span>
        </div>
        <div className="chart-head-price">
          <span className="big">{price != null ? fmt(price) : '—'}</span>
          {pct != null && <span className={'tag ' + cls(pct)} title="今日涨跌幅（相对昨收）">{fmtPct(pct)}</span>}
          <span
            className="muted chart-head-hint"
            title="东财对黄金 / WTI 的 1 分钟 K 线恒定滞后约 10 分钟；末端由新浪零延迟报价按分钟自采补点，图表会标注数据截至时间。非交易所实时推送。"
          >
            源端约 10 分钟 · 末端实时补点
          </span>
        </div>
        <button className="chart-close" title="关闭图表窗口" onClick={close}>✕</button>
      </div>
      <div className="chart-body">
        <DetailPanel card={card} onClose={close} chartLarge hideHeader closeOnSave={false} />
      </div>
    </div>
  );
}
