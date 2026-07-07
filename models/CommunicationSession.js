const mongoose = require("mongoose");

const communicationSessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  moduleType: {
    type: String,
    enum: ["hr", "star", "presentation", "professional"],
    required: true,
  },
  subModule: {
    type: String,
    default: null,
  },
  status: {
    type: String,
    enum: ["in-progress", "completed", "terminated", "ended"],
    default: "in-progress",
  },
  questionsAttempted: {
    type: Number,
    default: 0,
  },
  tabViolations: {
    type: Number,
    default: 0,
  },
  focusViolations: {
    type: Number,
    default: 0,
  },
  question: {
    type: String,
    required: true,
  },
  transcript: {
    type: String,
    default: "",
  },
  duration: {
    type: Number,
    default: 0,
  },
  evaluation: {
    content: { score: Number, feedback: String },
    delivery: { score: Number, feedback: String },
    overall: { score: Number, feedback: String },
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

module.exports = mongoose.model(
  "CommunicationSession",
  communicationSessionSchema,
);
