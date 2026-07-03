const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const sendVerificationEmail = require("../utils/sendVerificationEmail");
const sendPasswordResetEmail = require("../utils/sendPasswordResetEmail");
const passport = require("passport");
const AuditLog = require("../models/AuditLog");
const bcrypt = require("bcryptjs");
const router = express.Router();

// REGISTER - Create new user account (Simplified version)
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Please provide all fields",
      });
    }

    const existingUser = await User.findOne({
      email,
    });

    if (existingUser) {
      // User exists but email not verified
      if (existingUser.provider === "local" && !existingUser.isVerified) {
        const verificationToken = jwt.sign(
          {
            userId: existingUser._id,
          },
          process.env.JWT_SECRET,
          {
            expiresIn: "1d",
          },
        );

        const verificationLink = `${process.env.CLIENT_URL}/verify-email/${verificationToken}`;

        try {
          await sendVerificationEmail(existingUser.email, verificationLink);
        } catch (error) {
          console.error("Failed to resend verification email:", error);
        }

        return res.status(200).json({
          success: true,
          verificationRequired: true,
          message:
            "Your account already exists but is not verified. A new verification email has been sent.",
        });
      }

      return res.status(400).json({
        success: false,
        message: "User already exists",
      });
    }

    const user = new User({
      name,
      email,
      password,
      role: "Frontend Developer",
      experienceLevel: "Beginner",
      technologyStack: [],
      provider: "local",
      isVerified: false,
    });

    await user.save();

    const verificationToken = jwt.sign(
      {
        userId: user._id,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "1d",
      },
    );

    const verificationLink = `${process.env.CLIENT_URL}/verify-email/${verificationToken}`;
    try {
      await sendVerificationEmail(user.email, verificationLink);
    } catch (error) {
      console.error("Verification email failed:", error);
    }

    res.status(201).json({
      success: true,
      message: "Registration successful. Please verify your email.",
    });
  } catch (error) {
    console.error("Registration error:", error);

    res.status(500).json({
      success: false,
      message: "Server error during registration",
    });
  }
});

router.get(
  "/verify-email/:token",

  async (req, res) => {
    try {
      const decoded = jwt.verify(req.params.token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      if (user.isVerified) {
        return res.json({
          success: true,
          message: "Email already verified",
        });
      }

      user.isVerified = true;
      await user.save();

      return res.json({
        success: true,
        message: "Email verified successfully",
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired token",
      });
    }
  },
);

router.post("/resend-verification", async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({
      email,
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: "Email already verified",
      });
    }

    const verificationToken = jwt.sign(
      {
        userId: user._id,
      },

      process.env.JWT_SECRET,
      {
        expiresIn: "1d",
      },
    );

    const verificationLink = `${process.env.CLIENT_URL}/verify-email/${verificationToken}`;

    await sendVerificationEmail(user.email, verificationLink);

    return res.json({
      success: true,
      message: "Verification email resent",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Failed to resend verification email",
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
    if (!user.isActive) {
      return res.status(401).json({
        message: "Account is inactive. Contact administrator.",
      });
    }
    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    if (!user.isVerified && user.provider === "local") {
      return res.status(401).json({
        success: false,

        message: "Please verify your email first",
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || "secretkey",
      { expiresIn: "7d" },
    );

    // if (user.accountType === "admin") {
    //   await AuditLog.create({
    //     adminId: user._id,
    //     adminName: user.name,
    //     action: "ADMIN_LOGIN",
    //     target: user.email,
    //     details: "Admin logged in",
    //   });
    // }

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
        accountType: user.accountType,
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

router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user || user.provider !== "local") {
      return res.json({
        success: true,
        message: "If an account exists, a reset link has been sent",
      });
    }

    const resetToken = jwt.sign(
      {
        userId: user._id,
        type: "password-reset",
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "15m",
      },
    );

    const resetLink = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;

    await sendPasswordResetEmail(user.email, resetLink);

    res.json({
      success: true,
      message: "Reset link sent",
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body;

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.type !== "password-reset") {
      return res.status(400).json({
        message: "Invalid token",
      });
    }

    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    user.password = password;

    await user.save();

    res.json({
      success: true,
      message: "Password reset successful",
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Invalid or expired reset link",
    });
  }
});

router.put("/change-password", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({
        message: "No token provided",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secretkey");

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        message: "All fields are required",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters",
      });
    }

    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Google/Github users
    if (user.provider !== "local") {
      return res.status(400).json({
        message: "Password change is not available for social login accounts",
      });
    }

    const isMatch = await user.comparePassword(currentPassword);

    if (!isMatch) {
      return res.status(400).json({
        message: "Current password is incorrect",
      });
    }

    user.password = newPassword;

    await user.save();

    res.json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    console.error("Change password error:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
});

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
        accountType: user.accountType,
      },
    });
  } catch (error) {
    console.error("Update user error:", error);
    res.status(500).json({ message: "Server error during update" });
  }
});

module.exports = router;
