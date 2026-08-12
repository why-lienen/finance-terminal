import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { FundRankRow } from '../types';
import { fmtPct, cls } from '../utils';

// 注：东方财富 fundtradenew 不支持 ft=etf/lof 顶层类型（恒空），故用同可用的 fof 替代
const TYPES: Record<string, string> = {
  all: '全部', gp: '股票型', hh: '混合型', zq: '债券型', zs: '指数型', qdii: 'QDII', fof: 'FOF',
};

export default function Funds() {
  const [ft, setFt] = useState('all');
  const [list, setList] = useState<FundRankRow[]>([]);

  useEffect(() => {
    api.get<FundRankRow[]>('/market/funds/rank?ft=' + ft + '&pn=30').then((r) => setList(r.data));
  }, [ft]);

  return (
    <div>
      <div className="form">
        {Object.entries(TYPES).map(([k, v]) => (
          <button key={k} className={ft === k ? 'primary' : ''} onClick={() => setFt(k)}>{v}</button>
        ))}
      </div>
      <div className="card">
        <table>
          <thead>
            <tr><th>基金</th><th>代码</th><th>单位净值</th><th>日</th><th>周</th><th>月</th><th>年</th></tr>
          </thead>
          <tbody>
            {list.map((f) => (
              <tr key={f.code}>
                <td>{f.name}</td>
                <td>{f.code}</td>
                <td>{f.net}</td>
                <td className={cls(f.day)}>{fmtPct(f.day)}</td>
                <td className={cls(f.week)}>{fmtPct(f.week)}</td>
                <td className={cls(f.month)}>{fmtPct(f.month)}</td>
                <td className={cls(f.year)}>{fmtPct(f.year)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <div className="muted">加载中，或公开接口暂不可用</div>}
      </div>
    </div>
  );
}
