// 新浪外盘实时报价 → 自采 1 分钟 bar
//
// 背景：东方财富免费源对国际商品（101.GC00Y COMEX 黄金 / 102.CL00Y NYMEX WTI）的
//       1 分钟 K 线恒定滞后约 10 分钟（实测 f86 服务器时间也比本地慢 10 分钟）。
//       hq.sinajs.cn 的 hf_GC / hf_CL 快照时间戳与本地完全同步（零延迟），免费、无 key。
//
// 做法：服务端每 20 秒拉一次快照，按分钟聚合成 OHLC bar；取「晚于东财末端时间」的那些
//       bar 追加到东财历史序列后面，让 1 分钟图 / 浮窗的末端走到当前分钟。
//
// 口径风险：新浪 hf_GC 是现货/不同合约口径，绝对价与东财 COMEX 期货连续差约 20 美元。
//       因此这里只借用「走势形状」：按第一根实时 bar 的 open 作基准做比例缩放，
//       锚定到东财历史末端的 close，拼接处不跳价，绝对口径仍保持东财。
//
// 限制：自采序列只有服务启动后才开始累积，刚启动时实时段只有 1 根，随运行逐渐补齐。
//       新浪是非官方公开接口，可能变更/限流；失败时保留已有 bar，不清空。
const SINA_URL = 'https://hq.sinajs.cn/list=hf_GC,hf_CL';
const POLL_MS = 20 * 1000;
const MAX_BARS = 180; // 每个品种保留最近 3 小时的分钟 bar

// 东财 secid → 新浪 symbol。美元指数 100.UDI 不在此表：东财对它本来就不延迟。
const MAP = {
  '101.GC00Y': 'hf_GC',
  '102.CL00Y': 'hf_CL',
};

// symbol → 分钟 bar 数组（时间升序）
const store = new Map();
let lastTick = null;
let lastError = null;
let lastFetchAt = 0;
let timer = null;

function shanghaiNow() {
  // 中国无夏令时，UTC+8 固定；返回 "YYYY-MM-DD HH:MM"，与东财 K 线 date 同格式
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ');
}

function minuteKey(date, time) {
  // time: "09:42:48" → "2026-11-05 09:42"
  return date + ' ' + String(time).slice(0, 5);
}

function pushTick(symbol, price, t) {
  if (!Number.isFinite(price) || price <= 0 || !t) return;
  let bars = store.get(symbol);
  if (!bars) {
    bars = [];
    store.set(symbol, bars);
  }
  const last = bars[bars.length - 1];
  if (last && last.t === t) {
    last.close = price;
    last.high = Math.max(last.high, price);
    last.low = Math.min(last.low, price);
    last.ticks++;
  } else {
    bars.push({ t, open: price, high: price, low: price, close: price, ticks: 1 });
    if (bars.length > MAX_BARS) bars.splice(0, bars.length - MAX_BARS);
  }
}

async function poll() {
  try {
    const ctrl = new AbortController();
    const timerId = setTimeout(() => ctrl.abort(), 8000);
    let text;
    try {
      const res = await fetch(SINA_URL, {
        signal: ctrl.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Referer': 'https://finance.sina.com.cn/',
        },
      });
      if (!res.ok) throw new Error('http ' + res.status);
      const buf = await res.arrayBuffer();
      text = new TextDecoder('gbk').decode(buf);
    } finally {
      clearTimeout(timerId);
    }

    const now = {};
    const re = /hq_str_(hf_\w+)="([^"]*)"/g;
    let m;
    while ((m = re.exec(text))) {
      const sym = m[1];
      const f = m[2].split(',');
      const price = parseFloat(f[0]); // 最新价
      const time = f[6]; // "HH:MM:SS"
      const date = f[12]; // "YYYY-MM-DD"
      if (!Number.isFinite(price) || price <= 0 || !time || !date) continue;
      const t = minuteKey(date, time);
      pushTick(sym, price, t);
      now[sym] = { price, time, date, t };
    }
    lastTick = now;
    lastFetchAt = Date.now();
    lastError = null;
  } catch (e) {
    // 失败不清空已有 bar：宁可末端停在上一分钟，也不要闪退成空图
    lastError = String((e && e.message) || e);
  }
}

function start() {
  if (timer) return;
  poll();
  timer = setInterval(poll, POLL_MS);
  // 不阻塞进程退出（本地自测脚本、一次性诊断脚本需要能正常结束）
  if (timer.unref) timer.unref();
}
start();

// 取「可追加到东财历史末端」的实时 bar：只保留晚于东财末端的分钟，并做口径对齐
function getAlignedBars(secid, eastList) {
  const sym = MAP[secid];
  if (!sym) return [];
  const bars = store.get(sym) || [];
  if (!bars.length || !eastList || !eastList.length) return [];
  const lastEast = eastList[eastList.length - 1];
  const anchor = lastEast.close;
  if (!Number.isFinite(anchor) || anchor <= 0 || !lastEast.date) return [];

  // 字符串 "YYYY-MM-DD HH:MM" 字典序即时间序；两者都是北京时间
  const extra = bars.filter((b) => b.t > lastEast.date);
  if (!extra.length) return [];

  const base = extra[0].open;
  if (!Number.isFinite(base) || base <= 0) return [];
  const k = anchor / base;

  return extra.map((b) => ({
    date: b.t,
    open: +(b.open * k).toFixed(2),
    close: +(b.close * k).toFixed(2),
    high: +(b.high * k).toFixed(2),
    low: +(b.low * k).toFixed(2),
    vol: 0,
    realtime: true,
  }));
}

function getStatus() {
  const out = {
    pollMs: POLL_MS,
    localTime: shanghaiNow(),
    lastFetchAt: lastFetchAt ? new Date(lastFetchAt + 8 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ') : null,
    lastError,
    symbols: {},
  };
  for (const [secid, sym] of Object.entries(MAP)) {
    const bars = store.get(sym) || [];
    const tick = lastTick && lastTick[sym];
    out.symbols[secid] = {
      symbol: sym,
      bars: bars.length,
      first: bars.length ? bars[0].t : null,
      last: bars.length ? bars[bars.length - 1].t : null,
      lastPrice: tick ? tick.price : null,
      lastTickTime: tick ? tick.date + ' ' + tick.time : null,
    };
  }
  return out;
}

module.exports = { MAP, getAlignedBars, getStatus, _poll: poll, _store: store };
