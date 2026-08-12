import { useEffect, useState } from 'react';
import { getStocks } from '../api/market';
import { loadWatch, saveWatch } from '../store/local';
import type { Stock, WatchItem } from '../types';
import { cls, fmtPct } from '../utils';

const PRESET = [
  { symbol: '1.000001', name: '上证指数' },
  { symbol: '0.399001', name: '深证成指' },
  { symbol: '0.399006', name: '创业板指' },
];

export default function Stocks() {
  const [watch, setWatch] = useState<WatchItem[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [secid, setSecid] = useState('');
  const [name, setName] = useState('');

  async function load() {
    const w = loadWatch();
    setWatch(w);
    const secs = w.filter((x) => x.type === 'stock').map((x) => x.symbol);
    setStocks(await getStocks(secs));
  }
  useEffect(() => { load(); }, []);

  async function add(sec: string, nm: string) {
    if (!sec) return;
    const w = loadWatch().filter((x) => x.symbol !== sec);
    w.push({ symbol: sec, type: 'stock', name: nm });
    saveWatch(w);
    await load();
  }
  async function del(sym: string) {
    saveWatch(loadWatch().filter((x) => x.symbol !== sym));
    await load();
  }

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
        <table>
          <thead>
            <tr><th>名称</th><th>代码</th><th>最新价</th><th>涨跌幅</th><th>涨跌额</th><th></th></tr>
          </thead>
          <tbody>
            {stocks.map((x) => (
              <tr key={x.code}>
                <td>{x.name}</td>
                <td>{x.code}</td>
                <td>{x.price}</td>
                <td className={cls(x.pct)}>{fmtPct(x.pct)}</td>
                <td className={cls(x.change)}>{x.change}</td>
                <td><button onClick={() => del(x.code)}>删</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {stocks.length === 0 && <div className="muted">添加股票或指数查看行情</div>}
      </div>
    </div>
  );
}
