const mongoose = require("mongoose");

const ProgramSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  programName: { type: String, required: true },
  semesters: [
    {
      semesterNumber: { type: Number, required: true },
      subjectIds: [{ type: String }]
    }
  ]
}, { timestamps: true });

module.exports = mongoose.model("Program", ProgramSchema);