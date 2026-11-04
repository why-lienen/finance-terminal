// 共享 HTTP 服务：既提供 /api/* 行情接口（复用 Vercel 同一 handler），又托管前端构建产物。
// 桌面 app 不再依赖 `npm run dev`（Vite）：一个本地服务同时出界面 + 行情；东方财富/腾讯的 CORS 也在这层代理掉。
//
// 路径解析（同时支持两种运行位置）：
//   - 开发时：从 desktop/ 跑 `electron .` → api 在 ../api/server.js，web-dist 在 ../web/dist
//   - 打包后：api 与 web-dist 随 app 一起进入 app/ 内 → ./api/server.js、./web-dist
const http = require('http');
const fs = require('fs');
const path = require('path');
const handler = require('./_lib/handler');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
};

function send(res, status, body, headers) {
  res.writeHead(status, headers || {});
  res.end(body);
}

// 按候选路径定位前端构建产物 web-dist；每次请求都重新探测，支持先启动服务后构建
//  - 打包后：server.js 在 app/api/server.js，web-dist 位于 app/web-dist → ../web-dist
//  - 开发时：server.js 在项目根/api/server.js，web/dist 位于 项目根/web/dist → ../web/dist
function resolveWebDist() {
  const candidates = [
    process.env.WEB_DIST,
    path.join(__dirname, '../web-dist'),
    path.join(__dirname, '../web/dist'),
  ].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return path.join(__dirname, '../web/dist');
}

function serveStatic(req, res) {
  const WEB_DIST = resolveWebDist();
  if (!fs.existsSync(WEB_DIST)) {
    return send(
      res,
      503,
      '前端尚未构建。请先执行：cd web && npm run build （或由桌面 app 的打包脚本自动构建）。',
      { 'Content-Type': 'text/plain; charset=utf-8' },
    );
  }
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.normalize(path.join(WEB_DIST, urlPath));
  // 防目录穿越
  if (!filePath.startsWith(WEB_DIST)) return send(res, 403, 'forbidden');
  fs.readFile(filePath, (err, data) => {
    if (!err) {
      const ext = path.extname(filePath).toLowerCase();
      return send(res, 200, data, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    }
    // 非资源路径（无扩展名）回退到 index.html（SPA）
    if (!path.extname(filePath)) {
      fs.readFile(path.join(WEB_DIST, 'index.html'), (e2, d2) => {
        if (e2) return send(res, 404, 'not found');
        return send(res, 200, d2, { 'Content-Type': 'text/html; charset=utf-8' });
      });
    } else {
      send(res, 404, 'not found');
    }
  });
}

function createServer() {
  return http.createServer((req, res) => {
    const url = req.url || '/';
    if (url.startsWith('/api/')) handler(req, res);
    else serveStatic(req, res);
  });
}

// 监听本地端口；preferred 被占用时回退到系统分配的空闲端口（port 0）
function listen(host = '127.0.0.1', preferred = 18765) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    let settled = false;
    server.once('error', (err) => {
      if (!settled && err.code === 'EADDRINUSE') {
        settled = true;
        server.listen(0, host, () => {
          const addr = server.address();
          resolve({ server, port: addr.port, host });
        });
        return;
      }
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
    server.listen(preferred, host, () => {
      if (settled) return;
      settled = true;
      const addr = server.address();
      resolve({ server, port: addr.port, host });
    });
  });
}

module.exports = { createServer, listen };
