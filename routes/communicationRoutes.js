const express = require("express");
const axios = require("axios");
const authMiddleware = require("../middleware/auth");
const CommunicationSession = require("../models/CommunicationSession");
const User = require("../models/User");

const router = express.Router();

const AIAnalytics = require("../models/AIAnalytics");
// ============================================
// FREE AI SETUP (Same as Mock Interview)
// ============================================
let groqClient = null;
let geminiApiKey = null;
let githubToken = null;

// Initialize Groq
if (process.env.GROQ_API_KEY) {
  try {
    const Groq = require("groq-sdk");
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
    console.log("✅ Groq initialized for Communication Module");
  } catch (e) {
    console.log("⚠️ groq-sdk not installed");
  }
}

// Initialize Gemini
if (process.env.GEMINI_API_KEY) {
  geminiApiKey = process.env.GEMINI_API_KEY;
  console.log("✅ Gemini initialized for Communication Module");
}

// Initialize GitHub Models
if (process.env.GITHUB_TOKEN) {
  githubToken = process.env.GITHUB_TOKEN;
  console.log("✅ GitHub Models initialized for Communication Module");
}

// Unified Free AI Call
const callFreeAI = async (
  prompt,
  moduleName = "Communication",
  isJson = true,
) => {
  const providers = [];

  if (groqClient) {
    providers.push({
      name: "Groq",
      fn: async () => {
        const response = await groqClient.chat.completions.create({
          model: "llama-3.1-8b-instant",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
          max_tokens: 600,
          ...(isJson && { response_format: { type: "json_object" } }),
        });
        return response.choices[0].message.content;
      },
    });
  }

  if (geminiApiKey) {
    providers.push({
      name: "Gemini",
      fn: async () => {
        const response = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
          {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 600,
              responseMimeType: "application/json",
            },
          },
        );
        return response.data.candidates[0].content.parts[0].text;
      },
    });
  }

  if (githubToken) {
    providers.push({
      name: "GitHub",
      fn: async () => {
        const response = await axios.post(
          "https://models.inference.ai.azure.com/chat/completions",
          {
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.2,
            max_tokens: 600,
          },
          { headers: { Authorization: `Bearer ${githubToken}` } },
        );
        return response.data.choices[0].message.content;
      },
    });
  }

  for (const provider of providers) {
    try {
      console.log(`Trying ${provider.name} for Communication...`);
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
// QUESTION GENERATION
// ============================================
const generateQuestion = async (moduleType, subCategory = "common") => {
  let prompt = "";

  switch (moduleType) {
    case "hr":
      prompt = `Generate 1 professional HR interview question for category: ${subCategory || "common"}.
Return ONLY valid JSON:
{
  "question": "question here",

}`;
      break;

    case "star":
      prompt = `Generate 1 STAR method behavioral question.
Return ONLY valid JSON:
{
  "question": "question here",
 
}`;
      break;

    case "presentation":
      prompt = `Generate 1 presentation practice topic.
Return ONLY valid JSON:
{
  "question": "presentation topic here",

}`;
      break;

    case "professional":
      prompt = `Generate 1 professional workplace communication scenario.
Return ONLY valid JSON:
{
  "question": "scenario here",

}`;
      break;

    default:
      prompt = `Generate 1 good HR interview question. Return ONLY valid JSON.`;
  }

  try {
    const text = await callFreeAI(prompt, true);
    console.log("comm question ai: ", text);
    const parsed = safeParseJSON(text);

    if (parsed && parsed.question) {
      return parsed;
    }
    throw new Error("Invalid response");
  } catch (error) {
    console.log("AI failed, using fallback");
    return getFallbackQuestion(moduleType, subCategory);
  }
};

// ============================================
// FALLBACK QUESTIONS
// ============================================
const getFallbackQuestion = (moduleType, subCategory) => {
  // ... (Your existing fallback object - kept same)
  const fallbacks = {
    hr: {
      common: {
        question: "Tell me about yourself.",
        tips: [
          "Focus on professional background",
          "Keep it 60-90 seconds",
          "End with career goals",
        ],
        expectedKeywords: ["experience", "skills", "career"],
      },
      behavioral: {
        question:
          "Tell me about a time you faced a challenge at work and how you overcame it.",
        tips: [
          "Use STAR method",
          "Be specific about your role",
          "Share measurable results",
        ],
        expectedKeywords: ["situation", "task", "action", "result"],
      },
      situational: {
        question:
          "How would you handle a disagreement with your manager about a technical approach?",
        tips: [
          "Stay professional",
          "Focus on data/facts",
          "Show collaboration",
        ],
        expectedKeywords: ["professional", "discuss", "compromise", "data"],
      },
      career: {
        question: "Where do you see yourself in 5 years?",
        tips: ["Align with company goals", "Show ambition", "Be realistic"],
        expectedKeywords: ["growth", "learn", "contribute", "career"],
      },
    },
    star: {
      question:
        "Describe a situation where you had to solve a difficult problem at work. What was your approach and what was the outcome?",
      tips: [
        "S - Describe the Situation",
        "T - Explain your Task",
        "A - Detail your Actions",
        "R - Share the Results",
      ],
      expectedKeywords: ["situation", "task", "action", "result"],
    },
    presentation: {
      question:
        "Prepare a 3-minute presentation about a project you worked on. Explain the challenge, your solution, and the results.",
      tips: [
        "Start with a hook",
        "Structure your content",
        "Use examples",
        "End with a strong conclusion",
      ],
      expectedKeywords: ["hook", "structure", "examples", "conclusion"],
    },
    professional: {
      question:
        "A client is unhappy with a delayed delivery. How would you communicate with them to resolve the situation?",
      tips: [
        "Acknowledge the issue",
        "Apologize sincerely",
        "Offer solution",
        "Follow up",
      ],
      expectedKeywords: ["acknowledge", "apologize", "solution", "follow-up"],
    },
  };

  return (
    fallbacks[moduleType] ||
    fallbacks.hr?.common || {
      question: "Tell me about yourself.",
      tips: ["Keep it professional", "Highlight relevant experience"],
      expectedKeywords: ["experience", "skills"],
    }
  );
};

// ============================================
// EVALUATION
// ============================================
const evaluateCommunicationAnswer = async (moduleType, question, answer) => {
  const prompt = `Evaluate this ${moduleType} communication answer.

Question: ${question}
Answer: ${answer}

Return ONLY valid JSON:
{
  "content": 75,
  "delivery": 70,
  "overall": 72,
  "feedback": "Short one line feedback"
}`;

  try {
    const text = await callFreeAI(prompt, true);
    console.log("ai comm result: ", text);
    const parsed = safeParseJSON(text);

    return {
      content: {
        score: parsed?.content || 15,
        feedback: parsed?.feedback || "Good attempt",
      },
      delivery: {
        score: parsed?.delivery || 15,
        feedback: parsed?.feedback || "Keep practicing",
      },
      overall: {
        score: parsed?.overall || 15,
        feedback: parsed?.feedback || "Solid effort",
      },
    };
  } catch (error) {
    console.log("Evaluation failed, using fallback");
    return getFallbackEvaluation(answer);
  }
};

const getFallbackEvaluation = (answer) => {
  const wordCount = answer.split(/\s+/).length;
  const baseScore = wordCount > 40 ? 72 : 55;

  return {
    content: {
      score: baseScore,
      feedback: wordCount > 40 ? "Good content" : "Add more details",
    },
    delivery: { score: baseScore - 5, feedback: "Work on clarity" },
    overall: { score: baseScore - 2, feedback: "Keep practicing!" },
  };
};

// ============================================
// ROUTES
// ============================================

router.post("/generate-question", authMiddleware, async (req, res) => {
  const { moduleType, category = "common" } = req.body;

  try {
    const question = await generateQuestion(moduleType, category);
    res.json({ success: true, source: "ai", question });
  } catch (error) {
    const fallback = getFallbackQuestion(moduleType, category);
    res.json({ success: true, source: "fallback", question: fallback });
  }
});

router.post("/session/start", authMiddleware, async (req, res) => {
  const { moduleType, subModule, question } = req.body;

  const session = new CommunicationSession({
    userId: req.userId,
    moduleType,
    subModule,
    question,
    completedAt: null,
  });

  await session.save();

  res.json({ success: true, sessionId: session._id });
});

router.post("/evaluate", authMiddleware, async (req, res) => {
  const { sessionId, transcript, duration, question, moduleType } = req.body;

  let evaluation;
  let source = "fallback";

  try {
    evaluation = await evaluateCommunicationAnswer(
      moduleType,
      question,
      transcript,
    );
    source = "ai";
  } catch (error) {
    evaluation = getFallbackEvaluation(transcript);
  }

  // Save session
  if (sessionId) {
    const session = await CommunicationSession.findOne({
      _id: sessionId,
      userId: req.userId,
    });
    if (session) {
      session.transcript = transcript;
      session.evaluation = evaluation;
      session.duration = duration;
      session.evaluationSource = source;
      session.completedAt = new Date();
      await session.save();
    }
  }

  // Update user stats
  try {
    const user = await User.findById(req.userId);
    if (user) {
      if (!user.communicationStats) {
        user.communicationStats = {
          totalSessions: 0,
          averageScore: 0,
          bestScore: 0,
        };
      }

      const overallScore = evaluation.overall?.score || 0;
      user.communicationStats.totalSessions += 1;

      const currentTotal =
        user.communicationStats.averageScore *
        (user.communicationStats.totalSessions - 1);
      user.communicationStats.averageScore = Math.round(
        (currentTotal + overallScore) / user.communicationStats.totalSessions,
      );

      if (overallScore > (user.communicationStats.bestScore || 0)) {
        user.communicationStats.bestScore = overallScore;
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
    sessionId,
  });
});

router.get("/sessions/history", authMiddleware, async (req, res) => {
  const sessions = await CommunicationSession.find({
    userId: req.userId,
    completedAt: { $ne: null },
  })
    .sort({ completedAt: -1 })
    .limit(20);

  res.json({ sessions });
});

module.exports = router;
