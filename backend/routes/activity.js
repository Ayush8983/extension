const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Activity = require('../models/Activity');

// ingest batch. expected body: { activities: [ { url, domain, title, startTs, endTs } ] }
router.post('/batch', auth, async (req,res)=>{
  const userId = req.userId;
  const { activities } = req.body;
  if(!Array.isArray(activities)) return res.status(400).send({ error: "Invalid" });
  const docs = activities.map(a => ({
    userId,
    url: a.url,
    domain: a.domain,
    title: a.title || '',
    startTs: a.startTs,
    endTs: a.endTs,
    durationSec: Math.max(0, Math.round((a.endTs - a.startTs)/1000))
  }));
  try {
    await Activity.insertMany(docs);
    res.send({ ok: true, inserted: docs.length });
  } catch(e){ console.error(e); res.status(500).send({ error: "db" }); }
});

// query raw activities (with paging)
router.get('/', auth, async (req,res)=>{
  const userId = req.userId;
  const { from, to, page=1, limit=100 } = req.query;
  const q = { userId };
  if (from || to) q.createdAt = {};
  if (from) q.createdAt.$gte = new Date(Number(from));
  if (to) q.createdAt.$lte = new Date(Number(to));
  const rows = await Activity.find(q).sort({ startTs: -1 }).skip((page-1)*limit).limit(Number(limit));
  res.send(rows);
});

module.exports = router;
