// 本地开发入口：用 Node 内置 http 启动服务（无需 express，复用 Vercel 同一 handler）
const http = require('http');
const handler = require('../index');

const PORT = process.env.PORT || 3001;
http.createServer((req, res) => handler(req, res)).listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});
