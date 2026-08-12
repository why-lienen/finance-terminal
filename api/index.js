// Vercel Serverless Function —— 纯 Node 内置模块，零外部依赖（避免 Vercel 装包失败）
// 无需 express/cors，用内置 http/url 实现路由与 CORS，最大程度兼容 Vercel 运行时。
const quotes = require('./src/market/quotes');

function send(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

module.exports = async function handler(req, res) {
  // CORS 预检
  if (req.method === 'OPTIONS') return send(res, 204, {});

  let path, q;
  try {
    const u = new URL(req.url, 'http://localhost');
    path = u.pathname;
    q = u.searchParams;
  } catch (e) {
    return send(res, 400, { error: 'bad url' });
  }

  try {
    if (path === '/api/health') return send(res, 200, { ok: true });

    if (path === '/api/market/stocks') {
      const secids = (q.get('secids') || '').split(',').filter(Boolean);
      if (!secids.length) return send(res, 200, []);
      return send(res, 200, await quotes.getStocks(secids));
    }

    if (path === '/api/market/fund/estimate') {
      const code = (q.get('code') || '').trim();
      if (!/^\d{6}$/.test(code)) return send(res, 400, { error: 'need 6-digit fund code' });
      const d = await quotes.getFundEst(code);
      if (!d) return send(res, 502, { error: 'fund estimate unavailable' });
      return send(res, 200, d);
    }

    if (path === '/api/market/funds/rank') {
      const ft = q.get('ft') || 'all';
      const pn = parseInt(q.get('pn') || '30', 10);
      return send(res, 200, await quotes.getFundRank(ft, pn));
    }

    if (path === '/api/market/gold') {
      return send(res, 200, await quotes.getGold());
    }

    return send(res, 404, { error: 'not found', path });
  } catch (e) {
    return send(res, 500, { error: String((e && e.message) || e) });
  }
};
