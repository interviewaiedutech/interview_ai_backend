const mongoose = require("mongoose");

const systemSettingsSchema = new mongoose.Schema({
  maintenanceMode: {
    type: Boolean,
    default: false,
  },

  userRegistration: {
    type: Boolean,
    default: true,
  },
  aiEnabled: {
    type: Boolean,
    default: true,
  },
});

module.exports = mongoose.model("SystemSettings", systemSettingsSchema);
