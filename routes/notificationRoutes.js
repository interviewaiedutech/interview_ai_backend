const express = require("express");
const Notification = require("../models/Notification");

const router = express.Router();

// Get latest notifications
router.get("/", async (req, res) => {
  try {
    const notifications = await Notification.find()
      .sort({ createdAt: -1 })
      .limit(3);

    res.json(notifications);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch notifications",
    });
  }
});

// GET /api/notifications/all
router.get("/all", async (req, res) => {
  try {
    const notifications = await Notification.find().sort({ createdAt: -1 });

    res.json(notifications);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch notifications",
    });
  }
});

// Unread count
router.get("/unread-count", async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      isRead: false,
    });

    res.json({ count });
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch count",
    });
  }
});

// Mark one notification as read
router.patch("/:id/read", async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, {
      isRead: true,
    });

    res.json({
      success: true,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to update notification",
    });
  }
});

// Mark all as read
router.patch("/read-all", async (req, res) => {
  try {
    await Notification.updateMany({ isRead: false }, { isRead: true });

    res.json({
      success: true,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to update notifications",
    });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await Notification.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
    });
  } catch (error) {
    res.status(500).json({
      message: "Delete failed",
    });
  }
});

router.delete("/clear/read", async (req, res) => {
  try {
    await Notification.deleteMany({
      isRead: true,
    });

    res.json({
      success: true,
    });
  } catch (error) {
    res.status(500).json({
      message: "Delete failed",
    });
  }
});

module.exports = router;
