const express = require("express");
const axios = require("axios");
const authMiddleware = require("../middleware/auth");
const EmailSession = require("../models/EmailSession");
const User = require("../models/User");
const AIAnalytics = require("../models/AIAnalytics");
const router = express.Router();
const Notification = require("../models/Notification");

// ============================================
// FREE AI SETUP (Same as other modules)
// ============================================
let groqClient = null;
let geminiApiKey = null;
let githubToken = null;

// Initialize Groq
if (process.env.GROQ_API_KEY) {
  try {
    const Groq = require("groq-sdk");
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
    console.log("✅ Groq initialized for Email Module");
  } catch (e) {
    console.log("⚠️ groq-sdk not installed");
  }
}

// Initialize Gemini
if (process.env.GEMINI_API_KEY) {
  geminiApiKey = process.env.GEMINI_API_KEY;
  console.log("✅ Gemini initialized for Email Module");
}

// Initialize GitHub Models
if (process.env.GITHUB_TOKEN) {
  githubToken = process.env.GITHUB_TOKEN;
  console.log("✅ GitHub Models initialized for Email Module");
}

// Unified Free AI Call
const callFreeAI = async (prompt, moduleName = "Email", isJson = true) => {
  const providers = [];

  if (groqClient) {
    providers.push({
      name: "Groq",
      fn: async () => {
        const response = await groqClient.chat.completions.create({
          model: "llama-3.1-8b-instant",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
          max_tokens: 700,
          ...(isJson && { response_format: { type: "json_object" } }),
        });
        return response.choices[0].message.content;
      },
    });
  }

  if (githubToken) {
    providers.push({
      name: "GitHub Models",
      fn: async () => {
        const response = await axios.post(
          "https://models.inference.ai.azure.com/chat/completions",
          {
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.2,
            max_tokens: 700,
          },
          { headers: { Authorization: `Bearer ${githubToken}` } },
        );
        return response.data.choices[0].message.content;
      },
    });
  }

  if (geminiApiKey) {
    providers.push({
      name: "Gemini",
      fn: async () => {
        const response = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
          {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 700,
              responseMimeType: "application/json",
            },
          },
        );
        return response.data.candidates[0].content.parts[0].text;
      },
    });
  }

  for (const provider of providers) {
    try {
      console.log(`Trying ${provider.name} for Email...`);
      const start = Date.now();
      const result = await provider.fn();
      const end = Date.now();
      await AIAnalytics.create({
        provider: provider.name,
        module: moduleName,
        success: true,
        responseTime: end - start,
      });
      console.log(`✅ Success via ${provider.name}`);
      return result;
    } catch (err) {
      await AIAnalytics.create({
        provider: provider.name,
        module: moduleName,
        success: false,
        responseTime: 0,
      });
      console.log(`⚠️ ${provider.name} failed: ${err.message}`);
    }
  }

  throw new Error("All AI providers failed");
};

const safeParseJSON = (text) => {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    const jsonStr = match ? match[0] : text;
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error("JSON Parse Error:", e.message);
    return null;
  }
};

// ============================================
// GENERATE EMAIL SCENARIO
// ============================================
const generateEmailScenario = async (category = "professional") => {
  const prompt = `Generate a professional email writing practice scenario for category: ${category}.

Return ONLY valid JSON in this format:
{
  "title": "Short title",
  "scenario": "Detailed scenario description in one paragraph",
  "recipient": "Recipient name or role",
  "sender": "Your position",
  "tips": ["tip 1", "tip 2", "tip 3"],
  "sampleAnswer": "A sample professional email"
}`;

  try {
    const text = await callFreeAI(prompt, true);
    console.log("email generated using ai", text);
    const parsed = safeParseJSON(text);

    if (parsed && parsed.scenario) {
      return {
        id: Date.now(),
        ...parsed,
        category,
      };
    }
    throw new Error("Invalid format");
  } catch (error) {
    console.log("AI failed, using fallback");
    return getFallbackScenario(category);
  }
};

// ============================================
// EVALUATE EMAIL
// ============================================
const evaluateEmailWithAI = async (userEmail, scenario) => {
  const prompt = `Evaluate this professional email.

Scenario: ${scenario.title}
Context: ${scenario.scenario}

User's Email:
${userEmail}

Return ONLY valid JSON:
{
  "score": 85,
  "feedback": "Short constructive feedback"
}`;

  try {
    const text = await callFreeAI(prompt, true);
    console.log("email evaluated using ai", text);
    const parsed = safeParseJSON(text);

    return {
      score: parsed?.score || 70,
      feedback: parsed?.feedback || "Good attempt. Keep practicing.",
    };
  } catch (error) {
    console.log("Evaluation failed, using fallback", error);
    return evaluateEmailFallback(userEmail);
  }
};

// ============================================
// FALLBACKS
// ============================================
const getFallbackScenario = (category) => {
  const fallbacks = {
    professional: {
      title: "Meeting Request",
      scenario:
        "You need to schedule a meeting with your manager to discuss a project update. The project is ahead of schedule.",
      recipient: "Your Manager",
      sender: "You",
      tips: ["Mention purpose clearly", "Suggest time slots", "Be polite"],
      sampleAnswer:
        "Subject: Meeting Request - Project Update\n\nDear Manager,\n\nI would like to schedule a meeting...\n\nBest regards,\n[Your Name]",
    },
    formal: {
      title: "Job Application Follow-up",
      scenario:
        "You applied for a Frontend Developer position two weeks ago and want to follow up.",
      recipient: "Hiring Manager",
      sender: "You",
      tips: ["Be professional", "Show enthusiasm", "Keep it concise"],
      sampleAnswer: "Subject: Follow-up on Frontend Developer Application...",
    },
    customerSupport: {
      title: "Product Complaint",
      scenario:
        "You received a defective product and want a replacement or refund.",
      recipient: "Customer Support Team",
      sender: "You",
      tips: [
        "Include order number",
        "Describe issue clearly",
        "State desired resolution",
      ],
      sampleAnswer: "Subject: Defective Product - Order #12345...",
    },
  };

  return fallbacks[category] || fallbacks.professional;
};

const evaluateEmailFallback = (userEmail) => {
  const wordCount = userEmail.split(/\s+/).length;
  const score = wordCount > 80 ? 78 : wordCount > 40 ? 65 : 45;

  return {
    score,
    feedback:
      score > 70
        ? "Well-structured professional email"
        : "Good attempt. Focus on clarity and structure.",
  };
};

// ============================================
// ROUTES
// ============================================

router.post("/generate-scenario", authMiddleware, async (req, res) => {
  const { category = "professional" } = req.body;

  try {
    const scenario = await generateEmailScenario(category);
    res.json({ success: true, source: "ai", scenario });
  } catch (error) {
    const fallback = getFallbackScenario(category);
    res.json({ success: true, source: "fallback", scenario: fallback });
  }
});

router.post("/session/start", authMiddleware, async (req, res) => {
  const { category, scenarioTitle } = req.body;

  try {
    const session = new EmailSession({
      userId: req.userId,
      category,
      scenarioTitle,
      completedAt: null,
    });

    await session.save();
    res.json({ success: true, sessionId: session._id });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ success: false, message: "Failed to start session" });
  }
});

router.post("/evaluate", authMiddleware, async (req, res) => {
  const { email, scenario, sessionId, timeSpent } = req.body;

  let evaluation;
  let source = "fallback";

  try {
    evaluation = await evaluateEmailWithAI(email, scenario);
    source = "ai";
  } catch (error) {
    evaluation = evaluateEmailFallback(email);
  }

  const wordCount = email.split(/\s+/).length;

  // Save to database
  try {
    if (sessionId) {
      const session = await EmailSession.findOne({
        _id: sessionId,
        userId: req.userId,
      });
      if (session) {
        session.userEmail = email;
        session.scenario = scenario;
        session.evaluation = evaluation;
        session.wordCount = wordCount;
        session.timeSpent = timeSpent || 0;
        session.evaluationSource = source;
        session.completedAt = new Date();
        await session.save();
      }
    }
  } catch (dbError) {
    console.error("Database save error:", dbError.message);
  }

  //notification
  const user = await User.findById(req.userId);

  await Notification.create({
    title: "Email Practice Completed",
    message: `${user?.name || "User"} completed Email Practice`,
    type: "email",
    userId: req.userId,
    entityId: sessionId,
    entityType: "email",
  });

  // Update user stats
  try {
    const user = await User.findById(req.userId);
    if (user) {
      if (!user.emailStats) {
        user.emailStats = { totalSessions: 0, averageScore: 0, bestScore: 0 };
      }

      user.emailStats.totalSessions += 1;
      const currentTotal =
        user.emailStats.averageScore * (user.emailStats.totalSessions - 1);
      user.emailStats.averageScore = Math.round(
        (currentTotal + evaluation.score) / user.emailStats.totalSessions,
      );

      if (evaluation.score > (user.emailStats.bestScore || 0)) {
        user.emailStats.bestScore = evaluation.score;
      }

      await user.save();
    }
  } catch (err) {
    console.error("User stats update error:", err.message);
  }

  res.json({
    success: true,
    source,
    evaluation,
    wordCount,
  });
});

router.get("/sessions/history", authMiddleware, async (req, res) => {
  const sessions = await EmailSession.find({
    userId: req.userId,
    completedAt: { $ne: null },
  })
    .sort({ completedAt: -1 })
    .limit(20);

  res.json({ sessions });
});

router.get("/stats", authMiddleware, async (req, res) => {
  const sessions = await EmailSession.find({
    userId: req.userId,
    completedAt: { $ne: null },
  });

  const totalSessions = sessions.length;
  const averageScore =
    sessions.reduce((sum, s) => sum + (s.evaluation?.score || 0), 0) /
    (totalSessions || 1);

  res.json({
    totalSessions,
    averageScore: Math.round(averageScore),
  });
});

module.exports = router;
