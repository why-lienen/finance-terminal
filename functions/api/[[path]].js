// Cloudflare Pages Function — 处理所有 /api/* 请求
// 兼容 Cloudflare Workers 运行时（Web 标准 fetch/Request/Response）
// 部署后自动匹配 /api/health, /api/market/* 等所有路由

// ====== 缓存 ======
const CACHE_TTL = 30 * 1000;
const cache = new Map();

function getCached(key) {
  const c = cache.get(key);
  if (c && Date.now() - c.ts < CACHE_TTL) return c.data;
  return null;
}
function setCache(key, data) {
  cache.set(key, { ts: Date.now(), data });
}

// ====== 通用请求工具 ======
async function fetchText(url, headers = {}, retries = 2, timeout = 8000) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://quote.eastmoney.com/', ...headers },
      });
      if (!res.ok) throw new Error('http ' + res.status);
      return await res.text();
    } catch (e) {
      lastErr = e;
      if (i < retries) await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

// ====== 股票行情（腾讯 qt.gtimg.cn） ======
function secidToTencent(secid) {
  const [m, code] = String(secid).split('.');
  if (!code) return secid;
  const prefix = m === '1' ? 'sh' : m === '0' ? 'sz' : 'sh';
  return prefix + code;
}

async function getStocks(secids) {
  const key = 'stocks:' + secids.join(',');
  const cached = getCached(key);
  if (cached) return cached;
  try {
    const syms = secids.map(secidToTencent);
    const url = `https://qt.gtimg.cn/q=${syms.join(',')}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://gu.qq.com/' },
    });
    if (!res.ok) throw new Error('http ' + res.status);
    const buf = await res.arrayBuffer();
    const text = new TextDecoder('gbk').decode(buf);
    const re = /v_(\w+)="([^"]*)"/g;
    const out = [];
    let m;
    while ((m = re.exec(text))) {
      const f = m[2].split('~');
      const code = f[2], name = f[1];
      const price = parseFloat(f[3]);
      if (!code || !name || isNaN(price)) continue;
      out.push({ code, name, price, change: parseFloat(f[31]) || 0, pct: parseFloat(f[32]) || 0, open: parseFloat(f[5]) || 0, high: parseFloat(f[33]) || 0, low: parseFloat(f[34]) || 0, prevClose: parseFloat(f[4]) || 0, volume: parseFloat(f[6]) || 0 });
    }
    if (out.length) { setCache(key, out); return out; }
    throw new Error('empty');
  } catch (e) {
    // 兜底：东方财富 push2
    try {
      const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2&fields=f12,f13,f14,f2,f3,f4,f5,f6,f15,f16,f18&secids=${secids.join(',')}`;
      const text = await fetchText(url);
      const json = JSON.parse(text);
      const diff = json?.data?.diff || [];
      const list = diff.filter((d) => d && d.f2 !== '-' && d.f2 != null).map((d) => ({
        code: String(d.f12), market: d.f13, name: d.f14, price: +d.f2, pct: +d.f3, change: +d.f4, open: +d.f5, high: +d.f15, low: +d.f16, prevClose: +d.f18, volume: +d.f6,
      }));
      if (list.length) { setCache(key, list); return list; }
    } catch (_) {}
    return getCached(key) || [];
  }
}

// ====== 基金估值（新浪 hq.sinajs.cn） ======
async function getFundEst(code) {
  const key = 'fundest:' + code;
  const cached = getCached(key);
  if (cached) return cached;
  try {
    const url = `https://hq.sinajs.cn/list=fu_${code}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://finance.sina.com.cn/' },
    });
    if (!res.ok) throw new Error('http ' + res.status);
    const buf = await res.arrayBuffer();
    const txt = new TextDecoder('gbk').decode(buf);
    const m = txt.match(/hq_str_fu_(\d+)="([^"]*)"/);
    if (!m) throw new Error('no match');
    const f = m[2].split(',');
    const gsz = parseFloat(f[2]), dwjz = parseFloat(f[3]), ljjz = parseFloat(f[4]), gszzl = parseFloat(f[6]);
    const price = Number.isFinite(gsz) && gsz > 0 ? gsz : (Number.isFinite(dwjz) ? dwjz : null);
    const pct = Number.isFinite(gszzl) ? gszzl : null;
    const data = { code, name: f[0] || code, gsz: Number.isFinite(gsz) ? gsz : null, dwjz: Number.isFinite(dwjz) ? dwjz : null, ljjz: Number.isFinite(ljjz) ? ljjz : null, gszzl: pct, price, pct, date: f[7] || null, estimated: Number.isFinite(gsz) && gsz > 0 };
    setCache(key, data);
    return data;
  } catch (e) {
    return getCached(key) || null;
  }
}

// ====== 基金排行（东方财富 fundapi） ======
async function getFundRank(ft = 'all', pn = 20) {
  const key = `fundrank:${ft}:${pn}`;
  const cached = getCached(key);
  if (cached) return cached;
  try {
    const url = `https://fundapi.eastmoney.com/fundtradenew.aspx?ft=${ft}&sc=1nzf&st=desc&pi=1&pn=${pn}&fl=0&isab=1`;
    const text = await fetchText(url, { Referer: 'https://fundf10.eastmoney.com/' });
    const m = text.match(/var rankData\s*=\s*(\{[\s\S]*?\});/);
    if (!m) throw new Error('no match');
    const obj = (new Function('return ' + m[1]))();
    const datas = obj.data1 || obj.datas || [];
    const list = datas.map((row) => {
      const r = String(row).split('|');
      const num = (i) => { const v = parseFloat(r[i]); return Number.isFinite(v) ? v : 0; };
      return { code: r[0], name: r[1], type: r[2], net: num(4), day: num(5), week: num(6), month: num(7), year: num(10) || num(11) };
    });
    setCache(key, list);
    return list;
  } catch (e) {
    return getCached(key) || [];
  }
}

// ====== 金价 ======
async function getGold() {
  const key = 'gold';
  const cached = getCached(key);
  if (cached) return cached;
  try {
    const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=113.Au99.99&fields=f43,f57,f58&fltt=2`;
    const text = await fetchText(url, { Referer: 'https://quote.eastmoney.com/' }, 0, 5000);
    const json = JSON.parse(text);
    const d = json?.data;
    if (d && d.f43 && !isNaN(parseFloat(d.f43))) {
      const data = { price: parseFloat(d.f43), code: d.f57, name: d.f58 || 'Au99.99', source: 'eastmoney', stale: false };
      setCache(key, data);
      return data;
    }
  } catch (_) {}
  try {
    const res = await fetch('https://hq.sinajs.cn/list=AU9999', {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://finance.sina.com.cn/' },
    });
    const txt = await res.text();
    const m = txt.match(/var hq_str_AU9999="([^"]*)"/);
    if (m && m[1]) {
      const f = m[1].split(',');
      const price = parseFloat(f[1]) || parseFloat(f[2]);
      if (Number.isFinite(price) && price > 0) {
        const data = { price, code: 'AU9999', name: 'Au99.99(新浪)', source: 'sina', stale: false };
        setCache(key, data);
        return data;
      }
    }
  } catch (_) {}
  return cached || { price: 560.0, name: 'Au99.99(参考价)', source: 'fallback', stale: true, note: '行情接口暂不可用' };
}

// ====== 路由入口 ======
export async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }

  let url;
  try {
    url = new URL(request.url);
  } catch (e) {
    return json({ error: 'bad url' }, 400);
  }

  const path = url.pathname;
  const q = url.searchParams;

  try {
    if (path === '/api/health') return json({ ok: true });

    if (path === '/api/market/stocks') {
      const secids = (q.get('secids') || '').split(',').filter(Boolean);
      if (!secids.length) return json([]);
      return json(await getStocks(secids));
    }

    if (path === '/api/market/fund/estimate') {
      const code = (q.get('code') || '').trim();
      if (!/^\d{6}$/.test(code)) return json({ error: 'need 6-digit fund code' }, 400);
      const d = await getFundEst(code);
      if (!d) return json({ error: 'fund estimate unavailable' }, 502);
      return json(d);
    }

    if (path === '/api/market/funds/rank') {
      const ft = q.get('ft') || 'all';
      const pn = parseInt(q.get('pn') || '30', 10);
      return json(await getFundRank(ft, pn));
    }

    if (path === '/api/market/gold') {
      return json(await getGold());
    }

    return json({ error: 'not found', path }, 404);
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 500);
  }
}
