import { useEffect, useState } from 'react';
import { useRealtimeMonitor } from '../hooks';
import { getKline, getGoldKline } from '../api/market';
import { cls, fmt, fmtPct } from '../utils';
import MinuteSpark from './MinuteSpark';

interface Props {
  secid: string;
  name: string;
  code: string;
  kind: 'gold' | 'stock' | 'fixed';
}

interface Point {
  t: string;
  v: number;
}

// 只展示最近 10 根 1 分钟 K 线（≈10 分钟）。
// 注意：东方财富对 1min 的 lmt 参数不生效，会返回几百根，因此前端自行 slice(-10)。
const RECENT = 10;

// 从主面板「拖出」的独立浮窗：实时价格 + 今日涨跌幅 + 真实 1 分钟走势。
// 窗口本身 alwaysOnTop，拖动标题栏可移到屏幕任意位置；拖回主面板范围自动收回，✕ 也可关闭。
export default function FloatWidget({ secid, name, code, kind }: Props) {
  const isGold = kind === 'gold';
  const { gold, stocks } = useRealtimeMonitor(isGold ? [] : [secid], {
    withGold: isGold,
    intervalMs: 5000,
    silent: true, // 浮窗只展示，不重复触发报警（主窗口负责响铃/通知/触发记录）
  });

  const price = isGold ? gold?.price : stocks[code]?.price;
  const pct = isGold ? gold?.pct : stocks[code]?.pct;

  const [points, setPoints] = useState<Point[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const d = isGold ? await getGoldKline('1min', 30) : await getKline(secid, '1min', 30);
        if (cancelled) return;
        const list = (d.list || []).slice(-RECENT).map((x) => ({ t: x.date, v: x.close }));
        // 失败 / 空数据时保留上一次的点，不清空，避免浮窗闪烁
        if (list.length) setPoints(list);
      } catch (_) {
        /* 保留上一次数据 */
      }
    }
    load();
    const id = setInterval(load, 60000); // 1 分钟才出一根新 K，无需更频繁
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [secid, isGold]);

  // 透明偏好跟随主窗口：主进程 executeJavaScript 切 body class 为主，
  // 这里再监听 IPC 广播兜底（菜单栏切换 / 启动读回偏好），保证小窗与主窗口同白板、同透明。
  useEffect(() => {
    const shell = (window as any).appShell;
    if (shell && shell.onTransparency) {
      shell.onTransparency((v: boolean) => document.body.classList.toggle('transparent-bg', !!v));
    }
  }, []);

  const close = () => {
    const shell = (window as any).appShell;
    if (shell && shell.closeFloat) shell.closeFloat();
  };

  return (
    <div className="float-widget">
      <div className="float-card">
        <div className="float-head">
          <span className="float-name">{name}</span>
          <span className="float-sub muted">{isGold ? '伦敦金 XAU/USD' : kind === 'fixed' ? '全球/期货' : code}</span>
          <button className="float-x" title="收回面板" onClick={close}>✕</button>
        </div>

        <div className="float-price">
          <span className="big">{price != null ? fmt(price) : '—'}</span>
          {pct != null && <span className={'tag ' + cls(pct)}>{fmtPct(pct)}</span>}
        </div>

        <div className="float-spark">
          <MinuteSpark points={points} height={140} />
        </div>

        <div className="float-foot muted">1分钟走势 · 最近10分钟 · 每1分钟更新 · 拖动标题栏移动</div>
      </div>
    </div>
  );
}
