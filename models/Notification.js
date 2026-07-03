const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },

  message: {
    type: String,
    required: true,
  },

  type: {
    type: String,
    enum: [
      "user",
      "contact",
      "interview",
      "communication",
      "aptitude",
      "email",
      "jdprep",
    ],
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
  },

  entityType: {
    type: String,
    default: "",
  },
  isRead: {
    type: Boolean,
    default: false,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Notification", notificationSchema);
