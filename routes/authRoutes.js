const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const passport = require("passport");
const router = express.Router();

// REGISTER - Create new user account (Simplified version)
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Please provide name, email and password",
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        message: "User already exists with this email",
      });
    }

    // Create new user with default values for role, experienceLevel, technologyStack
    const user = new User({
      name,
      email,
      password,
      role: "Frontend Developer", // Default role
      experienceLevel: "Beginner", // Default experience level
      technologyStack: [], // Empty array by default
    });

    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || "secretkey",
      { expiresIn: "7d" },
    );

    // Return user info and token (exclude password)
    res.status(201).json({
      message: "Registration successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        experienceLevel: user.experienceLevel,
        technologyStack: user.technologyStack,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({
      message: "Server error during registration",
    });
  }
});

// LOGIN - Authenticate existing user
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        message: "Please provide email and password",
      });
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || "secretkey",
      { expiresIn: "7d" },
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        experienceLevel: user.experienceLevel,
        technologyStack: user.technologyStack,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      message: "Server error during login",
    });
  }
});

// GOOGLE LOGIN
router.get(
  "/google",

  passport.authenticate("google", {
    scope: ["profile", "email"],
  }),
);

// GOOGLE CALLBACK
router.get(
  "/google/callback",

  passport.authenticate("google", {
    session: false,

    failureRedirect: `${process.env.FRONTEND_URL}/login`,
  }),

  async (req, res) => {
    const token = jwt.sign(
      { userId: req.user._id },

      process.env.JWT_SECRET || "secretkey",

      { expiresIn: "7d" },
    );

    res.redirect(`${process.env.FRONTEND_URL}/oauth-success?token=${token}`);
  },
);

// GITHUB LOGIN
router.get(
  "/github",

  passport.authenticate("github", {
    scope: ["user:email"],
  }),
);

// GITHUB CALLBACK
router.get(
  "/github/callback",

  passport.authenticate("github", {
    session: false,

    failureRedirect: `${process.env.FRONTEND_URL}/login`,
  }),

  async (req, res) => {
    const token = jwt.sign(
      { userId: req.user._id },

      process.env.JWT_SECRET || "secretkey",

      { expiresIn: "7d" },
    );

    res.redirect(`${process.env.FRONTEND_URL}/oauth-success?token=${token}`);
  },
);

// GET current user profile (protected route)
router.get("/me", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secretkey");
    const user = await User.findById(decoded.userId).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // res.json(user);
    // Return user with streak info 13-05-2026
    res.json({
      ...user.toObject(),
      streak: user.streak || {
        currentStreak: 0,
        longestStreak: 0,
        lastActiveDate: null,
      },
    });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(401).json({ message: "Invalid token" });
  }
});

// UPDATE user profile (add this new route)
router.put("/update", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secretkey");
    const { role, experienceLevel, technologyStack } = req.body;

    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Update only provided fields
    if (role) user.role = role;
    if (experienceLevel) user.experienceLevel = experienceLevel;
    if (technologyStack) user.technologyStack = technologyStack;

    await user.save();

    res.json({
      message: "Profile updated successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        experienceLevel: user.experienceLevel,
        technologyStack: user.technologyStack,
      },
    });
  } catch (error) {
    console.error("Update user error:", error);
    res.status(500).json({ message: "Server error during update" });
  }
});

module.exports = router;
