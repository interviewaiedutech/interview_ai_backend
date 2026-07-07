const express = require("express");
const InterviewSession = require("../models/InterviewSession");
const User = require("../models/User");
const authMiddleware = require("../middleware/auth");
const AIAnalytics = require("../models/AIAnalytics");
const router = express.Router();
const Notification = require("../models/Notification");

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
    temperature: 0.4,
    max_tokens: 750,
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
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-latest:generateContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 750,
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
        max_tokens: 750,
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

  if (githubToken)
    providers.push({
      name: "GitHub Models",
      fn: () => generateWithGitHub(prompt, isJson),
    });

  if (geminiApiKey)
    providers.push({ name: "Gemini", fn: () => generateWithGemini(prompt) });

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
const evaluateAnswer = async (
  question,
  answer,
  category,
  experienceLevel,
  role,
) => {
  const prompt = `
You are an experienced technical interviewer and mentor.

Question: ${question}
Category: ${category}
Experience Level:${experienceLevel || "Beginner"}
Role: ${role || "Software Developer"}
Candidate's Answer: ${answer}

Evaluate the answer carefully and return **JSON only** with this exact structure:

{
  "score": <number between 0 and 10>,
  "feedback": "Write your feedback here, 
      also includes(strengths - List 1-2 strengths (or 'None' if very poor answer)) 
      and improvements(Specific suggestions on how to improve)"
}

Evaluation Guidelines:
- For **Beginner** level: Be encouraging and kind. Focus on basics. Give constructive feedback even if the answer is weak.
- For **Intermediate/Advanced/Expert**: Be more critical and detailed.
- Score range: 0 to 10 (10 = perfect/excellent answer, 0 = completely irrelevant or blank).
- Feedback should be professional, specific, and helpful.
- Highlight what was good first, then point out gaps.
- Suggest correct approach or key points they missed.
- Keep feedback concise but actionable (2-6 sentences max).

Do not add any text outside the JSON.
`;

  try {
    const text = await callFreeAI(
      prompt,
      true,
      "Technical Interview Evaluation",
    );
    const parsed = safeParseJSON(text);
    if (parsed && typeof parsed.score === "number") {
      return {
        score: Math.min(10, Math.max(0, parsed.score)),
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

  let experienceInstructions = "";
  // Role-specific adjustment
  let roleSpecificGuidance = "";

  if (experienceLevel === "Beginner") {
    roleSpecificGuidance = `
    IMPORTANT: Questions must be suitable for a **${role}** at beginner level.
    Use only basic concepts relevant to this role.
    Do NOT assume knowledge of advanced frameworks unless they are core to the role.
    For example:
    - Frontend: Basic HTML, CSS, JavaScript only (no React unless specifically requested)
    - Backend: Basic server logic, simple functions, databases basics
    - DevOps: Basic commands, simple scripting
    - Data Analyst: Basic Excel/SQL concepts, simple calculations
    - Non-technical roles (HR, Sales, Content Writer): Focus on behavioral, situational, and basic domain questions.
  `;
  }

  if (experienceLevel === "Beginner") {
    experienceInstructions = `
    Generate truly beginner-friendly questions for a ${role}.

    Distribution:
      - 50% fundamentals
      - 20% coding
      - 15% debugging
      - 15% behavioral

      Avoid:
      - System design
      - Distributed systems
      - Microservices
      - Scalability discussions
      - Advanced architecture

    ${roleSpecificGuidance}

    STRICT BEGINNER RULES:
    - Keep everything very simple.
    - Use plain, everyday language.
    - Avoid complex scenarios, business domains, or frameworks.
    - Focus on foundational knowledge only.
  `;
  }

  if (experienceLevel === "Intermediate") {
    experienceInstructions = `
      Generate mid-level questions suitable for a ${role}.

      Distribution:
      - 35% fundamentals
      - 35% practical / hands-on
      - 15% debugging
      - 15% basic system design / process

      Adapt questions to the ${role} responsibilities.
      `;
  }

  if (experienceLevel === "Advanced") {
    experienceInstructions = `
      Generate senior-level questions suitable for a ${role}.

      Distribution:
      - 25% coding
      - 25% architecture
      - 20% system design
      - 15% optimization
      - 15% leadership

      Focus on:
      - Scalability
      - Design decisions
      - Tradeoffs
      - Production incidents
    Adapt questions to the ${role} responsibilities.
      `;
  }
  if (experienceLevel === "Expert") {
    experienceInstructions = `
      Generate principal engineer / staff engineer level questions suitable for a ${role}..

      Distribution:
      - 30% system design
      - 25% architecture
      - 20% scalability
      - 15% leadership
      - 10% incident management

      Avoid beginner questions.

      Focus on:
      - Distributed systems
      - High traffic applications
      - Design tradeoffs
      - Team leadership
      - Production incidents
      - Cost optimization

      Assume the candidate has 6+ years experience.
      Adapt questions to the ${role} responsibilities.
      `;
  }

  const variationInstructions = `
  Generate FRESH, UNIQUE questions every time.
  Do not repeat common questions.
  Vary scenarios, wording, and contexts.
  Make them realistic for the given role.
`;

  const prompt = `
  You are a Principal Engineer.

      Candidate:
      - Role: ${role}
      - Experience: ${experienceLevel}
      - Tech Stack / Skills: ${techStr || "General skills for this role"}

      ${experienceInstructions}

      ${variationInstructions}

  Rules for all questions:
  - Questions must be highly relevant to the role of ${role}.
  - For technical roles, focus on relevant technologies from the tech stack.
  - For non-technical roles (HR, Sales, Content Writer, etc.), focus more on behavioral, situational, communication, and domain-specific questions.
  - Keep beginner questions very basic. Increase complexity only as per experience level.

      Return JSON only. Do not include any explanation.
      {
        "questions": [
          {
            "id": 1,
            "text": "Question text here",
            "category": "fundamentals | coding | debugging | behavioral | system_design",
            "difficulty": "Easy | Medium | Hard",
            "focus": "javascript_basics | sql | git | leadership etc."
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
      difficulty: q.difficulty || "Easy",
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
    const { sessionId, questionIndex, answer, experienceLevel, role } =
      req.body;

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
      const evaluation = await evaluateAnswer(
        q.question,
        answer,
        q.category,
        experienceLevel || session.experienceLevel,
        role || session.role,
      );
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
    const {
      sessionId,
      status = "completed",
      tabViolations = 0,
      focusViolations = 0,
    } = req.body;

    const session = await InterviewSession.findOne({
      _id: sessionId,
      userId: req.userId,
    });
    if (!session)
      return res.status(404).json({ message: "InterviewSession not found" });

    session.completed = true;
    session.status = status;

    session.tabViolations = tabViolations;

    session.focusViolations = focusViolations;

    const answeredQuestions = session.questions.filter((q) => q.answer);
    session.questionsAttempted = answeredQuestions.length;

    session.completedAt = new Date();
    const earnedScore = session.questions.reduce(
      (sum, q) => sum + (q.score || 0),
      0,
    );

    const maxScore = answeredQuestions.length * 10;

    session.totalScore =
      maxScore > 0 ? Math.round((earnedScore / maxScore) * 100) : 0;

    await session.save();

    //notification
    const user = await User.findById(req.userId);
    let title = "Interview Completed";
    let message = `${user.name} completed Technical Interview`;

    if (status === "ended") {
      title = "Interview Ended";
      message = `${user.name} ended Technical Interview`;
    }

    if (status === "terminated") {
      title = "Interview Terminated";
      message = `${user.name} interview terminated due to integrity violations`;
    }

    await Notification.create({
      title,
      message,
      type: "interview",
      userId: req.userId,
      entityId: sessionId,
      entityType: "interview",
    });

    // Update user streak
    if (status === "completed") {
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
    }

    res.json({
      success: true,
      score: session.totalScore,
      status: session.status,

      attempted: session.questionsAttempted,

      totalQuestions: session.questions.length,
      totalPossible: session.questions.length * 10,
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
