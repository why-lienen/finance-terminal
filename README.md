# 金融终端 · Finance Terminal

一个**自包含的 macOS 顶部菜单栏盯盘 App**（Electron）。点菜单栏「📈 盯盘」展开一个 500×720 的无边框窗口，`alwaysOnTop` 常驻最上层——切到别的应用也能继续看走势。

> **本项目不是公开网站。** 已移除 Vercel 部署入口（`vercel.json`、`api/[...path].js`）。App 内置一个 Node HTTP 服务，同源提供 `/api/*` 行情代理与前端界面，不依赖 Vite、公网部署或注册登录；打包成 `.app` 后双击即可运行。

**仓库地址：** https://github.com/why-lienen/finance-terminal

## 功能一览

| 模块 | 说明 |
|---|---|
| 盯盘卡片 | 国际金价、**美油 WTI（102.CL00Y）**、**美元指数（100.UDI）** 常驻，搜索可添加 A 股 / 指数；显示实时价、**今日涨跌幅（相对昨收）**、平滑迷你走势 |
| 放大图表窗口 | **点卡片直接开独立大窗口**（约 1100×780，无边框、可拖动 / 缩放、最上层）：分时 / 五日 / 1分钟（默认最近 30 分钟）/ 日K / 周K / 月K；图表铺满窗口，末端价对齐卡片实时价；重复点同一标的只聚焦、不叠窗 |
| 到价预警 | 上限 / 下限 + 启用开关；**跌破 = 急促方波警报，突破 = 上行琶音（愉悦音）**，两种声音不同；顶栏 🔊/🔇 静音；「已触发」点一下消掉；触发记录只保留最近 5 条；预警列表显示标的名称 |
| 拖出小浮窗 | 每张卡 ⧉ 可拖出独立最上层小窗，显示**最近 10 分钟 1 分钟 K 线走势**（时间轴 + 末端价 + 面积渐变 + 基准线）；可拖到任意位置、拖回主窗口范围自动收回、✕ 收回；浮窗只展示不重复报警 |
| 透明背景 | 顶栏 🪟 按钮或菜单栏下拉切换；**主窗口与所有小浮窗联动**（白板都白板、透明都透明），偏好持久化；点窗口空白处即可整窗拖动，按钮 / 输入框 / 卡片等交互区不受影响 |
| 非实时标识 | 顶栏明确标注「行情延迟约 10–30 秒 · 非实时」，避免把缓存数据误当交易所实时推送 |

## 运行方式

### 首次安装

```bash
npm run install:all        # 根 + api + web 依赖
npm run desktop:install    # desktop 依赖（Electron；postinstall 会自动本地签名）
```

### 构建并启动桌面 App

```bash
npm run build              # 构建界面 → web/dist
npm run desktop            # 启动菜单栏 App（= electron .）
```

启动后菜单栏出现「📈 盯盘」：左键点击展开 / 收起，右键菜单为「打开终端 / 透明背景 / 退出」。

`npm run desktop` 会自动拉起内置服务：优先 `127.0.0.1:18765`（被占用则回退空闲端口），同源出 `/api/*` 与 `web/dist`。若本机 `localhost:5173` 有 Vite 在跑，则直接走它拿热更新。

> ⚠️ 修改了 `desktop/main.js` 或 `desktop/preload.js` 后，必须**完全退出 Electron 再重启**——主进程不参与 Vite HMR，只刷新页面不会生效。

### 开发调试

```bash
npm run dev                # concurrently：Vite :5173 + 行情代理 :3001
npm run start              # 只起行情代理 :3001
```

浏览器打开 `http://localhost:5173` 即可用同一套 UI（浏览器模式下，点卡片走窗口内 Modal 兜底，透明按钮与拖出浮窗不可用）。

### 打包成可下载的 `.app`

```bash
cd desktop && npm run pack
```

流程：构建 `web/dist` → 把 `api/` 与 `web-dist/` 注入暂存目录 → `electron-packager` 打包 → `codesign --force --deep --sign -` 即席签名（绕过 macOS 对未签名 app 的拦截）。

产物：`desktop/finance-terminal-darwin-arm64/finance-terminal.app`

> 打包脚本目前固定 `darwin / arm64`，首次执行需下载 Electron。

## 技术栈

| 层 | 选型 |
|---|---|
| 桌面壳 | Electron 31：`Tray` + `BrowserWindow`（`frame:false` / `transparent:true` / `alwaysOnTop`）+ `ipcMain` + `contextBridge` preload；`-webkit-app-region` 实现拖动，macOS 透明合成层缓存用 `setBackgroundColor` + `invalidate` + bounds 抖动强制重绘 |
| 界面 | React 18 + Vite 5 + TypeScript + React Router；图表为手写 SVG（平滑曲线 / 面积渐变 / K 线 / 分时），无图表库；提示音用 Web Audio API |
| 内置服务 | Node 内置 `http`（无 Express）：同源托管 `web/dist` + `/api/*`，SPA fallback、MIME、防目录穿越、端口占用回退 |
| 行情代理 | 无状态：`api/_lib/handler.js` 路由 + `api/_lib/quotes.js` 数据源（内存缓存 + 降级兜底） |
| 数据持久化 | 自选 / 预警规则 / 触发记录 / 声音开关 → `localStorage`；透明偏好 → Electron `userData/ui-state.json`。全部本地，不上传、不跨设备同步 |

## 目录结构

```
api/
  server.js          内置 HTTP 服务（同源出界面 + 行情，桌面 App 用）
  _server.js         本地开发行情代理（:3001）
  _lib/handler.js    /api/* 路由
  _lib/quotes.js     行情抓取 + 缓存 + 兜底
desktop/
  main.js            Electron 主进程：菜单栏、主窗口、透明偏好、浮窗、放大图表窗口
  preload.js         contextBridge 暴露 window.appShell
  scripts/pack.js    打包 .app（含前端构建、资源注入、即席签名）
web/                 React + Vite 界面源码（构建产物 web/dist，已 gitignore）
  src/App.tsx        ?float=1 浮窗 / ?chart=1 放大图表窗口 / 主窗口 三路分流
  src/components/    StockChart / DetailPanel / ChartWindow / FloatWidget / MinuteSpark ...
```

## 数据源与接口

- **实时行情**：东方财富 `push2`、腾讯 `qt.gtimg.cn`（A 股，GBK 解码）；**K 线 / 分时**：`push2his`；**搜索**：`smartbox.gtimg.cn`。
- 商品与指数按 `secid` 市场号拆分（`0.` / `1.` 走腾讯，其余走东方财富），避免 WTI / 美元指数被只返回 A 股的源吞掉。国际金价历史用 COMEX 黄金连续 `101.GC00Y`。
- 缓存：实时 30 秒、历史 6 小时；失败时优先回退到「上次真实值」而非写死参考价。
- 前端 `axios baseURL='/api'`，同源请求内置服务。主要端点：`/api/health`、`/api/market/monitor`、`/api/market/stocks`、`/api/market/stock/kline`、`/api/market/stock/intraday`、`/api/market/gold`、`/api/market/gold/kline`、`/api/market/gold/intraday`、`/api/market/search`。

## 说明与限制

- 行情来自免费公开接口，存在缓存与限流，**约 10–30 秒延迟，非交易所实时推送**；仅供参考，**不构成投资建议**。公开接口可能变动，已做缓存与兜底。
- 打包目前仅 macOS arm64；窗口拖拽、透明实际透出桌面、浮窗拖回等 GUI 手感需在 macOS 实机验证（CI / 无头环境只能验证渲染层）。
- Electron 的 drag 区域不能选中 / 复制文本、不能拖滚动条（滚轮滚动正常），卡片与按钮已单独排除为 `no-drag` 以保证点击可用。
- 放大图表窗口为实底（不跟随透明切换），以保证 K 线清晰。
