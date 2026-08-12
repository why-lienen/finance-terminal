# 金融终端（Finance Terminal）

一个 Web 端的金融行情终端：聚合查看 **股票 / 全板块基金 / 黄金** 的实时行情，并记录你的**持仓收益**。
**纯前端 + 本地存储**，无需注册登录，打开即用；后端仅做无状态的公开行情代理（解决跨域）。
数据来自东方财富 / 腾讯 / 新浪等免费公开接口。

> 参考了 [fishing-funds](https://github.com/1zilc/fishing-funds) 的本地优先思路，并重写了基金估值数据源以规避其接口失效问题。

**仓库地址：** https://github.com/why-lienen/finance-terminal

## 功能
- 总看板：持仓总市值/总收益、实时金价、自选行情一屏看全
- 股票：A股/指数自选，腾讯实时行情
- 基金：全分类（股票/混合/债券/指数/QDII/FOF）排行
- 持仓中心：**一键导入我的持仓**（真实 6 位代码），按代码添加，实时估值自动算收益
- 黄金：实时金价 + 积存金估值
- 持仓与自选保存在浏览器本地（localStorage），匿名、随设备

## 数据源
- 股票/指数：腾讯 `qt.gtimg.cn`（GBK 解码）
- 基金排行：东方财富 `fundapi`
- 单只基金估值：新浪 `hq.sinajs.cn`（GBK 解码，返回 估算值/单位净值/涨跌幅）
- 实时金价：东方财富 Au99.99 → 新浪 AU9999 → 参考价兜底

## 技术栈
- 前端：React + Vite + TypeScript（持仓/自选存 localStorage）
- 行情代理：Node + Express（无状态，CORS 放开，可跑本地或部署为 Serverless）
- 数据源：东方财富 / 腾讯 / 新浪 免费公开接口

## 本地运行
```bash
npm run install:all      # 安装前后端依赖
npm run dev              # 前端 5173 + 行情代理 3001
```
打开 http://localhost:5173

## 部署（让别人也能访问）
本项目是「纯静态前端 + 无状态行情代理」，可一键部署到 Vercel / Netlify / GitHub Pages：

### Vercel（推荐，零配置）
1. 把本仓库推到 GitHub
2. 在 Vercel 导入该仓库（框架会自动识别 Vite；`vercel.json` 已配置构建与 `/api` 重写）
3. 部署完成后即可通过分配的域名访问，分享给任何人

> 行情代理以 Serverless Function 形式部署在 `api/` 目录，前端静态资源在 `web/dist`。
> 也可本地 `vercel` CLI 直接部署。

### 其他静态托管
前端是标准 Vite 产物（`web/dist`），可部署到任意静态托管；`/api` 需自行部署对应的 Node 服务（如 Railway / Render）。

## 说明
- 公开接口可能限流/变动，已做缓存与兜底；金价在某些网络环境下会回退到参考价。
- 持仓与自选仅存于当前浏览器，清除浏览器数据或更换设备不会同步（如需多端同步可后续接入云存储）。
