// 金融终端 · macOS 顶部菜单栏版本（Electron）
//
// 运行方式（在 desktop/ 目录，Mac 上需要联网安装一次依赖）：
//   npm install
//   npm start
//
// 打包成独立 .app（可选）：
//   npm install -g electron-packager
//   npm run pack
//   产物在 desktop/finance-terminal-darwin-arm64/finance-terminal.app
//
// 说明：
//   - 用 Tray 标题（emoji）作为菜单栏入口，避免额外的图标文件依赖；
//     点击标题即可展开/收起行情窗口，窗口失焦自动收起。
//   - 加载的是线上已部署地址（?bar=1 让网页只渲染顶部滚动行情条）。
//     想离线/隐私，可把 APP_URL 指向本地 `npm run dev` 后的地址，
//     并确保本地 api 代理（npm run dev 的 3001）一并运行。
const { app, BrowserWindow, Tray, nativeImage, screen } = require('electron');

const APP_URL =
  process.env.APP_URL ||
  'https://finance-terminal-ap66zd7cr-noah-ee76.vercel.app/?bar=1';

let win = null;
let tray = null;

function createWindow() {
  win = new BrowserWindow({
    width: 460,
    height: 300,
    show: false, // 默认隐藏，点菜单栏再展开
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
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
  tray.setTitle('📈 金融终端');
  tray.setToolTip('金融终端 · 点击展开行情');
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
});

// 阻止默认退出，保持菜单栏常驻
app.on('window-all-closed', (e) => e.preventDefault());
