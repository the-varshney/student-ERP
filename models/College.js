const mongoose = require("mongoose");

const CollegeSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  name: { type: String, required: true },
  address: { type: String, required: true },

  departments: [
    {
      deptId: { type: String, required: true },
      offeredProgramIds: [{ type: String }]
    }
  ]
}, { timestamps: true });

module.exports = mongoose.model("College", CollegeSchema);