// 公开行情接口代理 + 内存缓存 + 降级兜底（无状态，不依赖数据库）
// 注意：本文件位于 api/_lib/ 下划线目录，Vercel 不会把它当作独立 Serverless Function 部署，
// 而是作为 api/[...path].js 的依赖被打进同一个函数包。
const CACHE_TTL = 30 * 1000;
const HISTORY_TTL = 6 * 60 * 60 * 1000; // 历史净值/K线变化慢，缓存久一点
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
  if (c && Date.now() - c.ts < c.ttl) return c.data;
  return null;
}
// 无视 TTL 读取最后一次缓存值（用于兜底时优先返回“上次真实值”而非写死参考价）
function getCacheSoft(key) {
  const c = cache.get(key);
  return c ? c.data : null;
}
function setCache(key, data, ttl = CACHE_TTL) {
  cache.set(key, { ts: Date.now(), ttl, data });
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

// 基金排行（东方财富 fundapi）。标准列序：
// 0代码 1名称 2类型 3日期 4单位净值 5累计净值 6日涨幅 7近1周 8近1月 9近3月 10近6月 11近1年 12近2年 13近3年 14今年来 15成立来
async function getFundRank(ft = 'all', pn = 20) {
  const key = `fundrank:${ft}:${pn}`;
  const cached = getCached(key);
  if (cached) return cached;
  const url = `https://fundapi.eastmoney.com/fundtradenew.aspx?ft=${ft}&sc=1nzf&st=desc&pi=1&pn=${pn}&fl=0&isab=1`;
  try {
    const text = await fetchText(url, { Referer: 'https://fundf10.eastmoney.com/' });
    const m = text.match(/var rankData\s*=\s*(\{[\s\S]*?\});/);
    if (!m) throw new Error('no match');
    const obj = JSON.parse(m[1]); // 直接 JSON.parse，比 new Function 更安全
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
        date: r[3] || null,
        net: num(4),
        acc: num(5),
        day: num(6),
        week: num(7),
        month: num(8),
        quarter: num(9),
        half: num(10),
        year: num(11),
        y2: num(12),
        ytd: num(14),
        total: num(15),
      };
    });
    setCache(key, list);
    return list;
  } catch (e) {
    return getCached(key) || [];
  }
}

// 基金净值历史（东方财富 f10/lsjz），返回 [{date, nav, acc}]
async function getFundHistory(code, range = '1y') {
  const sizeMap = { '1m': 30, '3m': 90, '6m': 180, '1y': 365, '3y': 1095 };
  const pn = sizeMap[range] || 365;
  const key = `fundhist:${code}:${range}`;
  const cached = getCached(key);
  if (cached) return cached;
  const url = `https://api.fund.eastmoney.com/f10/lsjz?callback=&fundCode=${code}&pageIndex=1&pageSize=${pn}&_=${Date.now()}`;
  try {
    const text = await fetchText(url, {
      Referer: `https://fundf10.eastmoney.com/F10/jjjz_${code}.html`,
      'Accept': 'application/json',
    });
    const json = JSON.parse(text);
    const rows = json?.Data?.LSJZList || [];
    // 接口默认最新在前，翻转为时间升序
    const list = rows
      .map((r) => ({
        date: String(r.FSRQ || '').slice(0, 10),
        nav: parseFloat(r.DWJZ),
        acc: parseFloat(r.LJJZ),
      }))
      .filter((x) => x.date && Number.isFinite(x.nav))
      .reverse();
    setCache(key, list, HISTORY_TTL);
    return list;
  } catch (e) {
    return getCached(key) || [];
  }
}

// K线（东方财富 push2his）：股票/指数/黄金通用，secid 如 1.600519 / 113.Au99.99
// period: day=101 week=102 month=103；返回 [{date, open, close, high, low, vol}]
async function getKline(secid, period = 'day', limit = 60) {
  const kltMap = { day: 101, week: 102, month: 103, '60m': 61, '30m': 31, '15m': 21, '5m': 5 };
  const klt = kltMap[period] || 101;
  const key = `kline:${secid}:${period}:${limit}`;
  const cached = getCached(key);
  if (cached) return cached;
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}` +
    `&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58&klt=${klt}&fqt=0&end=20500101&lmt=${limit}`;
  try {
    const text = await fetchText(url, { Referer: 'https://quote.eastmoney.com/' }, 1, 8000);
    const json = JSON.parse(text);
    const klines = json?.data?.klines || [];
    const name = json?.data?.name || '';
    const code = json?.data?.code || secid;
    const list = klines.map((s) => {
      const p = String(s).split(',');
      return {
        date: p[0],
        open: parseFloat(p[1]),
        close: parseFloat(p[2]),
        high: parseFloat(p[3]),
        low: parseFloat(p[4]),
        vol: parseFloat(p[5]),
      };
    });
    const data = { code, name, period, list };
    setCache(key, data, HISTORY_TTL);
    return data;
  } catch (e) {
    return getCached(key) || { code: secid, name: '', period, list: [] };
  }
}

// 股票/指数搜索（腾讯智能选股 smartbox，免 token，支持中文名/代码）
// 返回 [{code, secid, name, type}]，secid 形如 1.600519 / 0.002181
async function getSearch(kw) {
  const key = 'search:' + kw;
  const cached = getCached(key);
  if (cached) return cached;
  const url = `https://smartbox.gtimg.cn/s3/?t=all&q=${encodeURIComponent(kw)}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://stockapp.finance.qq.com/' },
    });
    if (!res.ok) throw new Error('http ' + res.status);
    const buf = await res.arrayBuffer();
    let text;
    try {
      text = new TextDecoder('gbk').decode(buf);
    } catch (_) {
      text = new TextDecoder('utf-8').decode(buf); // 极少数 Node 未带 full-icu 时的兜底
    }
    const eq = text.indexOf('=');
    if (eq < 0) return [];
    const arrText = text.slice(eq + 1).trim().replace(/;$/, '');
    const arr = JSON.parse(arrText);
    const list = (Array.isArray(arr) ? arr : [])
      .slice(0, 12)
      .map((it) => {
        const code = String(it.code || '');
        const num = code.replace(/^[a-z]+/i, '');
        if (!/^\d{6}$/.test(num)) return null;
        const market = code.toLowerCase().startsWith('sh') ? '1' : '0';
        return { code: num, secid: market + '.' + num, name: String(it.name || ''), type: String(it.type || '') };
      })
      .filter((x) => x && x.name);
    setCache(key, list, 5 * 60 * 1000);
    return list;
  } catch (e) {
    return [];
  }
}

// 实时金价（元/克）：多源取数，任一有效即返回，最后兜底参考价
// 源顺序：新浪 SGE AU9999（最新价 f[3]）> 东方财富 Au99.99 > 参考价
async function getGold() {
  const key = 'gold';
  const cached = getCacheSoft(key);

  // 源1：新浪 SGE AU9999（元/克，最新价在 f[3]）
  try {
    const res = await fetch('https://hq.sinajs.cn/list=AU9999', {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://finance.sina.com.cn/' },
    });
    const txt = await res.text();
    const m = txt.match(/var hq_str_AU9999="([^"]*)"/);
    if (m && m[1]) {
      const f = m[1].split(',');
      const price = parseFloat(f[3]) || parseFloat(f[1]);
      if (Number.isFinite(price) && price > 200 && price < 3000) {
        const data = { price, code: 'AU9999', name: 'Au99.99(新浪SGE)', source: 'sina', stale: false };
        setCache(key, data, 15000);
        return data;
      }
    }
  } catch (_) {}

  // 源2：东方财富 上海金交所 Au99.99
  try {
    const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=113.Au99.99&fields=f43,f57,f58&fltt=2`;
    const text = await fetchText(url, { Referer: 'https://quote.eastmoney.com/' }, 0, 5000);
    const json = JSON.parse(text);
    const d = json?.data;
    const p = parseFloat(d?.f43);
    if (d && Number.isFinite(p) && p > 200 && p < 3000) {
      const data = { price: p, code: d.f57, name: d.f58 || 'Au99.99', source: 'eastmoney', stale: false };
      setCache(key, data, 15000);
      return data;
    }
  } catch (_) {}

  // 兜底：返回上次成功值（若有）或参考价，并标记 stale
  return cached || { price: 560.0, name: 'Au99.99(参考价)', source: 'fallback', stale: true, note: '行情接口暂不可用，使用参考价' };
}

module.exports = { getStocks, getFundEst, getFundRank, getFundHistory, getKline, getGold, getSearch };
