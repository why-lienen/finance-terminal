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

// ===== 公告栏数据源：新浪 7x24 财经快讯（实时突发快讯，免 key，服务端代理掉 CORS） =====
// 金十式「每次出现都会提示」的体验：拉取最新快讯，过滤出国际 / 黄金相关，按发布时间倒序返回。
// 新浪返回真实发布时间戳（intime，epoch 秒），不再有 00:00 假时间；docid 为稳定唯一 id，供前端去重。
// 轻量缓存 1 分钟：前端每 60s 轮询，实际打向新浪的频率降到每分钟一次。
const EVENTS_TTL = 60 * 1000;
let eventsCache = { at: 0, data: [] };

// 国际 / 黄金相关关键词：命中其一即保留（覆盖黄金本身，以及影响金价的国际宏观——美联储/美元/地缘/非农/原油/美股等）
const KW_GOLD = ['黄金', '金价', '伦敦金', '现货黄金', '白银', '金ETF', '黄金ETF', 'comex'];
const KW_INTL = [
  '美联储', '美元', '央行', '地缘', '伊朗', '中东', '霍尔木兹', '非农', '原油', '避险',
  '关税', '美股', '美债', '特朗普', '大选', '加息', '降息', 'CPI', 'PCE', 'GDP', '零售',
  '初请', '储备', '战争', '制裁', '汇率', '贵金属',
];
const EVENT_KEYWORDS = [...KW_GOLD, ...KW_INTL];
function eventImportance(text) {
  if (KW_GOLD.some((k) => text.includes(k))) return 2; // 黄金直接相关 → 红点
  return 1; // 国际宏观 → 琥珀点
}
function isRelevant(text) {
  return EVENT_KEYWORDS.some((k) => text.toLowerCase().includes(k.toLowerCase()));
}
function pad2(n) { return String(n).padStart(2, '0'); }

async function fetchEvents() {
  const now = Date.now();
  if (eventsCache.data.length && now - eventsCache.at < EVENTS_TTL) return eventsCache.data;
  const url = 'https://feed.mix.sina.com.cn/api/roll/get?pageid=153&lid=2516&k=&num=60&page=1';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://finance.sina.com.cn/' },
    });
    const j = await r.json();
    const list = (j && j.result && j.result.data) || [];
    const seen = new Set();
    const events = [];
    for (const it of list) {
      const raw = (it.title || '').trim() || (it.intro || '').trim();
      if (!raw) continue;
      if (!isRelevant(raw)) continue; // 仅保留国际 / 黄金相关
      const t = parseInt(it.intime || it.ctime || '0', 10);
      if (!t) continue;
      const id = String(it.docid || it.url || raw + '_' + t);
      if (seen.has(id)) continue;
      seen.add(id);
      const d = new Date(t * 1000);
      const time = `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
      events.push({
        id,
        time,
        title: raw,
        region: '',
        type: '',
        importance: eventImportance(raw),
        desc: raw,
      });
    }
    events.sort((a, b) => b.time.localeCompare(a.time)); // 最新在前
    eventsCache = { at: now, data: events };
    return events;
  } catch (e) {
    return eventsCache.data; // 失败时回退到上次缓存（若有）
  } finally {
    clearTimeout(timer);
  }
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

    // 公告栏：新浪 7x24 财经快讯（国际 / 黄金相关实时突发快讯），前端轮询此接口，发现新事件即弹 Toast 提示
    if (path === '/api/events') {
      return send(res, 200, { events: await fetchEvents() });
    }

    // 诊断：新浪实时补点源的状态（末端时间 / bar 数 / 与本地时间差），便于自测回归
    if (path === '/api/market/realtime/status') {
      return send(res, 200, quotes.getRealtimeStatus());
    }

    if (path === '/api/market/stocks') {
      const secids = (q.get('secids') || '').split(',').filter(Boolean);
      if (!secids.length) return send(res, 200, []);
      return send(res, 200, await quotes.getStocks(secids));
    }

    // 实时盯盘合并接口：一次返回 国际金价 + 全部自选标的，减少 5s 轮询的请求数
    if (path === '/api/market/monitor') {
      const secids = (q.get('secids') || '').split(',').filter(Boolean);
      const [g, s] = await Promise.all([
        quotes.getGold(),
        secids.length ? quotes.getStocks(secids) : Promise.resolve([]),
      ]);
      return send(res, 200, { gold: g, stocks: s });
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

    if (path === '/api/market/stock/intraday') {
      const secid = (q.get('secid') || '').trim();
      const days = parseInt(q.get('days') || '1', 10);
      if (!secid) return send(res, 400, { error: 'need secid' });
      return send(res, 200, await quotes.getIntraday(secid, days));
    }

    if (path === '/api/market/gold') {
      return send(res, 200, await quotes.getGold());
    }

    // 国际金价历史走势：用 COMEX 黄金期货连续(101.GC00Y) 作为国际金价的历史数据源
    // （与实时显示的伦敦金现货同价，美元/盎司）。支持分时/五日/日K/周K/月K/1分钟。
    if (path === '/api/market/gold/intraday') {
      const days = parseInt(q.get('days') || '1', 10);
      return send(res, 200, await quotes.getIntraday('101.GC00Y', days));
    }
    if (path === '/api/market/gold/kline') {
      const period = q.get('period') || 'day';
      const limit = parseInt(q.get('limit') || '120', 10);
      return send(res, 200, await quotes.getKline('101.GC00Y', period, limit));
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
