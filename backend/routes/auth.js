const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');

router.post('/register', async (req,res)=>{
  const { email, password, name } = req.body;
  if(!email || !password) return res.status(400).send({ error: "Email & password required" });
  let u = new User({ email, name });
  await u.setPassword(password);
  try {
    await u.save();
  } catch(e){ return res.status(400).send({ error: "User exists" }); }
  const token = jwt.sign({ id:u._id }, process.env.JWT_SECRET, { expiresIn:'30d' });
  res.send({ token, user: { id: u._id, email: u.email, name: u.name } });
});

router.post('/login', async (req,res)=>{
  const { email, password } = req.body;
  const u = await User.findOne({ email });
  if(!u) return res.status(401).send({ error: "Invalid" });
  const ok = await u.validatePassword(password);
  if(!ok) return res.status(401).send({ error: "Invalid" });
  const token = jwt.sign({ id:u._id }, process.env.JWT_SECRET, { expiresIn:'30d' });
  res.send({ token, user: { id: u._id, email: u.email } });
});

module.exports = router;
