const mongoose = require('mongoose');
const PrefSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true },
  blockedDomains: [String],
  timezone: String,
  dailyGoalMinutes: { type: Number, default: 240 } // example
});
module.exports = mongoose.model('Preference', PrefSchema);
