// 金融终端 · macOS 顶部菜单栏版本（Electron，无图标资源依赖）
//
// 运行方式（在桌面端目录）：
//   npm run desktop:install   # 首次安装 electron
//   npm run desktop           # 启动菜单栏（= electron .）
//     → 会自动拉起「内置服务」(行情代理 + 前端静态)，无需再开 `npm run dev` / Vite / 公开网站
//
// 打包成独立 .app（发布给没有 node 环境的机器）：
//   npm run pack
//   产物在 desktop/finance-terminal-darwin-arm64/finance-terminal.app
//
// 说明：
//   - 用 Tray 标题（emoji）作为菜单栏入口，避免额外的图标文件依赖；
//     点击标题即可展开/收起盯盘窗口，窗口失焦「不」自动收起（常驻最前）。
//   - 内置服务同时出 /api/*（行情）与前端界面（web-dist），监听 127.0.0.1 随机/指定端口；
//     前端 axios baseURL 为相对 '/api'，同源请求自然命中内置服务，彻底去掉对公开网站的依赖。
//   - backgroundThrottling:false 保证窗口隐藏后也不降速，5 秒轮询与到价提醒持续运行。
//   - 透明背景是「可切换」的：默认不透明（普通窗口观感），用户通过菜单栏「透明背景」或顶栏按钮开启；
//     该偏好是全局的：主窗口与所有拖出的小浮窗一起白板 / 一起透明（放大图表窗口为实底，不参与）。
//     窗口本身始终 alwaysOnTop（最上层常驻），切到别的 app 也一直可见。
const { app, BrowserWindow, Tray, nativeImage, screen, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let win = null;
let tray = null;
let apiServer = null;
let APP_URL = '';
const floatWins = new Set(); // 所有附加窗口（浮窗 + 放大图表），仅供 before-quit 统一关闭
const floatWidgets = new Set(); // 仅 ?float=1 小浮窗：透明偏好需要联动到它们
const chartWins = new Map(); // secid → 已开的放大图表窗口（重复点击直接聚焦，不叠窗口）

// 透明背景偏好（默认不透明），持久化到桌面目录下的小文件
const STATE_FILE = path.join(app.getPath('userData'), 'ui-state.json');
let uiState = { transparent: false };
function loadUiState() {
  try { const d = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); if (d && typeof d.transparent === 'boolean') uiState = d; } catch (_) {}
}
function saveUiState() {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(uiState)); } catch (_) {}
}

// 业务数据持久化（自选股 / 预警 / 触发记录 / 持仓）：落在 userData/app-data.json。
// 之所以不在渲染进程直接用 localStorage：localStorage 按「来源(origin)」隔离，而本 app 加载地址会在
// Vite(localhost:5173) 与 内置服务(127.0.0.1:端口) 间切换，端口被占用还会随机分配 →
// 来源一变旧数据就读不到。统一走磁盘文件，与加载地址彻底解耦，重启不再丢数据。
const DATA_FILE = path.join(app.getPath('userData'), 'app-data.json');
let appData = {};
try {
  const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  if (d && typeof d === 'object') appData = d;
} catch (_) {}
function saveAppData() {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(appData)); } catch (_) {}
}
// 在渲染进程里切换 body 的 transparent-bg 类（窗口本身 transparent:true，靠内容背景决定透不透明）
// ⚠️ macOS 已知坑：transparent:true 窗口在「内容 alpha 变化」后，Chromium 合成层不会主动重建，
// 会残留上一帧的不透明白板；Electron 官方文档也提示「透明窗口设 resizable:true 可能让透明失效」，
// 社区 issue #38630 同样是「resize 之后才恢复透明」。用户手动拉宽窗口能生效，就是这个原因。
// 因此每次切换后主动做一次等价的强制重绘，让 NSWindow/Chromium 重新分配 compositing surface。
// w 为任意窗口（主窗口 / 小浮窗）——浮窗同样是 transparent:true，会踩同一个坑。
function forceWindowRepaint(w, on) {
  if (!w || w.isDestroyed()) return;
  // ① 窗口底色跟着状态走：白板给不透明浅灰，透明给全透明。
  //    即使 CSS 合成层没及时刷新，原生窗口的 alpha 通道也是对的（双保险，切回白板也立刻生效）。
  try { w.setBackgroundColor(on ? '#00000000' : '#FFEEF1F6'); } catch (_) {}
  // ② 强制 Chromium 重绘整个视口（半透明卡片 / backdrop-filter 需要重新 paint）
  try { w.webContents.invalidate(); } catch (_) {}
  // ③ 1px bounds 抖动：等价于用户「拉宽一点」，重建 surface。x/y 不变、立刻还原，用户几乎无感。
  //    ⚠️ 只对主窗口做：小浮窗的 move 事件承担「拖回主面板自动收回」，任何 setBounds 都会触发 move，
  //    抖动可能把浮窗误关；且浮窗 resizable:false，靠 ①② 已足够重建 alpha 合成层。
  if (w === win) {
    try {
      const b = w.getBounds();
      w.setBounds({ x: b.x, y: b.y, width: b.width + 1, height: b.height });
      w.setBounds(b);
    } catch (_) {}
  }
}

// 对单个窗口：先等 body 的 transparent-bg 类真正落地，再强制重绘，避免重绘时 CSS 还没生效。
async function applyTransparencyTo(w, on) {
  if (!w || w.isDestroyed()) return;
  const v = !!on;
  try {
    await w.webContents.executeJavaScript(`document.body.classList.toggle('transparent-bg', ${v})`);
  } catch (_) {}
  forceWindowRepaint(w, v);
}

// 透明偏好是全局的：主窗口 + 所有已开的小浮窗一起切，保证「白板都白板、透明都透明」。
async function applyTransparency(on) {
  const v = !!on;
  for (const w of [win, ...floatWidgets]) {
    await applyTransparencyTo(w, v);
  }
}

// 状态广播：主窗口顶栏按钮状态由它同步；小浮窗也监听，作 executeJavaScript 之外的兜底。
function broadcastTransparency(v) {
  for (const w of [win, ...floatWidgets]) {
    if (!w || w.isDestroyed()) continue;
    try { w.webContents.send('app:transparency', v); } catch (_) {}
  }
}

// 解析内置 api 服务模块：
//   - 开发时（electron . 从 desktop/ 启动）：../api/server.js
//   - 打包后（api 随 app 一起进入 app/ 内）：./api/server.js
function resolveApiServer() {
  const candidates = [
    path.join(__dirname, 'api', 'server.js'),
    path.join(__dirname, '../api', 'server.js'),
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  throw new Error('找不到 api/server.js（请确认打包时包含了 api 目录）');
}

// 开发期检测：若本地 Vite 正在跑（npm run dev），直接用它拿热更新；
// 否则回退到内置服务（已 build 好的 web-dist）。这样「改 UI → 保存 → 即时看效果」无需重新打包。
function reachable(url) {
  return new Promise((resolve) => {
    const http = require('http');
    const req = http.get(url, (res) => { res.destroy(); resolve(true); });
    req.on('error', () => resolve(false));
    req.setTimeout(800, () => { req.destroy(); resolve(false); });
  });
}
async function pickAppUrl() {
  if (process.env.FT_DEV === '1') return 'http://localhost:5173/';
  if (await reachable('http://localhost:5173/')) return 'http://localhost:5173/';
  const { listen } = require(resolveApiServer());
  const { server, port } = await listen('127.0.0.1', 18765);
  apiServer = server;
  return `http://127.0.0.1:${port}/`;
}

function createWindow(url) {
  const wa = screen.getPrimaryDisplay().workArea;
  // 默认尺寸按当前界面实测：820×780 时顶栏完整（✕ 不被挤出）、3 张盯盘卡一行、
  // 预警中心全部可见，内容总高正好等于窗口高 → 打开即「默认展示所有内容」，无需滚动。
  // 小屏按工作区等比收敛，但保底 700×560（低于 700 宽顶栏会挤掉 ✕；前端另有 flex 防溢出兜底）。
  const width = Math.max(700, Math.min(820, wa.width - 16));
  const height = Math.max(560, Math.min(780, wa.height - 16));
  win = new BrowserWindow({
    width,
    height,
    minWidth: 700,   // 防止用户手动缩窄后又把 ✕ 挤没
    minHeight: 520,
    show: false, // 默认隐藏，点菜单栏再展开
    frame: false,
    resizable: true,
    alwaysOnTop: true, // 常驻最上层：切到别的 app 也一直可见
    skipTaskbar: true,
    transparent: true, // 窗口本身支持透明；是否真的透出桌面由内容背景（transparent-bg 类）决定
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false, // 关键：窗口隐藏后也不降速，保证 5s 轮询与到价提醒持续运行
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  win.loadURL(url);
  // 不再「失焦自动收起」——用户要的是常驻可见；改为由右上角 ✕ 手动收起（见 preload/appShell.close）
}

function positionWindow() {
  if (!win) return;
  const cursor = screen.getCursorScreenPoint();
  const disp = screen.getDisplayNearestPoint(cursor);
  // 用 workArea（含 x/y 原点）而不是只用 workAreaSize：外接显示器 / 刘海屏时
  // workArea.x 不为 0，旧写法会把窗口算到主屏坐标上导致跑偏甚至整窗出屏。
  const wa = disp.workArea;
  const [w] = win.getSize();
  // 贴当前屏幕工作区右上角，且保证窗口整体不越出屏幕边界
  const x = Math.max(wa.x + 8, wa.x + wa.width - w - 8);
  const y = wa.y + 8;
  win.setPosition(Math.round(x), Math.round(y));
}

// 拖出某张盯盘卡 → 开一个独立、最上层、可拖动的小浮窗（实时价格 + 迷你走势）
function openFloat({ secid, name, code, kind }) {
  if (!win) return;
  const q = `?float=1&secid=${encodeURIComponent(secid)}&name=${encodeURIComponent(name)}&code=${encodeURIComponent(code)}&kind=${encodeURIComponent(kind)}`;
  const fw = new BrowserWindow({
    width: 280,
    height: 360,
    frame: false,
    transparent: true,
    // 底色跟随当前透明偏好：白板模式窗口本身就不透桌面，透明模式才真正透出去。
    // 首帧就正确，避免「新拖出的小窗要拉一下才透明」（合成层缓存坑）。
    backgroundColor: uiState.transparent ? '#00000000' : '#FFEEF1F6',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  fw.loadURL(APP_URL + q);
  floatWins.add(fw);
  floatWidgets.add(fw);
  // 新开的浮窗继承主窗口当前状态：主窗口已是透明时，刚拖出的小窗不能还是白板。
  fw.webContents.on('did-finish-load', () => {
    applyTransparencyTo(fw, uiState.transparent).catch(() => {});
    try { fw.webContents.send('app:transparency', uiState.transparent); } catch (_) {}
  });
  fw.on('closed', () => { floatWins.delete(fw); floatWidgets.delete(fw); });

  // 初始位置放到主窗口外侧（左边/下方），避免一开就与主窗口重叠而被「拖回」逻辑误关
  const m = win.getBounds();
  const wa = screen.getDisplayMatching(m).workArea;
  let x = m.x - 280 - 16;
  if (x < wa.x) x = Math.min(m.x + 60, wa.x + wa.width - 280);
  let y = m.y + 120;
  if (y + 360 > wa.y + wa.height) y = Math.max(wa.y, wa.y + wa.height - 360);
  fw.setPosition(Math.max(wa.x, x), Math.max(wa.y, y));

  // 「拖回主面板」：浮窗中心进入主窗口范围即收回（等价于点 ✕，卡片仍留在面板里）。
  // 延迟武装：初始 setPosition 也会触发 move，需等用户真正开始拖动后再判定，防止刚弹出就被关掉。
  let armed = false;
  setTimeout(() => { armed = true; }, 700);
  fw.on('move', () => {
    if (!armed || !win) return;
    const f = fw.getBounds();
    const mm = win.getBounds();
    const cx = f.x + f.width / 2;
    const cy = f.y + f.height / 2;
    if (cx >= mm.x && cx <= mm.x + mm.width && cy >= mm.y && cy <= mm.y + mm.height) {
      armed = false;
      fw.close();
    }
  });
}

app.whenReady().then(async () => {
  loadUiState();

  // 前端「收起窗口」按钮
  ipcMain.on('app:close', () => { if (win) win.hide(); });
  // 透明背景开关（顶栏按钮 / 菜单栏项共用，main 为唯一真值来源）
  ipcMain.on('app:set-transparent', (e, v) => {
    uiState.transparent = !!v;
    saveUiState();
    applyTransparency(uiState.transparent).catch(() => {});
    broadcastTransparency(uiState.transparent);
  });
  // 拖出卡片 → 开浮窗
  ipcMain.on('app:float', (e, payload) => openFloat(payload));
  // 点卡片 → 开独立「放大图表」窗口：主窗口只有 500x720，Modal 再改也大不了，
  // 所以另起一个约 1000x760 的 BrowserWindow，让图表真正铺满（可拖动 / 可缩放 / 最上层）。
  ipcMain.on('app:chart', (e, payload) => {
    const p = payload || {};
    if (!win) return;
    const key = p.secid || p.code || '';
    const exist = chartWins.get(key);
    if (exist && !exist.isDestroyed()) { exist.show(); exist.focus(); return; }

    const wa = screen.getPrimaryDisplay().workArea;
    const w = Math.min(1100, Math.round(wa.width * 0.82));
    const h = Math.min(780, Math.round(wa.height * 0.82));
    const q = '?chart=1' +
      '&secid=' + encodeURIComponent(p.secid || '') +
      '&name=' + encodeURIComponent(p.name || '') +
      '&code=' + encodeURIComponent(p.code || '') +
      '&kind=' + encodeURIComponent(p.kind || 'stock') +
      '&prevClose=' + encodeURIComponent(p.prevClose ?? '') +
      '&unit=' + encodeURIComponent(p.unit ?? '') +
      '&sub=' + encodeURIComponent(p.sub || '');
    const cw = new BrowserWindow({
      width: w,
      height: h,
      frame: false,
      resizable: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      transparent: false, // 大窗口用实底，图表更清晰
      backgroundColor: '#eef1f6',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        backgroundThrottling: false,
        preload: path.join(__dirname, 'preload.js'),
      },
    });
    cw.loadURL(APP_URL + q);
    cw.setPosition(
      Math.round(wa.x + (wa.width - w) / 2),
      Math.round(wa.y + (wa.height - h) / 2),
    );
    chartWins.set(key, cw);
    floatWins.add(cw); // 复用 before-quit 的统一关闭
    cw.on('closed', () => { chartWins.delete(key); floatWins.delete(cw); });
  });
  // 浮窗自身关闭（收回面板）
  ipcMain.on('app:float-close', (e) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (w) w.close();
  });
  // 磁盘持久化（跨来源稳定）：渲染进程把 localStorage 镜像到这里，启动时再回填，避免「换端口/换源清空记录」
  ipcMain.handle('db:get', (_e, key) => (key in appData ? appData[key] : null));
  ipcMain.handle('db:set', (_e, key, value) => {
    appData[key] = value;
    saveAppData();
    return true;
  });

  try {
    // 选加载地址：优先本地 Vite 热更新（开发），否则用内置服务（已 build 的 web-dist）
    APP_URL = await pickAppUrl();
    console.log('[app] 加载地址：', APP_URL);

    createWindow(APP_URL);

    // 初始应用透明偏好（默认不透明）
    win.webContents.on('did-finish-load', () => {
      applyTransparency(uiState.transparent).catch(() => {});
      broadcastTransparency(uiState.transparent);
    });

    tray = new Tray(nativeImage.createEmpty());
    tray.setTitle('📈 盯盘');
    tray.setToolTip('我的盯盘终端 · 点击展开');
    tray.on('click', () => {
      if (!win) return;
      if (win.isVisible()) {
        win.hide();
      } else {
        positionWindow();
        win.show();
        win.focus();
      }
    });
    // 右键菜单：打开终端 / 透明背景切换 / 退出
    function buildTrayMenu() {
      return Menu.buildFromTemplate([
        { label: '打开终端', click: () => { positionWindow(); win.show(); win.focus(); } },
        {
          label: uiState.transparent ? '☑ 透明背景（点此关闭）' : '☐ 透明背景（点此开启）',
          click: () => {
            uiState.transparent = !uiState.transparent;
            saveUiState();
            applyTransparency(uiState.transparent).catch(() => {});
            broadcastTransparency(uiState.transparent);
            tray.setContextMenu(buildTrayMenu());
          },
        },
        { label: '退出', click: () => app.quit() },
      ]);
    }
    tray.setContextMenu(buildTrayMenu());
  } catch (e) {
    console.error('[app] 启动失败：', e);
    app.quit();
  }
});

// 退出前关闭内置服务
app.on('before-quit', () => {
  if (apiServer) {
    try { apiServer.close(); } catch (_) {}
  }
  for (const fw of floatWins) { try { fw.close(); } catch (_) {} }
});

// 阻止默认退出，保持菜单栏常驻
app.on('window-all-closed', (e) => e.preventDefault());
