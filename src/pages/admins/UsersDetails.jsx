import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box, Paper, Typography, Stack, Grid, TextField, Select, MenuItem, InputLabel,
  FormControl, Button, Chip, Avatar, IconButton, Tooltip, Snackbar, Alert, CircularProgress,Divider
} from '@mui/material';
import {
  Search as SearchIcon,
  RestartAlt as ResetIcon,
  SaveAlt as DownloadIcon,
  ContentCopy as CopyIcon,
  Person as PersonIcon,
  School as SchoolIcon,
  VerifiedUser as VerifiedIcon
} from '@mui/icons-material';
import axios from 'axios';
import { auth, db } from '../../firebase/Firebase';
import { collection, query as fsQuery, where as fsWhere, getDocs, doc, getDoc } from 'firebase/firestore';
import ImageViewer from '../../components/ImageViewer';
import SecondaryHeader from '../../components/secondaryHeader';
import { HeaderBackButton } from '../../components/header';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

//helpers
const neat = (v) => (v == null ? '' : v);
const toArray = (v) => Array.isArray(v) ? v : (v == null ? [] : [v]);
const csvEscape = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
const toCSV = (rows) => {
  const arr = toArray(rows);
  if (!arr.length) return '';
  const headers = Array.from(new Set(arr.flatMap(r => Object.keys(r || {}))));
  const body = arr.map(r => headers.map(h => csvEscape(r?.[h])).join(','));
  return [headers.join(','), ...body].join('\n');
};
const downloadBlob = (content, filename, mime) => {
  const blob = new Blob([content], { type: `${mime};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};
const exportCSV = (rows, name) => downloadBlob(toCSV(rows), `${name}.csv`, 'text/csv');

const normalizeStudentFirebase = (s) => {
  if (!s) return {};
  return {
    firebaseId: s.firebaseId || s.uid || s.id || '',
    email: s.email || '',
    firstName: s.firstName || '',
    lastName: s.lastName || '',
    program: s.program || '',
    programCode: s.programCode || '',
    semester: s.semester ?? '',
    collegeId: s.collegeId || s.college || '',
    collegeName: s.collegeName || '',
    department: s.department || '',
    profilePicUrl: s.profilePicUrl || '',
    role: s.role || 'Student',
    phone: s.phone || '',
    abcId: s.abcId || '',
    gender: s.gender || '',
    dob: s.dob || '',
    raw: s,
  };
};

const TeacherFireData = (t) => {
  if (!t) return {};
  return {
    firebaseId: t.uid || t.id || '',
    teacherId: t.teacherId || '',
    email: t.email || '',
    firstName: t.firstName || '',
    lastName: t.lastName || '',
    collegeId: t.college || '',
    collegeName: t.collegeName || '',
    department: t.department || t.departmentName || '',
    programName: t.program || t.programName || '',
    programCode: t.program || t.programCode || '',
    contactNumber: t.contactNumber != null ? String(t.contactNumber) : (t.phone || ''),
    profilePicUrl: t.profilePicUrl || '',
    role: t.role || 'Teacher',
    subjects: Array.isArray(t.subjects) ? t.subjects : [],
    raw: t,
  };
};

// handles semester
const normalizeTeacherSubjects = (subs) => {
  if (!Array.isArray(subs)) return [];
  return subs.map((s) => {
    let semester = s.semester;
    if (semester == null) {
      const k = Object.keys(s || {}).find(key => /^semester\d*$/i.test(key));
      semester = k ? s[k] : '';
    }
    return {
      semester: semester ?? '',
      subjectId: s.subjectId || s.subjectCode || s.code || '',
      subjectName: s.subjectName || s.name || '',
    };
  }).filter(x => x.semester !== '' || x.subjectId || x.subjectName);
};

// Merge student Firebase + Mongo into a single object
const mergeStudent = (fb, mg) => {
  if (!fb && !mg) return null;
  const fullName = `${neat(fb?.firstName)} ${neat(fb?.lastName)}`.trim();
  return {
    firebaseId: fb?.firebaseId || mg?.firebaseId || '',
    email: fb?.email || '',
    name: fullName || '',
    enrollmentNo: mg?.enrollmentNo || '',
    program: mg?.program || fb?.program || '',
    programCode: fb?.programCode || '',
    semester: mg?.semester ?? fb?.semester ?? '',
    yearOfAdmission: mg?.yearOfAdmission || '',
    department: mg?.department || fb?.department || '',
    collegeName: fb?.collegeName || '',
    collegeId: fb?.collegeId || '',
    phone: fb?.phone || '',
    gender: fb?.gender || '',
    dob: fb?.dob || '',
    abcId: fb?.abcId || '',
    profilePicUrl: fb?.profilePicUrl || '',
  };
};

const UserInspector = () => {
  const [loadingGate, setLoadingGate] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [role, setRole] = useState('Student'); // Student | Teacher
  const [email, setEmail] = useState('');
  const [enrollment, setEnrollment] = useState(''); 
  const [teacherId, setTeacherId] = useState(''); 
  const [busy, setBusy] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const [studentMerged, setStudentMerged] = useState(null);
  const [fbTeacher, setFbTeacher] = useState(null);
  const [imgOpen, setImgOpen] = useState(false);
  const [imgSrc, setImgSrc] = useState('');
  const [imgAlt, setImgAlt] = useState('');
  const [collegeNameCache, setCollegeNameCache] = useState({});

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setIsAdmin(false);
        setLoadingGate(false);
        setSnackbar({ open: true, message: 'Please log in', severity: 'error' });
        return;
      }
      try {
        const aDoc = await getDoc(doc(db, 'Admins', user.uid));
        const ok = aDoc.exists() && String(aDoc.data()?.role || '').toLowerCase() === 'admin';
        setIsAdmin(ok);
        if (!ok) setSnackbar({ open: true, message: 'Unauthorized. Admin role required.', severity: 'error' });
      } catch {
        setIsAdmin(false);
        setSnackbar({ open: true, message: 'Admin check failed', severity: 'error' });
      } finally {
        setLoadingGate(false);
      }
    });
    return () => unsub?.();
  }, []);

  const resetAll = useCallback(() => {
    setEmail('');
    setEnrollment('');
    setTeacherId('');
    setStudentMerged(null);
    setFbTeacher(null);
  }, []);

  const findStudentFirebaseByEmail = useCallback(async (emailVal) => {
    const col = collection(db, 'Students');
    const typed = emailVal.trim();
    const lower = typed.toLowerCase();
    let snap = await getDocs(fsQuery(col, fsWhere('email', '==', typed)));
    if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() };
    if (lower !== typed) {
      snap = await getDocs(fsQuery(col, fsWhere('email', '==', lower)));
      if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() };
    }
    const allSnap = await getDocs(col);
    for (const d of allSnap.docs) {
      const em = String(d.data()?.email || '').trim().toLowerCase();
      if (em === lower) return { id: d.id, ...d.data() };
    }
    return null;
  }, []);

  //Mongo: fetch student by firebaseId
  const findStudentMongoByFirebaseId = useCallback(async (firebaseId) => {
    if (!firebaseId) return null;
    try {
      const resp = await axios.get(`${API_BASE_URL}/api/students/${encodeURIComponent(firebaseId)}`);
      return resp.data || null;
    } catch (e) {
      if (e?.response?.status === 404) return null;
      throw e;
    }
  }, []);

  //Resolve college name by id (for teachers) via /api/colleges
  const resolveCollegeName = useCallback(async (id) => {
    if (!id) return '';
    if (collegeNameCache[id]) return collegeNameCache[id];
    try {
      const resp = await axios.get(`${API_BASE_URL}/api/colleges`);
      const list = Array.isArray(resp.data) ? resp.data : [];
      const found = list.find(c => (c._id || c.id) === id);
      const name = found ? (found.name || found.collegeName || '') : '';
      setCollegeNameCache(prev => ({ ...prev, [id]: name }));
      return name;
    } catch {
      return '';
    }
  }, [collegeNameCache]);

  // Firestore: teacher must match ID and email (case-insensitive)
  const findTeacher = useCallback(async (id, emailVal) => {
    const emailLower = String(emailVal || '').trim().toLowerCase();

    const d = await getDoc(doc(db, 'Teachers', id));
    if (d.exists()) {
      const data = { id: d.id, ...d.data() };
      if (String(data.email || '').trim().toLowerCase() === emailLower) return { data };
      return { error: 'email_mismatch', data };
    }

    let snap = await getDocs(fsQuery(collection(db, 'Teachers'), fsWhere('teacherId', '==', id)));
    if (!snap.empty) {
      const data = { id: snap.docs[0].id, ...snap.docs[0].data() };
      if (String(data.email || '').trim().toLowerCase() === emailLower) return { data };
      return { error: 'email_mismatch', data };
    }

    return { error: 'not_found' };
  }, []);

  const onFetch = useCallback(async () => {
    setSnackbar({ open: false, message: '', severity: 'info' });

    if (role === 'Student') {
      if (!email || !enrollment) {
        setSnackbar({ open: true, message: 'Provide student email and enrollment number', severity: 'warning' });
        return;
      }
    }
    if (role === 'Teacher') {
      if (!email || !teacherId) {
        setSnackbar({ open: true, message: 'Provide teacher email and teacherId', severity: 'warning' });
        return;
      }
    }

    try {
      setBusy(true);

      if (role === 'Student') {
        // Firebase by email
        const fbRaw = await findStudentFirebaseByEmail(email);
        const fb = fbRaw ? normalizeStudentFirebase(fbRaw) : null;
        // Mongo by firebaseId
        let mg = null;
        if (fb?.firebaseId) {
          mg = await findStudentMongoByFirebaseId(fb.firebaseId);
        }

        const merged = mergeStudent(fb, mg);
        setStudentMerged(merged);
        if (!merged) {
          setSnackbar({ open: true, message: 'Student not found in Firebase or MongoDB', severity: 'error' });
        } else {
          if (mg) {
            const mongoEnroll = String(mg.enrollmentNo || '');
            if (mongoEnroll && mongoEnroll !== String(enrollment).trim()) {
              setSnackbar({ open: true, message: 'Enrollment differs from Mongo record', severity: 'warning' });
            } else {
              setSnackbar({ open: true, message: 'Student fetched successfully', severity: 'success' });
            }
          } else {
            setSnackbar({ open: true, message: 'Student fetched (no Mongo record for enrollment check)', severity: 'info' });
          }
        }
      }

      if (role === 'Teacher') {
        const res = await findTeacher(String(teacherId).trim(), email.trim());
        if (res.error === 'not_found') {
          setFbTeacher(null);
          setSnackbar({ open: true, message: 'Teacher not found in Firebase', severity: 'error' });
        } else if (res.error === 'email_mismatch') {
          setFbTeacher(null);
          setSnackbar({ open: true, message: 'Teacher email does not match the provided teacherId', severity: 'error' });
        } else {
          let fb = TeacherFireData(res.data);
          if (!fb.collegeName && fb.collegeId) {
            const name = await resolveCollegeName(fb.collegeId);
            if (name) fb = { ...fb, collegeName: name };
          }

          setFbTeacher(fb);
          setSnackbar({ open: true, message: 'Teacher fetched successfully', severity: 'success' });
        }
      }
    } catch (e) {
      setSnackbar({ open: true, message: e?.message || 'Fetch failed', severity: 'error' });
    } finally {
      setBusy(false);
    }
  }, [role, email, enrollment, teacherId, findStudentFirebaseByEmail, findStudentMongoByFirebaseId, findTeacher, resolveCollegeName]);

  const handleOpenImage = useCallback((src, alt) => {
    setImgSrc(src || '');
    setImgAlt(alt || 'Profile');
    setImgOpen(true);
  }, []);

    const teacherSubjects = useMemo(() => normalizeTeacherSubjects(fbTeacher?.subjects), [fbTeacher]);


  if (loadingGate) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }
  if (!isAdmin) return null;

  return (
    <Box sx={{ p: { xs: 1.5, md: 2.5 }, maxWidth: 1200, mx: 'auto', minHeight: '100vh' }}>
        <SecondaryHeader
          title="User Details"
          leftArea={<><HeaderBackButton/><VerifiedIcon color="primary" /></>}
          rightArea={
            <Tooltip title="reset">
              <IconButton
                color="warning"
                onClick={() => {
                  resetAll();
                  setSnackbar({ open: true, message: 'Form reset', severity: 'info' });
                }}
              >
                <ResetIcon />
              </IconButton>
            </Tooltip>
          }
        elevation={0}
        border
        paperSx={{
          p: 2,
          borderRadius: 2,
          mb: 2,
          border: '1px solid',
          borderColor: 'divider',
          background: 'none',
          bgcolor: 'background.paper',
        }}
      />

      {/* Form */}
      <Paper elevation={1} sx={{ p: 2, borderRadius: 2 }}>
        <Stack spacing={1.25}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Role</InputLabel>
              <Select value={role} label="Role" onChange={(e) => setRole(e.target.value)}>
                <MenuItem value="Student">Student</MenuItem>
                <MenuItem value="Teacher">Teacher</MenuItem>
              </Select>
            </FormControl>

            <TextField
              size="small"
              label={role === 'Student' ? 'Student Email' : 'Teacher Email'}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              sx={{ flex: 1 }}
            />

            {role === 'Student' && (
              <TextField
                size="small"
                label="Enrollment No"
                value={enrollment}
                onChange={(e) => setEnrollment(e.target.value)}
                sx={{ flex: 1 }}
              />
            )}

            {role === 'Teacher' && (
              <TextField
                size="small"
                label="Teacher ID"
                value={teacherId}
                onChange={(e) => setTeacherId(e.target.value)}
                sx={{ flex: 1 }}
              />
            )}

            <Tooltip title="Fetch">
              <span>
                <Button
                  variant="contained"
                  startIcon={busy ? <CircularProgress size={16} /> : <SearchIcon />}
                  onClick={onFetch}
                  disabled={busy}
                >
                  Fetch
                </Button>
              </span>
            </Tooltip>
          </Stack>
        </Stack>
      </Paper>

      {/* Student profile card */}
      {role === 'Student' && studentMerged && (
  <Paper elevation={3} sx={{ p: { xs: 2, md: 3 }, borderRadius: 2, mt: 3 }}>
    {/* Header Section with Profile Info */}
    <Stack direction="row" spacing={3} alignItems="center" sx={{ mb: 2 }}>
      <Avatar
        src={studentMerged.profilePicUrl || ''}
        sx={{ width: 80, height: 80, cursor: studentMerged.profilePicUrl ? 'pointer' : 'default' }}
        onClick={() => studentMerged.profilePicUrl && handleOpenImage(studentMerged.profilePicUrl, studentMerged.name)}
      >
        <SchoolIcon sx={{ fontSize: 48 }} />
      </Avatar>
      <Box sx={{ flex: 1 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5, letterSpacing: '0.05em' }}>
          {studentMerged.name || '(No Name)'}
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 0.5 }}>
          {studentMerged.email}
        </Typography>
        <Chip 
          color="primary" 
          label="Student" 
          size="small" 
          sx={{ fontWeight: 'bold' }} 
        />
      </Box>
    </Stack>

    <Divider sx={{ my: 2 }} />

    {/* Main Details Grid */}
    <Grid container spacing={{ xs: 2, md: 15 }}>
      {/* Column 1 */}
      <Grid item xs={12} sm={6}>
        <Stack spacing={1.5}>
          <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'text.primary' }}>
            Academic Information
          </Typography>
          <Typography variant="body2" color="text.secondary">
            <strong style={{ color: 'text.primary' }}>Enrollment No:</strong> {neat(studentMerged.enrollmentNo)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            <strong style={{ color: 'text.primary' }}>Program:</strong> {neat(studentMerged.program)} {studentMerged.programCode ? `(${studentMerged.programCode})` : ''}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            <strong style={{ color: 'text.primary' }}>Semester:</strong> {neat(studentMerged.semester)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            <strong style={{ color: 'text.primary' }}>Year of Admission:</strong> {neat(studentMerged.yearOfAdmission)}
          </Typography>
        </Stack>
      </Grid>
      
      {/* Column 2 */}
      <Grid item xs={12} sm={6}>
        <Stack spacing={1}>
          <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'text.primary' }}>
            Personal & College Details
          </Typography>
          <Typography variant="body2" color="text.secondary">
            <strong style={{ color: 'text.primary' }}>Firebase ID:</strong> {neat(studentMerged.firebaseId)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            <strong style={{ color: 'text.primary' }}>Department:</strong> {neat(studentMerged.department)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            <strong style={{ color: 'text.primary' }}>College:</strong> {neat(studentMerged.collegeName)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            <strong style={{ color: 'text.primary' }}>College ID:</strong> {neat(studentMerged.collegeId)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            <strong style={{ color: 'text.primary' }}>ABC ID:</strong> {neat(studentMerged.abcId)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            <strong style={{ color: 'text.primary' }}>DOB:</strong> {neat(studentMerged.dob)}
          </Typography>
            <Typography variant="body2" color="text.secondary">
            <strong style={{ color: 'text.primary' }}>Phone:</strong> {neat(studentMerged.phone)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            <strong style={{ color: 'text.primary' }}>Gender:</strong> {neat(studentMerged.gender)}
          </Typography>
        </Stack>
      </Grid>
    </Grid>
    
    <Divider sx={{ my: 2 }} />

    {/* Action Buttons Section */}
    <Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-end">
      <Tooltip title="Copy JSON">
        <IconButton
          size="small"
          onClick={() => {
            const copyObj = { ...studentMerged };
            delete copyObj._firebaseRaw;
            delete copyObj._mongoRaw;
            navigator.clipboard.writeText(JSON.stringify(copyObj, null, 2));
          }}
        >
          <CopyIcon />
        </IconButton>
      </Tooltip>
      <Tooltip title="Download CSV">
        <IconButton
          size="small"
          onClick={() => exportCSV([studentMerged], 'student_profile')}
        >
          <DownloadIcon />
        </IconButton>
      </Tooltip>
    </Stack>
  </Paper>
)}

      {/* Teacher*/}
      {role === 'Teacher' && (
  <Paper elevation={3} sx={{ p: { xs: 2, md: 3 }, borderRadius: 2, mt: 3 }}>
    {/* Header Section with Profile Info */}
    <Stack direction="row" spacing={3} alignItems="center" sx={{ mb: 2 }}>
      <Avatar
        src={fbTeacher?.profilePicUrl || ''}
        sx={{ width: 80, height: 80, cursor: fbTeacher?.profilePicUrl ? 'pointer' : 'default' }}
        onClick={() => fbTeacher?.profilePicUrl && handleOpenImage(fbTeacher.profilePicUrl, `${fbTeacher.firstName || ''} ${fbTeacher.lastName || ''}`)}
      >
        <PersonIcon sx={{ fontSize: 48 }} />
      </Avatar>
      <Box sx={{ flex: 1 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5, letterSpacing: '0.05em' }}>
          {(fbTeacher?.firstName || '') + ' ' + (fbTeacher?.lastName || '')}
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 0.5 }}>
          {fbTeacher?.email || ''}
        </Typography>
        <Chip 
          color="secondary" 
          label="Teacher" 
          size="small" 
          sx={{ fontWeight: 'bold' }} 
        />
      </Box>
    </Stack>

    <Divider sx={{ my: 2 }} />

    {fbTeacher ? (
      <>
        <Grid container spacing={{ xs: 2, md: 3 }}>
          {/* Column 1 */}
          <Grid item xs={12} sm={6}>
            <Stack spacing={1}>
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold', color: 'text.primary' }}>
                Contact & Affiliation
              </Typography>
              <Typography variant="body2" color="text.secondary">
                <strong style={{ color: 'text.primary' }}>Teacher ID:</strong> {neat(fbTeacher.teacherId || fbTeacher.firebaseId)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                <strong style={{ color: 'text.primary' }}>College:</strong> {neat(fbTeacher.collegeName) || '(Name not available)'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                <strong style={{ color: 'text.primary' }}>College ID:</strong> {neat(fbTeacher.collegeId)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                <strong style={{ color: 'text.primary' }}>Department:</strong> {neat(fbTeacher.department)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                <strong style={{ color: 'text.primary' }}>Contact:</strong> {neat(fbTeacher.contactNumber)}
              </Typography>
            </Stack>
          </Grid>
          
          {/* Column 2 */}
          <Grid item xs={12} sm={6}>
            <Stack spacing={1}>
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold', color: 'text.primary' }}>
                Academic Details
              </Typography>
              <Typography variant="body2" color="text.secondary">
                <strong style={{ color: 'text.primary' }}>Program:</strong> {neat(fbTeacher.programName)} {fbTeacher.programCode ? `(${fbTeacher.programCode})` : ''}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                <strong style={{ color: 'text.primary' }}>Assigned Subjects:</strong>
              </Typography>
              {teacherSubjects.length ? (
                <Stack spacing={0.5} sx={{ pl: 2 }}>
                  {teacherSubjects.map((s, idx) => (
                    <Typography key={`${s.subjectId}-${idx}`} variant="body2" color="text.secondary">
                      &bull; Sem {neat(s.semester)} — {neat(s.subjectId)}: {neat(s.subjectName)}
                    </Typography>
                  ))}
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ pl: 2, fontStyle: 'italic' }}>
                  No subjects available.
                </Typography>
              )}
            </Stack>
          </Grid>
        </Grid>
        
        <Divider sx={{ my: 2 }} />

        {/* Action Buttons Section */}
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-end">
          <Tooltip title="Copy JSON">
            <IconButton
              size="small"
              onClick={() => navigator.clipboard.writeText(JSON.stringify(fbTeacher.raw || {}, null, 2))}
            >
              <CopyIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Download CSV">
            <IconButton
              size="small"
              onClick={() => exportCSV([fbTeacher], 'teacher_profile')}
            >
              <DownloadIcon />
            </IconButton>
          </Tooltip>
        </Stack>
      </>
    ) : (
      <Typography variant="body2" color="text.secondary">
        Teacher not found or email does not match the provided teacherId.
      </Typography>
    )}
  </Paper>
)}
      {/* Image Viewer */}
      <ImageViewer
        open={imgOpen}
        src={imgSrc}
        alt={imgAlt}
        onClose={() => setImgOpen(false)}
        centered
        maxWidth="100%"
        maxHeight="100%"
        minWidth={null}
        iMaxHeight="100%"
        top="50%"
        left="50%"
        right=""
        bottom=""
        transform="translate(-50%, -50%)"
        boxShadow={24}
        borderRadius={2}
        padding={4}
        showBackdrop
        showClose
        showDownload={false}
      />

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3800}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert elevation={6} variant="filled" onClose={() => setSnackbar(s => ({ ...s, open: false }))} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default UserInspector;