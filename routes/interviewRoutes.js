const express = require("express");
const InterviewSession = require("../models/InterviewSession");
const User = require("../models/User");
const authMiddleware = require("../middleware/auth");
const AIAnalytics = require("../models/AIAnalytics");
const router = express.Router();

// ============================================
// FREE AI SETUP — Groq (primary) + Gemini (fallback)
// ============================================
// Groq: free at console.groq.com — 14,400 req/day, extremely fast
// Gemini: free at aistudio.google.com — 1,500 req/day
// GitHub Models: free with github account at github.com/marketplace/models
// Hugging Face: free at huggingface.co/settings/tokens

let groqClient = null;
let geminiApiKey = null;
let githubToken = null;

// Initialize Groq
if (process.env.GROQ_API_KEY) {
  try {
    const Groq = require("groq-sdk");
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
    console.log("✅ Groq initialized (free tier — 14k req/day)");
  } catch (e) {
    console.log("⚠️ groq-sdk not installed. Run: npm install groq-sdk");
  }
}

// Initialize Gemini
if (process.env.GEMINI_API_KEY) {
  geminiApiKey = process.env.GEMINI_API_KEY;
  console.log("✅ Gemini initialized (free tier — 1500 req/day)");
}

// Initialize GitHub Models
if (process.env.GITHUB_TOKEN) {
  githubToken = process.env.GITHUB_TOKEN;
  console.log("✅ GitHub Models initialized (free with GitHub account)");
}

if (!groqClient && !geminiApiKey && !githubToken) {
  console.log("⚠️ No free AI keys found. Using fallback questions.");
  console.log("   Add to .env: GROQ_API_KEY, GEMINI_API_KEY, or GITHUB_TOKEN");
}

// ============================================
// GROQ — Primary Free AI (fastest)
// Get free key: https://console.groq.com
// Models: llama-3.1-8b-instant, llama-3.3-70b-versatile, mixtral-8x7b-32768
// ============================================
const generateWithGroq = async (prompt, isJson = true) => {
  if (!groqClient) throw new Error("Groq not configured");

  const response = await groqClient.chat.completions.create({
    model: "llama-3.1-8b-instant",
    messages: [
      {
        role: "system",
        content: isJson
          ? "You are an expert interview assistant. Always respond with valid JSON only. No markdown, no explanation, no backticks."
          : "You are an expert interview evaluator. Be concise and helpful.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.2,
    max_tokens: 600,
    ...(isJson && { response_format: { type: "json_object" } }),
  });

  return response.choices[0].message.content;
};

// ============================================
// GEMINI — Fallback Free AI
// Get free key: https://aistudio.google.com
// Free: 1,500 req/day, 1M tokens/min
// ============================================
const generateWithGemini = async (prompt) => {
  if (!geminiApiKey) throw new Error("Gemini not configured");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 600,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini error: ${err}`);
  }

  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
};

// ============================================
// GITHUB MODELS — Another Free Option
// Get free token: github.com/marketplace/models
// Models: gpt-4o-mini (free), Llama, Mistral, etc.
// ============================================
const generateWithGitHub = async (prompt, isJson = true) => {
  if (!githubToken) throw new Error("GitHub token not configured");

  const response = await fetch(
    "https://models.inference.ai.azure.com/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${githubToken}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: isJson
              ? "You are an expert interview assistant. Always respond with valid JSON only. No markdown, no explanation, no backticks."
              : "You are an expert interview evaluator.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 600,
      }),
    },
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`GitHub Models error: ${err}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
};

// ============================================
// UNIFIED AI CALL — tries each free provider
// ============================================
const callFreeAI = async (
  prompt,
  isJson = true,
  moduleName = "Technical Interview",
) => {
  const providers = [];

  if (groqClient)
    providers.push({
      name: "Groq",
      fn: () => generateWithGroq(prompt, isJson),
    });
  if (geminiApiKey)
    providers.push({ name: "Gemini", fn: () => generateWithGemini(prompt) });
  if (githubToken)
    providers.push({
      name: "GitHub Models",
      fn: () => generateWithGitHub(prompt, isJson),
    });

  for (const provider of providers) {
    try {
      console.log(`Trying ${provider.name} for interview...`);
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
    if (match) return JSON.parse(match[0]);
    return JSON.parse(text);
  } catch {
    return null;
  }
};

// ============================================
// EVALUATE ANSWER
// ============================================
const evaluateAnswer = async (question, answer, category) => {
  const prompt = `Evaluate this interview answer and return JSON only.

      Question: ${question}
      Category: ${category}
      Answer: ${answer}

      Return exactly this JSON:
      {"score": <number 10-20>, "feedback": "<one sentence under 20 words>"}`;

  try {
    const text = await callFreeAI(
      prompt,
      true,
      "Technical Interview Evaluation",
    );
    const parsed = safeParseJSON(text);
    if (parsed && typeof parsed.score === "number") {
      return {
        score: Math.min(20, Math.max(0, parsed.score)),
        feedback: parsed.feedback || "Good attempt",
      };
    }
  } catch (err) {
    console.log("Evaluation failed:", err.message);
  }

  // Fallback scoring based on answer length / quality heuristic
  const words = (answer || "").trim().split(/\s+/).length;
  const score = words < 10 ? 5 : words < 30 ? 10 : words < 80 ? 15 : 17;
  return { score, feedback: "Answer evaluated successfully." };
};

// ============================================
// GENERATE QUESTIONS
// ============================================
const generateQuestionsWithAI = async (
  role,
  experienceLevel,
  technologyStack,
) => {
  const techStr = technologyStack?.length
    ? technologyStack.join(", ")
    : "General";

  const randomSeed = Math.floor(Math.random() * 100000);

  const randomDifficulty = ["easy", "medium", "hard"][
    Math.floor(Math.random() * 3)
  ];

  const randomStyle = [
    "real world",
    "debugging",
    "optimization",
    "architecture",
    "behavioral",
    "practical implementation",
  ][Math.floor(Math.random() * 6)];

  // const prompt = `
  //     Generate 8-10 UNIQUE interview questions.

  //     Candidate:
  //     - Role: ${role}
  //     - Experience: ${experienceLevel}
  //     - Technologies: ${techStr}

  //     Requirements:
  //     - Difficulty: ${randomDifficulty}
  //     - Focus style: ${randomStyle}
  //     - Questions must differ every request.
  //     - Avoid generic repeated questions.
  //     - Include practical industry scenarios.
  //     - Use random seed ${randomSeed}

  //     Return ONLY valid JSON.

  //     {
  //       "questions": [
  //         {
  //           "text": "<question>",
  //           "category": "technical"
  //         },
  //         {
  //           "text": "<question>",
  //           "category": "technical"
  //         },
  //         {
  //           "text": "<question>",
  //           "category": "hr"
  //         },
  //         {
  //           "text": "<question>",
  //           "category": "coding"
  //         },
  //         {
  //           "text": "<question>",
  //           "category": "scenario"
  //         }
  //       ]
  //     }
  //   `;
  const prompt = `
You are a Principal Engineer and Technical Interviewer with 15+ years of experience hiring for top product companies and startups.

Generate 8-10 high-quality, unique interview questions.

Candidate Profile:
- Role: ${role}
- Experience Level: ${experienceLevel}
- Tech Stack: ${techStr}

Requirements:

- Use random seed ${randomSeed}
- Questions must be fresh and non-generic
- Include:
  Technical
  Coding
  System Design
  Debugging
  Architecture
  Scenario
  Behavioral
  Optimization

- Questions must reflect real-world industry problems
- Avoid repetitive interview questions

Return ONLY valid JSON.

{
  "questions": [
    {
      "id": 1,
      "text": "Question",
      "category": "system_design",
      "focus": "architecture"
    }
  ]
}
`;
  const text = await callFreeAI(prompt, true, "Technical Interview Generation");
  const parsed = safeParseJSON(text);

  if (
    parsed?.questions &&
    Array.isArray(parsed.questions) &&
    parsed.questions.length > 0
  ) {
    // return parsed.questions.slice(0, 5).map((q) => ({
    //   text: q.text || "Tell me about your experience.",
    //   category: q.category || "technical",
    // }));
    return parsed.questions.slice(0, 10).map((q) => ({
      id: q.id || 0,
      text: q.text || "Tell me about your experience.",
      category: q.category || "technical",
      difficulty: q.difficulty || "Medium",
      focus: q.focus || "general",
    }));
  }

  throw new Error("Invalid question format from AI");
};

// ============================================
// FALLBACK QUESTIONS — always works offline
// ============================================
const generateFallbackQuestions = (role, experienceLevel, technologyStack) => {
  const questionBank = {
    technical: {
      "Frontend Developer": [
        "Explain the difference between props and state in React.",
        "What is the Virtual DOM and how does it work?",
        "Explain closures in JavaScript with an example.",
        "What is CSS Flexbox and Grid? When would you use each?",
        "What are React hooks? Name 3 common hooks and their use cases.",
      ],
      "Backend Developer": [
        "Explain REST API design principles.",
        "What is JWT and how does authentication work?",
        "Explain database indexing and when to use it.",
        "What is the difference between SQL and NoSQL databases?",
        "Explain the event loop in Node.js.",
      ],
      "Full Stack Developer": [
        "Explain the MERN stack architecture.",
        "How do you handle CORS in a full-stack application?",
        "Explain how client-server communication works.",
        "What is GraphQL and how is it different from REST?",
        "How do you secure a full-stack application?",
      ],
      "UI/UX Designer": [
        "Explain the difference between UI and UX design.",
        "What is a design system and its benefits?",
        "Explain the principles of good typography.",
        "What is user research and why is it crucial?",
        "Explain the importance of accessibility in design.",
      ],
      "Data Analyst": [
        "Explain the difference between supervised and unsupervised learning.",
        "What is data cleaning and why is it important?",
        "What is SQL and what are its main commands?",
        "Explain what a primary key and foreign key are.",
        "What tools do you use for data analysis?",
      ],
    },
    hr: [
      "Tell me about a time you faced a challenge at work and how you overcame it.",
      "Where do you see yourself in 5 years?",
      "Why do you want to work for our company?",
      "What are your greatest strengths and weaknesses?",
      "How do you handle conflict with team members?",
    ],
    coding: [
      "Write a function to reverse a string.",
      "Write a function to check if a string is a palindrome.",
      "Write a function to find the factorial of a number.",
      "Write a function to remove duplicates from an array.",
      "Write a function to find the first non-repeating character in a string.",
    ],
    scenario: [
      "How would you debug a production issue that only occurs for specific users?",
      "How would you handle a tight deadline with incomplete requirements?",
      "How would you explain a technical concept to a non-technical stakeholder?",
      "How would you optimize a slow-performing web page?",
      "How would you handle a security vulnerability discovered in your code?",
    ],
  };

  const techQList =
    questionBank.technical[role] ||
    questionBank.technical["Full Stack Developer"];
  const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

  return [
    { text: shuffle(techQList)[0], category: "technical" },
    { text: shuffle(techQList)[1], category: "technical" },
    { text: shuffle(questionBank.hr)[0], category: "hr" },
    { text: shuffle(questionBank.coding)[0], category: "coding" },
    { text: shuffle(questionBank.scenario)[0], category: "scenario" },
  ];
};

// ============================================
// ROUTES
// ============================================

// Generate questions
router.post("/generate", authMiddleware, async (req, res) => {
  try {
    const { role, experienceLevel, technologyStack } = req.body;
    let questions = null;
    let source = "fallback";

    try {
      questions = await generateQuestionsWithAI(
        role,
        experienceLevel,
        technologyStack || [],
      );
      source = "ai";
      console.log("✅ Questions generated via free AI");
    } catch (aiErr) {
      console.log("AI generation failed, using fallback:", aiErr.message);
      questions = generateFallbackQuestions(
        role,
        experienceLevel,
        technologyStack || [],
      );
      source = "fallback";
    }

    res.json({ success: true, questions, source });
  } catch (error) {
    console.error("Generate endpoint error:", error);
    const questions = generateFallbackQuestions(
      req.body.role || "Frontend Developer",
      req.body.experienceLevel || "Beginner",
      req.body.technologyStack || [],
    );
    res.json({ success: true, questions, source: "emergency-fallback" });
  }
});

// Start session
router.post("/start-session", authMiddleware, async (req, res) => {
  try {
    const { role, experienceLevel, questions } = req.body;

    const session = new InterviewSession({
      userId: req.userId,
      questions: questions.map((q) => ({
        question: q.text,
        answer: "",
        category: q.category,
        difficulty: q.difficulty || "",
        focus: q.focus || "",
        questionId: q.id || 0,
        timestamp: new Date(),
      })),
      role,
      experienceLevel,
      startedAt: new Date(),
    });

    await session.save();
    res.json({
      success: true,
      sessionId: session._id,
      questions: session.questions,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error starting session" });
  }
});

// Submit answer
router.post("/submit-answer", authMiddleware, async (req, res) => {
  try {
    const { sessionId, questionIndex, answer } = req.body;

    const session = await InterviewSession.findOne({
      _id: sessionId,
      userId: req.userId,
    });
    if (!session)
      return res.status(404).json({ message: "InterviewSession not found" });

    if (session.questions[questionIndex]) {
      const q = session.questions[questionIndex];
      q.answer = answer;
      q.timestamp = new Date();
      console.log("tech interview answer: ", answer);
      const evaluation = await evaluateAnswer(q.question, answer, q.category);
      q.score = evaluation.score;
      q.feedback = evaluation.feedback;

      console.log(`Q${questionIndex} score: ${q.score} — ${q.feedback}`);
      await session.save();
    }

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error saving answer" });
  }
});

// Complete session
router.post("/complete-session", authMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.body;

    const session = await InterviewSession.findOne({
      _id: sessionId,
      userId: req.userId,
    });
    if (!session)
      return res.status(404).json({ message: "InterviewSession not found" });

    session.completed = true;
    session.completedAt = new Date();
    const earnedScore = session.questions.reduce(
      (sum, q) => sum + (q.score || 0),
      0,
    );

    const maxScore = session.questions.length * 20;

    session.totalScore = Math.round((earnedScore / maxScore) * 100);

    await session.save();

    // Update user streak
    const user = await User.findById(req.userId);
    if (user) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const lastActive = user.streak.lastActiveDate
        ? new Date(user.streak.lastActiveDate)
        : null;

      if (lastActive) {
        lastActive.setHours(0, 0, 0, 0);
        const diffDays = Math.floor(
          (today - lastActive) / (1000 * 60 * 60 * 24),
        );
        if (diffDays === 1) user.streak.currentStreak += 1;
        else if (diffDays > 1) user.streak.currentStreak = 1;
      } else {
        user.streak.currentStreak = 1;
      }

      if (user.streak.currentStreak > user.streak.longestStreak) {
        user.streak.longestStreak = user.streak.currentStreak;
      }

      user.streak.lastActiveDate = today;
      user.streak.streakHistory.push({ date: today, sessionsCompleted: 1 });
      await user.save();
    }

    res.json({
      success: true,
      score: session.totalScore,
      totalPossible: session.questions.length * 20,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error completing session" });
  }
});

// Get history
router.get("/history", authMiddleware, async (req, res) => {
  try {
    const sessions = await InterviewSession.find({
      userId: req.userId,
      completed: true,
    })
      .sort({ completedAt: -1 })
      .limit(20);
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ message: "Error fetching history" });
  }
});

// Get session details
router.get("/session/:sessionId", authMiddleware, async (req, res) => {
  try {
    const session = await InterviewSession.findOne({
      _id: req.params.sessionId,
      userId: req.userId,
    });
    if (!session)
      return res.status(404).json({ message: "InterviewSession not found" });
    res.json(session);
  } catch (error) {
    res.status(500).json({ message: "Error fetching session" });
  }
});

// Health check
router.get("/health", async (req, res) => {
  res.json({
    status: "ok",
    providers: {
      groq: !!groqClient,
      gemini: !!geminiApiKey,
      github_models: !!githubToken,
    },
    note: "Get free keys: Groq→console.groq.com | Gemini→aistudio.google.com | GitHub→github.com/marketplace/models",
  });
});

module.exports = router;
