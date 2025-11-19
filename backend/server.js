require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const authRoutes = require('./routes/auth');
const activityRoutes = require('./routes/activity');
const prefRoutes = require('./routes/prefs');
const reportRoutes = require('./routes/reports');

const app = express();
app.use(express.json());

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser:true, useUnifiedTopology:true })
  .then(()=> console.log("Mongo connected"));

app.use('/api/auth', authRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/prefs', prefRoutes);
app.use('/api/reports', reportRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, ()=> console.log(`Server ${PORT}`));
