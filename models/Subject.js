const mongoose = require("mongoose");

const SubjectSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  subjectName: { type: String, required: true },
  credit: { type: Number, required: true }
}, { timestamps: true });

module.exports = mongoose.model("Subject", SubjectSchema);