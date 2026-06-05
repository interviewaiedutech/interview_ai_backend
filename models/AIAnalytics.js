const mongoose = require("mongoose");

const aiAnalyticsSchema = new mongoose.Schema({
  provider: {
    type: String,
    enum: ["Groq", "Gemini", "GitHub Models"],
  },

  module: {
    type: String,
    default: "",
  },

  success: {
    type: Boolean,
    default: true,
  },

  responseTime: {
    type: Number,
    default: 0,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("AIAnalytics", aiAnalyticsSchema);
