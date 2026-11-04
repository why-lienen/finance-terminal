import { useEffect, useMemo, useRef, useState } from 'react';
import { getSearch, type SearchResult } from '../api/market';
import { loadWatch, saveWatch } from '../store/local';
import type { WatchItem, Stock } from '../types';
import { useRealtimeMonitor } from '../hooks';
import { cls, fmt, fmtPct } from '../utils';
import Sparkline from '../components/Sparkline';
import StockChart from '../components/StockChart';
import Modal from '../components/Modal';
import { getAlert, setAlert, removeAlert, loadAlerts, loadAlertLog, type AlertLogEntry } from '../store/alerts';
import { ensureAudio, playAlertSound, setSoundEnabled } from '../alertAudio';
import { canNotify, requestNotify, sendNotify, notifyPermission } from '../alertNotify';

function codeOf(symbol: string) {
  const p = symbol.split('.');
  return p[1] || symbol;
}
const GOLD_KEY = 'GOLD';

// 固定盯盘标的（与金价并列，常驻不可删）：美油 WTI + 美元指数 DXY
// secid 为东方财富全球/期货代码；实时价与走势图共用同一数据源，避免金价那种"实时价与图末点对不上"
const FIXED_ASSETS = [
  { key: 'CL00Y', symbol: '102.CL00Y', name: '美油 WTI', sub: 'NYMEX WTI 原油', unit: '美元/桶' },
  { key: 'UDI', symbol: '100.UDI', name: '美元指数', sub: '美元指数 DXY', unit: '' },
];

interface CardData {
  key: string;
  symbol: string;
  name: string;
  isGold: boolean;
  isFixed?: boolean;
  unit?: string;
  price: number | null;
  pct: number | null;
  change: number | null;
  sub?: string; // 副标题（如金价来源）
  series: number[];
  prevClose?: number; // 昨收，用于分时图 0% 基准线
  triggered: boolean;
}

export default function Terminal() {
  const [watch, setWatch] = useState<WatchItem[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<CardData | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [notifyState, setNotifyState] = useState<NotificationPermission>('default');
  const boxRef = useRef<HTMLDivElement>(null);
  // 仅在 Electron 菜单栏 app 内（preload 注入了 window.appShell）显示「收起窗口」按钮
  const isElectron = typeof window !== 'undefined' && !!(window as any).appShell;

  const stockWatch = useMemo(() => watch.filter((x) => x.type === 'stock'), [watch]);
  const symbols = useMemo(
    () => [...stockWatch.map((w) => w.symbol), ...FIXED_ASSETS.map((a) => a.symbol)],
    [stockWatch],
  );

  const { gold, stocks, series, triggered, loading, error, lastUpdate, toasts, dismissToast } =
    useRealtimeMonitor(symbols, { withGold: true, intervalMs: 5000 });

  useEffect(() => {
    setWatch(loadWatch());
    setSoundEnabled(true);
    if (canNotify()) setNotifyState(Notification.permission);
  }, []);

  // 防抖搜索
  useEffect(() => {
    const kw = query.trim();
    if (!kw) {
      setResults([]);
      setOpen(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await getSearch(kw);
        setResults(r);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  // 点击外部关闭下拉
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function add(sec: string, nm: string) {
    if (!sec) return;
    if (loadWatch().some((x) => x.symbol === sec) || FIXED_ASSETS.some((a) => a.symbol === sec)) {
      setQuery('');
      setResults([]);
      setOpen(false);
      return;
    }
    const w = loadWatch().filter((x) => x.symbol !== sec);
    w.push({ symbol: sec, type: 'stock', name: nm });
    saveWatch(w);
    setWatch(w);
    setQuery('');
    setResults([]);
    setOpen(false);
  }
  function del(sym: string) {
    saveWatch(loadWatch().filter((x) => x.symbol !== sym));
    setWatch(loadWatch());
    removeAlert(codeOf(sym));
  }

  function toggleSound() {
    const next = !soundOn;
    if (next) {
      ensureAudio(); // 用户手势，初始化音频
      playAlertSound();
    }
    setSoundOn(next);
    setSoundEnabled(next);
  }
  async function enableNotify() {
    const p = await requestNotify();
    setNotifyState(p);
  }

  // 组装卡片数据
  const cards: CardData[] = [];
  if (gold) {
    cards.push({
      key: GOLD_KEY,
      symbol: GOLD_KEY,
      name: '国际金价',
      isGold: true,
      price: gold.price,
      pct: gold.pct ?? null,
      change: gold.change ?? null,
      sub: gold.unit ? `伦敦金 XAU/USD · ${gold.unit}` : '伦敦金 XAU/USD',
      series: series[GOLD_KEY] || [],
      triggered: !!triggered[GOLD_KEY],
    });
  }
  for (const w of stockWatch) {
    const code = codeOf(w.symbol);
    const s = stocks[code];
    cards.push({
      key: code,
      symbol: w.symbol,
      name: s?.name || w.name || w.symbol,
      isGold: false,
      price: s ? s.price : null,
      pct: s ? s.pct : null,
      change: s ? s.change : null,
      series: series[code] || [],
      prevClose: s ? s.prevClose : undefined,
      triggered: !!triggered[code],
    });
  }
  // 固定盯盘标的：美油 WTI + 美元指数（常驻，不可删）
  for (const a of FIXED_ASSETS) {
    const s = stocks[a.key];
    cards.push({
      key: a.key,
      symbol: a.symbol,
      name: a.name,
      isGold: false,
      isFixed: true,
      sub: a.sub,
      unit: a.unit || undefined,
      price: s ? s.price : null,
      pct: s ? s.pct : null,
      change: s ? s.change : null,
      series: series[a.key] || [],
      prevClose: s ? s.prevClose : undefined,
      triggered: !!triggered[a.key],
    });
  }

  const ruleOf = (key: string) => getAlert(key);

  return (
    <div>
      {/* 控制条 */}
      <div className="term-bar">
        <div className="search-box term-search" ref={boxRef}>
          <input
            placeholder="添加监控标的：粤传媒、贵州茅台、600519、1.000001"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length && setOpen(true)}
          />
          {searching && <span className="muted search-hint">搜索中…</span>}
          {open && results.length > 0 && (
            <div className="search-dropdown">
              {results.map((r) => (
                <div key={r.secid} className="search-item" onClick={() => add(r.secid, r.name)}>
                  <span className="nm">{r.name}</span>
                  <span className="muted code">{r.code}</span>
                  <span className="muted secid">{r.secid}</span>
                </div>
              ))}
            </div>
          )}
          {open && !searching && results.length === 0 && query.trim() && (
            <div className="search-dropdown">
              <div className="muted" style={{ padding: 10 }}>无匹配结果，试试代码或简称</div>
            </div>
          )}
        </div>

        <div className="term-tools">
          <span className={'term-status ' + (error ? 'bad' : 'ok')}>
            {error ? '连接异常' : loading ? '连接中…' : '● 实时'}
            {lastUpdate > 0 && !error && (
              <span className="muted"> · {new Date(lastUpdate).toLocaleTimeString('zh-CN', { hour12: false })}</span>
            )}
          </span>
          <button className={soundOn ? 'primary' : ''} onClick={toggleSound}>
            {soundOn ? '🔊 提醒音' : '🔇 静音'}
          </button>
          {notifyState === 'granted' ? (
            <span className="pill ok">通知已开</span>
          ) : notifyState === 'denied' ? (
            <span className="pill">通知被拒</span>
          ) : (
            <button onClick={enableNotify}>开启系统通知</button>
          )}
          {isElectron && (
            <button className="app-close" title="收起盯盘窗口" onClick={() => (window as any).appShell.close()}>✕</button>
          )}
        </div>
      </div>

      {/* 监控看板 */}
      <div className="board">
        {cards.map((c) => {
          const rule = ruleOf(c.key);
          return (
            <div
              key={c.key}
              className={'mcard' + (c.triggered ? ' alerting' : '')}
              onClick={() => setDetail(c)}
            >
              <div className="mcard-top">
                <div>
                  <div className="mcard-name">{c.name}</div>
                  <div className="muted mcard-sub">{c.isGold || c.isFixed ? c.sub : codeOf(c.symbol)}</div>
                </div>
                {!c.isGold && !c.isFixed && (
                  <button
                    className="mcard-x"
                    onClick={(e) => {
                      e.stopPropagation();
                      del(c.symbol);
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="mcard-price">
                <span className="big">{c.price != null ? fmt(c.price) : '—'}</span>
                {c.pct != null && (
                  <span className={'tag ' + cls(c.pct)}>{fmtPct(c.pct)}</span>
                )}
              </div>

              <div className="mcard-spark">
                <Sparkline values={c.series} height={42} />
              </div>

              <div className="mcard-foot">
                {rule && rule.enabled ? (
                  <span className="alert-line">
                    {rule.upper != null && <span className="up">↑{fmt(rule.upper)}</span>}
                    {rule.upper != null && rule.lower != null && ' · '}
                    {rule.lower != null && <span className="down">↓{fmt(rule.lower)}</span>}
                  </span>
                ) : (
                  <span className="muted">点击设预警</span>
                )}
                {c.triggered && <span className="alert-badge">已触发</span>}
              </div>
            </div>
          );
        })}
        {cards.length === 0 && !loading && (
          <div className="muted" style={{ padding: 24 }}>添加一个标的开始盯盘，国际金价已默认在监控中。</div>
        )}
      </div>

      {/* 预警中心 */}
      <AlertCenter stocks={stocks} />

      {/* 详情 / 设预警 */}
      {detail && (
        <Modal open title={`${detail.name} · 实时曲线`} onClose={() => setDetail(null)}>
          <DetailPanel card={detail} onClose={() => setDetail(null)} />
        </Modal>
      )}

      {/* 提醒 Toast */}
      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={'toast ' + t.kind} onClick={() => dismissToast(t.id)}>
            <div className="toast-title">{t.title}</div>
            <div className="toast-body">{t.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailPanel({ card, onClose }: { card: CardData; onClose: () => void }) {
  const key = card.key;
  const unit = card.unit || (card.isGold ? '美元/盎司' : '');
  const existing = getAlert(key);
  const [upper, setUpper] = useState<string>(existing?.upper != null ? String(existing.upper) : '');
  const [lower, setLower] = useState<string>(existing?.lower != null ? String(existing.lower) : '');
  const [enabled, setEnabled] = useState<boolean>(existing?.enabled ?? true);

  function save() {
    const u = parseFloat(upper);
    const l = parseFloat(lower);
    setAlert(key, {
      upper: Number.isFinite(u) ? u : undefined,
      lower: Number.isFinite(l) ? l : undefined,
      enabled,
      name: card.name, // 把名称一并存下，预警列表不依赖标的是否仍在监控
    });
    onClose();
  }
  function delRule() {
    removeAlert(key);
    onClose();
  }
  function test() {
    ensureAudio();
    playAlertSound();
    sendNotify(`🔔 ${card.name} 测试提醒`, `这是一条测试通知（现价 ${fmt(card.price ?? 0)}）`);
  }

  return (
    <div>
      <div className="form" style={{ marginBottom: 12 }}>
        <span className="muted">现价</span>
        <span className="big" style={{ fontSize: 20 }}>{card.price != null ? fmt(card.price) : '—'}</span>
      </div>

      {card.isGold ? (
        <>
          <StockChart gold name="COMEX黄金（国际金价）" />
          <div className="muted" style={{ marginTop: 4 }}>
            走势图数据源：COMEX 黄金期货连续（与伦敦金现货同价，美元/盎司）。实时价见上方「现价」。
          </div>
        </>
      ) : (
        <StockChart secid={card.symbol} name={card.name} prevClose={card.prevClose} />
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
        <div className="form" style={{ marginTop: 10 }}>
          <button className="primary" onClick={save}>保存预警</button>
          <button onClick={test}>测试提醒</button>
          {existing && <button className="danger" onClick={delRule}>删除预警</button>}
        </div>
      </div>
    </div>
  );
}

function AlertCenter({ stocks }: { stocks: Record<string, Stock> }) {
  const alerts = loadAlerts();
  const log = loadAlertLog();
  const NAME_MAP: Record<string, string> = { [GOLD_KEY]: '国际金价', CL00Y: '美油 WTI', UDI: '美元指数' };
  const UNIT_MAP: Record<string, string> = { [GOLD_KEY]: '美元/盎司', CL00Y: '美元/桶' };
  // 预警键可能是 GOLD/CL00Y/UDI（固定资产）或 A股代码（如 002565）。
  // 优先用创建预警时存的名称，其次已知名称映射，其次实时行情名称，最后兜底显示代码。
  const nameOf = (key: string, r: any) => r?.name || NAME_MAP[key] || stocks[key]?.name || key;
  const entries = Object.entries(alerts).filter(([, r]) => r && (r.upper != null || r.lower != null));
  return (
    <div className="grid cols-2" style={{ marginTop: 18 }}>
      <div className="card">
        <h3>我的预警线</h3>
        {entries.length === 0 && <div className="muted">还没有设置预警，点击任意卡片右上角区域设定价格提醒。</div>}
        {entries.map(([key, r]) => (
          <div className="row" key={key}>
            <span>{nameOf(key, r)}</span>
            <span>
              {r.upper != null && <span className="up">↑{fmt(r.upper)} </span>}
              {r.lower != null && <span className="down">↓{fmt(r.lower)}</span>}
              {UNIT_MAP[key] && (r.upper != null || r.lower != null) && <span className="muted">{UNIT_MAP[key]}</span>}
              {!r.enabled && <span className="muted">（已停用）</span>}
            </span>
          </div>
        ))}
      </div>
      <div className="card">
        <h3>触发记录</h3>
        {log.length === 0 && <div className="muted">暂无触发记录。到价时会在此留痕。</div>}
        {log.slice(0, 12).map((e: AlertLogEntry, i) => (
          <div className="row" key={i}>
            <span>
              {e.name} <span className={e.dir === 'up' ? 'up' : 'down'}>{e.dir === 'up' ? '突破上限' : '跌破下限'}</span>
            </span>
            <span className="muted">{new Date(e.time).toLocaleTimeString('zh-CN', { hour12: false })} · {fmt(e.price)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
