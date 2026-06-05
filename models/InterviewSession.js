const mongoose = require("mongoose");

// Define Interview Session schema
const InterviewSessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  questions: [
    {
      question: String,
      answer: String,
      category: String,
      difficulty: {
        type: String,
        default: "",
      },
      focus: {
        type: String,
        default: "",
      },

      questionId: {
        type: Number,
        default: 0,
      },

      timestamp: Date,

      score: {
        type: Number,
        default: 0,
      },

      feedback: {
        type: String,
        default: "",
      },
    },
  ],
  role: String, // User's selected role for this session
  experienceLevel: String, // User's experience level
  completed: {
    type: Boolean,
    default: false,
  },
  totalScore: {
    type: Number,
    default: 0,
  },
  startedAt: {
    type: Date,
    default: Date.now,
  },
  completedAt: Date,
});

module.exports = mongoose.model("InterviewSession", InterviewSessionSchema);
