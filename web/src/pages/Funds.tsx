import { useState } from 'react';
import { api } from '../api/client';
import type { FundRankRow } from '../types';
import { fmtPct, cls } from '../utils';
import { usePolling } from '../hooks';
import { loadWatch, saveWatch, upsertHolding } from '../store/local';
import { getFundHistory } from '../api/market';
import LineChart from '../components/LineChart';
import Modal from '../components/Modal';

const TYPES: Record<string, string> = {
  all: '全部', gp: '股票型', hh: '混合型', zq: '债券型', zs: '指数型', qdii: 'QDII', fof: 'FOF',
};
const RANGES: [string, string][] = [['1m', '月'], ['3m', '季'], ['6m', '半年'], ['1y', '年'], ['3y', '3年']];

function FundDetail({ code, name }: { code: string; name?: string }) {
  const [range, setRange] = useState('1y');
  const { data, loading } = usePolling(
    () => getFundHistory(code, range),
    0,
    [code, range],
  );
  const series = (data || []).map((p) => ({ x: p.date, y: p.nav }));
  const latest = data?.[data.length - 1];
  return (
    <div>
      <div className="range-tabs" style={{ marginBottom: 10 }}>
        {RANGES.map(([r, label]) => (
          <button key={r} className={range === r ? 'primary' : ''} onClick={() => setRange(r)}>{label}</button>
        ))}
      </div>
      {loading && !data && <div className="muted">加载净值历史中…</div>}
      {latest && (
        <div style={{ display: 'flex', gap: 18, marginBottom: 8 }}>
          <div><div className="muted">最新净值</div><div className="big" style={{ fontSize: 20 }}>{latest.nav.toFixed(4)}</div></div>
          <div><div className="muted">累计净值</div><div className="big" style={{ fontSize: 20 }}>{latest.acc.toFixed(4)}</div></div>
          <div><div className="muted">日期</div><div className="big" style={{ fontSize: 20 }}>{latest.date}</div></div>
        </div>
      )}
      <LineChart series={series} height={240} formatVal={(v) => v.toFixed(4)} formatX={(s) => s.slice(5)} />
    </div>
  );
}

export default function Funds() {
  const [ft, setFt] = useState('all');
  const [msg, setMsg] = useState('');
  const [detail, setDetail] = useState<FundRankRow | null>(null);

  const { data: list, loading, error } = usePolling<FundRankRow[]>(
    () => api.get<FundRankRow[]>('/market/funds/rank?ft=' + ft + '&pn=30').then((r) => r.data),
    30000,
    [ft],
  );

  function addWatch(f: FundRankRow) {
    const w = loadWatch().filter((x) => x.symbol !== f.code);
    w.push({ symbol: f.code, type: 'fund', name: f.name });
    saveWatch(w);
    setMsg(`已加自选：${f.name}`);
    setTimeout(() => setMsg(''), 2000);
  }
  function addHolding(f: FundRankRow) {
    upsertHolding({ code: f.code, type: 'fund', name: f.name, shares: 0, cost: 0 });
    setMsg(`已加入持仓（去「持仓」页填份额/成本）：${f.name}`);
    setTimeout(() => setMsg(''), 2500);
  }

  return (
    <div>
      <div className="form">
        {Object.entries(TYPES).map(([k, v]) => (
          <button key={k} className={ft === k ? 'primary' : ''} onClick={() => setFt(k)}>{v}</button>
        ))}
        {msg && <span className="ok">{msg}</span>}
      </div>

      <div className="card">
        {error && <div className="err">基金榜加载失败：{error}（公开接口可能限流，稍后自动重试）</div>}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>基金</th><th>代码</th><th>净值</th>
                <th>日</th><th>周</th><th>月</th><th>季</th><th>年</th><th></th>
              </tr>
            </thead>
            <tbody>
              {(list || []).map((f) => (
                <tr key={f.code} style={{ cursor: 'pointer' }} onClick={() => setDetail(f)}>
                  <td>{f.name}</td>
                  <td className="muted">{f.code}</td>
                  <td>{f.net ? f.net.toFixed(4) : '—'}</td>
                  <td className={cls(f.day)}>{fmtPct(f.day)}</td>
                  <td className={cls(f.week)}>{fmtPct(f.week)}</td>
                  <td className={cls(f.month)}>{fmtPct(f.month)}</td>
                  <td className={cls(f.quarter)}>{fmtPct(f.quarter)}</td>
                  <td className={cls(f.year)}>{fmtPct(f.year)}</td>
                  <td className="row-actions">
                    <button onClick={(e) => { e.stopPropagation(); addWatch(f); }}>自选</button>
                    <button className="primary" onClick={(e) => { e.stopPropagation(); addHolding(f); }}>持仓</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && (!list || list.length === 0) && <div className="muted">加载中，或公开接口暂不可用</div>}
        {loading && <div className="muted">加载中…</div>}
        <div className="muted" style={{ marginTop: 8 }}>点击任意行查看净值历史走势</div>
      </div>

      <Modal open={!!detail} title={detail ? `${detail.name}（${detail.code}）净值走势` : ''} onClose={() => setDetail(null)}>
        {detail && <FundDetail code={detail.code} name={detail.name} />}
      </Modal>
    </div>
  );
}
