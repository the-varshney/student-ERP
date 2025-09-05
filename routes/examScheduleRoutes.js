const express = require('express');
const router = express.Router();
const dayjs = require('dayjs');
const ExamSchedule = require('../models/ExamSchedule');

// Time format validator (12h)
const TIME_REGEX = /^\d{1,2}:\d{2}\s*(AM|PM)$/i;

function normalizeExamInput(ex, { allowPartial }) {
  const out = {
    subjectId: ex.subjectId || '',
    course: typeof ex.course === 'string' ? ex.course.trim() : '',
    date: null,

    // preferred fields
    startTime: typeof ex.startTime === 'string' ? ex.startTime.trim() : '',
    endTime: typeof ex.endTime === 'string' ? ex.endTime.trim() : '',
    durationHours:
      ex.durationHours === '' || ex.durationHours == null
        ? null
        : Number(ex.durationHours),
    time: typeof ex.time === 'string' ? ex.time.trim() : '',
    duration: typeof ex.duration === 'string' ? ex.duration.trim() : ''
  };

  // Accept date as "YYYY-MM-DD"
  if (ex.date && dayjs(ex.date, 'YYYY-MM-DD', true).isValid()) {
    out.date = dayjs(ex.date, 'YYYY-MM-DD', true).toDate();
  } else if (!allowPartial) {
    throw new Error('date must be "YYYY-MM-DD"');
  }

  if (!out.startTime && out.time) out.startTime = out.time;
  if (out.durationHours == null && out.duration) {
    const m = out.duration.match(/^(\d+(\.\d+)?)\s*(hours?|hrs?)$/i);
    if (m) out.durationHours = Number(m);
  }

  // Type/format checks for strict modes
  if (!allowPartial) {
    if (!out.course) throw new Error('course is required');
    if (!out.date) throw new Error('date is required');
    if (!out.startTime || !TIME_REGEX.test(out.startTime)) {
      throw new Error('startTime must match "HH:MM AM/PM"');
    }
    const hasEnd = !!out.endTime;
    const hasDur = out.durationHours != null && Number.isFinite(out.durationHours) && out.durationHours > 0;
    if (!hasEnd && !hasDur) {
      throw new Error('Provide endTime or durationHours');
    }
    if (hasEnd && !TIME_REGEX.test(out.endTime)) {
      throw new Error('endTime must match "HH:MM AM/PM"');
    }
    if (hasDur && !(Number.isFinite(out.durationHours) && out.durationHours > 0)) {
      throw new Error('durationHours must be a positive number');
    }
  } else {
    // In draft mode, if provided, validate formats but do not require presence
    if (out.startTime && !TIME_REGEX.test(out.startTime)) {
      throw new Error('startTime must match "HH:MM AM/PM" when provided');
    }
    if (out.endTime && !TIME_REGEX.test(out.endTime)) {
      throw new Error('endTime must match "HH:MM AM/PM" when provided');
    }
    if (out.durationHours != null && !(Number.isFinite(out.durationHours) && out.durationHours > 0)) {
      throw new Error('durationHours must be a positive number when provided');
    }
  }

  return out;
}

function validateIdentity(req) {
  const {
    collegeId,
    departmentId,
    programId,
    semester,
    academicYear,
    examMonthYear
  } = req.body || {};
  const errors = [];
  if (!collegeId) errors.push('collegeId is required');
  if (!departmentId) errors.push('departmentId is required');
  if (!programId) errors.push('programId is required');

  const semNum = Number(semester);
  if (!semester || Number.isNaN(semNum)) errors.push('semester must be a number');

  if (!academicYear || typeof academicYear !== 'string') {
    errors.push('academicYear is required');
  }

  if (
    !examMonthYear ||
    typeof examMonthYear !== 'string' ||
    !/^\d{2}\/\d{4}$/.test(examMonthYear)
  ) {
    errors.push('examMonthYear must be "MM/YYYY"');
  }

  return { errors, semNum, collegeId, departmentId, programId, academicYear, examMonthYear };
}

// DRAFT: allow partial exams
router.post('/draft', async (req, res) => {
  try {
    const { errors, semNum, collegeId, departmentId, programId, academicYear, examMonthYear } = validateIdentity(req);
    if (errors.length) return res.status(400).json({ error: 'Invalid payload', details: errors });

    const examsIn = Array.isArray(req.body.exams) ? req.body.exams : [];
    let normalizedExams = [];
    try {
      normalizedExams = examsIn.map((ex) => normalizeExamInput(ex, { allowPartial: true }));
    } catch (e) {
      return res.status(400).json({ error: 'Invalid draft exam', message: e.message });
    }

    const createdBy = req.headers['x-user-id'] || req.user?.uid || '';

    const updated = await ExamSchedule.findOneAndUpdate(
      {
        collegeId,
        departmentId,
        programId,
        semester: semNum,
        academicYear,
        examMonthYear,
        status: 'DRAFT'
      },
      {
        $set: {
          collegeId,
          departmentId,
          programId,
          semester: semNum,
          academicYear,
          examMonthYear,
          status: 'DRAFT',
          exams: normalizedExams,
          createdBy,
          publishedAt: null
        }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json(updated);
  } catch (err) {
    console.error('Draft upsert error:', err);
    return res.status(500).json({ error: 'Failed to save draft' });
  }
});

// PUBLISH: require complete exams
router.post('/publish', async (req, res) => {
  try {
    const { errors, semNum, collegeId, departmentId, programId, academicYear, examMonthYear } = validateIdentity(req);
    if (errors.length) return res.status(400).json({ error: 'Invalid payload', details: errors });

    const examsIn = Array.isArray(req.body.exams) ? req.body.exams : [];
    if (!examsIn.length) {
      return res.status(400).json({ error: 'exams array is required and must not be empty' });
    }

    let normalizedExams = [];
    try {
      normalizedExams = examsIn.map((ex) => normalizeExamInput(ex, { allowPartial: false }));
    } catch (e) {
      return res.status(400).json({ error: 'Invalid exam', message: e.message });
    }

    const createdBy = req.headers['x-user-id'] || req.user?.uid || '';
    const now = new Date();

    const published = await ExamSchedule.findOneAndUpdate(
      {
        collegeId,
        departmentId,
        programId,
        semester: semNum,
        academicYear,
        examMonthYear,
        status: 'PUBLISHED'
      },
      {
        $set: {
          collegeId,
          departmentId,
          programId,
          semester: semNum,
          academicYear,
          examMonthYear,
          status: 'PUBLISHED',
          exams: normalizedExams,
          createdBy,
          publishedAt: now
        }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json(published);
  } catch (err) {
    console.error('Publish upsert error:', err);
    return res.status(500).json({ error: 'Failed to publish schedule' });
  }
});

// PUBLIC
router.get('/public', async (req, res) => {
  try {
    const { collegeId, programId, semester, academicYear, examMonthYear } = req.query || {};
    const filters = { status: 'PUBLISHED' };
    if (!collegeId || !programId || !semester) {
      return res.status(400).json({
        error: 'collegeId, programId, and semester are required query params'
      });
    }
    filters.collegeId = String(collegeId);
    filters.programId = String(programId);
    filters.semester = Number(semester);
    if (academicYear) filters.academicYear = String(academicYear);
    if (examMonthYear) filters.examMonthYear = String(examMonthYear);

    const doc = await ExamSchedule.findOne(filters).sort({ updatedAt: -1 }).lean();
    if (!doc) return res.status(404).json({ error: 'No published schedule found' });
    return res.json(doc);
  } catch (err) {
    console.error('Public fetch error:', err);
    return res.status(500).json({ error: 'Failed to fetch public schedule' });
  }
});

// DRAFT fetch
router.get('/draft', async (req, res) => {
  try {
    const { collegeId, departmentId, programId, semester, academicYear, examMonthYear } = req.query || {};
    const required = [collegeId, departmentId, programId, semester, academicYear, examMonthYear];
    if (required.some((v) => !v)) {
      return res.status(400).json({
        error: 'collegeId, departmentId, programId, semester, academicYear, examMonthYear are required'
      });
    }
    const filters = {
      status: 'DRAFT',
      collegeId: String(collegeId),
      departmentId: String(departmentId),
      programId: String(programId),
      semester: Number(semester),
      academicYear: String(academicYear),
      examMonthYear: String(examMonthYear)
    };
    const doc = await ExamSchedule.findOne(filters).lean();
    if (!doc) return res.status(404).json({ error: 'No draft found' });
    return res.json(doc);
  } catch (err) {
    console.error('Draft fetch error:', err);
    return res.status(500).json({ error: 'Failed to fetch draft' });
  }
});
router.get('/list', async (req, res) => {
  try {
    const {
      collegeId,
      status,           
      departmentId,
      programId,
      semester,
      academicYear,
      examMonthYear
    } = req.query || {};

    const q = {};
    if (collegeId) q.collegeId = String(collegeId);
    if (status) q.status = String(status);
    if (departmentId) q.departmentId = String(departmentId);
    if (programId) q.programId = String(programId);
    if (semester) q.semester = Number(semester);
    if (academicYear) q.academicYear = String(academicYear);
    if (examMonthYear) q.examMonthYear = String(examMonthYear);

    const docs = await ExamSchedule.find(q).sort({ updatedAt: -1 }).lean();
    return res.json(docs);
  } catch (err) {
    console.error('List fetch error:', err);
    return res.status(500).json({ error: 'Failed to list schedules' });
  }
});

// DELETE /api/exam-schedules/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const del = await ExamSchedule.findByIdAndDelete(id);
    if (!del) return res.status(404).json({ error: 'Schedule not found' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('Delete error:', err);
    return res.status(500).json({ error: 'Failed to delete schedule' });
  }
});


module.exports = router;
