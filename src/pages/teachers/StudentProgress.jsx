/* eslint-disable no-unused-vars */
import React, { useEffect, useMemo, useState } from 'react';
import { Box, Typography, Card, CardContent, Paper, Stack, Avatar, Button, FormControl, InputLabel, Select, MenuItem, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, CircularProgress, LinearProgress, Snackbar, Alert, Dialog, DialogTitle, DialogContent, IconButton, Tooltip,Grid,alpha,useTheme
} from '@mui/material';
import {
  QueryStats as QueryStatsIcon,
  School as SchoolIcon,
  Refresh as RefreshIcon,
  Info as InfoIcon,
  Close as CloseIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';
import axios from 'axios';
import { auth, db } from '../../firebase/Firebase';
import { collection, query as fsQuery, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { HeaderBackButton } from "../../components/header";
import SecondaryHeader from "../../components/secondaryHeader";
import TeacherHeader from '../../components/TeacherHeader';
import { useAuth } from "../../context/AuthContext";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const gradeFromPercent = (p) => {
  const pct = Number.isFinite(p) ? p : 0;
  if (pct >= 90) return 'A+';
  if (pct >= 80) return 'A';
  if (pct >= 70) return 'B+';
  if (pct >= 60) return 'B';
  if (pct >= 50) return 'C';
  return 'F';
}; 

const matchProgramForTeacher = (list, teacherProgram) => {
  const t = String(teacherProgram || '').trim().toLowerCase();
  return (
    list.find(p => String(p._id || '').trim().toLowerCase() === t) ||
    list.find(p => String(p.code || p.programCode || '').trim().toLowerCase() === t) ||
    list.find(p => String(p.name || p.programName || '').trim().toLowerCase() === t) ||
    null
  );
}; 

const subjectLabel = (s) => s?.subjectName || s?.name || s?.title || 'Subject'; 

// Concurrency helper for per-student requests
async function mapWithConcurrency(items, limit, task) {
  const ret = new Array(items.length);
  let i = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (i < items.length) {
      const idx = i++;
      ret[idx] = await task(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return ret;
} 

const resolveDepartmentId = async (students, teacherCollege, programIdOrCode) => {
  for (const st of students) {
    const d = st?.department;
    if (d && typeof d === 'object' && d._id) return d._id;
    if (d && typeof d === 'string' && d.trim()) return d.trim();
  }
  try {
    const deptRes = await axios.get(`${API_BASE_URL}/api/colleges/${teacherCollege}/departments`);
    const departments = deptRes.data || [];
    for (const dept of departments) {
      const depId = dept._id || dept.id;
      if (!depId) continue;
      const progRes = await axios.get(`${API_BASE_URL}/api/departments/${teacherCollege}/${depId}/programs`);
      const progs = progRes.data || [];
      const found = progs.find(p =>
        String(p._id || '').toLowerCase() === String(programIdOrCode).toLowerCase() ||
        String(p.code || '').toLowerCase() === String(programIdOrCode).toLowerCase() ||
        String(p.programCode || '').toLowerCase() === String(programIdOrCode).toLowerCase()
      );
      if (found) return depId;
    }
  } catch (e) {
    // ignore
  }
  return '';
}; 

// ---------- Component ----------
const TeacherStudentTracker = () => {
  const { userDetails, role, loading: authLoading } = useAuth();
  const [teacher, setTeacher] = useState(null);
  const [programDoc, setProgramDoc] = useState(null);
  // Filters
  const [semesters, setSemesters] = useState([]);
  const [selectedSemester, setSelectedSemester] = useState('');
  const [subjects, setSubjects] = useState([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState(''); 
  // Data holders
  const [students, setStudents] = useState([]);
  const [departmentId, setDepartmentId] = useState('');
  const [attendanceMap, setAttendanceMap] = useState({});
  const [assignmentsMap, setAssignmentsMap] = useState({});
  const [assignmentMarksMap, setAssignmentMarksMap] = useState({});
  const [resultsTotals, setResultsTotals] = useState({}); 
  // UI
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [detailDialog, setDetailDialog] = useState({ open: false, student: null }); 
  const theme = useTheme();
  // Bootstrap teacher + program
  
    useEffect(() => {
    const load = async () => {
    if (authLoading) return;
    if (!userDetails || role !== "Teacher") {
    setSnackbar({ open: true, message: "Access restricted to teachers only.", severity: "error" });
    return;
    }
    const info = {
    uid: userDetails.uid || userDetails.firebaseId,
    firstName: userDetails.firstName,
    lastName: userDetails.lastName,
    college: userDetails.college,
    program: userDetails.program,
    };
    setTeacher(info);
    try {
      const progResp = await axios.get(`${API_BASE_URL}/api/programs`);
      const allProgs = progResp.data || [];
      const match = matchProgramForTeacher(allProgs, info.program);
      if (!match?._id) {
        setSnackbar({ open: true, message: `Program "${info.program}" not found in catalog.`, severity: "warning" });
        return;
      }
      setProgramDoc(match);
    } catch (err) {
      console.error(err);
      setSnackbar({ open: true, message: "Failed to load program catalog.", severity: "error" });
    }
    };
    load();
    }, [authLoading, userDetails, role]);

  // Load semesters
  useEffect(() => {
    const loadSemesters = async () => {
      setSemesters([]);
      setSelectedSemester('');
      setSubjects([]);
      setSelectedSubjectId('');
      if (!programDoc?._id) return;
      try {
        const resp = await axios.get(`${API_BASE_URL}/api/programs/${programDoc._id}/semesters`);
        setSemesters(resp.data || []);
      } catch (err) {
        console.error(err);
        setSnackbar({ open: true, message: 'Failed to load semesters.', severity: 'error' });
      }
    };
    loadSemesters();
  }, [programDoc]);

  // Load subjects
  useEffect(() => {
    const loadSubjects = async () => {
      setSubjects([]);
      setSelectedSubjectId('');
      if (!programDoc?._id || !selectedSemester) return;
      try {
        const resp = await axios.get(`${API_BASE_URL}/api/programs/${programDoc._id}/semesters/${selectedSemester}/subjects`);
        setSubjects(resp.data || []);
      } catch (err) {
        console.error(err);
        setSnackbar({ open: true, message: 'Failed to load subjects.', severity: 'error' });
      }
    };
    loadSubjects();
  }, [programDoc, selectedSemester]); 

  const canLoad = Boolean(teacher?.college && programDoc?._id && selectedSemester); 

  const handleLoad = async () => {
    if (!canLoad) {
      setSnackbar({ open: true, message: 'Select a semester.', severity: 'warning' });
      return;
    }
    setLoading(true);
    setLoadingStep('Loading class roster…');
    try {
      // Firestore Students: scope by college + role
      const qFb = fsQuery(
        collection(db, 'Students'),
        where('collegeId', '==', teacher.college),
        where('role', '==', 'Student')
      );
      const fbSnap = await getDocs(qFb);
      const fbProfiles = fbSnap.docs.map(d => ({
        firebaseId: d.data().firebaseId,
        firstName: d.data().firstName,
        lastName: d.data().lastName,
        email: d.data().email,
        profilePicUrl: d.data().profilePicUrl || '',
        collegeName: d.data().collegeName || '',
        collegeId: d.data().collegeId,
        enrollmentNo: d.data().enrollmentNo || d.data().EnrollmentNo || '',
        program: d.data().program || '',
        semester: d.data().semester ?? d.data().Semester ?? '',
        department: d.data().department || null,
      })); 

      // Resolve program code string for code-based collections
      const programCode = String(
        teacher.program || programDoc?.code || programDoc?.programCode || programDoc?._id
      ).trim(); 

      //2. Cross-ref mongo by code+semester
      setLoadingStep('Cross-referencing students…');
      const crossResp = await axios.post(`${API_BASE_URL}/api/attendance/get-students`, {
        teacherCollege: teacher.college,
        teacherProgram: programCode,
        selectedSemester: String(selectedSemester),
        firebaseStudents: fbProfiles,
      });
      const final = crossResp.data?.students || [];
      setStudents(final);
      if (!final.length) {
        setDepartmentId('');
        setAttendanceMap({});
        setAssignmentsMap({});
        setAssignmentMarksMap({});
        setResultsTotals({});
        setSnackbar({ open: true, message: 'No students found for this class.', severity: 'info' });
        setLoading(false);
        setLoadingStep('');
        return;
      } 

      //4 Robust department id
      setLoadingStep('Resolving department…');
      const dept = await resolveDepartmentId(final, teacher.college, programDoc._id);
      setDepartmentId(dept); 

      // 5 Results: subject-aware aggregation
      setLoadingStep('Calculating results…');
      let totals = {};
      try {
        if (dept) {
          const ovRes = await axios.get(`${API_BASE_URL}/api/results/overview`, {
            params: {
              collegeId: teacher.college,
              departmentId: dept,
              programId: programDoc._id,
              semester: String(selectedSemester),
            },
          });
          const marks = ovRes.data?.marks || {};
          if (selectedSubjectId) {
            // Only the selected subject
            for (const [sid, subMap] of Object.entries(marks)) {
              const comp = (subMap && subMap[selectedSubjectId]) || {};
              let obtained = 0, max = 0;
              for (const k of Object.keys(comp)) {
                const v = comp[k] || {};
                const o = Number(v.obtained);
                const m = Number(v.max);
                if (Number.isFinite(o)) obtained += o;
                if (Number.isFinite(m)) max += m;
              }
              const percent = max ? (obtained / max) * 100 : 0;
              totals[sid] = { obtained, max, percent, grade: gradeFromPercent(percent) };
            }
          } else {
            // Overall across all subjects
            for (const [sid, subMap] of Object.entries(marks)) {
              let obtained = 0, max = 0;
              for (const subjId of Object.keys(subMap || {})) {
                const comp = subMap[subjId] || {};
                for (const k of Object.keys(comp)) {
                  const v = comp[k] || {};
                  const o = Number(v.obtained);
                  const m = Number(v.max);
                  if (Number.isFinite(o)) obtained += o;
                  if (Number.isFinite(m)) max += m;
                }
              }
              const percent = max ? (obtained / max) * 100 : 0;
              totals[sid] = { obtained, max, percent, grade: gradeFromPercent(percent) };
            }
          }
        }
      } catch {
        totals = {};
      }

      // Results fallback to student-marks when needed
      if (!Object.keys(totals).length) {
        const programPrefList = [programDoc._id, programCode].filter(Boolean);
        if (selectedSubjectId) {
          // Subject-only fallback
          for (const prog of programPrefList) {
            try {
              const r = await axios.get(`${API_BASE_URL}/api/results/student-marks`, {
                params: {
                  collegeId: teacher.college,
                  program: prog,
                  semester: String(selectedSemester),
                  subject: selectedSubjectId,
                },
              });
              const sm = r.data?.studentMarks || {};
              const perStudent = {};
              for (const [sid, comps] of Object.entries(sm)) {
                let obtained = 0, max = 0;
                for (const k of Object.keys(comps || {})) {
                  const v = comps[k] || {};
                  const o = Number(v.obtained);
                  const m = Number(v.max);
                  if (Number.isFinite(o)) obtained += o;
                  if (Number.isFinite(m)) max += m;
                }
                const percent = max ? (obtained / max) * 100 : 0;
                perStudent[sid] = { obtained, max, percent, grade: gradeFromPercent(percent) };
              }
              if (Object.keys(perStudent).length) {
                totals = perStudent;
                break;
              }
            } catch {
              // try next program key
            }
          }
        } else {
          // Overall fallback across all subjects
          const subjectIds = subjects.map(s => s._id);
          const perStudent = {};
          for (const s of final) perStudent[String(s._id)] = { obtained: 0, max: 0 };
          for (const sid of subjectIds) {
            let sm = {};
            for (const prog of programPrefList) {
              try {
                const r1 = await axios.get(`${API_BASE_URL}/api/results/student-marks`, {
                  params: {
                    collegeId: teacher.college,
                    program: prog,
                    semester: String(selectedSemester),
                    subject: sid,
                  },
                });
                sm = r1.data?.studentMarks || {};
                if (Object.keys(sm).length) break;
              } catch {
                sm = {};
              }
            }
            for (const [stuId, comps] of Object.entries(sm)) {
              const entry = perStudent[stuId];
              if (!entry) continue;
              for (const k of Object.keys(comps || {})) {
                const v = comps[k] || {};
                const o = Number(v.obtained);
                const m = Number(v.max);
                if (Number.isFinite(o)) entry.obtained += o;
                if (Number.isFinite(m)) entry.max += m;
              }
            }
          }
          for (const [stuId, agg] of Object.entries(perStudent)) {
            const percent = agg.max ? (agg.obtained / agg.max) * 100 : 0;
            totals[stuId] = { obtained: agg.obtained, max: agg.max, percent, grade: gradeFromPercent(percent) };
          }
        }
      }
      setResultsTotals(totals); 

      // 4) Attendance: subject-aware
      setLoadingStep('Aggregating attendance…');
      if (selectedSubjectId) {
        // Subject-specific: aggregate via sessions API
        const attParams = {
          collegeId: teacher.college,
          program: programCode,
          semester: String(selectedSemester),
          subject: selectedSubjectId,
          page: 1,
          limit: 2000,
        };
        const attResp = await axios.get(`${API_BASE_URL}/api/attendance/records`, { params: attParams });
        const records = attResp.data?.records || [];
        const attMap = {};
        for (const s of final) attMap[s.firebaseId] = { attended: 0, total: 0, percent: 0 };
        for (const rec of records) {
          const list = rec.studentsAttendance || rec.students || [];
          for (const sa of list) {
            const fid = sa.firebaseId;
            if (!fid || !(fid in attMap)) continue;
            attMap[fid].total += 1;
            if (sa.status === 'Present' || sa.present === true) attMap[fid].attended += 1;
          }
        }
        Object.values(attMap).forEach(v => { v.percent = v.total ? (v.attended / v.total) * 100 : 0; });
        setAttendanceMap(attMap);
      } else {
        // Overall: use per-student semester endpoint
        const attendanceEntries = await mapWithConcurrency(final, 8, async (stu) => {
          const fid = stu.firebaseId;
          try {
            const res = await axios.get(`${API_BASE_URL}/api/attendance/student/${fid}/semester/${String(selectedSemester)}`);
            const overall = res.data?.overallStats || {};
            const total = Number(overall.totalClasses || 0);
            const present = Number(overall.totalPresent || 0);
            const pct = total ? (present / total) * 100 : 0;
            return [fid, { attended: present, total, percent: pct }];
          } catch {
            try {
              const res2 = await axios.get(`${API_BASE_URL}/api/attendance/student/${fid}`);
              const overall = res2.data?.overallStats || {};
              const total = Number(overall.totalClasses || 0);
              const present = Number(overall.totalPresent || 0);
              const pct = total ? (present / total) * 100 : 0;
              return [fid, { attended: present, total, percent: pct }];
            } catch {
              return [fid, { attended: 0, total: 0, percent: 0 }];
            }
          }
        });
        const attMap = {};
        attendanceEntries.forEach(([fid, v]) => { attMap[fid] = v; });
        setAttendanceMap(attMap);
      } 

      // 5) Assignments: completion + graded marks; respect subject filter
      setLoadingStep('Computing assignments…');
      const aBase = [
        where('collegeId', '==', teacher.college),
        where('program', '==', programCode),
        where('semester', '==', Number(selectedSemester)),
      ];
      let aQueryRef = fsQuery(collection(db, 'assignments'), ...aBase, where('status', '==', 'active'));
      if (selectedSubjectId) {
        aQueryRef = fsQuery(
          collection(db, 'assignments'),
          ...aBase,
          where('subjectId', '==', selectedSubjectId),
          where('status', '==', 'active')
        );
      }
      const aSnap = await getDocs(aQueryRef);
      const assignments = aSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const totalAssignments = assignments.length;

      // Submissions; filter subjectId when set
      let sQueryRef = fsQuery(
        collection(db, 'submissions'),
        where('collegeId', '==', teacher.college),
        where('program', '==', programCode),
        where('semester', '==', String(selectedSemester))
      );
      if (selectedSubjectId) {
        sQueryRef = fsQuery(
          collection(db, 'submissions'),
          where('collegeId', '==', teacher.college),
          where('program', '==', programCode),
          where('semester', '==', String(selectedSemester)),
          where('subjectId', '==', selectedSubjectId)
        );
      }
      const sSnap = await getDocs(sQueryRef);

      const completionByStudent = {};
      const marksByStudent = {};
      for (const s of final) {
        completionByStudent[s.firebaseId] = 0;
        marksByStudent[s.firebaseId] = { obtained: 0, max: 0 };
      }
      sSnap.docs.forEach(docSnap => {
        const d = docSnap.data();
        const fid = d.studentFirebaseId;
        if (!fid || !(fid in completionByStudent)) return;
        completionByStudent[fid] += 1;
        const max = Number(d.maxMarks || 0);
        const obtained = d.status === 'graded' ? Number(d.obtainedMarks || 0) : 0;
        marksByStudent[fid].max += max;
        marksByStudent[fid].obtained += obtained;
      });

      const asgMap = {};
      const asgMarksMap = {};
      for (const s of final) {
        const fid = s.firebaseId;
        const completed = completionByStudent[fid] || 0;
        const percent = totalAssignments ? (completed / totalAssignments) * 100 : 0;
        asgMap[fid] = { completed, total: totalAssignments, percent };

        const mk = marksByStudent[fid] || { obtained: 0, max: 0 };
        const mPct = mk.max ? (mk.obtained / mk.max) * 100 : 0;
        asgMarksMap[fid] = { obtained: mk.obtained, max: mk.max, percent: mPct };
      }
      setAssignmentsMap(asgMap);
      setAssignmentMarksMap(asgMarksMap); 

      setSnackbar({ open: true, message: `Loaded ${final.length} students.`, severity: 'success' });
    } catch (err) {
      console.error(err);
      setSnackbar({ open: true, message: err?.response?.data?.error || 'Failed to load data.', severity: 'error' });
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  }; 

  // Derived rows
  const rows = useMemo(() => {
    return students.map((s) => {
      const att = attendanceMap[s.firebaseId] || { attended: 0, total: 0, percent: 0 };
      const asg = assignmentsMap[s.firebaseId] || { completed: 0, total: 0, percent: 0 };
      const asgMarks = assignmentMarksMap[s.firebaseId] || { obtained: 0, max: 0, percent: 0 };
      const res = resultsTotals[String(s._id)] || { obtained: 0, max: 0, percent: 0, grade: 'N/A' };
      return { s, att, asg, asgMarks, res };
    });
  }, [students, attendanceMap, assignmentsMap, assignmentMarksMap, resultsTotals]); 

  // KPIs
  const avgAttendance = useMemo(() => {
    const arr = rows.map(r => r.att.percent).filter(Number.isFinite);
    return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  }, [rows]);
  const avgResults = useMemo(() => {
    const arr = rows.map(r => r.res.percent).filter(Number.isFinite);
    return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  }, [rows]);
  const avgAssignments = useMemo(() => {
    const arr = rows.map(r => r.asg.percent).filter(Number.isFinite);
    return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  }, [rows]); 

  // Guards
  if (authLoading || !teacher) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
        <CircularProgress />
        <Typography>Loading teacher data…</Typography>
      </Box>
    );
  } 
  if (!teacher || !programDoc) {
    return (
      <Box sx={{ p: 3, minHeight:"100vh", minWidth:"100vw" }}>
        <CircularProgress />
        <Typography>Loading teacher data…</Typography>
      </Box>
    );
  } 

  // Render
  return (
    <Box sx={{ p: 3, maxWidth: 1400, mx: 'auto', minHeight: '100vh' }}>
      <SecondaryHeader
        title="Student Progress Tracker"
        leftArea={<><HeaderBackButton/><QueryStatsIcon fontSize="large" /></>}
      />

      {/* Teacher header */}
       <TeacherHeader sx={{background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 1)}, ${alpha(theme.palette.secondary.main, 0.4)})`,}}
            />

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Class Selection</Typography>
          <Grid container spacing={2}>
            <Grid xs={12} md={4}>
              <FormControl fullWidth size="small">
                <InputLabel>Program</InputLabel>
                <Select value={programDoc._id} label="Program" disabled sx={{ minHeight: 40 }}>
                  <MenuItem value={programDoc._id}>
                    {programDoc.name || programDoc.programName || programDoc.code || programDoc.programCode || programDoc._id}
                  </MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid xs={12} md={4}>
              <FormControl fullWidth size="small" disabled={!programDoc?._id}>
                <InputLabel>Semester</InputLabel>
                <Select
                  value={selectedSemester}
                  label="Semester"
                  onChange={(e) => {
                    setSelectedSemester(e.target.value);
                    setSubjects([]);
                    setSelectedSubjectId('');
                    setStudents([]);
                    setDepartmentId('');
                    setAttendanceMap({});
                    setAssignmentsMap({});
                    setAssignmentMarksMap({});
                    setResultsTotals({});
                  }}
                  sx={{ minHeight: 40, minWidth: 110 }}
                >
                  {(semesters || [])
                    .slice()
                    .sort((a, b) => (a.semesterNumber || 0) - (b.semesterNumber || 0))
                    .map((s) => (
                      <MenuItem key={s.semesterNumber} value={s.semesterNumber}>
                        Semester {s.semesterNumber}
                      </MenuItem>
                    ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid xs={12} md={4}>
              <FormControl fullWidth size="small" disabled={!selectedSemester}>
                <InputLabel>Subject (optional)</InputLabel>
                <Select
                  value={selectedSubjectId}
                  label="Subject (optional)"
                  onChange={(e) => setSelectedSubjectId(e.target.value)}
                  sx={{ minHeight: 40, minWidth: 100 }}
                >
                  <MenuItem value="">All Subjects</MenuItem>
                  {subjects.map((s) => (
                    <MenuItem key={s._id} value={s._id}>
                      {subjectLabel(s)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid xs={12}>
              <Button
                variant="contained"
                startIcon={loading ? <CircularProgress size={18} /> : <RefreshIcon />}
                disabled={!selectedSemester || loading}
                onClick={handleLoad}
                fullWidth
                sx={{ height: 48 }}
              >
                {loading ? (loadingStep || 'Loading…') : 'Load Students'}
              </Button>
              {loading && (
                <Box sx={{ mt: 2 }}>
                  <LinearProgress />
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    {loadingStep || 'Working…'}
                  </Typography>
                </Box>
              )}
            </Grid>
          </Grid>
        </CardContent>
      </Card>
      
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid xs={12} md={4}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2" color="text.secondary">Average Attendance</Typography>
            <Typography variant="h5" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {avgAttendance.toFixed(1)}%
              <Chip
                size="small"
                label={avgAttendance >= 75 ? 'Good' : avgAttendance >= 45 ? 'Watch' : 'Low'}
                color={avgAttendance >= 75 ? 'success' : avgAttendance >= 45 ? 'warning' : 'error'}
              />
            </Typography>
          </Paper>
        </Grid>
        <Grid xs={12} md={4}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2" color="text.secondary">Average Results</Typography>
            <Typography variant="h5">{avgResults.toFixed(1)}%</Typography>
          </Paper>
        </Grid>
        <Grid xs={12} md={4}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2" color="text.secondary">Average Assignments</Typography>
            <Typography variant="h5">{avgAssignments.toFixed(1)}%</Typography>
          </Paper>
        </Grid>
      </Grid> 

      {/* Table */}
      <TableContainer component={Paper} sx={{ mb: 3 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Student</TableCell>
              <TableCell>Enrollment</TableCell>
              <TableCell align="center">Attendance</TableCell>
              <TableCell align="center">Overall Result</TableCell>
              <TableCell align="center">Grade</TableCell>
              <TableCell align="center">Assignments</TableCell>
              <TableCell align="center">Assign. Marks</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map(({ s, att, asg, asgMarks, res }) => (
              <TableRow key={s._id || s.firebaseId} hover>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Avatar src={s.profilePicUrl || ''}>{s.firstName?.[0]}</Avatar>
                    <Box>
                      <Typography fontWeight="bold">
                        {s.firstName} {s.lastName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">{s.email}</Typography>
                    </Box>
                  </Box>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" fontWeight="medium">{s.enrollmentNo}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {s.department?.departmentName || '—'}
                  </Typography>
                </TableCell>
                <TableCell align="center">
                  <Typography
                    variant="body2"
                    fontWeight="bold"
                    color={att.percent >= 75 ? 'success.main' : att.percent >= 45 ? 'warning.main' : 'error.main'}
                  >
                    {Number.isFinite(att.percent) ? att.percent.toFixed(1) : '0.0'}%
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    ({att.attended}/{att.total})
                  </Typography>
                </TableCell>
                <TableCell align="center">
                  <Typography variant="body2" fontWeight="bold">
                    {Number.isFinite(res.percent) ? res.percent.toFixed(1) : '0.0'}%
                  </Typography>
                </TableCell>
                <TableCell align="center">
                  <Chip size="small" label={res.grade || 'N/A'} />
                </TableCell>
                <TableCell align="center">
                  <Typography variant="body2" fontWeight="bold">
                    {Number.isFinite(asg.percent) ? asg.percent.toFixed(1) : '0.0'}%
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    ({asg.completed}/{asg.total})
                  </Typography>
                </TableCell>
                <TableCell align="center">
                  <Typography variant="body2" fontWeight="bold">
                    {Number.isFinite(asgMarks.percent) ? asgMarks.percent.toFixed(1) : '0.0'}%
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    ({asgMarks.obtained}/{asgMarks.max})
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Details">
                    <IconButton onClick={() => setDetailDialog({ open: true, student: s })}><InfoIcon /></IconButton>
                  </Tooltip>
                  <Tooltip title="Download Summary">
                    <IconButton
                      component="a"
                      href={`data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify({
                        student: s,
                        attendance: att,
                        results: res,
                        assignmentsCompletion: asg,
                        assignmentsMarks: asgMarks,
                        generatedAt: new Date().toISOString(),
                      }, null, 2))}`}
                      download={`${s.enrollmentNo || 'student'}_summary.json`}
                    >
                      <DownloadIcon />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={8}>
                  <Typography align="center" color="text.secondary" sx={{ py: 3 }}>
                    No data to display.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer> 

      {/* Detail dialog */}
      <Dialog open={detailDialog.open} onClose={() => setDetailDialog({ open: false, student: null })} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          Student Details
          <IconButton onClick={() => setDetailDialog({ open: false, student: null })}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {detailDialog.student ? (
            <Stack spacing={1.5}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Avatar src={detailDialog.student.profilePicUrl || ''} sx={{ width: 56, height: 56 }}>
                  {detailDialog.student.firstName?.[0]}
                </Avatar>
                <Box>
                  <Typography variant="h6">
                    {detailDialog.student.firstName} {detailDialog.student.lastName}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">{detailDialog.student.email}</Typography>
                </Box>
              </Box>
              <Grid container spacing={2}>
                <Grid xs={6}>
                  <Typography variant="caption" color="text.secondary">Enrollment</Typography>
                  <Typography variant="body2" fontWeight="bold">{detailDialog.student.enrollmentNo}</Typography>
                </Grid>
                <Grid xs={6}>
                  <Typography variant="caption" color="text.secondary">Department</Typography>
                  <Typography variant="body2" fontWeight="bold">{detailDialog.student?.department?.departmentName || '—'}</Typography>
                </Grid>
              </Grid>
            </Stack>
          ) : (
            <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>
          )}
        </DialogContent>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert
          elevation={6}
          variant="filled"
          onClose={() => setSnackbar(s => ({ ...s, open: false }))}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default TeacherStudentTracker;
