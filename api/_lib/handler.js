// 统一的请求入口（Vercel 函数 与 本地开发服务器共用）
// 注意：这里只解析 req.url，必须由“能拿到完整原始路径”的入口调用：
//   - Vercel: api/[...path].js（catch-all 函数，req.url 为 /api/market/...）
//   - 本地:   api/_server.js（http 服务器，req.url 为完整路径）
const quotes = require('./quotes');

function send(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

async function handler(req, res) {
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

    if (path === '/api/market/fund/history') {
      const code = (q.get('code') || '').trim();
      const range = q.get('range') || '1y';
      if (!/^\d{6}$/.test(code)) return send(res, 400, { error: 'need 6-digit fund code' });
      return send(res, 200, await quotes.getFundHistory(code, range));
    }

    if (path === '/api/market/stock/kline') {
      const secid = (q.get('secid') || '').trim();
      const period = q.get('period') || 'day';
      const limit = parseInt(q.get('limit') || '60', 10);
      if (!secid) return send(res, 400, { error: 'need secid' });
      return send(res, 200, await quotes.getKline(secid, period, limit));
    }

    if (path === '/api/market/gold') {
      return send(res, 200, await quotes.getGold());
    }

    if (path === '/api/market/search') {
      const kw = (q.get('kw') || '').trim();
      if (!kw) return send(res, 200, []);
      return send(res, 200, await quotes.getSearch(kw));
    }

    return send(res, 404, { error: 'not found', path });
  } catch (e) {
    return send(res, 500, { error: String((e && e.message) || e) });
  }
}

module.exports = handler;
module.exports.handler = handler;
