const express = require("express");
const router = express.Router();
const Attendance = require("../models/Attendance");
const Student = require("../models/Student");

// GET filtered students records for attendance 
router.post("/get-students", async (req, res) => {
  try {
    const { 
      teacherCollege, 
      teacherProgram, 
      selectedSemester, 
      firebaseStudents // This comes from frontend after Firebase filtering
    } = req.body;

    if (!teacherCollege || !teacherProgram || !selectedSemester || !firebaseStudents) {
      return res.status(400).json({ 
        error: 'Missing required fields: teacherCollege, teacherProgram, selectedSemester, firebaseStudents' 
      });
    }

    console.log(`MongoDB filtering - Program: ${teacherProgram}, semester: ${selectedSemester}`);
    console.log(`Received ${firebaseStudents.length} students from Firebase`);

    // Extract firebaseIds from the Firebase filtered students
    const firebaseIds = firebaseStudents.map(student => student.firebaseId);

    // Get matching students from MongoDB with program and semester filter
    const mongoStudents = await Student.find({
      firebaseId: { $in: firebaseIds },
      program: teacherProgram,
      semester: selectedSemester
    }).populate('department', 'departmentName')
      .populate('program', 'programName')
      .lean();

    // console.log(`Found ${mongoStudents.length} matching students in MongoDB`);

    // Merge Firebase and MongoDB data
    const mergedStudents = mongoStudents
      .map(mongoStudent => {
        const firebaseData = firebaseStudents.find(
          fb => fb.firebaseId === mongoStudent.firebaseId
        );
        
        if (!firebaseData) return null;

        return {
          _id: mongoStudent._id,
          enrollmentNo: mongoStudent.enrollmentNo,
          firebaseId: mongoStudent.firebaseId,
          department: mongoStudent.department,
          program: mongoStudent.program,
          semester: mongoStudent.semester,
          yearOfAdmission: mongoStudent.yearOfAdmission,
          firstName: firebaseData.firstName || '',
          lastName: firebaseData.lastName || '',
          email: firebaseData.email || '',
          profilePicUrl: firebaseData.profilePicUrl || '',
          collegeName: firebaseData.collegeName || '',
        };
      })
      .filter(student => student !== null)
      .sort((a, b) => a.enrollmentNo.localeCompare(b.enrollmentNo));

    res.json({ 
      students: mergedStudents,
      count: mergedStudents.length,
      message: `Found ${mergedStudents.length} students for ${teacherProgram} - Semester ${selectedSemester}`
    });

  } catch (error) {
    console.error('Error in get-students:', error);
    res.status(500).json({ 
      error: 'Failed to fetch students', 
      details: error.message 
    });
  }
});

router.post("/create", async (req, res) => {
  try {
    const {
      collegeId,
      department,
      program,
      semester,
      subject,
      teacherId,
      teacherName,
      date,
      startTime,
      endTime,
      studentsAttendance
    } = req.body;

    // Validate required fields
    if (!collegeId || !department || !program || !semester || !subject || 
        !teacherId || !teacherName || !date || !startTime || !endTime || !studentsAttendance) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Create time slot string
    const timeSlot = `${startTime}-${endTime}`;

    // Check if attendance already exists for this session
    const existingAttendance = await Attendance.findOne({
      collegeId,
      program,
      semester,
      subject,
      date: new Date(date),
      timeSlot
    });

    if (existingAttendance) {
      return res.status(409).json({ 
        error: 'Attendance already recorded for this session',
        existingId: existingAttendance._id
      });
    }

    const presentCount = studentsAttendance.filter(s => s.status === 'Present').length;
    const absentCount = studentsAttendance.filter(s => s.status === 'Absent').length;

    // Create attendance record
    const attendance = new Attendance({
      collegeId,
      department,
      program,
      semester,
      subject,
      teacherId,
      teacherName,
      date: new Date(date),
      timeSlot,
      studentsAttendance,
      totalStudents: studentsAttendance.length,
      presentCount,
      absentCount
    });

    await attendance.save();

    res.status(201).json({ 
      message: 'Attendance recorded successfully',
      attendanceId: attendance._id,
      stats: { 
        presentCount, 
        absentCount, 
        total: studentsAttendance.length,
        attendancePercentage: ((presentCount / studentsAttendance.length) * 100).toFixed(1)
      }
    });

  } catch (error) {
    console.error('Error creating attendance:', error);
    
    if (error.code === 11000) {
      return res.status(409).json({ 
        error: 'Duplicate attendance record. Attendance already exists for this session.' 
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to create attendance record',
      details: error.message 
    });
  }
});


router.get("/records", async (req, res) => {
  try {
    const { 
      collegeId, 
      program, 
      semester, 
      subject, 
      teacherId, 
      startDate, 
      endDate, 
      page = 1, 
      limit = 20 
    } = req.query;

    let query = {};

    // Build query based on provided filters
    if (collegeId) query.collegeId = collegeId;
    if (program) query.program = program;
    if (semester) query.semester = semester;
    if (subject) query.subject = subject;
    if (teacherId) query.teacherId = teacherId;

    // Date range filter
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [records, totalCount] = await Promise.all([
      Attendance.find(query)
        .populate('department', 'departmentName')
        .populate('program', 'programName')
        .populate('subject', 'subjectName')
        .populate('studentsAttendance.student', 'enrollmentNo')
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Attendance.countDocuments(query)
    ]);

    res.json({
      records,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(totalCount / parseInt(limit)),
        count: totalCount,
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Error fetching attendance records:', error);
    res.status(500).json({ error: 'Failed to fetch attendance records' });
  }
});

// GET attendance analytics
router.get("/analytics", async (req, res) => {
  try {
    const { collegeId, program, semester, startDate, endDate } = req.query;

    let matchStage = {};
    if (collegeId) matchStage.collegeId = collegeId;
    if (program) matchStage.program = program;
    if (semester) matchStage.semester = semester;
    
    if (startDate || endDate) {
      matchStage.date = {};
      if (startDate) matchStage.date.$gte = new Date(startDate);
      if (endDate) matchStage.date.$lte = new Date(endDate);
    }

    const analytics = await Attendance.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalSessions: { $sum: 1 },
          totalStudentsMarked: { $sum: "$totalStudents" },
          totalPresent: { $sum: "$presentCount" },
          totalAbsent: { $sum: "$absentCount" },
          avgAttendanceRate: { 
            $avg: { 
              $divide: ["$presentCount", "$totalStudents"] 
            }
          }
        }
      }
    ]);

    const result = analytics[0] || {
      totalSessions: 0,
      totalStudentsMarked: 0,
      totalPresent: 0,
      totalAbsent: 0,
      avgAttendanceRate: 0
    };

    res.json({
      ...result,
      avgAttendanceRate: Math.round(result.avgAttendanceRate * 100 * 100) / 100
    });

  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// GET student attendance data by firebaseId
router.get("/student/:firebaseId", async (req, res) => {
  try {
    const { firebaseId } = req.params;

    // Find student information
    const student = await Student.findOne({ firebaseId })
      .populate('program', 'programName')
      .populate('department', 'departmentName');

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Find all attendance records where this student is present
    const attendanceRecords = await Attendance.find({
      "studentsAttendance.firebaseId": firebaseId,
      program: student.program._id || student.program,
      semester: student.semester
    }).populate('subject', 'subjectName')
      .sort({ date: -1 });

    // Group attendance by subject and calculate stats
    const subjectMap = new Map();
    let totalClasses = 0;
    let totalPresent = 0;
    let allRecords = [];

    attendanceRecords.forEach(record => {
      const subjectId = record.subject?._id?.toString() || record.subject;
      const subjectName = record.subject?.subjectName || 'Unknown Subject';

      // Initialize subject entry if not exists
      if (!subjectMap.has(subjectId)) {
        subjectMap.set(subjectId, {
          subjectId: subjectId,
          subjectName: subjectName,
          total: 0,
          present: 0,
          absent: 0,
          records: []
        });
      }

      const subjectEntry = subjectMap.get(subjectId);

      // Find student's specific attendance record
      const studentRecord = record.studentsAttendance.find(
        sa => sa.firebaseId === firebaseId
      );

      if (studentRecord) {
        subjectEntry.total++;
        totalClasses++;

        const attendanceRecord = {
          date: record.date,
          timeSlot: record.timeSlot,
          status: studentRecord.status,
          teacherName: record.teacherName,
          subjectName: subjectName,
          markedAt: studentRecord.markedAt
        };

        subjectEntry.records.push(attendanceRecord);
        allRecords.push(attendanceRecord);

        if (studentRecord.status === 'Present') {
          subjectEntry.present++;
          totalPresent++;
        } else {
          subjectEntry.absent++;
        }
      }
    });

    // Calculate percentages for each subject
    const subjectStats = Array.from(subjectMap.values()).map(subject => ({
      ...subject,
      percentage: subject.total > 0 ? ((subject.present / subject.total) * 100).toFixed(1) : 'N/A'
    }));

    // Calculate overall statistics
    const overallPercentage = totalClasses > 0 ? ((totalPresent / totalClasses) * 100).toFixed(1) : 'N/A';

    // Sort all records by date (most recent first)
    allRecords.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({
      student: {
        firebaseId: student.firebaseId,
        enrollmentNo: student.enrollmentNo,
        department: student.department,
        program: student.program,
        semester: student.semester,
        yearOfAdmission: student.yearOfAdmission
      },
      subjectStats: subjectStats,
      overallStats: {
        totalClasses: totalClasses,
        totalPresent: totalPresent,
        totalAbsent: totalClasses - totalPresent,
        percentage: overallPercentage
      },
      attendanceRecords: allRecords
    });

  } catch (error) {
    console.error('Error fetching student attendance:', error);
    res.status(500).json({ 
      error: 'Failed to fetch student attendance data',
      details: error.message 
    });
  }
});

// GET student attendance for a specific subject
router.get("/student/:firebaseId/subject/:subjectId", async (req, res) => {
  try {
    const { firebaseId, subjectId } = req.params;

    const attendanceRecords = await Attendance.find({
      "studentsAttendance.firebaseId": firebaseId,
      subject: subjectId
    }).populate('subject', 'subjectName')
      .sort({ date: -1 });

    const subjectAttendance = attendanceRecords.map(record => {
      const studentRecord = record.studentsAttendance.find(
        sa => sa.firebaseId === firebaseId
      );

      return {
        date: record.date,
        timeSlot: record.timeSlot,
        subject: record.subject,
        subjectName: record.subject?.subjectName || 'Unknown Subject',
        status: studentRecord.status,
        teacherName: record.teacherName,
        markedAt: studentRecord.markedAt
      };
    });

    res.json(subjectAttendance);

  } catch (error) {
    console.error('Error fetching subject attendance:', error);
    res.status(500).json({ error: 'Failed to fetch subject attendance' });
  }
});

module.exports = router;

// GET student attendance for a specific semester
router.get("/student/:firebaseId/semester/:semester", async (req, res) => {
    try {
      const { firebaseId, semester } = req.params;
  
      // Find student information
      const student = await Student.findOne({ firebaseId })
        .populate('program', 'programName')
        .populate('department', 'departmentName');
  
      if (!student) {
        return res.status(404).json({ error: 'Student not found' });
      }
  
      // Find all attendance records for specific semester
      const attendanceRecords = await Attendance.find({
        "studentsAttendance.firebaseId": firebaseId,
        program: student.program._id || student.program,
        semester: semester
      }).populate('subject', 'subjectName')
        .sort({ date: -1 });
  
      // Group attendance by subject and calculate stats (same logic as main route)
      const subjectMap = new Map();
      let totalClasses = 0;
      let totalPresent = 0;
      let allRecords = [];
  
      attendanceRecords.forEach(record => {
        const subjectId = record.subject?._id?.toString() || record.subject;
        const subjectName = record.subject?.subjectName || 'Unknown Subject';
  
        if (!subjectMap.has(subjectId)) {
          subjectMap.set(subjectId, {
            subjectId: subjectId,
            subjectName: subjectName,
            total: 0,
            present: 0,
            absent: 0,
            records: []
          });
        }
  
        const subjectEntry = subjectMap.get(subjectId);
        const studentRecord = record.studentsAttendance.find(
          sa => sa.firebaseId === firebaseId
        );
  
        if (studentRecord) {
          subjectEntry.total++;
          totalClasses++;
  
          const attendanceRecord = {
            date: record.date,
            timeSlot: record.timeSlot,
            status: studentRecord.status,
            teacherName: record.teacherName,
            subjectName: subjectName,
            markedAt: studentRecord.markedAt
          };
  
          subjectEntry.records.push(attendanceRecord);
          allRecords.push(attendanceRecord);
  
          if (studentRecord.status === 'Present') {
            subjectEntry.present++;
            totalPresent++;
          } else {
            subjectEntry.absent++;
          }
        }
      });
  
      const subjectStats = Array.from(subjectMap.values()).map(subject => ({
        ...subject,
        percentage: subject.total > 0 ? ((subject.present / subject.total) * 100).toFixed(1) : 'N/A'
      }));
  
      const overallPercentage = totalClasses > 0 ? ((totalPresent / totalClasses) * 100).toFixed(1) : 'N/A';
      allRecords.sort((a, b) => new Date(b.date) - new Date(a.date));
  
      res.json({
        subjectStats: subjectStats,
        overallStats: {
          totalClasses: totalClasses,
          totalPresent: totalPresent,
          totalAbsent: totalClasses - totalPresent,
          percentage: overallPercentage
        },
        attendanceRecords: allRecords
      });
  
    } catch (error) {
      console.error('Error fetching semester attendance:', error);
      res.status(500).json({ 
        error: 'Failed to fetch semester attendance data',
        details: error.message 
      });
    }
  });
  