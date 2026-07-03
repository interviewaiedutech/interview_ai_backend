const express = require("express");
const axios = require("axios");
const authMiddleware = require("../middleware/auth");
const AptitudeSession = require("../models/AptitudeSession");
const User = require("../models/User");
const router = express.Router();
const Notification = require("../models/Notification");

const APTITUDE_API = "https://aptitude-gold.vercel.app";

const topics = [
  "Age",
  "Calendar",
  "MixtureAndAlligation",
  "PermutationAndCombination",
  "PipesAndCistern",
  "ProfitAndLoss",
  "SimpleInterest",
  "SpeedTimeDistance",
];

// Get all topics
router.get("/topics", authMiddleware, async (req, res) => {
  res.json({ topics });
});

// Get questions for a specific topic
router.get("/questions/:topic", authMiddleware, async (req, res) => {
  const { topic } = req.params;
  const { limit = 10, offset = 0 } = req.query;

  if (!topics.includes(topic)) {
    return res.status(400).json({ error: "Invalid topic" });
  }

  try {
    const promises = [];
    const requestCount = parseInt(limit) || 10;

    for (let i = 0; i < requestCount; i++) {
      promises.push(axios.get(`${APTITUDE_API}/${topic}`));
    }

    const responses = await Promise.all(promises);

    let questions = responses.map((response) => response.data);

    const uniqueQuestions = [];
    const questionTexts = new Set();

    for (const q of questions) {
      let questionObj = q;
      if (Array.isArray(q) && q.length > 0) {
        questionObj = q[0];
      }

      if (
        questionObj &&
        questionObj.question &&
        !questionTexts.has(questionObj.question)
      ) {
        questionTexts.add(questionObj.question);
        uniqueQuestions.push({
          id: Date.now() + Math.random(),
          question: questionObj.question,
          options: questionObj.options || [],
          answer: questionObj.answer,
          explanation:
            questionObj.explanation ||
            `The correct answer is: ${questionObj.answer}`,
          difficulty: questionObj.difficulty || "medium",
        });
      }
    }

    const paginatedQuestions = uniqueQuestions.slice(
      offset,
      offset + requestCount,
    );

    res.json({
      topic,
      total: uniqueQuestions.length,
      questions: paginatedQuestions,
    });
  } catch (error) {
    console.error("API Error:", error.message);
    res.status(500).json({ error: "Failed to fetch questions" });
  }
});

// Start a new aptitude session
router.post("/session/start", authMiddleware, async (req, res) => {
  const { topic, totalQuestions } = req.body;

  try {
    const session = new AptitudeSession({
      userId: req.userId,
      topic,
      totalQuestions,
      correctAnswers: 0,
      score: 0,
      percentage: 0,
      questions: [],
      completedAt: null,
    });

    await session.save();

    res.json({
      success: true,
      sessionId: session._id,
    });
  } catch (error) {
    console.error("Error creating session:", error);
    res.status(500).json({ error: "Failed to create session" });
  }
});

// Submit answer and update session
router.post("/session/submit", authMiddleware, async (req, res) => {
  const {
    sessionId,
    questionId,
    questionText,
    userAnswer,
    correctAnswer,
    explanation,
    isCorrect,
    timeSpent,
  } = req.body;

  try {
    const session = await AptitudeSession.findOne({
      _id: sessionId,
      userId: req.userId,
    });

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    // Add question to session
    session.questions.push({
      questionId,
      questionText,
      userAnswer,
      correctAnswer,
      isCorrect,
      explanation,
      timeSpent,
    });

    // Update scores
    if (isCorrect) {
      session.correctAnswers += 1;
    }
    session.score = session.correctAnswers * 10; // 10 points per correct answer
    session.percentage =
      (session.correctAnswers / session.totalQuestions) * 100;

    await session.save();

    res.json({
      success: true,
      correct: isCorrect,
      correctAnswer,
      explanation,
      currentScore: session.score,
      currentPercentage: session.percentage,
    });
  } catch (error) {
    console.error("Error submitting answer:", error);
    res.status(500).json({ error: "Failed to submit answer" });
  }
});

// Complete session
router.post("/session/complete", authMiddleware, async (req, res) => {
  const { sessionId, timeSpent } = req.body;

  try {
    const session = await AptitudeSession.findOne({
      _id: sessionId,
      userId: req.userId,
    });

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    session.completedAt = new Date();
    session.timeSpent = timeSpent;
    session.percentage =
      (session.correctAnswers / session.totalQuestions) * 100;

    await session.save();

    // Update user's overall progress (optional)
    const user = await User.findById(req.userId);
    await Notification.create({
      title: "Aptitude Session Completed",
      message: `${user?.name || "User"} completed ${session.topic}`,
      type: "aptitude",
      userId: req.userId,
      entityId: sessionId,
      entityType: "aptitude",
    });
    if (user) {
      // You can add aptitude stats to user model if needed
      if (!user.aptitudeStats) {
        user.aptitudeStats = {
          totalSessions: 0,
          totalCorrect: 0,
          totalQuestions: 0,
          averageScore: 0,
        };
      }
      user.aptitudeStats.totalSessions += 1;
      user.aptitudeStats.totalCorrect += session.correctAnswers;
      user.aptitudeStats.totalQuestions += session.totalQuestions;
      user.aptitudeStats.averageScore =
        (user.aptitudeStats.totalCorrect / user.aptitudeStats.totalQuestions) *
        100;
      await user.save();
    }

    res.json({
      success: true,
      session: {
        id: session._id,
        topic: session.topic,
        totalQuestions: session.totalQuestions,
        correctAnswers: session.correctAnswers,
        percentage: session.percentage,
        score: session.score,
        timeSpent: session.timeSpent,
      },
    });
  } catch (error) {
    console.error("Error completing session:", error);
    res.status(500).json({ error: "Failed to complete session" });
  }
});

// Get session history
router.get("/sessions/history", authMiddleware, async (req, res) => {
  const { limit = 10 } = req.query;

  try {
    const sessions = await AptitudeSession.find({
      userId: req.userId,
      completedAt: { $ne: null },
    })
      .sort({ completedAt: -1 })
      .limit(parseInt(limit));

    res.json({
      sessions: sessions.map((s) => ({
        id: s._id,
        topic: s.topic,
        totalQuestions: s.totalQuestions,
        correctAnswers: s.correctAnswers,
        percentage: s.percentage,
        score: s.score,
        completedAt: s.completedAt,
        timeSpent: s.timeSpent,
      })),
    });
  } catch (error) {
    console.error("Error fetching sessions:", error);
    res.status(500).json({ error: "Failed to fetch sessions" });
  }
});

// Get session details by ID
router.get("/session/:sessionId", authMiddleware, async (req, res) => {
  const { sessionId } = req.params;

  try {
    const session = await AptitudeSession.findOne({
      _id: sessionId,
      userId: req.userId,
    });

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    res.json({
      session: {
        id: session._id,
        topic: session.topic,
        totalQuestions: session.totalQuestions,
        correctAnswers: session.correctAnswers,
        percentage: session.percentage,
        score: session.score,
        questions: session.questions,
        timeSpent: session.timeSpent,
        completedAt: session.completedAt,
      },
    });
  } catch (error) {
    console.error("Error fetching session:", error);
    res.status(500).json({ error: "Failed to fetch session" });
  }
});

// Get overall aptitude stats
router.get("/stats", authMiddleware, async (req, res) => {
  try {
    const sessions = await AptitudeSession.find({
      userId: req.userId,
      completedAt: { $ne: null },
    });

    const totalSessions = sessions.length;
    const totalQuestions = sessions.reduce(
      (sum, s) => sum + s.totalQuestions,
      0,
    );
    const totalCorrect = sessions.reduce((sum, s) => sum + s.correctAnswers, 0);
    const overallPercentage =
      totalQuestions > 0 ? (totalCorrect / totalQuestions) * 100 : 0;

    // Topic-wise breakdown
    const topicStats = {};
    for (const session of sessions) {
      if (!topicStats[session.topic]) {
        topicStats[session.topic] = {
          totalQuestions: 0,
          correctAnswers: 0,
          sessions: 0,
        };
      }
      topicStats[session.topic].totalQuestions += session.totalQuestions;
      topicStats[session.topic].correctAnswers += session.correctAnswers;
      topicStats[session.topic].sessions += 1;
    }

    res.json({
      totalSessions,
      totalQuestions,
      totalCorrect,
      overallPercentage: Math.round(overallPercentage),
      topicStats: Object.entries(topicStats).map(([topic, stats]) => ({
        topic,
        ...stats,
        percentage: Math.round(
          (stats.correctAnswers / stats.totalQuestions) * 100,
        ),
      })),
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// Evaluate single answer (for immediate feedback)
router.post("/evaluate", authMiddleware, async (req, res) => {
  const { userAnswer, correctAnswer, explanation } = req.body;

  const isCorrect = userAnswer === correctAnswer;

  res.json({
    correct: isCorrect,
    userAnswer,
    correctAnswer,
    explanation: explanation || `The correct answer is: ${correctAnswer}`,
    score: isCorrect ? 1 : 0,
    message: isCorrect
      ? "✅ Correct! Great job!"
      : `❌ Incorrect. The correct answer is: ${correctAnswer}`,
  });
});

module.exports = router;
