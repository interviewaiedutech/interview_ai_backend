const mongoose = require("mongoose");

const emailSessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  category: {
    type: String,
    enum: ["professional", "formal", "customer-support"],
    required: true,
  },

  scenarioTitle: {
    type: String,
    required: true,
  },

  scenario: {
    type: Object,
    default: null,
  },

  userEmail: {
    type: String,
    default: "",
  },

  evaluation: {
    score: {
      type: Number,
      default: 0,
    },

    feedback: {
      type: String,
      default: "",
    },
  },

  wordCount: {
    type: Number,
    default: 0,
  },

  timeSpent: {
    type: Number,
    default: 0,
  },

  evaluationSource: {
    type: String,
    enum: ["ai", "fallback"],
    default: "ai",
  },

  completedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("EmailSession", emailSessionSchema);
