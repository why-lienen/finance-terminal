import { NavLink, Outlet } from 'react-router-dom';

const tabs = [
  ['/', '总看板'],
  ['/stocks', '股票'],
  ['/funds', '基金'],
  ['/gold', '黄金'],
  ['/holdings', '持仓'],
];

export default function Layout() {
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          金融<span className="dot">终端</span>
        </div>
        <nav>
          {tabs.map(([to, label]) => (
            <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
              {label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
