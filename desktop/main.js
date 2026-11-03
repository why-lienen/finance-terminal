// 金融终端 · macOS 顶部菜单栏版本（Electron）
//
// 运行方式（在桌面端目录，Mac 上需要联网安装一次依赖）：
//   npm run desktop:install   # 首次安装 electron
//   npm run desktop           # 启动菜单栏（= electron .）
//
// 打包成独立 .app（可选，发布给没有 node 环境的机器）：
//   npm install -g electron-packager
//   npm run pack
//   产物在 desktop/finance-terminal-darwin-arm64/finance-terminal.app
//
// 说明：
//   - 用 Tray 标题（emoji）作为菜单栏入口，避免额外的图标文件依赖；
//     点击标题即可展开/收起盯盘窗口，窗口失焦自动收起。
//   - 默认加载本地 `npm run dev` 后的地址 http://localhost:5173/（即「盯盘终端」单页，
//     含实时走势 + 到价提醒）。这样你本地改的代码立刻能在菜单栏看到。
//   - 想用线上已部署版本（无需本地 dev server），启动时指定环境变量：
//       APP_URL=https://你的vercel地址/ npm run desktop
//   - backgroundThrottling:false 保证窗口隐藏后也不降速，5 秒轮询与到价提醒持续运行。
const { app, BrowserWindow, Tray, nativeImage, screen, Menu } = require('electron');

// 加载盯盘终端（首页即 Terminal 单页）
const APP_URL = process.env.APP_URL || 'http://localhost:5173/';

let win = null;
let tray = null;

function createWindow() {
  win = new BrowserWindow({
    width: 500,
    height: 720,
    show: false, // 默认隐藏，点菜单栏再展开
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false, // 关键：窗口隐藏后也不降速，保证 5s 轮询与到价提醒持续运行
    },
  });
  win.loadURL(APP_URL);
  // 失焦自动收起
  win.on('blur', () => win && win.hide());
}

function positionWindow() {
  if (!win) return;
  const cursor = screen.getCursorScreenPoint();
  const disp = screen.getDisplayNearestPoint(cursor);
  const { width } = disp.workAreaSize;
  const [w, h] = win.getSize();
  // 贴在菜单栏正下方、靠右
  const x = width - w - 8;
  const y = 24;
  win.setPosition(x, y);
}

app.whenReady().then(() => {
  createWindow();

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
  // 右键菜单
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开终端', click: () => { positionWindow(); win.show(); win.focus(); } },
      { label: '退出', click: () => app.quit() },
    ]),
  );
});

// 阻止默认退出，保持菜单栏常驻
app.on('window-all-closed', (e) => e.preventDefault());
