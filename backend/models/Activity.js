const mongoose = require('mongoose');

const ActivitySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  url: String,
  domain: String,
  title: String,
  startTs: Number,
  endTs: Number,
  durationSec: Number,
  createdAt: { type: Date, default: Date.now }
});
ActivitySchema.index({ userId: 1, createdAt: 1 });
module.exports = mongoose.model('Activity', ActivitySchema);
