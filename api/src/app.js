// Express 应用（无状态行情代理，不含数据库/登录）。本地与 Vercel serverless 共用。
const express = require('express');
const cors = require('cors');
const market = require('./routes/market');

const app = express();
app.use(cors()); // 放开跨域，纯静态前端也可直接调用
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/market', market);

module.exports = app;
