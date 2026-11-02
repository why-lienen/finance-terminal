import { useEffect, useState } from 'react';
import { getStocks, getKline } from '../api/market';
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
  const [secid, setSecid] = useState('');
  const [name, setName] = useState('');
  const [detail, setDetail] = useState<{ secid: string; name: string } | null>(null);

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

  function add(sec: string, nm: string) {
    if (!sec) return;
    const w = loadWatch().filter((x) => x.symbol !== sec);
    w.push({ symbol: sec, type: 'stock', name: nm });
    saveWatch(w);
    setWatch(w);
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
      <div className="form">
        <input placeholder="secid 如 1.600519" value={secid} onChange={(e) => setSecid(e.target.value)} />
        <input placeholder="名称" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="primary" onClick={() => { add(secid, name); setSecid(''); setName(''); }}>加自选</button>
        <span className="muted">示例：</span>
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
        {!loading && stockWatch.length === 0 && <div className="muted">添加股票或指数（secid）查看行情，点击行看 K 线</div>}
        {loading && stockWatch.length > 0 && <div className="muted">刷新中…</div>}
      </div>

      <Modal open={!!detail} title={detail ? `${detail.name || detail.secid} 走势` : ''} onClose={() => setDetail(null)}>
        {detail && <StockDetail secid={detail.secid} name={detail.name} />}
      </Modal>
    </div>
  );
}
