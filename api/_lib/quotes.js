// 公开行情接口代理 + 内存缓存 + 降级兜底（无状态，不依赖数据库）
// 注意：本文件位于 api/_lib/ 下划线目录，Vercel 不会把它当作独立 Serverless Function 部署，
// 而是作为 api/[...path].js 的依赖被打进同一个函数包。
const CACHE_TTL = 30 * 1000;
const HISTORY_TTL = 6 * 60 * 60 * 1000; // 历史净值/K线变化慢，缓存久一点
const cache = new Map(); // key -> { ts, data }
const sinaRealtime = require('./sinaRealtime');

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

// 腾讯源只支持 A股(sh/sz)；商品/指数(如 100.UDI / 102.CL00Y)必须走东方财富。
// 之前“腾讯只回了 A股就让 list.length>0 直接返回”，会把商品标的悄悄丢弃。
// 改为按市场号拆分：0/1 走腾讯(兜底东方财富)，其余直接走东方财富，互不干扰。
function splitBySource(secids) {
  const cn = [];
  const other = [];
  for (const s of secids) {
    const m = String(s).split('.')[0];
    if (m === '0' || m === '1') cn.push(s);
    else other.push(s);
  }
  return { cn, other };
}

async function getStocks(secids) {
  const key = 'stocks:' + secids.join(',');
  const cached = getCached(key);
  if (cached) return cached;
  const { cn, other } = splitBySource(secids);
  const parts = await Promise.all([
    cn.length ? getStocksCn(cn) : Promise.resolve([]),
    other.length ? getStocksPush2(other) : Promise.resolve([]),
  ]);
  const list = [].concat(parts[0], parts[1]);
  if (list.length) { setCache(key, list); return list; }
  return getCached(key) || [];
}

// A股：腾讯为主、东方财富兜底（此分支只含 0/1 市场，不会误丢商品）
async function getStocksCn(secids) {
  try {
    const list = await getStocksTencent(secids);
    if (list.length) return list;
    throw new Error('empty');
  } catch (e) {
    try {
      const list = await getStocksPush2(secids);
      if (list.length) return list;
    } catch (_) {}
    return [];
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
async function getKlineRaw(secid, period = 'day', limit = 60) {
  const kltMap = { day: 101, week: 102, month: 103, '1min': 1, '5m': 5, '15m': 21, '30m': 31, '60m': 61 };
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
    // 分钟级 K 线变化快，用短缓存；日/周/月变化慢，沿用长缓存
    const isMinute = ['1min', '5m', '15m', '30m', '60m'].includes(period);
    setCache(key, data, isMinute ? 20000 : HISTORY_TTL);
    return data;
  } catch (e) {
    return getCached(key) || { code: secid, name: '', period, list: [] };
  }
}

// 1 分钟 K 线的「末端实时补点」：
// 东财免费源对国际商品（101.GC00Y / 102.CL00Y）的 1 分钟 K 线恒定滞后约 10 分钟，
// 这里把新浪零延迟快照自采的分钟 bar 追加到东财历史末端，让图走到当前分钟。
// 只对 1min + 这两个 secid 生效；美元指数 100.UDI 东财本来就实时，不参与。
// 关键：东财历史部分仍走 getKlineRaw 的 20 秒缓存，实时段每次现算，不会被缓存僵住。
async function getKline(secid, period = 'day', limit = 60) {
  const base = await getKlineRaw(secid, period, limit);
  const list = base.list || [];
  const asOf = list.length ? list[list.length - 1].date : null;

  if (period !== '1min' || !sinaRealtime.MAP[secid] || !list.length) {
    return { ...base, asOf, realtimeCount: 0 };
  }
  try {
    const extra = sinaRealtime.getAlignedBars(secid, list);
    if (!extra.length) return { ...base, asOf, realtimeCount: 0 };
    // concat 生成新数组，不污染 getKlineRaw 的缓存对象
    const merged = list.concat(extra);
    return {
      ...base,
      list: merged,
      asOf: merged[merged.length - 1].date,
      realtimeCount: extra.length,
      realtimeFrom: extra[0].date,
      sourceNote: '东财历史 1 分钟 K 线（源端约 10 分钟延迟）+ 新浪实时报价自采补点',
    };
  } catch (e) {
    return { ...base, asOf, realtimeCount: 0 };
  }
}

// 诊断用：暴露新浪自采源的实时状态（末端时间、bar 数、与本地时间差）
function getRealtimeStatus() {
  return sinaRealtime.getStatus();
}

// 分时（全天/多日）：东方财富 push2his trends2，返回每根分钟的 最新价/均价/成交量
// 用于"分时/五日"走势图；days=1 为当日，days=5 为最近5个交易日拼接
async function getIntraday(secid, days = 1) {
  const key = `intraday:${secid}:${days}`;
  const cached = getCached(key);
  if (cached) return cached;
  const url =
    `https://push2his.eastmoney.com/api/qt/stock/trends2/get?secid=${secid}` +
    `&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56,f57,f58&iscr=0&ndays=${days}&forcect=1`;
  try {
    const text = await fetchText(url, { Referer: 'https://quote.eastmoney.com/' }, 1, 8000);
    const json = JSON.parse(text);
    const trends = json?.data?.trends || [];
    const list = trends
      .map((s) => {
        const p = String(s).split(',');
        const price = parseFloat(p[3]); // 最新价 (f53)
        const avgRaw = parseFloat(p[7]); // 均价 (f58)
        const volRaw = parseFloat(p[5]); // 成交量(手) (f56)
        // 指数类标的（如 100.UDI 美元指数）东财 trends2 的 f58 均价与 f56 成交量恒为 0，
        // 那是「无此字段」而非真实均价/成交量。若原样透传，前端会把 0 纳入 Y 轴范围，
        // 把 101.x 的价格压成一条水平直线（表现为「分时/五日一直不动」）。
        // 这里统一归一化：无效均价 -> null（语义明确），无效成交量 -> 0，非法价格点直接丢弃。
        return {
          t: p[0], // "2026-11-03 09:30"
          price,
          avg: Number.isFinite(avgRaw) && avgRaw > 0 ? avgRaw : null,
          vol: Number.isFinite(volRaw) && volRaw > 0 ? volRaw : 0,
        };
      })
      .filter((x) => Number.isFinite(x.price) && x.price > 0);
    const asOf = list.length ? list[list.length - 1].t : null;
    const data = { code: json?.data?.code || secid, name: json?.data?.name || '', days, list, asOf };
    setCache(key, data, 15000); // 分时变化快，短缓存便于实时刷新
    return data;
  } catch (e) {
    return getCacheSoft(key) || { code: secid, name: '', days, list: [], asOf: null };
  }
}

// 股票/指数搜索：东方财富 suggest（按关键词过滤，JSON/UTF-8）为主，腾讯智能选股(GBK)兜底
// 返回 [{code, secid, name, type}]，secid 形如 1.600519 / 0.002181
const EM_SEARCH_TOKEN = 'D43BF722C8E5ADC0C3E1CEA6A1D6D2E5';

async function getSearch(kw) {
  const key = 'search:' + kw;
  const cached = getCached(key);
  if (cached) return cached;

  // 源1：东方财富 suggest（真正按关键词过滤，返回 Code/Name/MktNum）
  try {
    const url = `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(kw)}&type=14&token=${EM_SEARCH_TOKEN}`;
    const text = await fetchText(url, { Referer: 'https://quote.eastmoney.com/' }, 1, 8000);
    const json = JSON.parse(text);
    const data = json?.QuotationCodeTable?.Data || [];
    const list = data
      .filter((d) => d && d.Code && d.Name)
      .map((d) => {
        const num = String(d.Code);
        const market = String(d.MktNum) === '1' ? '1' : '0';
        return { code: num, secid: market + '.' + num, name: d.Name, type: d.SecurityTypeName || '' };
      });
    if (list.length) { setCache(key, list, 5 * 60 * 1000); return list; }
  } catch (e) {
    console.error('[search] eastmoney suggest fail:', e.message);
  }

  // 源2：腾讯智能选股 v_hint（GBK，单条兜底，格式 sz~002181~粤传媒~ycm~GP-A）
  try {
    const url = `https://smartbox.gtimg.cn/s3/?t=all&q=${encodeURIComponent(kw)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://stockapp.finance.qq.com/' },
    });
    if (!res.ok) throw new Error('http ' + res.status);
    const buf = await res.arrayBuffer();
    let text;
    try {
      text = new TextDecoder('gbk').decode(buf);
    } catch (_) {
      text = new TextDecoder('utf-8').decode(buf);
    }
    const m = text.match(/v_hint="([^"]*)"/);
    if (m && m[1]) {
      const f = m[1].split('~');
      const mkt = (f[0] || '').toLowerCase();
      const num = f[1];
      const name = f[2];
      if (num && /^\d{6}$/.test(num) && name) {
        const market = mkt === 'sh' ? '1' : '0';
        const list = [{ code: num, secid: market + '.' + num, name, type: '' }];
        setCache(key, list, 5 * 60 * 1000);
        return list;
      }
    }
  } catch (e) {
    console.error('[search] tencent fail:', e.message);
  }
  return [];
}

function cacheGold(data) {
  setCache('gold', data, 15000);
  return data;
}

// 实时国际金价（腾讯伦敦金现货 hf_XAU，单位：美元/盎司）——按国际口径直接展示，不做国内换算
// 字段：f[0]=现价(USD/oz) f[1]=涨跌幅% f[7]=昨收
async function getGold() {
  const cached = getCacheSoft('gold');

  try {
    const txt = await fetchText('https://qt.gtimg.cn/q=hf_XAU', { Referer: 'https://gu.qq.com/' }, 1, 8000);
    const m = txt.match(/v_hf_XAU="([^"]*)"/);
    if (m && m[1]) {
      const f = m[1].split(',');
      const price = parseFloat(f[0]); // 美元/盎司
      const pct = parseFloat(f[1]); // 涨跌幅 %
      const prevClose = parseFloat(f[7]); // 昨收
      if (Number.isFinite(price) && price > 1000) {
        const change = Number.isFinite(prevClose) ? Math.round((price - prevClose) * 100) / 100 : NaN;
        return cacheGold({
          price,
          code: 'XAU',
          name: '伦敦金 XAU/USD',
          source: 'tencent',
          stale: false,
          unit: '美元/盎司',
          pct: Number.isFinite(pct) ? pct : undefined,
          change: Number.isFinite(change) ? change : undefined,
          prevClose: Number.isFinite(prevClose) ? prevClose : undefined,
        });
      }
    }
  } catch (e) {
    console.error('[gold] tencent fail:', e.message);
  }

  // 兜底：返回上次真实值（标记 stale），避免无数据时显示写死的参考价
  if (cached) return { ...cached, stale: true, note: '实时接口暂不可用，显示最近一次数值' };
  return { price: 0, name: '伦敦金 XAU/USD', code: 'XAU', source: 'none', stale: true, unit: '美元/盎司', note: '行情接口暂不可用' };
}

module.exports = {
  getStocks, getFundEst, getFundRank, getFundHistory,
  getKline, getIntraday, getGold, getSearch, getRealtimeStatus,
};
