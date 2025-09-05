const mongoose = require('mongoose');

const ExamItemSchema = new mongoose.Schema(
  {
    subjectId: { type: String, default: '' },
    course: { type: String, trim: true }, 
    date: { type: Date },                 

    startTime: { type: String, default: '' },     
    endTime: { type: String, default: '' },       
    durationHours: { type: Number, default: null }, 
    time: { type: String, default: '', select: false },
    duration: { type: String, default: '', select: false }
  },
  { _id: false }
);

const ExamScheduleSchema = new mongoose.Schema(
  {
    collegeId: { type: String, required: true, index: true },
    departmentId: { type: String, required: true, index: true },
    programId: { type: String, required: true, index: true },
    semester: { type: Number, required: true, index: true },
    academicYear: { type: String, required: true, index: true },
    examMonthYear: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['DRAFT', 'PUBLISHED'],
      required: true,
      index: true
    },
    exams: { type: [ExamItemSchema], default: [] },
    createdBy: { type: String, default: '' },
    publishedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

// Compound indexing
ExamScheduleSchema.index({
  collegeId: 1,
  departmentId: 1,
  programId: 1,
  semester: 1,
  academicYear: 1,
  examMonthYear: 1,
  status: 1
});

module.exports = mongoose.model('ExamSchedule', ExamScheduleSchema);