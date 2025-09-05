const mongoose = require("mongoose");

const ComponentScoreSchema = new mongoose.Schema({
  obtained: { type: Number, default: null },
  max: { type: Number, default: 0 }
}, { _id: false });

const StudentResultSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
  enrollmentNo: { type: String },
  studentName: { type: String },
  firebaseId: { type: String },
  scores: {
    type: Map,
    of: ComponentScoreSchema,
    default: {}
  }
}, { _id: false });

const ResultSchema = new mongoose.Schema({
  collegeId: { type: String, required: true },
  program: { type: String, required: true },
  semester: { type: String, required: true },
  subject: { type: String, required: true },
  teacherId: { type: String, required: true },
  results: { type: [StudentResultSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date }
});

ResultSchema.index({ collegeId: 1, program: 1, semester: 1, subject: 1 }, { unique: false });

module.exports = mongoose.model("Result", ResultSchema);
