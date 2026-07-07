const mongoose = require("mongoose");

const jdPrepSessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  jobDescription: {
    type: String,
    required: true,
  },

  // Skills
  extractedSkills: {
    type: [String],
    default: [],
  },
  finalSkills: {
    type: [String],
    default: [],
  },

  // Generated Questions
  questions: [
    {
      _id: {
        type: mongoose.Schema.Types.ObjectId,
        auto: true,
      },

      question: {
        type: String,
        required: true,
      },

      category: {
        type: String,
        enum: [
          "technical",
          "behavioral",
          "experience",
          "situational",
          "role-specific",
          "general",
        ],
        required: true,
      },

      difficulty: {
        type: String,
        enum: ["Easy", "Medium", "Hard"],
        default: "Medium",
      },

      importance: String,

      answer: {
        transcript: String,

        responseType: {
          type: String,
          enum: ["video", "text"],
          default: "video",
        },

        duration: Number,

        submittedAt: Date,
      },

      feedback: {
        score: {
          type: Number,
          default: 0,
        },

        strengths: [String],

        improvements: [String],

        aiFeedback: String,
      },
    },
  ],

  // Final Evaluation (Separate AI call)
  overallEvaluation: {
    overallScore: { type: Number, min: 0, max: 100 },
    jdAlignmentScore: { type: Number, min: 0, max: 100 },
    strengths: [String],
    improvements: [String],
    summaryFeedback: String,
    evaluatedAt: Date,
  },

  // Learning Recommendations (Separate AI call)
  learningRecommendations: [
    {
      topic: String,
      priority: { type: String, enum: ["High", "Medium", "Low"] },
      reason: String,
      suggestedResources: [
        {
          title: String,
          type: {
            type: String,
            enum: [
              "Course",
              "Video",
              "Article",
              "Documentation",
              "Book",
              "Tutorial",
              "Website",
              "Practice",
            ],
          },
          link: String,
        },
      ],
    },
  ],

  // Progress Tracking
  currentStep: {
    type: String,
    enum: [
      "input",
      "skills",
      "questions",
      "practice",
      "evaluation",
      "completed",
    ],
    default: "input",
  },

  status: {
    type: String,
    enum: ["in-progress", "completed", "ended", "terminated", "abandoned"],
    default: "in-progress",
  },

  tabViolations: {
    type: Number,
    default: 0,
  },

  focusViolations: {
    type: Number,
    default: 0,
  },

  integrityScore: {
    type: Number,
    default: 100,
  },

  // Metadata
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  completedAt: Date,

  totalPracticeTime: { type: Number, default: 0 },
  questionsAttempted: { type: Number, default: 0 },
});

module.exports = mongoose.model("JDPrepSession", jdPrepSessionSchema);
