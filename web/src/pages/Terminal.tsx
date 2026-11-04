import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSearch, type SearchResult } from '../api/market';
import { loadWatch, saveWatch } from '../store/local';
import type { WatchItem, Stock, CardData } from '../types';
import { useRealtimeMonitor } from '../hooks';
import { cls, fmt, fmtPct } from '../utils';
import Sparkline from '../components/Sparkline';
import Modal from '../components/Modal';
import DetailPanel from '../components/DetailPanel';
import { getAlert, removeAlert, loadAlerts, loadAlertLog, type AlertLogEntry } from '../store/alerts';

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

export default function Terminal() {
  const [watch, setWatch] = useState<WatchItem[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<CardData | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  // 仅在 Electron 菜单栏 app 内（preload 注入了 window.appShell）显示「收起窗口」按钮
  const isElectron = typeof window !== 'undefined' && !!(window as any).appShell;
  // 已触发提醒：用户点掉后隐藏（红框+徽标都消失）；若该标的再次触发则自动重新显示
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});
  const prevTrig = useRef<Record<string, boolean>>({});

  const stockWatch = useMemo(() => watch.filter((x) => x.type === 'stock'), [watch]);
  const symbols = useMemo(
    () => [...stockWatch.map((w) => w.symbol), ...FIXED_ASSETS.map((a) => a.symbol)],
    [stockWatch],
  );

  const { gold, stocks, series, triggered, loading, toasts, dismissToast } =
    useRealtimeMonitor(symbols, { withGold: true, intervalMs: 5000 });

  useEffect(() => {
    setWatch(loadWatch());
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

  // 把某张卡片「拖出」为独立浮窗（仅 Electron 内可用）
  function popOut(c: CardData) {
    const shell = (window as any).appShell;
    if (shell && shell.float) {
      shell.float(c.symbol, c.name, c.key, c.isGold ? 'gold' : c.isFixed ? 'fixed' : 'stock');
    }
  }

  // 稳定的 onClose：配合 DetailPanel 的 React.memo，避免主窗口每 5 秒行情刷新
  // 把详情内容连带重渲染（用户反馈「打开详情后每次数据刷新整个一闪」）。
  const closeDetail = useCallback(() => setDetail(null), []);

  // 点卡片：Electron 内直接开「独立大图表窗口」（图纸真正放大，不再挤在 500x720 主窗里）；
  // 浏览器模式没有 appShell → 保留原来的小 Modal 作为兜底，功能不丢。
  function openDetail(c: CardData) {
    const shell = (window as any).appShell;
    if (isElectron && shell && shell.openChart) {
      shell.openChart({
        secid: c.symbol,
        name: c.name,
        code: c.key,
        kind: c.isGold ? 'gold' : c.isFixed ? 'fixed' : 'stock',
        prevClose: c.prevClose ?? '',
        unit: c.unit ?? '',
        sub: c.sub ?? '',
      });
      return;
    }
    setDetail(c);
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

  // 当某个标的「再次触发」时，清除它之前的"已忽略"，让红框+徽标重新出现
  const trigKey = cards.map((c) => c.key + (c.triggered ? '1' : '0')).join(',');
  useEffect(() => {
    for (const c of cards) {
      const was = prevTrig.current[c.key];
      if (c.triggered && !was && dismissed[c.key]) {
        setDismissed((d) => {
          const n = { ...d };
          delete n[c.key];
          return n;
        });
      }
      prevTrig.current[c.key] = c.triggered;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigKey]);

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
      </div>

      {/* 监控看板 */}
      <div className="board">
        {cards.map((c) => {
          const rule = ruleOf(c.key);
          return (
            <div
              key={c.key}
              className={'mcard' + (c.triggered && !dismissed[c.key] ? ' alerting' : '')}
              onClick={() => openDetail(c)}
            >
              <div className="mcard-top">
                <div>
                  <div className="mcard-name">{c.name}</div>
                  <div className="muted mcard-sub">{c.isGold || c.isFixed ? c.sub : codeOf(c.symbol)}</div>
                </div>
                <div className="mcard-actions">
                  {isElectron && (
                    <button
                      className="mcard-pop"
                      title="拖出为独立浮窗（最上层常驻，可拖动；拖回面板即收回）"
                      onClick={(e) => {
                        e.stopPropagation();
                        popOut(c);
                      }}
                    >
                      ⧉
                    </button>
                  )}
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
              </div>

              <div className="mcard-price">
                <span className="big">{c.price != null ? fmt(c.price) : '—'}</span>
                {c.pct != null && (
                  <span className={'tag ' + cls(c.pct)} title="今日涨跌幅（相对昨收）">{fmtPct(c.pct)}</span>
                )}
              </div>

              <div className="mcard-spark">
                <Sparkline values={c.series} height={46} />
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
                {c.triggered && !dismissed[c.key] && (
                  <span
                    className="alert-badge"
                    title="点击清除提醒"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDismissed((d) => ({ ...d, [c.key]: true }));
                    }}
                  >
                    已触发 ✕
                  </span>
                )}
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

      {/* 详情 / 设预警：Electron 下点卡片走独立大窗口，这里只作浏览器模式兜底 */}
      {detail && (
        <Modal open title={`${detail.name} · 实时曲线`} onClose={closeDetail}>
          <DetailPanel card={detail} onClose={closeDetail} />
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
        {log.slice(0, 5).map((e: AlertLogEntry, i) => (
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
