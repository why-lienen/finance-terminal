import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import Bar from '../pages/Bar';

const tabs = [
  ['/', '总看板'],
  ['/stocks', '股票'],
  ['/funds', '基金'],
  ['/gold', '黄金'],
  ['/holdings', '持仓'],
];

function Clock() {
  const [t, setT] = useState('');
  useEffect(() => {
    const upd = () => setT(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
    upd();
    const id = setInterval(upd, 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="clock">{t}</span>;
}

export default function Layout() {
  const location = useLocation();
  // 菜单栏紧凑模式：Electron 以 ?bar=1 打开时只显示滚动行情条
  if (new URLSearchParams(location.search).get('bar') === '1') {
    return <Bar />;
  }
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          金融<span className="dot">终端</span>
          <span className="badge">PRO</span>
        </div>
        <nav>
          {tabs.map(([to, label]) => (
            <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
              {label}
            </NavLink>
          ))}
        </nav>
        <Clock />
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
