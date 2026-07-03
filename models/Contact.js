const mongoose = require("mongoose");

const contactSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      trim: true,
    },

    message: {
      type: String,
      required: true,
      trim: true,
    },

    status: {
      type: String,
      enum: ["NEW", "READ", "REPLIED"],
      default: "NEW",
    },

    isRead: {
      type: Boolean,
      default: false,
    },

    repliedAt: {
      type: Date,
      default: null,
    },
    replies: [
      {
        message: String,
        sentAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Contact", contactSchema);
