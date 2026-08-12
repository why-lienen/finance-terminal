// Vercel Serverless Function 入口（所有后端代码均在 api/ 内，确保被打包）
// 用 @vercel/node 的 createServer 包装 Express，兼容 Vercel 运行时
const { createServer } = require('@vercel/node');
const app = require('./src/app');

module.exports = createServer(app);
