import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useEvents } from '../hooks';
import { AnnouncementBar, EventToasts } from '../components/AnnouncementBar';
import { isSoundEnabled, setSoundEnabled } from '../alertAudio';

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
  const isElectron = typeof window !== 'undefined' && !!(window as any).appShell;
  const [soundOn, setSoundOn] = useState(isSoundEnabled());
  const [transparent, setTransparent] = useState(
    () => typeof document !== 'undefined' && document.body.classList.contains('transparent-bg'),
  );

  // 本地立即生效：直接切 body 的 class + 更新按钮状态。
  // 关键：不依赖 IPC 往返，点下去马上有反应；主进程只负责持久化 / 同步菜单栏。
  const applyTransparent = (v: boolean) => {
    document.body.classList.toggle('transparent-bg', v);
    setTransparent(v);
  };

  // 主进程（菜单栏切换 / 启动时读回偏好）同步过来时，走同一套本地逻辑
  useEffect(() => {
    const shell = (window as any).appShell;
    if (shell && shell.onTransparency) shell.onTransparency((v: boolean) => applyTransparent(v));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
  };
  const toggleTransparent = () => {
    const next = !transparent;
    applyTransparent(next); // 先本地立即生效
    const shell = (window as any).appShell;
    if (shell && shell.setTransparent) shell.setTransparent(next); // 再通知主进程（失败也不影响本次切换）
  };

  // 公告栏：轮询东方财富财经日历，发现新事件弹 Toast（金十式 push）
  const { events, toasts, dismissToast } = useEvents();

  return (
    <div className="app">
      {/* 左边缘拖拽条：不随页面滚动，滚到任何位置都能抓住窗口左缘平移；只占左侧 10px 空白 padding，不挡卡片 / 按钮 / 输入。
          右边缘拖拽条已删除——它之前压在竖向滚动条上导致「下滑时灵时不灵」。主拖动手柄仍是整条顶栏。 */}
      {isElectron && (
        <div className="drag-rail drag-rail-l" aria-hidden="true" />
      )}
      <header className="topbar">
        <div className="brand">
          盯盘<span className="dot">终端</span>
          <span className="badge">PRO</span>
        </div>
        <span
          className="freshness"
          title="东方财富免费源对国际商品（黄金 / WTI 原油）的 1 分钟 K 线恒定滞后约 10 分钟；A 股 / 美元指数约 30 秒内。1 分钟图与浮窗的末端已由新浪零延迟实时报价按分钟自采补齐，图表会标注「数据截至 HH:MM」。行情每 5 秒刷新，非交易所实时推送，仅供参考。"
        >
          源端延迟约 10 分钟 · 末端实时补点
        </span>

        <div className="top-actions">
          <button className={'icon-btn' + (soundOn ? '' : ' off')} title={soundOn ? '提醒音：开' : '提醒音：关'} onClick={toggleSound}>
            {soundOn ? '🔊' : '🔇'}
          </button>
          {isElectron && (
            <button
              className={'trans-btn' + (transparent ? ' on' : '')}
              title={transparent ? '透明背景：已开启（点此关闭）' : '透明背景：已关闭（点此开启）'}
              aria-pressed={transparent}
              onClick={toggleTransparent}
            >
              {transparent ? '🪟 透明·开' : '🪟 透明'}
            </button>
          )}
          {isElectron && (
            <button className="icon-btn close" title="收起盯盘窗口" onClick={() => (window as any).appShell.close()}>✕</button>
          )}
          <Clock />
        </div>
      </header>
      <AnnouncementBar events={events} />
      <main className="content">
        <Outlet />
      </main>
      <EventToasts toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
