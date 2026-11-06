import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { migrateFromDisk } from './store/db';
import './theme.css';

// 先尝试从磁盘把历史数据回填到当前来源（解决「换加载地址/端口导致记录清空」），再渲染。
// migrateFromDisk 只做一次 IPC 往返、无数据时立即 resolve，不会明显拖慢首屏。
migrateFromDisk().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  );
});
