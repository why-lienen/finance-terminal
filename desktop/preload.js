// 菜单栏 app 预加载脚本：
// 1) 暴露 window.appShell.close() 给前端「收起窗口」按钮调用
// 2) 给 body 打上 .electron-app 标记，让前端 CSS 按此作用域启用「透明常驻 + 可拖动」样式
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('appShell', {
  close: () => ipcRenderer.send('app:close'),
});

window.addEventListener('DOMContentLoaded', () => {
  document.body.classList.add('electron-app');
});
