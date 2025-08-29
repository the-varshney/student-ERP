const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema({
  firebaseId: { type: String, required: true, unique: true },
  department: { type: String, ref: "Department", required: true },
  program: { type: String, ref: "Program", required: true },
  semester: { type: String, required: true },
  yearOfAdmission: { type: String, required: true },
  enrollmentNo: { type: String, unique: true, required: true },
}, { timestamps: false });

module.exports = mongoose.model("Student", studentSchema);