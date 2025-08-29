const mongoose = require("mongoose");

const AttendanceSchema = new mongoose.Schema({
  // Session Information
  collegeId: { type: String, required: true, index: true },
  department: { type: String, ref: "Department", required: true, index: true },
  program: { type: String, ref: "Program", required: true, index: true },
  semester: { type: String, required: true, index: true },
  subject: { type: String, ref: "Subject", required: true, index: true },
  
  // Teacher & Schedule
  teacherId: { type: String, required: true, index: true },
  teacherName: { type: String, required: true },
  date: { type: Date, required: true, index: true },
  timeSlot: { type: String, required: true },
  
  // Students Attendance Data
  studentsAttendance: [{
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    enrollmentNo: { type: String, required: true },
    firebaseId: { type: String, required: true },
    studentName: { type: String, required: true },
    status: { 
      type: String, 
      enum: ['Present', 'Absent'], 
      required: true 
    },
    markedAt: { type: Date, default: Date.now }
  }],
  
  //Statistics
  totalStudents: { type: Number, required: true },
  presentCount: { type: Number, default: 0 },
  absentCount: { type: Number, default: 0 },
  
  // Metadata
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { 
  timestamps: true,
  // Ensure one attendance record per subject per time slot, so no duplicate records for same time slot
  indexes: [
    { collegeId: 1, program: 1, semester: 1 },
    { subject: 1, date: 1, timeSlot: 1 },
    { teacherId: 1, date: 1 },
    { "studentsAttendance.student": 1 },
    { "studentsAttendance.enrollmentNo": 1 },
    // Unique constraint to prevent duplicate attendance
    { collegeId: 1, program: 1, semester: 1, subject: 1, date: 1, timeSlot: 1 },
  ]
});

// Compound unique index to prevent duplicate attendance sessions
AttendanceSchema.index(
  { collegeId: 1, program: 1, semester: 1, subject: 1, date: 1, timeSlot: 1 }, 
  { unique: true }
);

module.exports = mongoose.model("Attendance", AttendanceSchema);
