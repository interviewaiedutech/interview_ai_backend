const AuditLog = require("../models/AuditLog");

const logAdminAction = async (admin, action, target = "", details = "") => {
  try {
    await AuditLog.create({
      adminId: admin._id,
      adminName: admin.name,
      action,
      target,
      details,
    });
  } catch (error) {
    console.error("Audit Log Error:", error);
  }
};

module.exports = logAdminAction;
