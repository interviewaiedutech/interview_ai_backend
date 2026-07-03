const express = require("express");
const router = express.Router();
const Contact = require("../models/Contact");
const AuditLog = require("../models/AuditLog");
const sendContactNotification = require("../utils/sendContactNotification");
const sendContactAcknowledgement = require("../utils/sendContactAcknowledgement");
const logAdminAction = require("../utils/auditLogger");
const Notification = require("../models/Notification");

router.post("/", async (req, res) => {
  try {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    const contact = await Contact.create({
      name,
      email,
      message,
    });

    await Notification.create({
      title: "New Contact Message",
      message: `${name} submitted a contact request`,
      type: "contact",
      entityId: contact._id,
      entityType: "contact",
    });
    await logAdminAction(
      null,
      "CONTACT_MESSAGE_RECEIVED",
      email,
      "New contact message received",
    );

    try {
      await sendContactNotification(name, email, message);

      await sendContactAcknowledgement(name, email);
    } catch (emailError) {
      console.error(emailError);
    }

    return res.status(201).json({
      success: true,
      message: "Message submitted successfully",
      contact,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

module.exports = router;
