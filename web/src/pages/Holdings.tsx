import { useEffect, useState } from 'react';
import type { Holding, Portfolio } from '../types';
import { loadHoldings, saveHoldings, upsertHolding } from '../store/local';
import { computePortfolio } from '../store/portfolio';
import { getFundEst } from '../api/market';
import { fmt, fmtPct, cls } from '../utils';
import { usePolling } from '../hooks';
import PortfolioChart from '../components/PortfolioChart';

// 老大的真实持仓（真实 6 位代码，行情来自新浪实时估值）。
// 下面的份额/成本为「示例值」，请改成你的真实数字后收益才会准确。
const SEED: Holding[] = [
  { code: '021874', type: 'fund', name: '中欧沪深港黄金产业股票指数C', shares: 1000, cost: 1200 },
  { code: '013309', type: 'fund', name: '易方达恒生科技ETF联接(QDII)C', shares: 2000, cost: 1800 },
  { code: '021180', type: 'fund', name: '易方达产业机遇混合C', shares: 1500, cost: 1500 },
  { code: '002910', type: 'fund', name: '易方达供给改革灵活配置混合', shares: 800, cost: 2000 },
  { code: '011613', type: 'fund', name: '华夏科创50ETF联接C', shares: 3000, cost: 3000 },
  { code: '588710', type: 'fund', name: '华泰柏瑞科创半导体材料设备ETF', shares: 1000, cost: 1100 },
  { code: '017470', type: 'fund', name: '嘉实上证科创板芯片ETF联接C', shares: 2000, cost: 1900 },
  { code: 'XAU', type: 'gold', name: '积存金', shares: 45, cost: 38000 },
];

export default function Holdings() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [code, setCode] = useState('');
  const [type, setType] = useState<'fund' | 'gold'>('fund');
  const [shares, setShares] = useState('');
  const [cost, setCost] = useState('');
  const [msg, setMsg] = useState('');

  const { data: pf, loading, reload } = usePolling<Portfolio>(
    () => computePortfolio(loadHoldings()),
    20000,
    [holdings.length],
  );

  function syncList() {
    const list = loadHoldings();
    setHoldings(list);
    reload();
  }
  // 首次挂载载入
  useEffect(() => { syncList(); /* eslint-disable-next-line */ }, []);

  async function seed() {
    const existing = loadHoldings();
    if (existing.length) {
      setMsg('已有持仓，未覆盖');
      return;
    }
    saveHoldings([...SEED]);
    syncList();
    setMsg('已导入示例持仓（份额/成本为示例，请改成你的真实数字）');
  }

  async function add() {
    if (!code) return;
    let realCode = code.trim();
    let t = type;
    if (t === 'gold') {
      realCode = 'XAU';
    } else if (!/^\d{6}$/.test(realCode)) {
      setMsg('基金请填写 6 位代码');
      return;
    }
    let name = '';
    if (t === 'fund') {
      const est = await getFundEst(realCode).catch(() => null);
      if (!est) {
        setMsg('未获取到该基金行情，请检查代码');
        return;
      }
      name = est.name;
    } else {
      name = '积存金';
    }
    upsertHolding({
      code: realCode,
      type: t,
      name,
      shares: Number(shares) || 0,
      cost: Number(cost) || 0,
    });
    syncList();
    setCode(''); setShares(''); setCost(''); setMsg('已添加');
  }

  function updateField(c: string, field: 'shares' | 'cost', value: string) {
    const list = loadHoldings().map((x) =>
      x.code === c ? { ...x, [field]: Number(value) || 0 } : x,
    );
    saveHoldings(list);
    syncList();
  }

  function del(c: string) {
    saveHoldings(loadHoldings().filter((x) => x.code !== c));
    syncList();
  }

  const s = pf?.summary;
  return (
    <div>
      <PortfolioChart />

      <div className="form">
        <button className="primary" onClick={seed}>导入示例持仓</button>
        <input placeholder="6 位基金代码" value={code} onChange={(e) => setCode(e.target.value)} />
        <select value={type} onChange={(e) => setType(e.target.value as 'fund' | 'gold')}>
          <option value="fund">基金</option>
          <option value="gold">黄金(克)</option>
        </select>
        <input placeholder="份额/克数" value={shares} onChange={(e) => setShares(e.target.value)} />
        <input placeholder="成本(元)" value={cost} onChange={(e) => setCost(e.target.value)} />
        <button onClick={add}>添加</button>
        {msg && <span className="muted">{msg}</span>}
      </div>

      <div className="card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>名称/代码</th><th>类型</th><th>份额</th><th>成本</th>
                <th>现价</th><th>市值</th><th>收益</th><th>盈亏%</th><th></th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((it) => {
                const pi = pf?.items.find((p) => p.code === it.code);
                return (
                  <tr key={it.code}>
                    <td>
                      {pi?.name || it.name}
                      <div className="muted">{it.code}{pi?.estimated ? ' · 估值' : ''}</div>
                    </td>
                    <td>{it.type === 'gold' ? '积存金' : '基金'}</td>
                    <td>
                      <input
                        className="cell"
                        type="number"
                        value={it.shares}
                        onChange={(e) => updateField(it.code, 'shares', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        className="cell"
                        type="number"
                        value={it.cost}
                        onChange={(e) => updateField(it.code, 'cost', e.target.value)}
                      />
                    </td>
                    <td>{pi?.price != null ? fmt(pi.price) : '—'}</td>
                    <td>{pi?.market != null ? fmt(pi.market) : '—'}</td>
                    <td className={cls(pi?.pnl ?? undefined)}>{pi?.pnl != null ? fmt(pi.pnl) : '—'}</td>
                    <td className={cls(pi?.pnlPct ?? undefined)}>{pi?.pnlPct != null ? fmtPct(pi.pnlPct) : '—'}</td>
                    <td><button className="danger" onClick={() => del(it.code)}>删除</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!loading && holdings.length === 0 && (
          <div className="muted">尚无持仓，点「导入示例持仓」或手动添加（基金填 6 位代码）</div>
        )}
        {loading && holdings.length > 0 && <div className="muted">刷新中…</div>}
      </div>

      {s && holdings.length > 0 && (
        <div className="grid cols-4" style={{ marginTop: 16 }}>
          <div className="card">
            <h3>总市值</h3>
            <div className="big">{fmt(s.totalMarket)}</div>
            <div className="muted">成本 {fmt(s.totalCost)}</div>
          </div>
          <div className="card">
            <h3>总收益</h3>
            <div className={'big ' + cls(s.totalPnl)}>{fmt(s.totalPnl)}</div>
            <div className={cls(s.totalPnlPct)}>{fmtPct(s.totalPnlPct)}</div>
          </div>
          <div className="card">
            <h3>持仓数</h3>
            <div className="big">{holdings.length}</div>
            <div className="muted">基金 {holdings.filter((h) => h.type === 'fund').length} · 黄金 {holdings.filter((h) => h.type === 'gold').length}</div>
          </div>
          <div className="card">
            <h3>当日浮动</h3>
            <div className="muted">盘中估值实时更新</div>
            <div className="muted">每 20s 自动刷新</div>
          </div>
        </div>
      )}
    </div>
  );
}
