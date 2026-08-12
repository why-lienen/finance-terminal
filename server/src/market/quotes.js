// 公开行情接口代理 + 内存缓存 + 降级兜底（无状态，不依赖数据库）
const CACHE_TTL = 30 * 1000;
const cache = new Map(); // key -> { ts, data }

async function fetchText(url, headers = {}, retries = 2, timeout = 8000) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Referer': 'https://quote.eastmoney.com/',
          ...headers,
        },
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

function getCached(key) {
  const c = cache.get(key);
  if (c && Date.now() - c.ts < CACHE_TTL) return c.data;
  return null;
}
function setCache(key, data) {
  cache.set(key, { ts: Date.now(), data });
}

// 股票/指数行情：腾讯 qt.gtimg.cn 为主源（稳定、GBK 解码），东方财富 push2 兜底
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
    const list = await getStocksTencent(secids);
    if (list.length) { setCache(key, list); return list; }
    throw new Error('empty');
  } catch (e) {
    try {
      const list = await getStocksPush2(secids);
      if (list.length) { setCache(key, list); return list; }
    } catch (_) {}
    return getCached(key) || [];
  }
}

async function getStocksTencent(secids) {
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
    const code = f[2];
    const name = f[1];
    const price = parseFloat(f[3]);
    if (!code || !name || isNaN(price)) continue;
    out.push({
      code,
      name,
      price,
      change: parseFloat(f[31]) || 0,
      pct: parseFloat(f[32]) || 0,
      open: parseFloat(f[5]) || 0,
      high: parseFloat(f[33]) || 0,
      low: parseFloat(f[34]) || 0,
      prevClose: parseFloat(f[4]) || 0,
      volume: parseFloat(f[6]) || 0,
    });
  }
  return out;
}

async function getStocksPush2(secids) {
  const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2&fields=f12,f13,f14,f2,f3,f4,f5,f6,f15,f16,f18&secids=${secids.join(',')}`;
  const text = await fetchText(url);
  const json = JSON.parse(text);
  const diff = json?.data?.diff || [];
  return diff
    .filter((d) => d && d.f2 !== '-' && d.f2 != null)
    .map((d) => ({
      code: String(d.f12),
      market: d.f13,
      name: d.f14,
      price: +d.f2,
      pct: +d.f3,
      change: +d.f4,
      open: +d.f5,
      high: +d.f15,
      low: +d.f16,
      prevClose: +d.f18,
      volume: +d.f6,
    }));
}

// 单只基金估值（新浪 hq.sinajs.cn，GBK 解码）。字段：
// [0]名称 [2]估算值(gsz) [3]单位净值(dwjz) [4]累计净值 [6]估算涨跌幅(gszzl) [7]净值日期
async function getFundEst(code) {
  const key = 'fundest:' + code;
  const cached = getCached(key);
  if (cached) return cached;
  const url = `https://hq.sinajs.cn/list=fu_${code}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://finance.sina.com.cn/' },
    });
    if (!res.ok) throw new Error('http ' + res.status);
    const buf = await res.arrayBuffer();
    const txt = new TextDecoder('gbk').decode(buf);
    const m = txt.match(/hq_str_fu_(\d+)="([^"]*)"/);
    if (!m) throw new Error('no match');
    const f = m[2].split(',');
    const gsz = parseFloat(f[2]);
    const dwjz = parseFloat(f[3]);
    const ljjz = parseFloat(f[4]);
    const gszzl = parseFloat(f[6]);
    const price = Number.isFinite(gsz) && gsz > 0 ? gsz : (Number.isFinite(dwjz) ? dwjz : null);
    const pct = Number.isFinite(gszzl) ? gszzl : null;
    const data = {
      code,
      name: f[0] || code,
      gsz: Number.isFinite(gsz) ? gsz : null,
      dwjz: Number.isFinite(dwjz) ? dwjz : null,
      ljjz: Number.isFinite(ljjz) ? ljjz : null,
      gszzl: pct,
      price,
      pct,
      date: f[7] || null,
      estimated: Number.isFinite(gsz) && gsz > 0,
    };
    setCache(key, data);
    return data;
  } catch (e) {
    return getCached(key) || null;
  }
}

// 基金排行（东方财富 fundapi，jsonp: var rankData = {...}），字段已升级为 data1
async function getFundRank(ft = 'all', pn = 20) {
  const key = `fundrank:${ft}:${pn}`;
  const cached = getCached(key);
  if (cached) return cached;
  const url = `https://fundapi.eastmoney.com/fundtradenew.aspx?ft=${ft}&sc=1nzf&st=desc&pi=1&pn=${pn}&fl=0&isab=1`;
  try {
    const text = await fetchText(url, { Referer: 'https://fundf10.eastmoney.com/' });
    const m = text.match(/var rankData\s*=\s*(\{[\s\S]*?\});/);
    if (!m) throw new Error('no match');
    const obj = (new Function('return ' + m[1]))();
    const datas = obj.data1 || obj.datas || [];
    const list = datas.map((row) => {
      const r = String(row).split('|');
      const num = (i) => {
        const v = parseFloat(r[i]);
        return Number.isFinite(v) ? v : 0;
      };
      return {
        code: r[0],
        name: r[1],
        type: r[2],
        net: num(4), // 单位净值
        day: num(5), // 日涨幅
        week: num(6), // 近1周
        month: num(7), // 近1月
        year: num(10) || num(11), // 近1年(空则退回近2年)
      };
    });
    setCache(key, list);
    return list;
  } catch (e) {
    return getCached(key) || [];
  }
}

// 实时金价（元/克）：优先东方财富 Au99.99，其次新浪 SGE AU9999，最后兜底参考价
async function getGold() {
  const key = 'gold';
  const cached = getCached(key);
  if (cached) return cached;
  // 源1：东方财富上海金交所 Au99.99（本环境常被拦截，快速失败走兜底）
  try {
    const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=113.Au99.99&fields=f43,f57,f58&fltt=2`;
    const text = await fetchText(url, { Referer: 'https://quote.eastmoney.com/' }, 0, 5000);
    const json = JSON.parse(text);
    const d = json?.data;
    if (d && d.f43 && !isNaN(parseFloat(d.f43))) {
      const data = {
        price: parseFloat(d.f43),
        code: d.f57,
        name: d.f58 || 'Au99.99',
        source: 'eastmoney',
        stale: false,
      };
      setCache(key, data);
      return data;
    }
  } catch (_) {}
  // 源2：新浪 SGE AU9999（元/克）
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch('https://hq.sinajs.cn/list=AU9999', {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://finance.sina.com.cn/' },
    });
    const txt = await res.text();
    clearTimeout(t);
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
  // 兜底：不缓存，避免长期锁定
  return cached || { price: 560.0, name: 'Au99.99(参考价)', source: 'fallback', stale: true, note: '行情接口暂不可用，使用参考价' };
}

module.exports = { getStocks, getFundEst, getFundRank, getGold };
