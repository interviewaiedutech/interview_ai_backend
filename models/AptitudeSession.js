const mongoose = require("mongoose");

const aptitudeSessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  topic: {
    type: String,
    required: true,
  },
  totalQuestions: {
    type: Number,
    required: true,
  },
  correctAnswers: {
    type: Number,
    default: 0,
  },
  score: {
    type: Number,
    default: 0,
  },
  percentage: {
    type: Number,
    default: 0,
  },
  questions: [
    {
      questionId: String,
      questionText: String,
      userAnswer: String,
      correctAnswer: String,
      isCorrect: Boolean,
      explanation: String,
      timeSpent: Number, // in seconds
    },
  ],
  timeSpent: {
    type: Number,
    default: 0,
  },
  completedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("AptitudeSession", aptitudeSessionSchema);
