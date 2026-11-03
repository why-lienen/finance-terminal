import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';

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

// 只保留「盯盘」单页：去掉其它 tab，菜单栏与浏览器里都是同一个盯盘终端
export default function Layout() {
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          盯盘<span className="dot">终端</span>
          <span className="badge">PRO</span>
        </div>
        <Clock />
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
