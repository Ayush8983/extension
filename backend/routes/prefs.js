const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Preference = require('../models/Preference');

router.get('/', auth, async (req,res)=>{
  let p = await Preference.findOne({ userId: req.userId });
  if(!p) {
    p = await new Preference({ userId: req.userId }).save();
  }
  res.send(p);
});

router.post('/', auth, async (req,res)=>{
  const payload = req.body;
  let p = await Preference.findOneAndUpdate({ userId: req.userId }, payload, { new:true, upsert:true });
  res.send(p);
});

module.exports = router;
