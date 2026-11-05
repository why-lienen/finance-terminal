// 详情 / 设预警面板：主窗口的小 Modal（浏览器模式）与独立大图表窗口共用。
// 用 React.memo 包裹，避免主窗口每 5 秒行情刷新把详情内容连带重渲染（用户反馈「一闪一下」）。
import { memo, useState } from 'react';
import type { CardData } from '../types';
import { getAlert, setAlert, removeAlert } from '../store/alerts';
import { ensureAudio, playAlertSound } from '../alertAudio';
import { sendNotify } from '../alertNotify';
import { fmt } from '../utils';
import StockChart from './StockChart';

interface Props {
  card: CardData;
  onClose: () => void;
  chartLarge?: boolean; // 独立大窗口：图表铺满窗口宽高、隐藏缩放条
  hideHeader?: boolean; // 大窗口顶部已有现价条，隐藏这里重复的一行
  closeOnSave?: boolean; // 大窗口保存预警后不关窗
}

function DetailPanelBase({
  card,
  onClose,
  chartLarge = false,
  hideHeader = false,
  closeOnSave = true,
}: Props) {
  const key = card.key;
  const unit = card.unit || (card.isGold ? '美元/盎司' : '');
  const existing = getAlert(key);
  const [upper, setUpper] = useState<string>(existing?.upper != null ? String(existing.upper) : '');
  const [lower, setLower] = useState<string>(existing?.lower != null ? String(existing.lower) : '');
  const [enabled, setEnabled] = useState<boolean>(existing?.enabled ?? true);
  const [saved, setSaved] = useState(false);

  function save() {
    const u = parseFloat(upper);
    const l = parseFloat(lower);
    setAlert(key, {
      upper: Number.isFinite(u) ? u : undefined,
      lower: Number.isFinite(l) ? l : undefined,
      enabled,
      name: card.name, // 把名称一并存下，预警列表不依赖标的是否仍在监控
    });
    if (closeOnSave) {
      onClose();
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }
  function delRule() {
    removeAlert(key);
    setUpper('');
    setLower('');
    setSaved(false);
  }
  function test() {
    ensureAudio();
    playAlertSound();
    sendNotify(`🔔 ${card.name} 测试提醒`, `这是一条测试通知（现价 ${fmt(card.price ?? 0)}）`);
  }

  return (
    <div>
      {!hideHeader && (
        <div className="form" style={{ marginBottom: 12 }}>
          <span className="muted">现价</span>
          <span className="big" style={{ fontSize: 20 }}>{card.price != null ? fmt(card.price) : '—'}</span>
        </div>
      )}

      {card.isGold ? (
        <>
          <StockChart gold name="COMEX黄金（国际金价）" livePrice={card.price ?? undefined} large={chartLarge} />
          <div className="muted" style={{ marginTop: 4 }}>
            走势图数据源：COMEX 黄金期货连续（东财，源端约 10 分钟延迟）；1 分钟图末端由新浪零延迟报价按分钟自采补点，标「数据截至 HH:MM」，虚线区分。实时价见上方「现价」。
          </div>
        </>
      ) : (
        <StockChart
          secid={card.symbol}
          name={card.name}
          prevClose={card.prevClose}
          livePrice={card.price ?? undefined}
          large={chartLarge}
        />
      )}

      <div style={{ marginTop: 16 }}>
        <div className="muted" style={{ marginBottom: 8 }}>到价提醒（价格触及即弹窗+声音+系统通知）</div>
        <div className="form">
          <label>突破上限 ↑</label>
          <input className="cell" type="number" step="0.01" placeholder={card.isGold ? '如 3950' : card.price != null ? '如 ' + fmt(card.price) : '输入价格'} value={upper} onChange={(e) => setUpper(e.target.value)} />
          <label>跌破下限 ↓</label>
          <input className="cell" type="number" step="0.01" placeholder={card.isGold ? '如 3850' : card.price != null ? '如 ' + fmt(card.price) : '输入价格'} value={lower} onChange={(e) => setLower(e.target.value)} />
          {unit && <div className="muted" style={{ marginTop: 4 }}>单位：{unit}（与现价口径一致）</div>}
        </div>
        <div className="form" style={{ marginTop: 6 }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} style={{ width: 'auto' }} />
            启用该预警
          </label>
        </div>
        <div className="form" style={{ marginTop: 10, alignItems: 'center' }}>
          <button className="primary" onClick={save}>保存预警</button>
          <button onClick={test}>测试提醒</button>
          {existing && <button className="danger" onClick={delRule}>删除预警</button>}
          {saved && <span className="muted">已保存 ✓</span>}
        </div>
      </div>
    </div>
  );
}

export default memo(DetailPanelBase);
