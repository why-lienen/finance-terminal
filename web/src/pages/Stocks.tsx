import { useEffect, useRef, useState } from 'react';
import { getStocks, getKline, getSearch, type SearchResult } from '../api/market';
import { loadWatch, saveWatch } from '../store/local';
import type { Stock, WatchItem } from '../types';
import { cls, fmt, fmtPct } from '../utils';
import { usePolling } from '../hooks';
import LineChart from '../components/LineChart';
import Modal from '../components/Modal';

const PRESET = [
  { symbol: '1.000001', name: '上证指数' },
  { symbol: '0.399001', name: '深证成指' },
  { symbol: '0.399006', name: '创业板指' },
];

function codeOf(symbol: string) {
  const parts = symbol.split('.');
  return parts[1] || symbol;
}

function StockDetail({ secid, name }: { secid: string; name?: string }) {
  const [period, setPeriod] = useState('day');
  const { data, loading } = usePolling(() => getKline(secid, period, 60), 0, [secid, period]);
  const series = (data?.list || []).map((p) => ({ x: p.date, y: p.close }));
  const last = data?.list?.[data.list.length - 1];
  return (
    <div>
      <div className="range-tabs" style={{ marginBottom: 10 }}>
        {[['day', '日K'], ['week', '周K'], ['month', '月K']].map(([p, l]) => (
          <button key={p} className={period === p ? 'primary' : ''} onClick={() => setPeriod(p)}>{l}</button>
        ))}
      </div>
      {loading && !data && <div className="muted">加载 K 线中…</div>}
      {last && (
        <div style={{ display: 'flex', gap: 18, marginBottom: 8 }}>
          <div><div className="muted">收盘</div><div className="big" style={{ fontSize: 20 }}>{fmt(last.close)}</div></div>
          <div><div className="muted">最高</div><div className="up" style={{ fontSize: 18 }}>{fmt(last.high)}</div></div>
          <div><div className="muted">最低</div><div className="down" style={{ fontSize: 18 }}>{fmt(last.low)}</div></div>
          <div><div className="muted">名称</div><div style={{ fontSize: 16 }}>{name || data?.name}</div></div>
        </div>
      )}
      <LineChart series={series} height={240} formatVal={(v) => fmt(v)} formatX={(s) => s.slice(5)} />
    </div>
  );
}

export default function Stocks() {
  const [watch, setWatch] = useState<WatchItem[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<{ secid: string; name: string } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const { data: stocks, loading, error, reload } = usePolling<Record<string, Stock>>(
    async () => {
      const w = loadWatch().filter((x) => x.type === 'stock');
      const list = await getStocks(w.map((x) => x.symbol));
      const map: Record<string, Stock> = {};
      for (const s of list) map[s.code] = s;
      return map;
    },
    20000,
    [watch.length],
  );

  useEffect(() => { setWatch(loadWatch()); }, []);

  // 防抖搜索
  useEffect(() => {
    const kw = query.trim();
    if (!kw) { setResults([]); setOpen(false); return; }
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
    if (loadWatch().some((x) => x.symbol === sec)) {
      setQuery(''); setResults([]); setOpen(false);
      return; // 已在自选，不重复加
    }
    const w = loadWatch().filter((x) => x.symbol !== sec);
    w.push({ symbol: sec, type: 'stock', name: nm });
    saveWatch(w);
    setWatch(w);
    setQuery(''); setResults([]); setOpen(false);
    reload();
  }
  function del(sym: string) {
    saveWatch(loadWatch().filter((x) => x.symbol !== sym));
    setWatch(loadWatch());
    reload();
  }

  const stockWatch = watch.filter((x) => x.type === 'stock');

  return (
    <div>
      <div className="search-box" ref={boxRef}>
        <input
          placeholder="搜索股票 / 指数，如 粤传媒、贵州茅台、600519"
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
          <div className="search-dropdown"><div className="muted" style={{ padding: 10 }}>无匹配结果，试试代码或简称</div></div>
        )}
      </div>

      <div className="form" style={{ marginTop: 8 }}>
        <span className="muted">快速添加：</span>
        {PRESET.map((p) => (
          <button key={p.symbol} onClick={() => add(p.symbol, p.name)}>{p.name}</button>
        ))}
      </div>

      <div className="card">
        {error && <div className="err">行情加载失败：{error}</div>}
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th>名称</th><th>代码</th><th>最新价</th><th>涨跌幅</th><th>涨跌额</th><th></th></tr>
            </thead>
            <tbody>
              {stockWatch.map((w) => {
                const s = stocks?.[codeOf(w.symbol)];
                return (
                  <tr key={w.symbol} style={{ cursor: 'pointer' }} onClick={() => setDetail({ secid: w.symbol, name: s?.name || w.name })}>
                    <td>{s?.name || w.name || w.symbol}</td>
                    <td className="muted">{w.symbol}</td>
                    <td>{s ? fmt(s.price) : '—'}</td>
                    <td className={cls(s?.pct)}>{s ? fmtPct(s.pct) : '—'}</td>
                    <td className={cls(s?.change)}>{s ? fmt(s.change) : '—'}</td>
                    <td><button className="danger" onClick={(e) => { e.stopPropagation(); del(w.symbol); }}>删除</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!loading && stockWatch.length === 0 && <div className="muted">搜索并添加股票 / 指数，点击行看 K 线</div>}
        {loading && stockWatch.length > 0 && <div className="muted">刷新中…</div>}
      </div>

      <Modal open={!!detail} title={detail ? `${detail.name || detail.secid} 走势` : ''} onClose={() => setDetail(null)}>
        {detail && <StockDetail secid={detail.secid} name={detail.name} />}
      </Modal>
    </div>
  );
}
