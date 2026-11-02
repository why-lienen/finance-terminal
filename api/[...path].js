// Vercel Serverless Function（catch-all）：所有 /api/* 都进这里
// 文件名 [...]path.js 是 Vercel 的“可选 catch-all”写法，能匹配 /api 以及 /api/market/...
// 这样不需要在 vercel.json 里做会“吃掉路径”的 rewrite。
module.exports = require('./_lib/handler');
