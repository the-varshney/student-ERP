/* eslint-disable no-console */
const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const College = require('../models/College');
const Department = require('../models/Department');
const Program = require('../models/Program');
const admin = require('firebase-admin');

const firestore = admin.firestore();

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

// GET /api/students/filtered
router.get('/filtered', async (req, res) => {
  try {
    const { collegeId, departmentId, programId, semester } = req.query;

    // Pull candidate student profiles from Firestore by college
    if (!collegeId) {
      return res.status(400).json({ error: 'collegeId is required' });
    }

    // Build Firestore base query on Students collection
    let baseQuery = firestore.collection('Students');
    if (collegeId && collegeId !== 'ALL') {
      baseQuery = baseQuery.where('collegeId', '==', String(collegeId));
    }
    // If Firestore profile stores program as code, filter at source 
    if (programId && programId !== 'ALL' && programId !== 'null') {
      baseQuery = baseQuery.where('program', '==', String(programId));
    }
    // If Firestore profile stores department code (e.g., 'D-CS'),
    if (departmentId && departmentId !== 'ALL' && departmentId !== 'null') {
    }

    const snap = await baseQuery.get();
    const fsProfiles = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    const firebaseIds = fsProfiles.map(u => u.firebaseId).filter(Boolean);

    if (firebaseIds.length === 0) {
      return res.json([]);
    }

    //query Mongo Students by firebaseId IN and optional academic filters that truly exist
    const chunks = chunk(firebaseIds, 200);
    let allMongo = [];
    for (let i = 0; i < chunks.length; i += 1) {
      const ids = chunks[i];
      const mongoFilter = { firebaseId: { $in: ids } };

      // Only filter program in Mongo if you are certain Student.program is stored as 'BCA' code as in your sample
      if (programId && programId !== 'ALL' && programId !== 'null') {
        mongoFilter.program = String(programId);
      }
      // Only filter semester if present in Mongo
      if (semester && semester !== 'ALL' && semester !== 'null' && semester !== 'undefined') {
        mongoFilter.semester = String(semester);
      }

      const part = await Student.find(mongoFilter).sort({ enrollmentNo: 1 }).lean();
      allMongo = allMongo.concat(part);
    }

    // Deduplicate by firebaseId in case of overlaps
    const mongoByFid = new Map();
    allMongo.forEach(s => { mongoByFid.set(s.firebaseId, s); });
    const mongoStudents = Array.from(mongoByFid.values());

    if (mongoStudents.length === 0) {
      return res.json([]);
    }

    //Build lookup maps for labels where possible
const uniqueCollegeIds = [...new Set(mongoStudents.map(s => s.college).filter(Boolean))];
const uniqueDepartmentIds = [...new Set(mongoStudents.map(s => s.department).filter(Boolean))];
const uniqueProgramIds = [...new Set(mongoStudents.map(s => s.program).filter(Boolean))];

const [colleges, departments, programs] = await Promise.all([
  uniqueCollegeIds.length ? College.find({ _id: { $in: uniqueCollegeIds } }).lean() : Promise.resolve([]),
  uniqueDepartmentIds.length ? Department.find({ _id: { $in: uniqueDepartmentIds } }).lean() : Promise.resolve([]),
  uniqueProgramIds.length ? Program.find({ _id: { $in: uniqueProgramIds } }).lean() : Promise.resolve([]),
]);

const collegeMap = new Map(colleges.map(c => [String(c._id), c]));
const departmentMap = new Map(departments.map(d => [String(d._id), d]));
const programMap = new Map(programs.map(p => [String(p._id), p]));


    // Merge Mongo rows with their Firestore profile
    const fsByFid = new Map(fsProfiles.map(p => [p.firebaseId, p]));
    const combined = mongoStudents.map((ms, i) => {
      const fp = fsByFid.get(ms.firebaseId) || {};
      const obj = {
        _id: ms._id,
        firebaseId: ms.firebaseId,
        enrollmentNo: ms.enrollmentNo,
        semester: ms.semester,
        yearOfAdmission: ms.yearOfAdmission,
        college: ms.college && collegeMap.get(String(ms.college)) ? collegeMap.get(String(ms.college)) : { _id: ms.college || fp.collegeId || 'N/A', name: fp.collegeName || 'N/A' },
        department: departmentMap.get(String(ms.department)) || { _id: ms.department || fp.department || 'N/A', departmentName: 'N/A' },
        program: ms.program && programMap.get(String(ms.program)) ? programMap.get(String(ms.program)) : { _id: ms.program || fp.program || 'N/A', programName: fp.programName || ms.program || fp.program || 'N/A' },
        firstName: fp.firstName || 'N/A',
        lastName: fp.lastName || '',
        email: fp.email || '',
        phone: fp.phone || '',
        gender: fp.gender || '',
        profilePicUrl: fp.profilePicUrl || '',
      };
      return obj;
    });
    return res.json(combined);
  } catch (err) {
    console.error('[ERROR] /students/filtered', err?.message, err?.stack);
    return res.status(500).json({ error: 'Failed to fetch student data.' });
  }
});

router.get("/:firebaseId", async (req, res) => {
  try {
    const student = await Student.findOne({ firebaseId: req.params.firebaseId });
    if (!student) {
      return res.status(404).json({ error: "Student academic data not found." });
    }
    res.json(student);
  } catch (err) {
    console.error("Error fetching student:", err);
    res.status(500).json({ error: "Failed to fetch student data.", message: err.message });
  }
});

// Create a new student record
router.post("/", async (req, res) => {
  try {
    const { firebaseId, department, program, semester, yearOfAdmission, enrollmentNo } = req.body;
    
    // validation
    if (!firebaseId || !department || !program || !semester || !yearOfAdmission || !enrollmentNo) {
      return res.status(400).json({ error: "Missing required academic fields." });
    }

    // Check if a student with this firebaseId already exists to prevent duplicates
    const existingStudent = await Student.findOne({ firebaseId });
    if (existingStudent) {
        return res.status(409).json({ error: "A student with this ID already has academic data." });
    }

    const student = new Student({
      firebaseId,
      department,
      program,
      semester,
      yearOfAdmission,
      enrollmentNo,
    });
    
    await student.save();
    res.status(201).json(student);
  } catch (err) {
    console.error("Error creating student:", err);
    res.status(500).json({ error: "Failed to create student record.", message: err.message });
  }
});

router.get("/filtered", async (req, res) => {
  try {
    const { collegeId, departmentId, programId, semester } = req.query;
    const filter = {};

    if (collegeId && collegeId !== 'ALL') {
      filter.college = collegeId;
    }
    if (departmentId && departmentId !== 'ALL') {
      filter.department = departmentId;
    }
    if (programId && programId !== 'ALL') {
      filter.program = programId;
    }
    if (semester && semester !== 'ALL') {
      filter.semester = semester;
    }

    const students = await Student.find(filter)
      // Populate all three fields to provide a complete object for the frontend
      .populate('college', 'name')
      .populate('departments', 'departmentName')
      .populate('programs', 'programName')
      .sort({ enrollmentNo: 1 });

    res.json(students);
  } catch (err) {
    console.error("Error fetching filtered students:", err);
    res.status(500).json({ error: "Failed to fetch filtered student data." });
  }
});


router.put("/:firebaseId", async (req, res) => {
    try {
        const { department, program, semester, yearOfAdmission, enrollmentNo } = req.body;
        const updatedData = { department, program, semester, yearOfAdmission, enrollmentNo };

        const student = await Student.findOneAndUpdate(
            { firebaseId: req.params.firebaseId },
            updatedData,
            { new: true, runValidators: true }
        );

        if (!student) {
            return res.status(404).json({ error: "Student not found to update." });
        }
        res.status(200).json(student);
    } catch (err) {
        console.error("Error updating student:", err);
        res.status(500).json({ error: "Failed to update student data.", message: err.message });
    }
});


// Remove a student's academic data 
router.delete("/:firebaseId", async (req, res) => {
    try {
        const student = await Student.findOneAndDelete({ firebaseId: req.params.firebaseId });

        if (!student) {
            // It's okay if the student doesn't exist; maybe they were already rejected.
            // Sending a 204 No Content response is appropriate here.
            return res.status(204).send(); 
        }
        res.status(200).json({ message: "Student academic data deleted successfully." });
    } catch (err) {
        console.error("Error deleting student:", err);
        res.status(500).json({ error: "Failed to delete student data.", message: err.message });
    }
});


module.exports = router;
