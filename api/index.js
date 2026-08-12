// Vercel Serverless Function 入口
// 用 @vercel/node 的 createServer 包装 Express，确保与 Vercel 运行时兼容
const { createServer } = require('@vercel/node');
const app = require('../server/src/app');

module.exports = createServer(app);
