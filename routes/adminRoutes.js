const express = require("express");
const router = express.Router();

const User = require("../models/User");
const AptitudeSession = require("../models/AptitudeSession");
const CommunicationSession = require("../models/CommunicationSession");
const EmailSession = require("../models/EmailSession");
const InterviewSession = require("../models/InterviewSession");
const JDPrepSession = require("../models/JDPrepSession");
const AIAnalytics = require("../models/AIAnalytics");
const auth = require("../middleware/auth");
const SystemSettings = require("../models/SystemSettings");
const Contact = require("../models/Contact");
const sendContactReply = require("../utils/sendContactReply");

const bcrypt = require("bcryptjs");
const { Parser } = require("json2csv");
const ExcelJS = require("exceljs");
const logAdminAction = require("../utils/auditLogger");
const AuditLog = require("../models/AuditLog");

router.use(auth);

/* sidebar stats counts*/
router.get("/stats/users-count", auth, async (req, res) => {
  try {
    const count = await User.countDocuments({
      accountType: { $ne: "admin" },
    });

    res.json({
      success: true,
      count,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch users count",
    });
  }
});

router.get("/stats/unread-messages", auth, async (req, res) => {
  try {
    const count = await Contact.countDocuments({
      isRead: false,
    });

    res.json({
      success: true,
      count,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch unread count",
    });
  }
});

/*
=========================================
Dashboard API
GET /api/admin/dashboard
=========================================
*/
router.get("/dashboard", async (req, res) => {
  try {
    // Users
    const totalUsers = await User.countDocuments({
      accountType: "user",
    });
    const totalAdmins = await User.countDocuments({
      accountType: "admin",
    });

    const activeUsers = await User.countDocuments({
      accountType: "user",
      "streak.lastActiveDate": {
        $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
    });

    const weeklyUserGrowth = await User.aggregate([
      {
        $match: {
          accountType: "user",
        },
      },
      {
        $group: {
          _id: {
            year: {
              $isoWeekYear: "$createdAt",
            },
            week: {
              $isoWeek: "$createdAt",
            },
          },
          users: {
            $sum: 1,
          },
        },
      },
      {
        $sort: {
          "_id.year": 1,
          "_id.week": 1,
        },
      },
    ]);
    // const userGrowth = weeklyUserGrowth.map((item) => ({
    //   week: `W${item._id.week}`,
    //   users: item.users,
    // }));
    const currentWeek = new Date();

    const userGrowth = [];

    for (let i = 4; i >= 0; i--) {
      const date = new Date(currentWeek);

      date.setDate(date.getDate() - i * 7);

      const weekNumber = Math.ceil(
        ((date - new Date(date.getFullYear(), 0, 1)) / 86400000 +
          new Date(date.getFullYear(), 0, 1).getDay() +
          1) /
          7,
      );

      userGrowth.push({
        week: `W${weekNumber}`,
        users: 0,
      });
    }

    weeklyUserGrowth.forEach((item) => {
      const index = userGrowth.findIndex((w) => w.week === `W${item._id.week}`);

      if (index !== -1) {
        userGrowth[index].users = item.users;
      }
    });

    console.log(userGrowth);

    const groqCount = await AIAnalytics.countDocuments({
      provider: "Groq",
    });

    const geminiCount = await AIAnalytics.countDocuments({
      provider: "Gemini",
    });

    const githubCount = await AIAnalytics.countDocuments({
      provider: "GitHub Models",
    });
    const aiUsage = [
      {
        name: "Groq",
        value: groqCount,
      },
      {
        name: "Gemini",
        value: geminiCount,
      },
      {
        name: "GitHub",
        value: githubCount,
      },
    ];
    // Sessions
    const aptitudeCount = await AptitudeSession.countDocuments();

    const communicationCount = await CommunicationSession.countDocuments();

    const emailCount = await EmailSession.countDocuments();

    const interviewCount = await InterviewSession.countDocuments();

    const jdPrepCount = await JDPrepSession.countDocuments();

    const totalSessions =
      aptitudeCount +
      communicationCount +
      emailCount +
      interviewCount +
      jdPrepCount;

    // Average Scores

    const aptitudeAvg = await AptitudeSession.aggregate([
      {
        $group: {
          _id: null,
          avgScore: {
            $avg: "$percentage",
          },
        },
      },
    ]);

    const communicationAvg = await CommunicationSession.aggregate([
      {
        $group: {
          _id: null,
          avgScore: {
            $avg: "$evaluation.overall.score",
          },
        },
      },
    ]);

    const emailAvg = await EmailSession.aggregate([
      {
        $group: {
          _id: null,
          avgScore: {
            $avg: "$evaluation.score",
          },
        },
      },
    ]);

    const jdPrepAvg = await JDPrepSession.aggregate([
      {
        $group: {
          _id: null,
          avgScore: {
            $avg: "$overallEvaluation.overallScore",
          },
        },
      },
    ]);

    // Recent Interview Sessions

    const interviewSessions = await InterviewSession.find()
      .populate("userId", "name")
      .sort({ startedAt: -1 })
      .limit(20);

    const aptitudeSessions = await AptitudeSession.find()
      .populate("userId", "name")
      .sort({ createdAt: -1 })
      .limit(20);

    const communicationSessions = await CommunicationSession.find()
      .populate("userId", "name")
      .sort({ createdAt: -1 })
      .limit(20);

    const emailSessions = await EmailSession.find()
      .populate("userId", "name")
      .sort({ createdAt: -1 })
      .limit(20);

    const jdPrepSessions = await JDPrepSession.find()
      .populate("userId", "name")
      .sort({ createdAt: -1 })
      .limit(20);

    const allSessions = [
      ...interviewSessions.map((s) => ({
        _id: s._id,
        user: s.userId?.name || "Unknown",
        module: "Technical",
        score: s.totalScore || 0,
        status: s.completed ? "Completed" : "In Progress",
        date: s.startedAt,
      })),

      ...aptitudeSessions.map((s) => ({
        _id: s._id,
        user: s.userId?.name || "Unknown",
        module: "Aptitude",
        score: Math.round(s.percentage || 0),
        status: "Completed",
        date: s.completedAt,
      })),

      ...communicationSessions.map((s) => ({
        _id: s._id,
        user: s.userId?.name || "Unknown",
        module: "Communication",
        score: Math.round(s.evaluation?.overall?.score || 0),
        status: "Completed",
        date: s.completedAt,
      })),

      ...emailSessions.map((s) => ({
        _id: s._id,
        user: s.userId?.name || "Unknown",
        module: "Email",
        score: Math.round(s.evaluation?.score || 0),
        status: "Completed",
        date: s.completedAt,
      })),

      ...jdPrepSessions.map((s) => ({
        _id: s._id,
        user: s.userId?.name || "Unknown",
        module: "JD Prep",
        score: Math.round(s.overallEvaluation?.overallScore || 0),
        status: "Completed",
        date: s.createdAt,
      })),
    ];
    console.log("Interview:", interviewSessions.length);
    console.log("Aptitude:", aptitudeSessions.length);
    console.log("Communication:", communicationSessions.length);
    console.log("Email:", emailSessions.length);
    console.log("JD Prep:", jdPrepSessions.length);

    const recentSessions = allSessions
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 10);

    const users = await User.find({
      accountType: "user",
    });

    //Top Users
    const topUsers = await Promise.all(
      users.map(async (user) => {
        const interviewSessions = await InterviewSession.find({
          userId: user._id,
          completed: true,
        });

        const interviewAverage =
          interviewSessions.length > 0
            ? interviewSessions.reduce(
                (sum, session) => sum + (session.totalScore || 0),
                0,
              ) / interviewSessions.length
            : 0;

        const scores = [
          interviewAverage,
          user.aptitudeStats?.averageScore || 0,
          user.communicationStats?.averageScore || 0,
          user.emailStats?.averageScore || 0,
          user.jdPrepStats?.averageScore || 0,
        ];

        const validScores = scores.filter((score) => score > 0);

        const averageScore =
          validScores.length > 0
            ? Math.round(
                validScores.reduce((sum, score) => sum + score, 0) /
                  validScores.length,
              )
            : 0;

        const totalSessions =
          interviewSessions.length +
          (user.aptitudeStats?.totalSessions || 0) +
          (user.communicationStats?.totalSessions || 0) +
          (user.emailStats?.totalSessions || 0) +
          (user.jdPrepStats?.totalSessions || 0);

        return {
          name: user.name,
          averageScore,
          totalSessions,
        };
      }),
    );
    console.log("top users: ", topUsers);
    const rankedUsers = topUsers
      .filter((user) => user.totalSessions > 0)
      .sort((a, b) => b.averageScore - a.averageScore)
      .slice(0, 5);

    const now = new Date();

    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const previousMonthStart = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1,
    );

    const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);

    //users trends
    const currentMonthUsers = await User.countDocuments({
      accountType: "user",
      createdAt: { $gte: currentMonthStart },
    });

    const previousMonthUsers = await User.countDocuments({
      accountType: "user",
      createdAt: {
        $gte: previousMonthStart,
        $lt: previousMonthEnd,
      },
    });

    //admin trends
    const currentMonthAdmins = await User.countDocuments({
      accountType: "admin",
      createdAt: { $gte: currentMonthStart },
    });

    const previousMonthAdmins = await User.countDocuments({
      accountType: "admin",
      createdAt: {
        $gte: previousMonthStart,
        $lt: previousMonthEnd,
      },
    });

    //sessions trend
    const currentMonthSessions =
      (await AptitudeSession.countDocuments({
        createdAt: { $gte: currentMonthStart },
      })) +
      (await CommunicationSession.countDocuments({
        createdAt: { $gte: currentMonthStart },
      })) +
      (await EmailSession.countDocuments({
        createdAt: { $gte: currentMonthStart },
      })) +
      (await InterviewSession.countDocuments({
        startedAt: { $gte: currentMonthStart },
      })) +
      (await JDPrepSession.countDocuments({
        createdAt: { $gte: currentMonthStart },
      }));

    const previousMonthSessions =
      (await AptitudeSession.countDocuments({
        createdAt: {
          $gte: previousMonthStart,
          $lt: previousMonthEnd,
        },
      })) +
      (await CommunicationSession.countDocuments({
        createdAt: {
          $gte: previousMonthStart,
          $lt: previousMonthEnd,
        },
      })) +
      (await EmailSession.countDocuments({
        createdAt: {
          $gte: previousMonthStart,
          $lt: previousMonthEnd,
        },
      })) +
      (await InterviewSession.countDocuments({
        startedAt: {
          $gte: previousMonthStart,
          $lt: previousMonthEnd,
        },
      })) +
      (await JDPrepSession.countDocuments({
        createdAt: {
          $gte: previousMonthStart,
          $lt: previousMonthEnd,
        },
      }));

    //active users trend
    const currentActiveUsers = await User.countDocuments({
      accountType: "user",
      "streak.lastActiveDate": {
        $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
    });

    const previousActiveUsers = await User.countDocuments({
      accountType: "user",
      "streak.lastActiveDate": {
        $gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
        $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
    });

    //growth trend
    const calculateGrowth = (current, previous) => {
      if (previous === 0) {
        return current > 0 ? 100 : 0;
      }

      return Number((((current - previous) / previous) * 100).toFixed(1));
    };

    //create trends
    const totalUsersTrend = calculateGrowth(
      currentMonthUsers,
      previousMonthUsers,
    );

    const totalAdminsTrend = calculateGrowth(
      currentMonthAdmins,
      previousMonthAdmins,
    );

    const totalSessionsTrend = calculateGrowth(
      currentMonthSessions,
      previousMonthSessions,
    );

    const activeUsersTrend = calculateGrowth(
      currentActiveUsers,
      previousActiveUsers,
    );

    res.status(200).json({
      stats: {
        totalUsers,
        totalAdmins,
        activeUsers,
        totalSessions,

        totalUsersTrend,
        totalAdminsTrend,
        totalSessionsTrend,
        activeUsersTrend,
      },
      userGrowth,
      aiUsage,
      recentSessions,
      topUsers: rankedUsers,
    });
  } catch (error) {
    console.error("Dashboard Error:", error);

    res.status(500).json({
      message: "Failed to load dashboard data",
    });
  }
});

/*
=========================================
Users API
GET /api/admin/users
=========================================
*/

router.get("/users", async (req, res) => {
  try {
    const users = await User.find({
      accountType: "user",
    })
      .select("-password")
      .sort({
        createdAt: -1,
      });

    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        // Interview Stats

        const interviewSessions = await InterviewSession.find({
          userId: user._id,
          completed: true,
        });

        const interviewTotalSessions = interviewSessions.length;

        const interviewAverageScore =
          interviewTotalSessions > 0
            ? interviewSessions.reduce(
                (sum, session) => sum + (session.totalScore || 0),
                0,
              ) / interviewTotalSessions
            : 0;

        // Total Sessions Across All Modules

        const totalSessions =
          interviewTotalSessions +
          (user.jdPrepStats?.totalSessions || 0) +
          (user.communicationStats?.totalSessions || 0) +
          (user.emailStats?.totalSessions || 0) +
          (user.aptitudeStats?.totalSessions || 0);

        // Average Score Across All Modules

        const scores = [
          interviewAverageScore,
          user.jdPrepStats?.averageScore || 0,
          user.communicationStats?.averageScore || 0,
          user.emailStats?.averageScore || 0,
          user.aptitudeStats?.averageScore || 0,
        ];

        const validScores = scores.filter((score) => score > 0);

        const averageScore =
          validScores.length > 0
            ? Math.round(
                validScores.reduce((sum, score) => sum + score, 0) /
                  validScores.length,
              )
            : 0;

        return {
          ...user.toObject(),

          totalSessions,

          averageScore,

          currentStreak: user.streak?.currentStreak || 0,

          status: user.isVerified ? "Verified" : "Pending",

          joined: new Date(user.createdAt).toLocaleDateString(),

          interviewStats: {
            totalSessions: interviewTotalSessions,
            averageScore: Math.round(interviewAverageScore),
          },
        };
      }),
    );

    res.status(200).json(usersWithStats);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to fetch users",
    });
  }
});

router.post("/users", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    const existingUser = await User.findOne({
      email,
    });

    if (existingUser) {
      return res.status(400).json({
        message: "Email already exists",
      });
    }

    const user = await User.create({
      name,
      email,
      password,
      role,
      provider: "local",
      accountType: "user",
      isVerified: true,
    });
    await logAdminAction(
      req.user,
      "USER_CREATED",
      user.email,
      "New user created",
    );
    res.status(201).json(user);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to create user",
    });
  }
});
// router.get("/users", async (req, res) => {
//   try {
//     const users = await User.find({
//       accountType: "user",
//     })
//       .select("-password")
//       .sort({
//         createdAt: -1,
//       });

//     res.status(200).json(users);
//   } catch (error) {
//     console.error(error);

//     res.status(500).json({
//       message: "Failed to fetch users",
//     });
//   }
// });

/*
=========================================
User Details
GET /api/admin/users/:id
=========================================
*/

router.get("/users/:id", async (req, res) => {
  try {
    const user = await User.findOne({
      _id: req.params.id,
      accountType: "user",
    });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    res.json(user);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to fetch user",
    });
  }
});

/*
=========================================
Delete User
DELETE /api/admin/users/:id
=========================================
*/

router.delete("/users/:id", async (req, res) => {
  try {
    const user = await User.findOne({
      _id: req.params.id,
      accountType: "user",
    });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // await user.deleteOne();
    user.isActive = false;
    await user.save();
    await logAdminAction(
      req.user,
      "USER_DEACTIVATED",
      user.email,
      "User deactivated",
    );
    res.json({
      message: "User deactivated successfully",
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to delete user",
    });
  }
});

// restore the inactive users
router.put("/users/:id/restore", async (req, res) => {
  try {
    const user = await User.findOne({
      _id: req.params.id,
      accountType: "user",
    });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    user.isActive = true;

    await user.save();
    await logAdminAction(
      req.user,
      "USER_RESTORED",
      user.email,
      "User restored",
    );
    res.json({
      message: "User restored successfully",
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to restore user",
    });
  }
});

/*
=========================================
Sessions page
=========================================
*/

router.get("/sessions", async (req, res) => {
  try {
    const adminIds = await User.find({ accountType: "admin" }, "_id");

    const adminUserIds = adminIds.map((user) => user._id);

    const interviewSessions = await InterviewSession.find({
      userId: {
        $nin: adminUserIds,
      },
    })
      .populate("userId", "name email")
      .lean();

    const jdPrepSessions = await JDPrepSession.find({
      userId: {
        $nin: adminUserIds,
      },
    })
      .populate("userId", "name email")
      .lean();

    const communicationSessions = await CommunicationSession.find({
      userId: {
        $nin: adminUserIds,
      },
    })
      .populate("userId", "name email")
      .lean();

    const emailSessions = await EmailSession.find({
      userId: {
        $nin: adminUserIds,
      },
    })
      .populate("userId", "name email")
      .lean();

    const aptitudeSessions = await AptitudeSession.find({
      userId: {
        $nin: adminUserIds,
      },
    })
      .populate("userId", "name email")
      .lean();

    const sessions = [];

    interviewSessions.forEach((s) => {
      sessions.push({
        _id: s._id,
        user: s.userId?.name,
        email: s.userId?.email,
        module: "Technical Interview",
        score: s.totalScore || 0,
        questions: s.questions?.length || 0,
        status: s.completed ? "Completed" : "In Progress",
        date: s.completedAt || s.startedAt,
      });
    });

    jdPrepSessions.forEach((s) => {
      sessions.push({
        _id: s._id,
        user: s.userId?.name,
        email: s.userId?.email,
        module: "JD Prep",
        score: s.overallEvaluation?.overallScore || 0,
        questions: s.questions?.length || 0,
        status: s.status,
        date: s.completedAt || s.createdAt,
      });
    });

    communicationSessions.forEach((s) => {
      sessions.push({
        _id: s._id,
        user: s.userId?.name,
        email: s.userId?.email,
        module: "Communication",
        score: s.evaluation?.overall?.score || 0,
        questions: 1,
        status: "Completed",
        date: s.completedAt,
      });
    });

    emailSessions.forEach((s) => {
      sessions.push({
        _id: s._id,
        user: s.userId?.name,
        email: s.userId?.email,
        module: "Email",
        score: s.evaluation?.score || 0,
        questions: 1,
        status: "Completed",
        date: s.completedAt,
      });
    });

    aptitudeSessions.forEach((s) => {
      sessions.push({
        _id: s._id,
        user: s.userId?.name,
        email: s.userId?.email,
        module: "Aptitude",
        score: s.percentage || 0,
        questions: s.totalQuestions || 0,
        status: "Completed",
        date: s.completedAt,
      });
    });

    sessions.sort((a, b) => new Date(b.date) - new Date(a.date));

    const now = new Date();

    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const previousMonthStart = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1,
    );

    const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);

    const currentSessions = sessions.filter(
      (s) => new Date(s.date) >= currentMonthStart,
    );

    const previousSessions = sessions.filter((s) => {
      const d = new Date(s.date);

      return d >= previousMonthStart && d < previousMonthEnd;
    });

    const calculateGrowth = (current, previous) => {
      if (previous === 0) {
        return current > 0 ? 100 : 0;
      }

      return Number((((current - previous) / previous) * 100).toFixed(1));
    };

    const totalSessionsTrend = calculateGrowth(
      currentSessions.length,
      previousSessions.length,
    );

    const currentCompleted = currentSessions.filter(
      (s) => s.status?.toLowerCase() === "completed",
    ).length;

    const previousCompleted = previousSessions.filter(
      (s) => s.status?.toLowerCase() === "completed",
    ).length;

    const completedTrend = calculateGrowth(currentCompleted, previousCompleted);

    const currentInProgress = currentSessions.filter((s) =>
      s.status?.toLowerCase().includes("progress"),
    ).length;

    const previousInProgress = previousSessions.filter((s) =>
      s.status?.toLowerCase().includes("progress"),
    ).length;

    const inProgressTrend = calculateGrowth(
      currentInProgress,
      previousInProgress,
    );

    const currentScores = currentSessions
      .map((s) => Number(s.score))
      .filter((s) => !isNaN(s));

    const previousScores = previousSessions
      .map((s) => Number(s.score))
      .filter((s) => !isNaN(s));

    const currentAvg =
      currentScores.length > 0
        ? currentScores.reduce((a, b) => a + b, 0) / currentScores.length
        : 0;

    const previousAvg =
      previousScores.length > 0
        ? previousScores.reduce((a, b) => a + b, 0) / previousScores.length
        : 0;

    const avgScoreTrend = Number((currentAvg - previousAvg).toFixed(1));

    res.json({
      sessions,

      stats: {
        totalSessionsTrend,
        completedTrend,
        inProgressTrend,
        avgScoreTrend,
      },
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to fetch sessions",
    });
  }
});

router.get("/sessions/:id", async (req, res) => {
  try {
    const sessionId = req.params.id;

    // Interview Session
    let session = await InterviewSession.findById(sessionId).populate(
      "userId",
      "name email",
    );

    if (session) {
      return res.json({
        type: "Technical Interview",

        _id: session._id,

        user: session.userId?.name,

        email: session.userId?.email,

        score: session.totalScore,

        status: session.completed ? "Completed" : "In Progress",

        date: session.completedAt || session.startedAt,

        questions: session.questions || [],
      });
    }

    // JD Prep Session

    session = await JDPrepSession.findById(sessionId).populate(
      "userId",
      "name email",
    );

    if (session) {
      return res.json({
        type: "JD Prep",

        _id: session._id,

        user: session.userId?.name,

        email: session.userId?.email,

        score: session.overallEvaluation?.overallScore || 0,

        status: session.status,

        date: session.completedAt || session.createdAt,

        questions: session.questions || [],

        overallEvaluation: session.overallEvaluation,
      });
    }

    // Communication Session

    session = await CommunicationSession.findById(sessionId).populate(
      "userId",
      "name email",
    );

    if (session) {
      return res.json({
        type: "Communication",

        _id: session._id,

        user: session.userId?.name,

        email: session.userId?.email,

        score: session.evaluation?.overall?.score || 0,

        status: "Completed",

        date: session.completedAt,

        question: session.question,

        transcript: session.transcript,

        evaluation: session.evaluation,
      });
    }

    // Email Session

    session = await EmailSession.findById(sessionId).populate(
      "userId",
      "name email",
    );

    if (session) {
      return res.json({
        type: "Email",

        _id: session._id,

        user: session.userId?.name,

        email: session.userId?.email,

        score: session.evaluation?.score || 0,

        status: "Completed",

        date: session.completedAt,

        emailContent: session.userEmail,

        feedback: session.evaluation?.feedback,
      });
    }

    // Aptitude Session

    session = await AptitudeSession.findById(sessionId).populate(
      "userId",
      "name email",
    );

    if (session) {
      return res.json({
        type: "Aptitude",

        _id: session._id,

        user: session.userId?.name,

        email: session.userId?.email,

        score: session.percentage,

        status: "Completed",

        date: session.completedAt,

        questions: session.questions || [],
      });
    }

    return res.status(404).json({
      message: "Session not found",
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to fetch session details",
    });
  }
});

router.get("/ai-analytics", async (req, res) => {
  try {
    const { range = "7d" } = req.query;

    const now = new Date();

    let currentStart = new Date();
    let previousStart = new Date();
    let previousEnd = new Date();

    switch (range) {
      case "24h":
        currentStart.setHours(now.getHours() - 24);

        previousEnd = new Date(currentStart);
        previousStart = new Date(previousEnd);
        previousStart.setHours(previousStart.getHours() - 24);
        break;

      case "7d":
        currentStart.setDate(now.getDate() - 7);

        previousEnd = new Date(currentStart);
        previousStart = new Date(previousEnd);
        previousStart.setDate(previousStart.getDate() - 7);
        break;

      case "30d":
        currentStart.setDate(now.getDate() - 30);

        previousEnd = new Date(currentStart);
        previousStart = new Date(previousEnd);
        previousStart.setDate(previousStart.getDate() - 30);
        break;

      case "90d":
        currentStart.setDate(now.getDate() - 90);

        previousEnd = new Date(currentStart);
        previousStart = new Date(previousEnd);
        previousStart.setDate(previousStart.getDate() - 90);
        break;

      default:
        currentStart.setDate(now.getDate() - 7);
    }

    const filter = {
      createdAt: { $gte: currentStart },
    };

    const totalRequests = await AIAnalytics.countDocuments(filter);

    const previousTotalRequests = await AIAnalytics.countDocuments({
      createdAt: {
        $gte: previousStart,
        $lt: previousEnd,
      },
    });

    const previousGroqRequests = await AIAnalytics.countDocuments({
      provider: "Groq",
      createdAt: {
        $gte: previousStart,
        $lt: previousEnd,
      },
    });

    const previousGeminiRequests = await AIAnalytics.countDocuments({
      provider: "Gemini",
      createdAt: {
        $gte: previousStart,
        $lt: previousEnd,
      },
    });

    const previousGithubRequests = await AIAnalytics.countDocuments({
      provider: "GitHub Models",
      createdAt: {
        $gte: previousStart,
        $lt: previousEnd,
      },
    });

    const groqRequests = await AIAnalytics.countDocuments({
      ...filter,
      provider: "Groq",
    });

    const geminiRequests = await AIAnalytics.countDocuments({
      ...filter,
      provider: "Gemini",
    });

    const githubRequests = await AIAnalytics.countDocuments({
      ...filter,
      provider: "GitHub Models",
    });

    const successRequests = await AIAnalytics.countDocuments({
      ...filter,
      success: true,
    });

    const failedRequests = await AIAnalytics.countDocuments({
      ...filter,
      success: false,
    });

    const avgResponse = await AIAnalytics.aggregate([
      {
        $match: {
          createdAt: { $gte: currentStart },
        },
      },
      {
        $group: {
          _id: null,
          avgTime: {
            $avg: "$responseTime",
          },
        },
      },
    ]);

    const successRate =
      totalRequests > 0
        ? ((successRequests / totalRequests) * 100).toFixed(1)
        : 0;

    const failureRate =
      totalRequests > 0
        ? ((failedRequests / totalRequests) * 100).toFixed(1)
        : 0;

    const calculateGrowth = (current, previous) => {
      if (previous === 0) {
        return current > 0 ? 100 : 0;
      }

      return Number((((current - previous) / previous) * 100).toFixed(1));
    };

    const totalTrend = calculateGrowth(totalRequests, previousTotalRequests);
    const groqTrend = calculateGrowth(groqRequests, previousGroqRequests);
    const geminiTrend = calculateGrowth(geminiRequests, previousGeminiRequests);
    const githubTrend = calculateGrowth(githubRequests, previousGithubRequests);

    res.json({
      totalRequests,
      groqRequests,
      geminiRequests,
      githubRequests,

      totalTrend,
      groqTrend,
      geminiTrend,
      githubTrend,

      successRate,
      failureRate,
      avgResponseTime: avgResponse[0]?.avgTime || 0,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to fetch analytics",
    });
  }
});

// reports
const getReportSummaryData = async (startDate, endDate) => {
  let dateFilter = {};

  if (startDate && endDate) {
    dateFilter = {
      createdAt: {
        $gte: new Date(startDate),
        $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
      },
    };
  }

  const adminIds = await User.find({ accountType: "admin" }, "_id");

  const adminUserIds = adminIds.map((u) => u._id);

  const totalUsers = await User.countDocuments({
    accountType: { $ne: "admin" },
    ...dateFilter,
  });

  const monthlyNewUsers = await User.countDocuments({
    accountType: { $ne: "admin" },
    createdAt: {
      $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    },
  });

  const interviewCount = await InterviewSession.countDocuments({
    userId: {
      $nin: adminUserIds,
    },
    ...dateFilter,
  });

  const jdPrepCount = await JDPrepSession.countDocuments({
    userId: {
      $nin: adminUserIds,
    },
    ...dateFilter,
  });

  const communicationCount = await CommunicationSession.countDocuments({
    userId: {
      $nin: adminUserIds,
    },
    ...dateFilter,
  });

  const emailCount = await EmailSession.countDocuments({
    userId: {
      $nin: adminUserIds,
    },
    ...dateFilter,
  });

  const aptitudeCount = await AptitudeSession.countDocuments({
    userId: {
      $nin: adminUserIds,
    },
    ...dateFilter,
  });

  const totalSessions =
    interviewCount +
    jdPrepCount +
    communicationCount +
    emailCount +
    aptitudeCount;

  const avgSessionsPerUser =
    totalUsers > 0 ? Number((totalSessions / totalUsers).toFixed(1)) : 0;

  const moduleUsage = {
    technical: interviewCount,
    jdPrep: jdPrepCount,
    communication: communicationCount,
    email: emailCount,
    aptitude: aptitudeCount,
  };

  const mostUsedModule = Object.keys(moduleUsage).reduce((a, b) =>
    moduleUsage[a] > moduleUsage[b] ? a : b,
  );

  const monthlyUsers = await User.aggregate([
    {
      $match: {
        accountType: {
          $ne: "admin",
        },
      },
    },
    {
      $group: {
        _id: {
          year: {
            $year: "$createdAt",
          },
          month: {
            $month: "$createdAt",
          },
        },
        users: {
          $sum: 1,
        },
      },
    },
    {
      $sort: {
        "_id.year": 1,
        "_id.month": 1,
      },
    },
  ]);

  let runningTotal = 0;

  const userGrowth = monthlyUsers.map((item) => {
    runningTotal += item.users;

    return {
      month: `${item._id.month}/${item._id.year}`,
      users: runningTotal,
    };
  });

  const now = new Date();

  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const previousMonthEnd = currentMonthStart;

  const previousMonthUsers = await User.countDocuments({
    accountType: { $ne: "admin" },
    createdAt: {
      $gte: previousMonthStart,
      $lt: previousMonthEnd,
    },
  });

  const currentMonthSessionFilter = {
    createdAt: {
      $gte: currentMonthStart,
    },
  };

  const previousMonthSessionFilter = {
    createdAt: {
      $gte: previousMonthStart,
      $lt: previousMonthEnd,
    },
  };

  const currentTotalSessions =
    (await InterviewSession.countDocuments({
      startedAt: { $gte: currentMonthStart },
    })) +
    (await JDPrepSession.countDocuments({
      createdAt: { $gte: currentMonthStart },
    })) +
    (await CommunicationSession.countDocuments({
      completedAt: { $gte: currentMonthStart },
    })) +
    (await EmailSession.countDocuments({
      completedAt: { $gte: currentMonthStart },
    })) +
    (await AptitudeSession.countDocuments({
      completedAt: { $gte: currentMonthStart },
    }));

  const previousTotalSessions =
    (await InterviewSession.countDocuments({
      startedAt: {
        $gte: previousMonthStart,
        $lt: previousMonthEnd,
      },
    })) +
    (await JDPrepSession.countDocuments({
      createdAt: {
        $gte: previousMonthStart,
        $lt: previousMonthEnd,
      },
    })) +
    (await CommunicationSession.countDocuments({
      completedAt: {
        $gte: previousMonthStart,
        $lt: previousMonthEnd,
      },
    })) +
    (await EmailSession.countDocuments({
      completedAt: {
        $gte: previousMonthStart,
        $lt: previousMonthEnd,
      },
    })) +
    (await AptitudeSession.countDocuments({
      completedAt: {
        $gte: previousMonthStart,
        $lt: previousMonthEnd,
      },
    }));

  const calculateGrowth = (current, previous) => {
    if (previous === 0) {
      return current > 0 ? 100 : 0;
    }

    return Number((((current - previous) / previous) * 100).toFixed(1));
  };

  const newUsersTrend = calculateGrowth(monthlyNewUsers, previousMonthUsers);

  const currentUsersCount = await User.countDocuments({
    accountType: { $ne: "admin" },
  });

  const previousUsersCount = previousMonthUsers;

  const currentAvgSessionsPerUser =
    currentUsersCount > 0 ? currentTotalSessions / currentUsersCount : 0;

  const previousAvgSessionsPerUser =
    previousUsersCount > 0 ? previousTotalSessions / previousUsersCount : 0;

  const sessionsTrend = calculateGrowth(
    currentAvgSessionsPerUser,
    previousAvgSessionsPerUser,
  );
  const currentCompletedSessions =
    (await InterviewSession.countDocuments({
      startedAt: { $gte: currentMonthStart },
      completed: true,
    })) +
    (await JDPrepSession.countDocuments({
      createdAt: { $gte: currentMonthStart },
      status: "completed",
    })) +
    (await CommunicationSession.countDocuments({
      completedAt: { $gte: currentMonthStart },
    })) +
    (await EmailSession.countDocuments({
      completedAt: { $gte: currentMonthStart },
    })) +
    (await AptitudeSession.countDocuments({
      completedAt: { $gte: currentMonthStart },
    }));

  const previousCompletedSessions =
    (await InterviewSession.countDocuments({
      startedAt: {
        $gte: previousMonthStart,
        $lt: previousMonthEnd,
      },
      completed: true,
    })) +
    (await JDPrepSession.countDocuments({
      createdAt: {
        $gte: previousMonthStart,
        $lt: previousMonthEnd,
      },
      status: "completed",
    })) +
    (await CommunicationSession.countDocuments({
      completedAt: {
        $gte: previousMonthStart,
        $lt: previousMonthEnd,
      },
    })) +
    (await EmailSession.countDocuments({
      completedAt: {
        $gte: previousMonthStart,
        $lt: previousMonthEnd,
      },
    })) +
    (await AptitudeSession.countDocuments({
      completedAt: {
        $gte: previousMonthStart,
        $lt: previousMonthEnd,
      },
    }));

  const currentCompletionRate =
    currentTotalSessions > 0
      ? Number(
          ((currentCompletedSessions / currentTotalSessions) * 100).toFixed(1),
        )
      : 0;

  const previousCompletionRate =
    previousTotalSessions > 0
      ? Number(
          ((previousCompletedSessions / previousTotalSessions) * 100).toFixed(
            1,
          ),
        )
      : 0;

  const completionRateTrend = Number(
    (currentCompletionRate - previousCompletionRate).toFixed(1),
  );

  console.log("Current Users:", monthlyNewUsers);
  console.log("Previous Users:", previousMonthUsers);

  console.log("Current Sessions:", currentTotalSessions);
  console.log("Previous Sessions:", previousTotalSessions);

  console.log("current average score per user:", currentAvgSessionsPerUser);
  console.log("previous average score per user:", previousAvgSessionsPerUser);

  return {
    monthlyNewUsers,
    avgSessionsPerUser,
    mostUsedModule,
    completionRate: currentCompletionRate,

    newUsersTrend,
    sessionsTrend,
    completionRateTrend,

    userGrowth,
    moduleUsage,
    interviewCount,
    jdPrepCount,
    communicationCount,
    emailCount,
    aptitudeCount,
    adminUserIds,
  };
};

router.get("/reports", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const data = await getReportSummaryData(startDate, endDate);

    res.json({
      monthlyNewUsers: data.monthlyNewUsers,
      avgSessionsPerUser: data.avgSessionsPerUser,
      mostUsedModule: data.mostUsedModule,
      overallAverageScore: Math.round(data.overallAverageScore),
      completionRate: data.completionRate,

      newUsersTrend: data.newUsersTrend,
      sessionsTrend: data.sessionsTrend,
      avgScoreTrend: data.avgScoreTrend,
      completionRateTrend: data.completionRateTrend,

      moduleUsage: data.moduleUsage,
      userGrowth: data.userGrowth,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to fetch reports",
    });
  }
});

router.get("/reports/export", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let sessionDateFilter = {};

    if (startDate && endDate) {
      sessionDateFilter = {
        createdAt: {
          $gte: new Date(startDate),
          $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
        },
      };
    }
    const data = await getReportSummaryData(startDate, endDate);
    const interviewSessions = await InterviewSession.find(
      sessionDateFilter,
    ).populate("userId", "name email");

    const jdPrepSessions = await JDPrepSession.find(sessionDateFilter).populate(
      "userId",
      "name email",
    );

    const communicationSessions = await CommunicationSession.find(
      sessionDateFilter,
    ).populate("userId", "name email");

    const emailSessions = await EmailSession.find(sessionDateFilter).populate(
      "userId",
      "name email",
    );

    const aptitudeSessions = await AptitudeSession.find().populate(
      "userId",
      "name email",
    );
    const workbook = new ExcelJS.Workbook();

    const sessionData = [];

    interviewSessions.forEach((session) => {
      sessionData.push({
        user: session.userId?.name || "Unknown",
        email: session.userId?.email || "-",
        module: "Interview",
        score: session.totalScore || 0,
        status: session.completed ? "Completed" : "In Progress",
        date: session.completed ? session.completedAt : session.startedAt,
      });
    });

    jdPrepSessions.forEach((session) => {
      sessionData.push({
        user: session.userId?.name || "Unknown",
        email: session.userId?.email || "-",
        module: "JD Prep",
        score: session.overallEvaluation?.overallScore || 0,
        status: session.status == "completed" ? "Completed" : "In Progress",
        date: session.createdAt,
      });
    });

    communicationSessions.forEach((session) => {
      sessionData.push({
        user: session.userId?.name || "Unknown",
        email: session.userId?.email || "-",
        module: "Communication",
        score: session.evaluation?.overall?.score || 0,
        status: session.completedAt ? "Completed" : "In Progress",
        date: session.completedAt,
      });
    });

    emailSessions.forEach((session) => {
      sessionData.push({
        user: session.userId?.name || "Unknown",
        email: session.userId?.email || "-",
        module: "Email",
        score: session.evaluation?.score || 0,
        status: session.completedAt ? "Completed" : "In Progress",
        date: session.completedAt,
      });
    });

    aptitudeSessions.forEach((session) => {
      sessionData.push({
        user: session.userId?.name || "Unknown",
        email: session.userId?.email || "-",
        module: "Aptitude",
        score: session.percentage || 0,
        status: "Completed",
        date: session.completedAt,
      });
    });
    /* ==========================
       SHEET 1 : SUMMARY
    ========================== */

    const summarySheet = workbook.addWorksheet("Summary");

    summarySheet.columns = [
      { header: "Metric", key: "metric", width: 30 },
      { header: "Value", key: "value", width: 20 },
    ];

    summarySheet.addRows([
      {
        metric: "New Users This Month",
        value: data.monthlyNewUsers,
      },
      {
        metric: "Sessions Per User",
        value: data.avgSessionsPerUser,
      },
      {
        metric: "Most Used Module",
        value: data.mostUsedModule,
      },
      {
        metric: "Average User Score",
        value: data.overallAverageScore,
      },
    ]);

    /* ==========================
       SHEET 2 : USER GROWTH
    ========================== */

    const growthSheet = workbook.addWorksheet("User Growth");

    growthSheet.columns = [
      {
        header: "Month",
        key: "month",
        width: 20,
      },
      {
        header: "Users",
        key: "users",
        width: 15,
      },
    ];

    data.userGrowth.forEach((item) => {
      growthSheet.addRow({
        month: item.month,
        users: item.users,
      });
    });

    /* ==========================
       SHEET 3 : MODULE USAGE
    ========================== */

    const moduleSheet = workbook.addWorksheet("Module Usage");

    moduleSheet.columns = [
      {
        header: "Module",
        key: "module",
        width: 25,
      },
      {
        header: "Sessions",
        key: "sessions",
        width: 20,
      },
    ];

    moduleSheet.addRows([
      {
        module: "Technical Interview",
        sessions: data.interviewCount,
      },
      {
        module: "JD Prep",
        sessions: data.jdPrepCount,
      },
      {
        module: "Communication",
        sessions: data.communicationCount,
      },
      {
        module: "Email",
        sessions: data.emailCount,
      },
      {
        module: "Aptitude",
        sessions: data.aptitudeCount,
      },
    ]);

    /* ==========================
       SHEET 4 : SESSION DETAILS
    ========================== */
    console.log("session details of admin reports", sessionData);
    const sessionSheet = workbook.addWorksheet("Session Details");

    sessionSheet.columns = [
      {
        header: "User",
        key: "user",
        width: 25,
      },
      {
        header: "Email",
        key: "email",
        width: 35,
      },
      {
        header: "Module",
        key: "module",
        width: 20,
      },
      {
        header: "Score",
        key: "score",
        width: 15,
      },
      {
        header: "Status",
        key: "status",
        width: 15,
      },
      {
        header: "Date",
        key: "date",
        width: 25,
      },
    ];

    sessionData.forEach((item) => {
      sessionSheet.addRow({
        ...item,
        date: item.date ? new Date(item.date).toLocaleString("en-GB") : "-",
      });
    });

    /* ==========================
       SHEET 5 : USER PERFORMANCE
    ========================== */

    const performanceSheet = workbook.addWorksheet("User Performance");

    performanceSheet.columns = [
      {
        header: "User Name",
        key: "name",
        width: 25,
      },
      {
        header: "Email",
        key: "email",
        width: 35,
      },
      {
        header: "Total Sessions",
        key: "sessions",
        width: 20,
      },
      {
        header: "Average Score",
        key: "score",
        width: 20,
      },
    ];

    const users = await User.find({
      accountType: "user",
      ...(startDate && endDate
        ? {
            createdAt: {
              $gte: new Date(startDate),
              $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
            },
          }
        : {}),
    });

    users.forEach((user) => {
      const totalSessions =
        (user.aptitudeStats?.totalSessions || 0) +
        (user.communicationStats?.totalSessions || 0) +
        (user.emailStats?.totalSessions || 0) +
        (user.jdPrepStats?.totalSessions || 0);

      const scores = [
        user.aptitudeStats?.averageScore || 0,
        user.communicationStats?.averageScore || 0,
        user.emailStats?.averageScore || 0,
        user.jdPrepStats?.averageScore || 0,
      ];

      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

      performanceSheet.addRow({
        name: user.name,
        email: user.email,
        sessions: totalSessions,
        score: avgScore.toFixed(2),
      });
    });

    /* ==========================
       HEADER STYLE
    ========================== */

    workbook.eachSheet((sheet) => {
      sheet.getRow(1).font = {
        bold: true,
      };
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=InterviewAI_Report.xlsx",
    );

    await workbook.xlsx.write(res);

    res.end();
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to export report",
    });
  }
});

// Contact Messages routes
router.get("/contacts", async (req, res) => {
  try {
    const contacts = await Contact.find().sort({ createdAt: -1 });

    res.json({
      success: true,
      contacts,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch contacts",
    });
  }
});

router.patch("/contacts/:id/read", async (req, res) => {
  try {
    const contact = await Contact.findByIdAndUpdate(
      req.params.id,
      {
        isRead: true,
        status: "READ",
      },
      {
        returnDocument: "after",
      },
    );
    await logAdminAction(
      req.user,
      "CONTACT_MARK_READ",
      contact.email,
      "contact message is read",
    );
    res.json({
      success: true,
      contact,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
    });
  }
});

router.delete("/contacts/:id", async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    if (!contact) {
      return res.status(404).json({
        success: false,
        message: "Contact not found",
      });
    }
    await Contact.findByIdAndDelete(req.params.id);
    await logAdminAction(
      req.user,
      "CONTACT_DELETED",
      contact.email,
      "Deleted contact message",
    );
    res.json({
      success: true,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
    });
  }
});

router.post("/contacts/:id/reply", async (req, res) => {
  try {
    const { reply } = req.body;

    const contact = await Contact.findById(req.params.id);

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: "Contact not found",
      });
    }

    await sendContactReply(contact.email, contact.name, reply);

    await logAdminAction(
      req.user,
      "CONTACT_REPLY_SENT",
      contact.email,
      "Reply sent to contact message",
    );

    contact.status = "REPLIED";
    contact.isRead = true;
    contact.repliedAt = new Date();
    contact.replies.push({
      message: reply,
    });

    await contact.save();

    res.json({
      success: true,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
    });
  }
});

// Profile Page
router.get("/profile", auth, async (req, res) => {
  try {
    const admin = await User.findById(req.userId).select("-password");

    if (!admin) {
      return res.status(404).json({
        message: "Admin not found",
      });
    }

    res.json({
      name: admin.name,
      email: admin.email,
      accountType: admin.accountType,
      profilePicture: admin.profilePicture,
      createdAt: admin.createdAt,
      lastActiveDate: admin.streak?.lastActiveDate,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to fetch profile",
    });
  }
});
router.put("/change-password", auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        message: "Current password and new password are required",
      });
    }

    const admin = await User.findById(req.userId);

    if (!admin) {
      return res.status(404).json({
        message: "Admin not found",
      });
    }

    const isMatch = await admin.comparePassword(currentPassword);

    if (!isMatch) {
      return res.status(400).json({
        message: "Current password is incorrect",
      });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters",
      });
    }
    admin.password = newPassword;

    await admin.save();

    res.json({
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to change password",
    });
  }
});

router.get("/settings", auth, async (req, res) => {
  try {
    let settings = await SystemSettings.findOne();

    if (!settings) {
      settings = await SystemSettings.create({});
    }

    res.json(settings);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch settings",
    });
  }
});

//update settings

router.put("/settings", auth, async (req, res) => {
  try {
    let settings = await SystemSettings.findOne();

    if (!settings) {
      settings = await SystemSettings.create({});
    }

    settings.maintenanceMode = req.body.maintenanceMode;

    settings.userRegistration = req.body.userRegistration;

    await settings.save();

    res.json(settings);
  } catch (error) {
    res.status(500).json({
      message: "Failed to update settings",
    });
  }
});

router.get("/settings/providers", auth, async (req, res) => {
  try {
    res.json({
      gemini: !!process.env.GEMINI_API_KEY,

      groq: !!process.env.GROQ_API_KEY,

      githubModels: !!process.env.GITHUB_TOKEN,

      ollama: false,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch providers",
    });
  }
});

/*
=========================================
Audit Logs
GET /api/admin/audit-logs
=========================================
*/

router.get("/audit-logs", async (req, res) => {
  try {
    const logs = await AuditLog.find()
      .sort({
        createdAt: -1,
      })
      .limit(1000);

    res.status(200).json(logs);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to fetch audit logs",
    });
  }
});

router.get("/global-search", async (req, res) => {
  try {
    const q = req.query.q?.trim();

    if (!q) {
      return res.json({
        users: [],
        sessions: [],
        contacts: [],
        analytics: [],
        auditLogs: [],
        counts: {
          users: 0,
          sessions: 0,
          contacts: 0,
          analytics: 0,
          auditLogs: 0,
        },
      });
    }

    const regex = new RegExp(q, "i");

    const [
      users,
      interviewSessions,
      communicationSessions,
      emailSessions,
      aptitudeSessions,
      jdPrepSessions,
      contacts,
      auditLogs,
      analytics,
    ] = await Promise.all([
      User.find({
        accountType: "user",
        $or: [
          { name: regex },
          { email: regex },
          { role: regex },
          { technologyStack: regex },
        ],
      })
        .select("name email role")
        .limit(3),

      InterviewSession.find({
        $or: [
          { role: regex },
          { experienceLevel: regex },
          { "questions.question": regex },
        ],
      })
        .populate("userId", "name")
        .limit(3),

      CommunicationSession.find({
        $or: [{ question: regex }, { transcript: regex }],
      })
        .populate("userId", "name")
        .limit(3),

      EmailSession.find({
        $or: [{ scenarioTitle: regex }, { userEmail: regex }],
      })
        .populate("userId", "name")
        .limit(3),

      AptitudeSession.find({
        $or: [{ topic: regex }, { "questions.questionText": regex }],
      })
        .populate("userId", "name")
        .limit(3),

      JDPrepSession.find({
        $or: [
          { jobDescription: regex },
          { finalSkills: regex },
          { "questions.question": regex },
        ],
      })
        .populate("userId", "name")
        .limit(3),

      Contact.find({
        $or: [{ name: regex }, { email: regex }, { message: regex }],
      })
        .select("name email message")
        .limit(2),

      AuditLog.find({
        $or: [
          { adminName: regex },
          { action: regex },
          { target: regex },
          { details: regex },
        ],
      }).limit(2),

      AIAnalytics.find({
        $or: [{ provider: regex }, { module: regex }],
      }).limit(2),
    ]);

    const sessions = [
      ...interviewSessions.map((s) => ({
        id: s._id,
        user: s.userId?.name || "Unknown",
        module: "Technical Interview",
      })),

      ...communicationSessions.map((s) => ({
        id: s._id,
        user: s.userId?.name || "Unknown",
        module: "Communication",
      })),

      ...emailSessions.map((s) => ({
        id: s._id,
        user: s.userId?.name || "Unknown",
        module: "Email",
      })),

      ...aptitudeSessions.map((s) => ({
        id: s._id,
        user: s.userId?.name || "Unknown",
        module: "Aptitude",
      })),

      ...jdPrepSessions.map((s) => ({
        id: s._id,
        user: s.userId?.name || "Unknown",
        module: "JD Prep",
      })),
    ].slice(0, 3);

    res.json({
      users,
      sessions,
      contacts,
      analytics,
      auditLogs,

      counts: {
        users: users.length,
        sessions: sessions.length,
        contacts: contacts.length,
        analytics: analytics.length,
        auditLogs: auditLogs.length,
      },
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Search failed",
    });
  }
});

module.exports = router;
