const express = require("express");
const router = express.Router();
const Result = require("../models/Result");
const Student = require("../models/Student");
const Program = require("../models/Program");
const Subject = require("../models/Subject");
const PublishedResult = require("../models/PublishedResult");

// Components used across results
const RESULT_COMPONENTS = [
  'midSem', 'endSem', 'attendance', 'practical', 'assignment1', 'assignment2', 'internal'
];

// GET: all student marks for program/sem/subject
router.get("/student-marks", async (req, res) => {
  try {
    const { collegeId, program, semester, subject } = req.query;
    if (!collegeId || !program || !semester || !subject) {
      return res.status(400).json({ error: "Missing parameters" });
    }
    const doc = await Result.findOne({ collegeId, program, semester, subject }).lean();
    const map = {};
    if (doc && Array.isArray(doc.results)) {
      for (const r of doc.results) {
        const scores = {};
        if (r.scores) {
          for (const [k, v] of Object.entries(r.scores)) {
            scores[k] = { obtained: v?.obtained ?? null, max: v?.max ?? 0 };
          }
        }
        map[String(r.studentId)] = scores;
      }
    }
    return res.json({ studentMarks: map });
  } catch (e) {
    console.error("student-marks error:", e);
    return res.status(500).json({ error: "Failed to fetch marks" });
  }
});

//batch create/merge one component marks
router.post("/create", async (req, res) => {
  try {
    const { collegeId, program, semester, subject, teacherId, component, maxMarks, results } = req.body;
    if (!collegeId || !program || !semester || !subject || !teacherId || !component || typeof maxMarks !== 'number' || !Array.isArray(results)) {
      return res.status(400).json({ error: "Missing or invalid fields" });
    }

    let doc = await Result.findOne({ collegeId, program, semester, subject });
    if (!doc) {
      doc = new Result({ collegeId, program, semester, subject, teacherId, results: [] });
    }

    const byId = new Map(doc.results.map(r => [String(r.studentId), r]));
    for (const r of results) {
      const id = String(r.studentId);
      const obtained = r.obtained === null || r.obtained === undefined ? null : Number(r.obtained);
      if (byId.has(id)) {
        const sr = byId.get(id);
        if (!sr.scores) sr.scores = new map();

sr.scores.set(component, { obtained, max: Number(maxMarks) });
      } else {
        const newScores = new Map();

        newScores.set(component, { obtained, max: Number(maxMarks) });

        const entry = {
          studentId: r.studentId,
          enrollmentNo: r.enrollmentNo || '',
          studentName: r.studentName || '',
          firebaseId: r.firebaseId || '',
          scores: { [component]: { obtained, max: Number(maxMarks) } }
        };
        doc.results.push(entry);
      }
    }
    doc.updatedAt = new Date();
    await doc.save();
    return res.status(201).json({ message: "Results saved" });
  } catch (e) {
    console.error("create results error:", e);
    return res.status(500).json({ error: "Failed to save results" });
  }
});

// update a single student's component mark
router.patch("/update-mark", async (req, res) => {
  try {
    const { collegeId, program, semester, subject, teacherId, studentId, component, obtained, maxMarks } = req.body;
    if (!collegeId || !program || !semester || !subject || !teacherId || !studentId || !component) {
      return res.status(400).json({ error: "Missing fields" });
    }

    let doc = await Result.findOne({ collegeId, program, semester, subject });
    if (!doc) {
      doc = new Result({ collegeId, program, semester, subject, teacherId, results: [] });
    }

    let sr = doc.results.find(r => String(r.studentId) === String(studentId));
    if (!sr) {
      sr = { studentId, scores: {} };
      doc.results.push(sr);
    }
    if (!sr.scores) {
      sr.scores = new Map();
    }
    sr.scores.set(component, {
      obtained: obtained === null || obtained === undefined ? null : Number(obtained),
      max: Number(maxMarks ?? 0)
    });

    doc.updatedAt = new Date();
    await doc.save();
    return res.json({ message: "Mark updated" });
  } catch (e) {
    console.error("update-mark error:", e);
    return res.status(500).json({ error: "Failed to update mark" });
  }
});

// Summary overview
router.get("/overview", async (req, res) => {
  try {
    const { collegeId, departmentId, programId, semester } = req.query;
    if (!collegeId || !departmentId || !programId || !semester) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    const prog = await Program.findById(programId);
    if (!prog) return res.status(404).json({ error: "Program not found" });
    const sem = prog.semesters.find(s => String(s.semesterNumber) === String(semester));
    const subjectIds = sem ? sem.subjectIds : [];
    const subjects = await Subject.find({ _id: { $in: subjectIds } }, { __v: 0 }).sort({ _id: 1 }).lean();

    const students = await Student.find({
      program: programId,
      semester: String(semester)
    }).lean();

    const marks = {};
    for (const stu of students) marks[String(stu._id)] = {};
    for (const sub of subjects) {
      const doc = await Result.findOne({
        collegeId,
        program: programId,
        semester: String(semester),
        subject: String(sub._id)
      }).lean();

      if (doc && Array.isArray(doc.results)) {
        for (const r of doc.results) {
          const sid = String(r.studentId);
          if (!marks[sid]) marks[sid] = {};
          if (!marks[sid][String(sub._id)]) marks[sid][String(sub._id)] = {};
          const scores = r.scores || {};
          for (const k of Object.keys(scores)) {
            if (!RESULT_COMPONENTS.includes(k)) continue;
            const v = scores[k] || {};
            marks[sid][String(sub._id)][k] = { obtained: v.obtained ?? null, max: v.max ?? 0 };
          }
          for (const k of RESULT_COMPONENTS) {
            if (!marks[sid][String(sub._id)][k]) {
              marks[sid][String(sub._id)][k] = { obtained: null, max: 0 };
            }
          }
        }
      }
      for (const stu of students) {
        const sid = String(stu._id);
        if (!marks[sid]) marks[sid] = {};
        if (!marks[sid][String(sub._id)]) {
          marks[sid][String(sub._id)] = {};
          for (const k of RESULT_COMPONENTS) {
            marks[sid][String(sub._id)][k] = { obtained: null, max: 0 };
          }
        }
      }
    }

    const pr = await PublishedResult.findOne({
      collegeId, departmentId, programId, semester: String(semester)
    }).lean();

    const shapedStudents = students
      .sort((a, b) => (a.enrollmentNo || '').localeCompare(b.enrollmentNo || ''))
      .map(s => ({
        _id: s._id,
        enrollmentNo: s.enrollmentNo,
        firstName: s.firstName,
        lastName: s.lastName,
        email: s.email
      }));

    res.json({
      subjects: subjects.map(s => ({ _id: s._id, subjectName: s.subjectName })),
      students: shapedStudents,
      marks,
      publishStatus: pr ? {
        published: !!pr.published,
        publishedAt: pr.publishedAt || null,
        publishedBy: pr.publishedBy || null
      } : { published: false }
    });
  } catch (e) {
    console.error("overview error:", e);
    res.status(500).json({ error: "Failed to build overview" });
  }
});

// Publish routes
router.post("/publish", async (req, res) => {
  try {
    const { collegeId, departmentId, programId, semester } = req.body;
    if (!collegeId || !departmentId || !programId || !semester) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const now = new Date();
    const pr = await PublishedResult.findOneAndUpdate(
      { collegeId, departmentId, programId, semester: String(semester) },
      {
        $set: {
          published: true,
          publishedAt: now,
          publishedBy: req.user?.uid ? { uid: req.user.uid, name: req.user.name || 'Associate' } : {}
        }
      },
      { upsert: true, new: true }
    );

    res.json({ message: "Published", publishedAt: pr.publishedAt });
  } catch (e) {
    console.error("publish error:", e);
    res.status(500).json({ error: "Failed to publish" });
  }
});

router.get("/publish-status", async (req, res) => {
  try {
    const { collegeId, departmentId, programId, semester } = req.query;
    const pr = await PublishedResult.findOne({
      collegeId, departmentId, programId, semester: String(semester)
    }).lean();
    if (!pr) return res.json({ published: false });
    res.json({
      published: !!pr.published,
      publishedAt: pr.publishedAt || null,
      publishedBy: pr.publishedBy || null
    });
  } catch (e) {
    console.error("publish-status error:", e);
    res.status(500).json({ error: "Failed to fetch publish status" });
  }
});

router.post("/publish-preview", async (req, res) => {
  try {
    const { collegeId, departmentId, programId, semester } = req.body;
    if (!collegeId || !departmentId || !programId || !semester) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const now = new Date();
    const pr = await PublishedResult.findOneAndUpdate(
      { collegeId, departmentId, programId, semester: String(semester) },
      {
        $set: {
          previewPublished: true,
          previewAt: now,
          previewBy: req.user?.uid ? { uid: req.user.uid, name: req.user.name || 'Associate' } : {}
        }
      },
      { upsert: true, new: true }
    );

    return res.json({ message: "Preview published", previewAt: pr.previewAt });
  } catch (e) {
    console.error("publish-preview error:", e);
    return res.status(500).json({ error: "Failed to publish preview" });
  }
});

router.get("/publish-preview-status", async (req, res) => {
  try {
    const { collegeId, departmentId, programId, semester } = req.query;
    if (!collegeId || !departmentId || !programId || !semester) {
      return res.status(400).json({ error: "Missing parameters" });
    }
    const pr = await PublishedResult.findOne({
      collegeId, departmentId, programId, semester: String(semester)
    }).lean();

    if (!pr) return res.json({ previewPublished: false });
    return res.json({
      previewPublished: !!pr.previewPublished,
      previewAt: pr.previewAt || null,
      previewBy: pr.previewBy || null
    });
  } catch (e) {
    console.error("publish-preview-status error:", e);
    return res.status(500).json({ error: "Failed to fetch preview status" });
  }
});

module.exports = router;
