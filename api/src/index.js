// 本地开发入口：启动 Express 服务（无数据库）
const app = require('./app');
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`[server] listening on http://localhost:${PORT}`));
