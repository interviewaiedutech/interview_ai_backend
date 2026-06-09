const express = require("express");
const Progress = require("../models/Progress");
const InterviewSession = require("../models/InterviewSession");
const CommunicationSession = require("../models/CommunicationSession");
const EmailSession = require("../models/EmailSession");
const AptitudeSession = require("../models/AptitudeSession");
const User = require("../models/User");
const JDPrepSession = require("../models/JDPrepSession");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

const getCurrentWeekRange = () => {
  const now = new Date();

  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);

  return { startOfWeek, endOfWeek };
};

const buildWeeklyAnalytics = (sessions) => {
  const { startOfWeek, endOfWeek } = getCurrentWeekRange();

  const weeklySessions = sessions.filter((s) => {
    const d = new Date(s.completedAt);

    return d >= startOfWeek && d <= endOfWeek;
  });

  return {
    totalSessions: weeklySessions.length,

    aptitudeSessions: weeklySessions.filter((s) => s.module === "aptitude")
      .length,

    communicationSessions: weeklySessions.filter(
      (s) => s.module === "communication",
    ).length,

    technicalSessions: weeklySessions.filter((s) => s.module === "technical")
      .length,

    emailSessions: weeklySessions.filter((s) => s.module === "email").length,

    jdprepSessions: weeklySessions.filter((s) => s.module === "jdprep").length,

    avgScore:
      weeklySessions.length > 0
        ? Math.round(
            weeklySessions.reduce((sum, s) => sum + (s.score || 0), 0) /
              weeklySessions.length,
          )
        : 0,
  };
};

// GET User Progress (Aggregated from ALL modules)
router.get("/", authMiddleware, async (req, res) => {
  try {
    let progress = await Progress.findOne({ userId: req.userId });
    if (!progress) {
      progress = new Progress({ userId: req.userId });
      await progress.save();
    }

    // === 1. Technical Interview Sessions ===
    const technicalSessions = await InterviewSession.find({
      userId: req.userId,
      completed: true,
    });

    const totalTechSessions = technicalSessions.length;
    const totalTechQuestions = technicalSessions.reduce(
      (sum, s) => sum + s.questions.filter((q) => q.answer).length,
      0,
    );
    const techTotalScore = technicalSessions.reduce(
      (sum, s) => sum + (s.totalScore || 0),
      0,
    );
    const techAvgScore = totalTechSessions
      ? Math.round(techTotalScore / totalTechSessions)
      : 0;

    // === 2. Communication Sessions ===
    const commSessions = await CommunicationSession.find({
      userId: req.userId,
      completedAt: { $ne: null },
    });

    const totalCommSessions = commSessions.length;
    const commTotalScore = commSessions.reduce(
      (sum, s) => sum + (s.evaluation?.overall?.score || 0),
      0,
    );
    const commAvgScore = totalCommSessions
      ? Math.round(commTotalScore / totalCommSessions)
      : 0;

    // === 3. Email Sessions ===
    const emailSessions = await EmailSession.find({
      userId: req.userId,
      completedAt: { $ne: null },
    });

    const totalEmailSessions = emailSessions.length;
    const emailTotalScore = emailSessions.reduce(
      (sum, s) => sum + (s.evaluation?.score || 0),
      0,
    );
    const emailAvgScore = totalEmailSessions
      ? Math.round(emailTotalScore / totalEmailSessions)
      : 0;

    // === 4. Aptitude Sessions ===
    const aptitudeSessions = await AptitudeSession.find({
      userId: req.userId,
    });

    const totalAptitudeSessions = aptitudeSessions.length;
    const totalAptitudeQuestions = aptitudeSessions.reduce(
      (sum, s) => sum + (s.totalQuestions || 0),
      0,
    );
    const totalAptitudeCorrect = aptitudeSessions.reduce(
      (sum, s) => sum + (s.correctAnswers || 0),
      0,
    );
    const aptitudeAvgScore = totalAptitudeQuestions
      ? Math.round((totalAptitudeCorrect / totalAptitudeQuestions) * 100)
      : 0;

    // === 5. JD Prep Sessions ===
    const jdSessions = await JDPrepSession.find({
      userId: req.userId,
      status: "completed",
    });
    const totalJDSessions = jdSessions.length;

    const jdAvgScore = totalJDSessions
      ? Math.round(
          jdSessions.reduce(
            (sum, s) => sum + (s.overallEvaluation?.overallScore || 0),
            0,
          ) / totalJDSessions,
        )
      : 0;

    // === Overall Statistics ===
    const totalSessions =
      totalTechSessions +
      totalCommSessions +
      totalEmailSessions +
      totalAptitudeSessions +
      totalJDSessions;
    const totalQuestionsAnswered = totalTechQuestions + totalAptitudeQuestions;

    const overallAvgScore = totalSessions
      ? Math.round(
          (techAvgScore * totalTechSessions +
            commAvgScore * totalCommSessions +
            emailAvgScore * totalEmailSessions +
            aptitudeAvgScore * totalAptitudeSessions +
            jdAvgScore * totalJDSessions) /
            totalSessions,
        )
      : 0;

    // Update Progress Document
    progress.totalSessions = totalSessions;
    progress.totalQuestionsAnswered = totalQuestionsAnswered;
    progress.averageScore = overallAvgScore;
    progress.lastActive = new Date();

    // Topics Covered (from all modules)
    const topicMap = {};

    // Technical
    technicalSessions.forEach((session) => {
      session.questions.forEach((q) => {
        if (q.answer) {
          const cat = q.category || "technical";
          if (!topicMap[cat])
            topicMap[cat] = { topic: cat, count: 0, lastPracticed: new Date() };
          topicMap[cat].count++;
        }
      });
    });

    // Communication
    commSessions.forEach((s) => {
      const cat = `communication_${s.moduleType || "general"}`;
      // console.log("module tye", topicMap, " - ", cat);
      if (!topicMap[cat])
        topicMap[cat] = { topic: cat, count: 0, lastPracticed: new Date() };
      // console.log("moduleType in comm: ", topicMap[cat]);
      topicMap[cat].count++;
    });

    // Email & Aptitude
    if (totalEmailSessions > 0) {
      topicMap["email"] = {
        topic: "email",
        count: totalEmailSessions,
        lastPracticed: new Date(),
      };
    }
    if (totalAptitudeSessions > 0) {
      topicMap["aptitude"] = {
        topic: "aptitude",
        count: totalAptitudeSessions,
        lastPracticed: new Date(),
      };
    }
    if (totalJDSessions > 0) {
      topicMap["jdprep"] = {
        topic: "jdprep",

        count: totalJDSessions,

        lastPracticed: new Date(),
      };
    }

    progress.topicsCovered = Object.values(topicMap);

    // ============================================
    // MODULE STATS
    // ============================================

    const moduleStats = {
      technical: {
        sessions: technicalSessions.length,

        score:
          technicalSessions.length > 0
            ? Math.round(
                technicalSessions.reduce(
                  (sum, s) => sum + (s.totalScore || 0),
                  0,
                ) / technicalSessions.length,
              )
            : 0,
      },

      communication: {
        sessions: commSessions.length,

        score:
          commSessions.length > 0
            ? Math.round(
                commSessions.reduce(
                  (sum, s) => sum + (s.evaluation?.overall?.score || 0),
                  0,
                ) / commSessions.length,
              )
            : 0,
      },

      aptitude: {
        sessions: aptitudeSessions.length,

        score:
          aptitudeSessions.length > 0
            ? Math.round(
                aptitudeSessions.reduce(
                  (sum, s) =>
                    sum +
                    (s.totalQuestions > 0
                      ? (s.correctAnswers / s.totalQuestions) * 100
                      : 0),
                  0,
                ) / aptitudeSessions.length,
              )
            : 0,
      },
      jdprep: {
        sessions: jdSessions.length,

        score:
          jdSessions.length > 0
            ? Math.round(
                jdSessions.reduce(
                  (sum, s) => sum + (s.overallEvaluation?.overallScore || 0),
                  0,
                ) / jdSessions.length,
              )
            : 0,
      },
      email: {
        sessions: emailSessions.length,

        score:
          emailSessions.length > 0
            ? Math.round(
                emailSessions.reduce(
                  (sum, s) => sum + (s.evaluation?.score || 0),
                  0,
                ) / emailSessions.length,
              )
            : 0,
      },

      hr: {
        sessions: commSessions.filter((s) => s.moduleType === "hr").length,

        score: (() => {
          const hrSessions = commSessions.filter((s) => s.moduleType === "hr");

          return hrSessions.length > 0
            ? Math.round(
                hrSessions.reduce(
                  (sum, s) => sum + (s.evaluation?.overall?.score || 0),
                  0,
                ) / hrSessions.length,
              )
            : 0;
        })(),
      },

      presentation: {
        sessions: commSessions.filter((s) => s.moduleType === "presentation")
          .length,

        score: (() => {
          const sessions = commSessions.filter(
            (s) => s.moduleType === "presentation",
          );

          return sessions.length > 0
            ? Math.round(
                sessions.reduce(
                  (sum, s) => sum + (s.evaluation?.overall?.score || 0),
                  0,
                ) / sessions.length,
              )
            : 0;
        })(),
      },

      professional: {
        sessions: commSessions.filter((s) => s.moduleType === "professional")
          .length,

        score: (() => {
          const sessions = commSessions.filter(
            (s) => s.moduleType === "professional",
          );

          return sessions.length > 0
            ? Math.round(
                sessions.reduce(
                  (sum, s) => sum + (s.evaluation?.overall?.score || 0),
                  0,
                ) / sessions.length,
              )
            : 0;
        })(),
      },

      star: {
        sessions: commSessions.filter((s) => s.moduleType === "star").length,

        score: (() => {
          const sessions = commSessions.filter((s) => s.moduleType === "star");

          return sessions.length > 0
            ? Math.round(
                sessions.reduce(
                  (sum, s) => sum + (s.evaluation?.overall?.score || 0),
                  0,
                ) / sessions.length,
              )
            : 0;
        })(),
      },
    };
    // === ALL SESSIONS (with full details) ===
    const allSessions = [
      ...technicalSessions.map((s) => ({
        _id: s._id,
        module: "technical",
        title: s.role || "Technical Interview",
        score: s.totalScore || 0,
        completedAt: s.completedAt,
        questions: s.questions || [],
      })),

      ...commSessions.map((s) => ({
        _id: s._id,
        module: "communication",
        title: s.moduleType
          ? s.moduleType.charAt(0).toUpperCase() + s.moduleType.slice(1)
          : "Communication",
        score: s.evaluation?.overall?.score || 0,
        completedAt: s.completedAt,
        questions: [
          {
            question: s.question || "Speak on the given topic",
            answer: s.transcript || "",
            feedback: s.evaluation?.overall?.feedback || "No detailed feedback",
            category: s.moduleType || "communication",
          },
        ],
      })),

      ...emailSessions.map((s) => ({
        _id: s._id,
        module: "email",
        title: s.scenarioTitle || "Email Writing",
        score: s.evaluation?.score || 0,
        completedAt: s.completedAt,
        questions: [
          {
            question: `Professional Email: ${s.scenarioTitle}`,
            answer: s.userEmail || "",
            feedback: s.evaluation?.feedback || "",
            category: "email",
          },
        ],
      })),

      ...aptitudeSessions.map((s) => ({
        _id: s._id,
        module: "aptitude",
        title: s.topic || "Aptitude Assessment",
        score:
          s.totalQuestions > 0
            ? Math.round((s.correctAnswers / s.totalQuestions) * 100)
            : 0,
        completedAt: s.completedAt,
        questions: s.questions.map((q, i) => ({
          question: q.questionText,
          answer: q.userAnswer || "Not answered",
          feedback: q.explanation || (q.isCorrect ? "Correct" : "Incorrect"),
          category: "aptitude",
        })),
      })),
      ...jdSessions.map((s) => ({
        _id: s._id,
        module: "jdprep",
        title: "JD Interview Preparation",
        score: s.overallEvaluation?.overallScore || 0,
        completedAt: s.completedAt,
        questions:
          s.questions?.map((q) => ({
            question: q.question,
            answer: q.answer?.transcript || "",
            feedback: q.feedback?.aiFeedback || "",
            score: q.feedback?.score || 0,
            strengths: q.feedback?.strengths || [],
            improvements: q.feedback?.improvements || [],
            category: q.category || "jdprep",
          })) || [],
      })),
    ]
      .filter((s) => s.completedAt)
      .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));

    // ============================================
    // RECENT 5 SESSIONS
    // ============================================

    const recentSessions = allSessions.slice(0, 5);
    const weeklyAnalytics = buildWeeklyAnalytics(allSessions);
    await progress.save();

    res.json({
      success: true,
      progress: {
        totalSessions,
        totalQuestionsAnswered,
        averageScore: overallAvgScore,
        topicsCovered: progress.topicsCovered,
        lastActive: progress.lastActive,
        recentSessions,
        allSessions,
        moduleStats,
        weeklyAnalytics,
        // Module-wise breakdown
        technical: { sessions: totalTechSessions, avgScore: techAvgScore },
        communication: { sessions: totalCommSessions, avgScore: commAvgScore },
        email: { sessions: totalEmailSessions, avgScore: emailAvgScore },
        aptitude: {
          sessions: totalAptitudeSessions,
          avgScore: aptitudeAvgScore,
        },
        jdprep: {
          sessions: totalJDSessions,
          avgScore: jdAvgScore,
        },
      },
    });
  } catch (error) {
    console.error("Progress Error:", error);
    res.status(500).json({ message: "Error fetching progress" });
  }
});

// Streak Route (already good)
router.get("/streak", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("streak");

    res.json({
      currentStreak: user?.streak?.currentStreak || 0,
      longestStreak: user?.streak?.longestStreak || 0,
      lastActiveDate: user?.streak?.lastActiveDate,
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching streak" });
  }
});

// UPDATE progress manually
router.post("/update", authMiddleware, async (req, res) => {
  try {
    const { sessionCompleted } = req.body;

    let progress = await Progress.findOne({ userId: req.userId });
    if (!progress) {
      progress = new Progress({ userId: req.userId });
    }

    if (sessionCompleted) {
      progress.totalSessions += 1;
      progress.lastActive = new Date();

      // Update weekly activity
      const currentWeek = getWeekNumber(new Date());
      const weekActivity = progress.weeklyActivity.find(
        (w) => w.week === currentWeek,
      );
      if (weekActivity) {
        weekActivity.sessionsCount++;
      } else {
        progress.weeklyActivity.push({ week: currentWeek, sessionsCount: 1 });
      }
    }

    await progress.save();
    res.json({ success: true, progress });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error updating progress" });
  }
});

// Helper function to get week number
function getWeekNumber(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
  );
}
router.get("/leaderboard/technical", authMiddleware, async (req, res) => {
  try {
    const leaderboard = await InterviewSession.aggregate([
      {
        $match: {
          completed: true,
        },
      },
      {
        $group: {
          _id: "$userId",
          averageScore: {
            $avg: "$totalScore",
          },
          totalSessions: {
            $sum: 1,
          },
        },
      },
      {
        $match: {
          totalSessions: {
            $gte: 0,
          },
        },
      },
      {
        $sort: {
          averageScore: -1,
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $unwind: "$user",
      },
      {
        $project: {
          _id: 1,
          name: "$user.name",
          averageScore: {
            $round: ["$averageScore", 1],
          },
          totalSessions: 1,
        },
      },
    ]);

    const userId = req.user.id;

    const rankedLeaderboard = leaderboard.map((user, index) => ({
      ...user,
      rank: index + 1,
    }));

    const currentUserIndex = rankedLeaderboard.findIndex(
      (user) => user._id.toString() === userId,
    );

    const currentUserRank =
      currentUserIndex !== -1 ? rankedLeaderboard[currentUserIndex].rank : null;

    const percentile =
      currentUserRank && rankedLeaderboard.length
        ? Math.round(
            ((rankedLeaderboard.length - currentUserRank) /
              rankedLeaderboard.length) *
              100,
          )
        : 0;

    res.json({
      leaderboard: rankedLeaderboard,
      currentUserRank,
      percentile,
      totalUsers: rankedLeaderboard.length,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to load leaderboard",
    });
  }
});

// // GET user streak information 13-05-2026
// router.get("/streak", authMiddleware, async (req, res) => {
//   try {
//     const user = await User.findById(req.userId).select("streak");

//     if (!user) {
//       return res.status(404).json({ message: "User not found" });
//     }
//     console.log("streak", user.streak);
//     res.json({
//       currentStreak: user.streak?.currentStreak || 0,
//       longestStreak: user.streak?.longestStreak || 0,
//       lastActiveDate: user.streak?.lastActiveDate,
//       streakHistory: user.streak?.streakHistory || [],
//     });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Error fetching streak data" });
//   }
// });

module.exports = router;
