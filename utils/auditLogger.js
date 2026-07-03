const AuditLog = require("../models/AuditLog");

const logAdminAction = async (admin, action, target = "", details = "") => {
  try {
    await AuditLog.create({
      adminId: admin?._id || null,
      adminName: admin?.name || "System",
      action,
      target,
      details,
    });
  } catch (error) {
    console.error("Audit Log Error:", error);
  }
};

module.exports = logAdminAction;
