const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Activity = require('../models/Activity');
const mongoose = require('mongoose');

// returns aggregated report for date range
router.get('/summary', auth, async (req,res)=>{
  const userId = mongoose.Types.ObjectId(req.userId);
  const from = new Date(Number(req.query.from)); // epoch ms
  const to = new Date(Number(req.query.to));     // epoch ms
  const agg = await Activity.aggregate([
    { $match: { userId, startTs: { $gte: from.getTime(), $lte: to.getTime() } } },
    { $group: {
      _id: "$domain",
      totalSec: { $sum: "$durationSec" },
      count: { $sum: 1 }
    }},
    { $sort: { totalSec: -1 } }
  ]);
  res.send(agg);
});
module.exports = router;
