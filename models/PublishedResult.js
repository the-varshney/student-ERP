const mongoose = require("mongoose");

const PublishedResultSchema = new mongoose.Schema({
  collegeId: { type: String, required: true },
  departmentId: { type: String, required: true },
  programId: { type: String, required: true },
  semester: { type: String, required: true },

  // Final publish
  published: { type: Boolean, default: false },
  publishedAt: { type: Date },
  publishedBy: {
    uid: { type: String },
    name: { type: String }
  },

  // Preview publish
  previewPublished: { type: Boolean, default: false },
  previewAt: { type: Date },
  previewBy: {
    uid: { type: String },
    name: { type: String }
  }
}, { timestamps: true });

PublishedResultSchema.index(
  { collegeId: 1, departmentId: 1, programId: 1, semester: 1 },
  { unique: true }
);

module.exports = mongoose.model("PublishedResult", PublishedResultSchema);
