// Vercel Serverless Function 入口（所有后端代码均在 api/ 内，确保被打包）
// Express app 本身即 (req, res) => void，Vercel Node 运行时直接调用即可。
module.exports = require('./src/app');
