const mongoose = require("mongoose");

const DepartmentSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  departmentName: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model("Department", DepartmentSchema);