const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// Define User schema
const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Name is required"],
    trim: true,
  },
  email: {
    type: String,
    required: [true, "Email is required"],
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    minlength: [6, "Password must be at least 6 characters"],
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  provider: {
    type: String,
    enum: ["local", "google", "github"],
    default: "local",
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  accountType: {
    type: String,
    enum: ["user", "admin"],
    default: "user",
  },
  role: {
    type: String,
    enum: [
      "Frontend Developer",
      "Backend Developer",
      "Full Stack Developer",
      "UI/UX Designer",
      "DevOps Engineer",
      "Product Manager",
      "Mobile Developer",
      "QA Engineer",
      "Security Engineer",
      "Cloud Engineer",
      "Data Analyst",
      "Data Scientist",
      "Business Analyst",
      "AI Engineer",
      "Machine Learning Engineer",
      "Project Manager",
      "Technical Support Engineer",
      "HR Executive",
      "Sales Executive",
      "Digital Marketing Specialist",
      "Content Writer",
      "Graduate Trainee",
      "Student",
    ],
    default: "Frontend Developer",
  },
  experienceLevel: {
    type: String,
    enum: ["Beginner", "Intermediate", "Advanced"],
    default: "Beginner",
  },
  technologyStack: {
    type: [String],
    default: [],
  },
  googleId: {
    type: String,
    default: null,
  },

  githubId: {
    type: String,
    default: null,
  },

  profilePicture: {
    type: String,
    default: "",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  streak: {
    currentStreak: {
      type: Number,
      default: 0,
    },
    longestStreak: {
      type: Number,
      default: 0,
    },
    lastActiveDate: {
      type: Date,
      default: null,
    },
    streakHistory: [
      {
        date: Date,
        sessionsCompleted: Number,
      },
    ],
  },
  aptitudeStats: {
    totalSessions: {
      type: Number,
      default: 0,
    },
    totalCorrect: {
      type: Number,
      default: 0,
    },
    totalQuestions: {
      type: Number,
      default: 0,
    },
    averageScore: {
      type: Number,
      default: 0,
    },
    topicWiseStats: {
      type: Map,
      of: new mongoose.Schema({
        correct: Number,
        total: Number,
      }),
      default: {},
    },
  },
  emailStats: {
    totalSessions: {
      type: Number,
      default: 0,
    },
    averageScore: {
      type: Number,
      default: 0,
    },
    bestScore: {
      type: Number,
      default: 0,
    },
    totalTimeSpent: {
      type: Number,
      default: 0,
    },
  },
  communicationStats: {
    totalSessions: { type: Number, default: 0 },
    averageScore: { type: Number, default: 0 },
    bestScore: { type: Number, default: 0 },
  },
  jdPrepStats: {
    totalSessions: { type: Number, default: 0 },
    completedSessions: { type: Number, default: 0 },
    averageScore: { type: Number, default: 0 },
    bestScore: { type: Number, default: 0 },
    totalTimeSpent: { type: Number, default: 0 },
    lastPracticeDate: { type: Date, default: null },
  },
  // Add this to your existing user schema
  ieltsStats: {
    reading: {
      totalSessions: { type: Number, default: 0 },
      averageBandScore: { type: Number, default: 0 },
      bestBandScore: { type: Number, default: 0 },
      totalQuestions: { type: Number, default: 0 },
      totalCorrect: { type: Number, default: 0 },
      lastPracticeDate: { type: Date, default: null },
    },
    listening: {
      totalSessions: { type: Number, default: 0 },
      averageBandScore: { type: Number, default: 0 },
      bestBandScore: { type: Number, default: 0 },
    },
    speaking: {
      totalSessions: { type: Number, default: 0 },
      averageBandScore: { type: Number, default: 0 },
      bestBandScore: { type: Number, default: 0 },
    },
    writing: {
      totalSessions: { type: Number, default: 0 },
      averageBandScore: { type: Number, default: 0 },
      bestBandScore: { type: Number, default: 0 },
    },
  },
});

// Hash password before saving to database
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Method to compare entered password with stored hash
userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
