// Import required packages
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const session = require("express-session");

// Load environment variables from .env file
dotenv.config();

// Initialize express app
const app = express();

// Middleware setup
app.use(cors()); // Enable Cross-Origin Resource Sharing
app.use(express.json()); // Parse JSON request bodies

// Import route modules
const authRoutes = require("./routes/authRoutes");
const interviewRoutes = require("./routes/interviewRoutes");
const progressRoutes = require("./routes/progressRoutes");
const aptitudeRoutes = require("./routes/aptitudeRoutes");
const emailRoutes = require("./routes/emailRoutes");
const communicationRoutes = require("./routes/communicationRoutes");
//19-05-2026
// const ieltsReadingRoutes = require("./routes/ieltsReadingRoutes");
// const IELTSSession = require("./models/IELTSSession");

//22-05-2026
const jdPrepRoutes = require("./routes/jdPrepRoutes");

const passport = require("./config/passport");

// Database connection to MongoDB
mongoose
  .connect(process.env.MONGODB_URI || "mongodb://localhost:27017/interviewai")
  .then(() => console.log("✅ MongoDB connected successfully"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// API route handlers

app.use(
  session({
    secret: process.env.SESSION_SECRET,

    resave: false,

    saveUninitialized: false,
  }),
);

app.use(passport.initialize());

app.use(passport.session());

app.use("/api/auth", authRoutes); // Authentication routes (register, login)
app.use("/api/interview", interviewRoutes); // Interview generation & sessions
app.use("/api/progress", progressRoutes); // Progress tracking routes
//14-05-2026
app.use("/api/aptitude", aptitudeRoutes); //aptitude route
app.use("/api/email", emailRoutes);
//15-05-2026
app.use("/api/communication", communicationRoutes);
//19-05-2026
// app.use("/api/ielts/reading", ieltsReadingRoutes);

//22-05-2026
app.use("/api/jd", jdPrepRoutes);
// Welcome route for testing API
app.get("/", (req, res) => {
  res.json({ message: "Welcome to InterviewAI API" });
});

// Add this near the top of the file, after the other requires
console.log(
  "✅ Ollama will connect to:",
  process.env.OLLAMA_HOST || "http://localhost:11434",
);

// Start the server on specified port
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
