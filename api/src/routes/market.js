const express = require('express');
const router = express.Router();
const quotes = require('../market/quotes');

// 批量股票/指数行情（secids 形如 1.600519,0.399006）
router.get('/stocks', async (req, res) => {
  const secids = (req.query.secids || '').split(',').filter(Boolean);
  if (!secids.length) return res.json([]);
  res.json(await quotes.getStocks(secids));
});

// 单只基金估值（6 位代码）
router.get('/fund/estimate', async (req, res) => {
  const code = (req.query.code || '').trim();
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'need 6-digit fund code' });
  const d = await quotes.getFundEst(code);
  if (!d) return res.status(502).json({ error: 'fund estimate unavailable' });
  res.json(d);
});

// 基金排行（ft: all/gp/hh/zq/zs/qdii/etf）
router.get('/funds/rank', async (req, res) => {
  const ft = req.query.ft || 'all';
  const pn = parseInt(req.query.pn || '30', 10);
  res.json(await quotes.getFundRank(ft, pn));
});

// 实时金价（元/克）
router.get('/gold', async (req, res) => {
  res.json(await quotes.getGold());
});

module.exports = router;
