// 菜单栏 app 预加载脚本：
// 1) 暴露 window.appShell.close() 给前端「收起窗口」按钮调用
// 2) 拖出卡片：float(secid,name,code,kind) / closeFloat()
// 3) 放大图表窗口：openChart(payload)（关闭复用 closeFloat，主进程按来源窗口关闭）
// 4) 透明背景：setTransparent(v) / onTransparency(cb)
// 5) 按加载参数给 body 打标记：图表窗口 → .electron-chart，浮窗 → .electron-float，主窗 → .electron-app
const { contextBridge, ipcRenderer } = require('electron');

// 主进程 → 渲染进程的透明状态同步：只用一个固定 listener，回调存模块级变量，
// 避免把「隔离世界的函数」直接交给 ipcRenderer.on（某些 Electron 版本下会静默失效）。
let transparencyCb = null;
ipcRenderer.on('app:transparency', (_e, v) => {
  if (transparencyCb) transparencyCb(v);
});

contextBridge.exposeInMainWorld('appShell', {
  close: () => ipcRenderer.send('app:close'),
  float: (secid, name, code, kind) => ipcRenderer.send('app:float', { secid, name, code, kind }),
  closeFloat: () => ipcRenderer.send('app:float-close'),
  openChart: (payload) => ipcRenderer.send('app:chart', payload),
  setTransparent: (v) => ipcRenderer.send('app:set-transparent', v),
  onTransparency: (cb) => { transparencyCb = cb; },
});

window.addEventListener('DOMContentLoaded', () => {
  const p = new URLSearchParams(window.location.search);
  if (p.has('chart')) document.body.classList.add('electron-chart');
  else if (p.has('float')) document.body.classList.add('electron-float');
  else document.body.classList.add('electron-app');
});
