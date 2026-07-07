const express = require("express");
const axios = require("axios");
const authMiddleware = require("../middleware/auth");
const JDPrepSession = require("../models/JDPrepSession");
const User = require("../models/User");
const AIAnalytics = require("../models/AIAnalytics");

const router = express.Router();
const Notification = require("../models/Notification");

// ============================================
// AI CLIENT SETUP
// ============================================
let groqClient = null;
let geminiApiKey = null;
let githubToken = null;

// Initialize Groq
if (process.env.GROQ_API_KEY) {
  try {
    const Groq = require("groq-sdk");
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
    console.log("✅ Groq initialized for JD Prep Module");
  } catch (e) {
    console.log("⚠️ groq-sdk not installed");
  }
}

// Initialize Gemini
if (process.env.GEMINI_API_KEY) {
  geminiApiKey = process.env.GEMINI_API_KEY;
  console.log("✅ Gemini initialized for JD Prep Module");
}

// Initialize GitHub Models
if (process.env.GITHUB_TOKEN) {
  githubToken = process.env.GITHUB_TOKEN;
  console.log("✅ GitHub Models initialized for JD Prep Module");
}

// Unified Free AI Call
const callFreeAI = async (prompt, moduleName = "JD Prep", isJson = true) => {
  const providers = [];

  if (groqClient) {
    providers.push({
      name: "Groq",
      fn: async () => {
        const response = await groqClient.chat.completions.create({
          model: "llama-3.1-8b-instant",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
          max_tokens: 800,
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
            temperature: 0.3,
            max_tokens: 800,
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
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-latest:generateContent?key=${geminiApiKey}`,
          {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 800,
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
      console.log(`Trying ${provider.name} for JD Prep...`);
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
// FALLBACK QUESTIONS
// ============================================

const fallbackQuestions = [
  {
    question: "Tell me about yourself.",
    category: "general",
    difficulty: "Easy",
    importance: "Checks communication and introduction skills",
  },

  {
    question: "Explain a challenging project you worked on.",
    category: "experience",
    difficulty: "Medium",
    importance: "Evaluates problem-solving ability",
  },

  {
    question: "How do you handle tight deadlines?",
    category: "situational",
    difficulty: "Medium",
    importance: "Measures time management skills",
  },

  {
    question: "What are your strengths and weaknesses?",
    category: "behavioral",
    difficulty: "Easy",
    importance: "Evaluates self-awareness",
  },

  {
    question: "Describe your experience with team collaboration.",
    category: "behavioral",
    difficulty: "Medium",
    importance: "Checks teamwork ability",
  },

  {
    question: "How do you debug technical issues?",
    category: "technical",
    difficulty: "Medium",
    importance: "Evaluates troubleshooting approach",
  },

  {
    question: "Why do you want this role?",
    category: "general",
    difficulty: "Easy",
    importance: "Checks role motivation",
  },

  {
    question: "Explain a situation where you solved a difficult problem.",
    category: "experience",
    difficulty: "Medium",
    importance: "Measures analytical thinking",
  },
];
// ============================================
// 1. PROCESS JD
// ============================================
router.post("/process", authMiddleware, async (req, res) => {
  const { jobDescription } = req.body;

  if (!jobDescription || jobDescription.trim().length < 50) {
    return res
      .status(400)
      .json({ success: false, message: "Job Description is too short" });
  }

  try {
    const session = new JDPrepSession({
      userId: req.userId,
      jobDescription: jobDescription.trim(),
      currentStep: "skills",
    });
    await session.save();

    // IMPROVED PROMPT - Strictly control category values
    //     const prompt = `You are an expert technical recruiter.

    // Job Description:
    // ${jobDescription}

    // Return ONLY valid JSON in this exact format. Do not use any other category names.

    // {
    //   "skills": ["React.js", "Leadership", "Problem Solving", "Communication", ...],
    //   "questions": [
    //     {
    //       "question": "Question text here",
    //       "category": "technical",
    //       "difficulty": "Medium",
    //       "importance": "Brief reason why this question is asked"
    //     }
    //   ]
    // }

    // Rules:
    // - Use ONLY these categories: technical, behavioral, experience, situational, role-specific, general
    // - Do not use "soft" or "soft-skills" as category.
    // - Generate 8 to 12 high-quality questions differently.
    // - Extract both technical and soft skills in the skills array.`;
    const prompt = `
    You are a senior technical recruiter, hiring manager, and interview coach with 15+ years of experience.

    JOB DESCRIPTION:
    ${jobDescription}

    TASK:

    Analyze the Job Description carefully and generate interview questions that are DIRECTLY related to the skills, technologies, responsibilities, tools, frameworks, domain knowledge, and experience requirements mentioned in the JD.
    DO NOT generate generic interview questions.
    Every question must be traceable to something explicitly mentioned or strongly implied in the Job Description.
    Return ONLY valid JSON in the following format:

    {
      "skills": [
        "React",
        "Node.js",
        "MongoDB"
      ],

      "seniorityLevel": "Mid-Level",

      "highWeightageTopics": [
        "React Performance",
        "REST APIs",
        "System Design"
      ],

      "questions": [
        {
          "question": "Explain how React reconciliation works and how it impacts performance.",
          "category": "technical",
          "difficulty": "Medium",
          "importance": "React is a core requirement in the JD."
        }
      ]
    }

    STRICT RULES:

    1. Extract ALL important technical and soft skills from the JD.
    2. Determine the seniority level:
      - Fresher
      - Junior
      - Mid-Level
      - Senior
      - Lead
      - Staff
    3. Generate 8-10 interview questions.
    4. Use ONLY these categories:
      - technical
      - behavioral
      - experience
      - situational
      - role-specific
      - general
    5. Difficulty must be ONLY:
      - Easy
      - Medium
      - Hard
    6. Question distribution:
      - 60% Technical Questions
      - 20% Experience-Based Questions
      - 10% Behavioral Questions
      - 10% Situational Questions
    7. If a technology appears in the JD, generate questions specifically about that technology.
      Examples:
      - React → React hooks, lifecycle, optimization, state management.
      - Spring Boot → REST APIs, security, JPA, microservices.
      - Node.js → Event Loop, streams, async handling.
      - MongoDB → Indexing, aggregation, schema design.
      - AWS → EC2, S3, IAM, deployment.
      - SQL → Joins, indexing, optimization.
    8. Generate scenario-based questions from the responsibilities section of the JD.
    9. Generate experience-based questions from the required years of experience.
    10. Avoid generic questions such as:
        - Tell me about yourself.
        - Why should we hire you?
        - What are your strengths?
    11. Include real-world problem solving questions whenever possible.
    12. Include debugging and optimization questions if the JD mentions development work.
    13. Include architecture and design questions if the JD mentions senior-level responsibilities.
    14. Populate highWeightageTopics with the most important skills the interviewer is likely to focus on.
    15. Return ONLY valid JSON.
  `;
    // const aiResponse = await callFreeAI(prompt, true);
    // const parsed = safeParseJSON(aiResponse);

    // if (!parsed) throw new Error("Failed to parse AI response");

    let parsed = null;

    try {
      const aiResponse = await callFreeAI(prompt, true);

      parsed = safeParseJSON(aiResponse);
    } catch (err) {
      console.error("AI question generation failed at jdprep:", err.message);
    }

    // FALLBACK
    if (!parsed || !parsed.questions) {
      parsed = {
        skills: [
          "Communication",
          "Problem Solving",
          "Teamwork",
          "Technical Knowledge",
        ],

        questions: fallbackQuestions,
      };
    }

    // Update session
    session.extractedSkills = parsed.skills || [];
    session.finalSkills = parsed.skills || [];
    session.questions = parsed.questions || [];
    await session.save();

    res.json({
      success: true,
      sessionId: session._id,
      skills: parsed.skills,
      questions: parsed.questions,
    });
  } catch (error) {
    console.error("JD Process Error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to process job description" });
  }
});

// ============================================
// 2. EVALUATE ANSWERS + UPDATE USER STATS
// ============================================
router.post("/evaluate", authMiddleware, async (req, res) => {
  const { sessionId, answers = [] } = req.body;

  try {
    const session = await JDPrepSession.findOne({
      _id: sessionId,
      userId: req.userId,
    });
    if (!session)
      return res
        .status(404)
        .json({ success: false, message: "Session not found" });

    const allAnswersText = answers
      .map((a) => `Q: ${a.questionText}\nA: ${a.transcript}`)
      .join("\n\n");

    const prompt = `
      Evaluate candidate answers for this role.

      Skills Required:
      ${session.finalSkills.join(", ")}

      Questions and Answers:
      ${allAnswersText}
      Return ONLY valid JSON:
      {
        "overallScore": 78,
        "summaryFeedback": "Short summary",
        "strengths": [
          "Strength 1"
        ],
        "improvements": [
          "Improvement 1"
        ],
        "questionFeedback": [
          {
            "questionText": "Question here",
            "score": 80,
            "aiFeedback": "Good answer",
            "strengths": [
              "Clear explanation"
            ],
            "improvements": [
              "Add examples"
            ]
          }
        ]
      }
      `;
    // const aiText = await callFreeAI(prompt, true);
    // const parsed = safeParseJSON(aiText);
    let parsed = null;

    try {
      const aiText = await callFreeAI(prompt, true);

      parsed = safeParseJSON(aiText);
      console.log("jd evaluation", parsed);
    } catch (err) {
      console.error("AI evaluation failed:", err.message);
    }

    // FALLBACK EVALUATION
    if (!parsed) {
      parsed = {
        overallScore: 65,
        summaryFeedback: "Good attempt. Keep practicing.",
        strengths: ["Communication"],
        improvements: ["Add more examples"],
        questionFeedback: answers.map((a) => ({
          questionText: a.questionText,
          score: 60,
          aiFeedback: "Good answer. Add more technical depth.",
          strengths: ["Clear explanation"],
          improvements: ["Use examples"],
        })),
      };
    }
    // Update question-wise answers + feedback
    session.questions.forEach((q) => {
      const matchedAnswer = answers.find((a) => a.questionText === q.question);
      const matchedFeedback = parsed?.questionFeedback?.find(
        (f) => f.questionText === q.question,
      );

      // Save Answer
      q.answer = {
        transcript: matchedAnswer?.transcript || "",
        responseType: matchedAnswer?.responseType || "video",
        duration: matchedAnswer?.duration || 0,
        submittedAt: new Date(),
      };

      // Save Feedback
      q.feedback = {
        score: matchedFeedback?.score || 0,
        strengths: matchedFeedback?.strengths || [],
        improvements: matchedFeedback?.improvements || [],
        aiFeedback: matchedFeedback?.aiFeedback || "",
      };
    });
    // Overall Evaluation
    const evaluation = {
      overallScore: parsed?.overallScore || 65,
      jdAlignmentScore: parsed?.jdAlignmentScore || 70,
      strengths: parsed?.strengths || [],
      improvements: parsed?.improvements || [],
      summaryFeedback: parsed?.summaryFeedback || "Good attempt.",
      evaluatedAt: new Date(),
    };
    session.overallEvaluation = evaluation;
    session.currentStep = "evaluation";
    if (session.status !== "terminated" && session.status !== "ended") {
      session.status = "completed";
    }
    session.questionsAttempted = Math.max(
      session.questionsAttempted || 0,
      answers.length,
    );
    await session.save();

    //notification
    const user = await User.findById(req.userId);
    let title = "JD Prep Completed";

    let message = `${user?.name || "User"} completed JD Preparation`;

    if (session.status === "ended") {
      title = "JD Prep Ended";

      message = `${user?.name || "User"} ended JD Preparation`;
    }

    if (session.status === "terminated") {
      title = "JD Prep Terminated";

      message = `${user?.name || "User"} terminated JD preparation`;
    }
    await Notification.create({
      title,
      message,
      type: "jdprep",
      userId: req.userId,
      entityId: sessionId,
      entityType: "jdprep",
    });

    // === UPDATE USER STATS ===
    if (user) {
      if (!user.jdPrepStats) {
        user.jdPrepStats = {
          totalSessions: 0,
          completedSessions: 0,
          averageScore: 0,
          bestScore: 0,
          totalTimeSpent: 0,
          lastPracticeDate: new Date(),
        };
      }

      const score = evaluation.overallScore || 0;
      user.jdPrepStats.totalSessions += 1;
      if (session.status === "completed") {
        user.jdPrepStats.completedSessions += 1;
      }
      user.jdPrepStats.lastPracticeDate = new Date();
      user.jdPrepStats.totalTimeSpent += answers.reduce(
        (sum, a) => sum + (a.duration || 0),
        0,
      );

      // Update average score
      const oldTotal =
        user.jdPrepStats.averageScore * (user.jdPrepStats.totalSessions - 1);
      user.jdPrepStats.averageScore = Math.round(
        (oldTotal + score) / user.jdPrepStats.totalSessions,
      );

      if (score > (user.jdPrepStats.bestScore || 0)) {
        user.jdPrepStats.bestScore = score;
      }

      await user.save();
    }

    res.json({ success: true, evaluation });
  } catch (error) {
    console.error("JD Evaluation Error:", error);
    res.status(500).json({ success: false, message: "Evaluation failed" });
  }
});
router.post("/terminate", authMiddleware, async (req, res) => {
  try {
    const { sessionId, tabViolations, focusViolations, attemptedQuestions } =
      req.body;

    const session = await JDPrepSession.findOne({
      _id: sessionId,
      userId: req.userId,
    });

    if (!session) {
      return res.status(404).json({
        success: false,
      });
    }

    session.status = "terminated";
    session.currentStep = "evaluation";

    session.tabViolations = tabViolations;

    session.focusViolations = focusViolations;

    session.questionsAttempted = attemptedQuestions;

    session.completedAt = new Date();

    await session.save();

    res.json({
      success: true,
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      success: false,
    });
  }
});

router.post("/end", authMiddleware, async (req, res) => {
  try {
    const {
      sessionId,

      tabViolations,

      focusViolations,

      attemptedQuestions,
    } = req.body;

    const session = await JDPrepSession.findOne({
      _id: sessionId,

      userId: req.userId,
    });

    if (!session) {
      return res.status(404).json({
        success: false,
      });
    }

    session.status = "ended";

    session.currentStep = "evaluation";

    session.tabViolations = tabViolations;

    session.focusViolations = focusViolations;

    session.questionsAttempted = attemptedQuestions;

    session.completedAt = new Date();

    await session.save();

    res.json({
      success: true,
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      success: false,
    });
  }
});

// ============================================
// 3. RECOMMENDATIONS
// ============================================
router.post("/recommendations", authMiddleware, async (req, res) => {
  const { sessionId } = req.body;

  try {
    const session = await JDPrepSession.findOne({
      _id: sessionId,
      userId: req.userId,
    });
    if (!session)
      return res
        .status(404)
        .json({ success: false, message: "Session not found" });

    //     const prompt = `Based on this Job Description and candidate performance, suggest 4-6 learning recommendations.

    // Job Description: ${session.jobDescription.substring(0, 500)}...
    // Candidate Score: ${session.overallEvaluation?.overallScore || 70}

    // Return ONLY a valid JSON array.`;
    const prompt = `
        Based on this Job Description and candidate performance,
        suggest 4 learning recommendations.

        Skills:
        ${session.finalSkills.join(", ")}

        Candidate Score:
        ${session.overallEvaluation?.overallScore || 70}

        Return ONLY valid JSON:
        {
          "recommendations": [
            {
              "topic": "React Performance",
              "priority": "High",
              "reason": "Weak understanding detected",
              "suggestedResources": [
                {
                  "title": "React Docs",
                  "type": "Documentation",
                  "link": "https://react.dev"
                }
              ]
            }
          ]
        }
     `;

    // const aiText = await callFreeAI(prompt, true);
    let parsed = null;

    try {
      const aiText = await callFreeAI(prompt, true);
      console.log("Recommendations AI Response:", aiText);
      parsed = safeParseJSON(aiText);
    } catch (err) {
      console.error("Recommendation AI failed:", err.message);
    }

    // FALLBACK RECOMMENDATIONS
    if (!parsed) {
      parsed = {
        recommendations: [
          {
            topic: "Communication Skills",
            priority: "High",
            reason: "Improve interview communication.",
            suggestedResources: [
              {
                title: "Communication Basics",
                type: "Course",
                link: "https://www.coursera.org",
              },
            ],
          },

          {
            topic: "Problem Solving",
            priority: "Medium",
            reason: "Improve analytical thinking.",
            suggestedResources: [
              {
                title: "Problem Solving Guide",
                type: "Article",
                link: "https://www.freecodecamp.org",
              },
            ],
          },
        ],
      };
    }
    // console.log("Recommendations AI Response:", aiText);
    // let parsed = safeParseJSON(aiText);

    if (!Array.isArray(parsed)) {
      parsed = parsed?.recommendations || [];
    }

    const recommendations = Array.isArray(parsed) ? parsed : [];
    const validResourceTypes = [
      "Course",
      "Video",
      "Article",
      "Documentation",
      "Book",
      "Tutorial",
      "Website",
      "Practice",
    ];

    recommendations.forEach((recommendation) => {
      if (!recommendation.suggestedResources) return;

      recommendation.suggestedResources.forEach((resource) => {
        if (!validResourceTypes.includes(resource.type)) {
          console.log(
            `Invalid resource type: ${resource.type}. Converting to Article`,
          );

          resource.type = "Article";
        }
      });
    });
    session.learningRecommendations = recommendations;
    session.currentStep = "completed";
    if (session.status !== "terminated" && session.status !== "ended") {
      session.status = "completed";
    }
    session.completedAt = new Date();
    await session.save();

    res.json({ success: true, recommendations });
  } catch (error) {
    console.error("Recommendations Error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to generate recommendations" });
  }
});

// History Route
router.get("/history", authMiddleware, async (req, res) => {
  try {
    const sessions = await JDPrepSession.find({
      userId: req.userId,
      status: "completed",
    })
      .sort({ completedAt: -1 })
      .limit(15);

    res.json({ success: true, sessions });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch history" });
  }
});

module.exports = router;
