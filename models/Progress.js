const mongoose = require("mongoose");

// Define Progress tracking schema
const progressSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
  },
  totalSessions: {
    type: Number,
    default: 0,
  },
  totalQuestionsAnswered: {
    type: Number,
    default: 0,
  },
  averageScore: {
    type: Number,
    default: 0,
  },
  topicsCovered: [
    {
      topic: String,
      count: Number,
      lastPracticed: Date,
    },
  ],
  weeklyActivity: [
    {
      week: String,
      sessionsCount: Number,
    },
  ],
  lastActive: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Progress", progressSchema);
