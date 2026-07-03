const express = require("express");
const axios = require("axios");
const authMiddleware = require("../middleware/auth");
const CommunicationSession = require("../models/CommunicationSession");
const User = require("../models/User");

const router = express.Router();

const AIAnalytics = require("../models/AIAnalytics");
const Notification = require("../models/Notification");

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
            max_tokens: 600,
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
              maxOutputTokens: 600,
            },
          },
        );
        return response.data.candidates[0].content.parts[0].text;
      },
    });
  }

  for (const provider of providers) {
    try {
      console.log(`Trying ${provider.name} for Communication...`);
      const start = Date.now();
      const result = await provider.fn();
      // console.log("ai comm", result);
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
      console.log(err.response?.data);
      console.log(JSON.stringify(err.response?.data, null, 2));

      console.log(err.message);
    }
  }

  throw new Error("All AI providers failed");
};

const safeParseJSON = (text) => {
  try {
    text = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const match = text.match(/\{[\s\S]*\}/);

    // console.log("JSON TO PARSE");

    // console.log(text, match);
    if (!match) {
      return null;
    }

    return JSON.parse(match[0]);
  } catch (err) {
    console.log("parse json error", err.message);
    // console.log(text);

    return null;
  }
};

// ============================================
// QUESTION GENERATION
// ============================================
const generateQuestion = async (
  moduleType,
  subCategory = "common",
  profile = {},
) => {
  const {
    role = "Software Developer",
    experienceLevel = "Beginner",
    technologyStack = [],
  } = profile;
  // Format tech stack nicely for the prompt
  const techString =
    technologyStack.length > 0
      ? technologyStack.join(", ")
      : "relevant technologies in your field";

  let prompt = "";

  switch (moduleType) {
    case "hr":
      prompt = `You are an experienced HR interviewer conducting a real technical + behavioral interview for a ${experienceLevel} ${role} position.

Generate **1 realistic, professional HR interview question** suitable for the candidate's profile.
- Role: ${role}
- Experience Level: ${experienceLevel}
- Technology Stack: ${techString}
- Category: ${subCategory || "common"}

Make the question feel like a real interview question (not generic). Focus on experience, challenges, projects, teamwork, or role-specific situations.
Generate a **different scenario** every time.

Return ONLY valid JSON in this exact format:
{
  "question": "Your full question here"
}`;
      break;

    case "star":
      prompt = `You are an experienced HR/behavioral interviewer for a ${experienceLevel} ${role} role.

          Generate **1 strong STAR method behavioral question** (Situation, Task, Action, Result) tailored to the candidate.

          Profile:
          - Role: ${role}
          - Level: ${experienceLevel}
          - Tech: ${techString}

          Make it realistic and relevant to software development / workplace challenges. Vary the scenario each time (leadership, conflict, failure, success, collaboration, tight deadlines, etc.).

          Return ONLY valid JSON:
          {
            "question": "Your full STAR question here"
          }`;
      break;

    case "presentation":
      prompt = `Generate **1 realistic presentation practice topic** for a ${experienceLevel} ${role} with experience in ${techString}.

          The topic should be something a candidate might actually present in a real interview or team setting (architecture, project deep-dive, technology evaluation, process improvement, etc.).
          Make it specific and different every time.

          Return ONLY valid JSON:
          {
            "question": "Presentation topic here"
          }`;
      break;

    case "professional":
      prompt = `Generate **1 realistic workplace communication scenario** for a ${experienceLevel} ${role} working with ${techString}.

          The scenario should involve emails, meetings, stakeholder communication, giving/receiving feedback, handling disagreements, or cross-team collaboration.
          Make it feel like a real professional situation. Generate a different scenario each time.

          Return ONLY valid JSON:
          {
            "question": "Full scenario description here"
          }`;
      break;

    default:
      prompt = `Generate 1 realistic HR interview question for a ${experienceLevel} ${role} role with tech stack: ${techString}.
          Generate a different scenario each time.
          Return ONLY valid JSON:
          {
            "question": "question here"
          }`;
  }

  try {
    const text = await callFreeAI(prompt, "Communication", true);
    console.log("comm question ai Raw Response: ", text);
    const parsed = safeParseJSON(text);
    // console.log("comm PARSED");

    // console.log(parsed);

    if (parsed && parsed.question) {
      // console.log("QUESTION OK");
      return parsed;
    }
    console.log("QUESTION FAILED");
    throw new Error("Invalid response");
  } catch (error) {
    console.log("AI failed, using fallback", error);
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
        question:
          "Walk me through your professional journey and what motivated you to apply for this role.",
        tips: [
          "Focus on relevant experience and achievements",
          "Keep your response to 60-90 seconds",
          "Connect your background to the role you're applying for",
        ],
        expectedKeywords: ["experience", "achievements", "motivation", "role"],
      },
      behavioral: {
        question:
          "Tell me about a time when you had to work on a complex project with tight deadlines. How did you manage it?",
        tips: [
          "Use the STAR method (Situation, Task, Action, Result)",
          "Highlight prioritization and time management",
          "Mention any tools or techniques you used",
        ],
        expectedKeywords: ["deadline", "prioritization", "delivery", "result"],
      },
      situational: {
        question:
          "You are working on a critical feature and discover a major technical debt issue that could delay the release. How would you handle this situation?",
        tips: [
          "Show clear communication with stakeholders",
          "Balance quality vs. deadlines",
          "Demonstrate problem-solving and ownership",
        ],
        expectedKeywords: [
          "prioritize",
          "communicate",
          "trade-off",
          "stakeholder",
        ],
      },
      career: {
        question:
          "Where do you see your career in the next 3-5 years, and how does this role align with your long-term goals?",
        tips: [
          "Show ambition and growth mindset",
          "Align your goals with the company’s direction",
          "Be realistic and specific",
        ],
        expectedKeywords: ["growth", "learning", "contribution", "long-term"],
      },
    },
    star: {
      question:
        "Describe a challenging situation where you had to collaborate with a difficult team member to deliver a project successfully. What was the outcome?",
      tips: [
        "S - Clearly describe the Situation",
        "T - Explain your specific Task/Responsibility",
        "A - Detail the Actions you took",
        "R - Share measurable Results and learnings",
      ],
      expectedKeywords: [
        "situation",
        "task",
        "action",
        "result",
        "collaboration",
      ],
    },
    presentation: {
      question:
        "Prepare a 5-minute presentation on a technical project you are most proud of. Explain the problem, your approach, technical decisions, and the final impact.",
      tips: [
        "Structure your presentation clearly (Problem → Solution → Results)",
        "Highlight technical decisions and trade-offs",
        "Practice good pacing and engagement",
      ],
      expectedKeywords: [
        "problem",
        "solution",
        "decision",
        "impact",
        "results",
      ],
    },
    professional: {
      question:
        "A senior stakeholder requests a last-minute major change in scope just before the release deadline. How would you handle this communication and situation?",
      tips: [
        "Acknowledge their request professionally",
        "Clearly explain impact on timeline and resources",
        "Propose alternatives or phased delivery",
        "Maintain positive stakeholder relationship",
      ],
      expectedKeywords: [
        "stakeholder",
        "scope",
        "impact",
        "negotiation",
        "alternative",
      ],
    },
  };

  if (moduleType === "hr") {
    return fallbacks.hr[subCategory] || fallbacks.hr.common;
  }

  return fallbacks[moduleType] || fallbacks.hr.common;
  // return (
  //   fallbacks[moduleType] ||
  //   fallbacks.hr?.common || {
  //     question: "Tell me about yourself.",
  //     tips: ["Keep it professional", "Highlight relevant experience"],
  //     expectedKeywords: ["experience", "skills"],
  //   }
  // );
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
    const text = await callFreeAI(prompt, "Communication", true);
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

  const user = await User.findById(req.userId).select(
    "role experienceLevel technologyStack",
  );
  try {
    const question = await generateQuestion(moduleType, category, {
      role: user?.role || "Software Developer",

      experienceLevel: user?.experienceLevel || "Beginner",

      technologyStack: user?.technologyStack || [],
    });
    res.json({ success: true, source: "ai", question });
  } catch (error) {
    console.log("comm ai generated error", error);
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

  // notification
  const user = await User.findById(req.userId);

  await Notification.create({
    title: "Communication Practice Completed",
    message: `${user?.name || "User"} completed ${moduleType}`,
    type: "communication",
    userId: req.userId,
    entityId: sessionId,
    entityType: "communication",
  });

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
