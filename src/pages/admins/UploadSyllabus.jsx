/* eslint-disable no-unused-vars */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Box, Container, Typography, Alert, Card, CardContent, Button, Grid, Stack, TextField,
  Chip, InputAdornment, Divider, Skeleton, Dialog, DialogContent, alpha,
  DialogTitle, IconButton, useMediaQuery, useTheme, Paper, Tabs, Tab, Select, MenuItem
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DownloadIcon from '@mui/icons-material/Download';
import CloseIcon from '@mui/icons-material/Close';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import SaveIcon from '@mui/icons-material/Save';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { getAuth } from 'firebase/auth';
import { db, storage } from '../../firebase/Firebase';
import {
  collection, query, where, getDocs, addDoc, setDoc, doc, getDoc, serverTimestamp
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import SecondaryHeader from '../../components/secondaryHeader';
import { HeaderBackButton } from '../../components/header';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// Helpers
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const toInt = (v) => {
  const n = Number(v);
  if (Number.isFinite(n)) return n;
  const parsed = parseInt(String(v ?? '').replace(/\D/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
};
const sanitizeName = (s) => String(s || '').replace(/[^a-zA-Z0-9._-]/g, '_');
const computeDefaultAY = () => {
  const now = new Date();
  const y = now.getFullYear();
  return `${y}-${y + 1}`;
};

export default function SyllabusManager() {
  const theme = useTheme();
  const auth = getAuth();
  const [admin, setAdmin] = useState(null);
  const [authError, setAuthError] = useState('');
  // Catalog data
  const [departments, setDepartments] = useState([]);
  const [activeDeptId, setActiveDeptId] = useState('');
  const [programsByDept, setProgramsByDept] = useState({});
  const [semestersByProgram, setSemestersByProgram] = useState({});
  const [academicYear, setAcademicYear] = useState(computeDefaultAY());
  // Upload dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState('NEW'); // NEW or UPDATE
  const [editDocId, setEditDocId] = useState(null);
  const [selForUpload, setSelForUpload] = useState({ deptId: '', programId: '', semester: '' });
  const [draftStatus, setDraftStatus] = useState('PUBLISHED');
  // File upload
  const [file, setFile] = useState(null);
  const [previewURL, setPreviewURL] = useState('');
  // Existing syllabuses
  const [loading, setLoading] = useState(true);
  const [inlineMsg, setInlineMsg] = useState('');
  const [search, setSearch] = useState('');
  const [groupedView, setGroupedView] = useState({});
  const [viewerUrl, setViewerUrl] = useState('');
  const [busy, setBusy] = useState(false);

  // Auth headers
  const getAuthHeaders = useCallback(async () => {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    const user = auth.currentUser;
    if (user) headers['Authorization'] = `Bearer ${await user.getIdToken()}`;
    return headers;
  }, [auth]);

  // load depts/programs/semesters
  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        setInlineMsg('');
        setAuthError('');

        const user = auth.currentUser;
        if (!user) {
          setAuthError('Not authenticated. Please login.');
          setLoading(false);
          return;
        }

        // Checking admin role
        const aSnap = await getDoc(doc(db, 'Admins', user.uid));
        if (!aSnap.exists()) {
          setAuthError('Admin profile not found.');
          setLoading(false);
          return;
        }
        const aData = aSnap.data();
        if (String(aData.role).toLowerCase() !== 'admin') {
          setAuthError('Insufficient permissions. Admin access required.');
          setLoading(false);
          return;
        }
        setAdmin({ uid: user.uid, ...aData });

        // Load departments
        const deptRes = await axios.get(`${API_BASE_URL}/api/departments`, { headers: await getAuthHeaders() });
        const depts = Array.isArray(deptRes.data) ? deptRes.data : [];
        setDepartments(depts);
        if (depts.length > 0) setActiveDeptId(depts[0]._id || depts[0].id || '');

        // Programs and semesters
        const progMap = {};
        const semMap = {};
        for (const d of depts) {
          const deptId = d._id || d.id;
          try {
            const progRes = await axios.get(`${API_BASE_URL}/api/departments/${deptId}/programs`, { headers: await getAuthHeaders() });
            const progs = Array.isArray(progRes.data) ? progRes.data : [];
            progMap[deptId] = progs;

            for (const p of progs) {
              const pid = p._id || p.id;
              try {
                const semRes = await axios.get(`${API_BASE_URL}/api/programs/${pid}/semesters`, { headers: await getAuthHeaders() });
                const sems = Array.isArray(semRes.data) ? semRes.data : [];
                semMap[pid] = sems
                  .map((s) => s.semesterNumber ?? s.semester ?? s.number)
                  .filter((n) => Number.isFinite(n))
                  .sort((a, b) => a - b);
              } catch {
                semMap[pid] = [];
              }
            }
          } catch {
            progMap[deptId] = [];
          }
        }
        setProgramsByDept(progMap);
        setSemestersByProgram(semMap);
      } catch (err) {
        console.error('init failed', err);
        setInlineMsg('Failed to initialize. Please check network and permissions.');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [API_BASE_URL, getAuthHeaders, auth]);

  //grouped syllabus view
  const buildGroupedView = useCallback(async () => {
    if (!departments.length) {
      setGroupedView({});
      return;
    }
    try {
      setLoading(true);
      const colRef = collection(db, 'Syllabus');
      const qRef = query(colRef, where('academicYear', '==', String(academicYear)));
      const snap = await getDocs(qRef);
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const byProgramSem = new Map();
      rows.forEach((it) => {
        const key = `${String(it.programId)}__${toInt(it.semester)}`;
        if (!byProgramSem.has(key)) byProgramSem.set(key, it);
        else {
          const prev = byProgramSem.get(key);
          const ta = it.updatedAt?.toMillis ? it.updatedAt.toMillis() : 0;
          const tb = prev.updatedAt?.toMillis ? prev.updatedAt.toMillis() : 0;
          if (ta > tb) byProgramSem.set(key, it);
        }
      });

      const grouped = {};
      for (const d of departments) {
        const deptId = d._id || d.id;
        const deptName = d.departmentName || d.name || deptId;
        const progs = programsByDept[deptId] || [];
        const gProgs = {};
        for (const p of progs) {
          const pid = p._id || p.id;
          const pname = p.programName || p.name || pid;
          const sems = semestersByProgram[pid] || [];
          const bySem = {};
          sems.forEach((s) => {
            const key = `${String(pid)}__${Number(s)}`;
            bySem[s] = byProgramSem.get(key) || null;
          });
          gProgs[pid] = { programName: pname, bySemester: bySem };
        }
        grouped[deptId] = { departmentName: deptName, programs: gProgs };
      }
      setGroupedView(grouped);
    } catch (err) {
      console.error('buildGroupedView failed', err);
      setInlineMsg('Failed to load syllabuses.');
    } finally {
      setLoading(false);
    }
  }, [departments, programsByDept, semestersByProgram, academicYear]);

  useEffect(() => {
    buildGroupedView();
  }, [buildGroupedView]);

  // File choose
  const onChooseFile = (e) => {
    const f = e.target.files?.[0] || null;
    if (!f) return;
    if ((f.type || '') !== 'application/pdf') {
      setInlineMsg('Please select a PDF file.');
      setFile(null);
      setPreviewURL('');
      return;
    }
    setInlineMsg('');
    setFile(f);
    setPreviewURL(URL.createObjectURL(f));
  };

  const uploadToStorage = async (collegeId, programIdLocal, semesterLocal) => {
    const safe = sanitizeName(file.name);
    const path = `syllabuses/${collegeId}/${programIdLocal}/sem-${toInt(semesterLocal)}/${Date.now()}_${safe}`;
    const storageRef = ref(storage, path);
    const snap = await uploadBytes(storageRef, file, { contentType: 'application/pdf' });
    const url = await getDownloadURL(snap.ref);
    return { path, url, fileName: file.name, mimeType: 'application/pdf', size: file.size };
  };

  const handleOpenUpload = (deptId, programIdLocal, semesterLocal, existingDoc = null) => {
    setSelForUpload({ deptId, programId: programIdLocal, semester: semesterLocal });
    setFile(null);

    if (existingDoc) {
      setDialogMode('UPDATE');
      setEditDocId(existingDoc.id);
      setAcademicYear(existingDoc.academicYear || academicYear);
      setDraftStatus(existingDoc.status || 'DRAFT');
      setPreviewURL(existingDoc.storage?.url || '');
    } else {
      setDialogMode('NEW');
      setEditDocId(null);
      setDraftStatus('DRAFT');
      setPreviewURL('');
    }
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    try {
      setBusy(true);
      setInlineMsg('');
      const { deptId, programId, semester } = selForUpload;
      const collegeId = 'C000';
      if (!collegeId || !deptId || !programId || !semester || !academicYear) {
        setInlineMsg('Missing info.');
        return;
      }

      let storageInfo = null;
      if (file) storageInfo = await uploadToStorage(collegeId, programId, semester);

      const prog = (programsByDept[deptId] || []).find((p) => String(p._id || p.id) === String(programId));
      const payload = {
        collegeId,
        departmentId: deptId,
        programId: String(programId),
        programName: prog?.programName || prog?.name || '',
        semester: toInt(semester),
        academicYear: String(academicYear),
        status: draftStatus,
        type: 'pdf',
        title: `${prog?.programName || prog?.name || 'Program'} • Sem ${toInt(semester)} • ${academicYear}`,
        uploadedBy: auth.currentUser?.uid || '',
        updatedAt: serverTimestamp(),
        ...(file && { storage: storageInfo })
      };

      if (dialogMode === 'NEW') {
        const colRef = collection(db, 'Syllabus');
        payload.uploadedAt = serverTimestamp();
        await addDoc(colRef, payload);
      } else if (dialogMode === 'UPDATE' && editDocId) {
        const docRef = doc(db, 'Syllabus', editDocId);
        await setDoc(docRef, payload, { merge: true });
      }

      setDialogOpen(false);
      setFile(null);
      setPreviewURL('');
      await buildGroupedView();
      setInlineMsg(draftStatus === 'PUBLISHED' ? 'Syllabus published.' : 'Draft saved.');
    } catch (err) {
      console.error('handleSubmit failed', err);
      setInlineMsg('Failed to upload/update.');
    } finally {
      setBusy(false);
    }
  };

  const programsForActiveDept = useMemo(() => programsByDept[activeDeptId] || [], [programsByDept, activeDeptId]);
  const filteredProgramsForActiveDept = useMemo(() => {
    const q = clean(search).toLowerCase();
    if (!q) return programsForActiveDept;
    return programsForActiveDept.filter((p) =>
      String(p.programName || p.name || '').toLowerCase().includes(q)
    );
  }, [programsForActiveDept, search]);

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>

      <SecondaryHeader
                title="Admin • Syllabus Manager"
                leftArea={<HeaderBackButton />}
                rightArea={<TextField
          placeholder="Search program by name…"
          size="small"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
          sx={{ width: { xs: '100%', sm: '300px', md: '400px' } }}
        />}
                  elevation={0}
                  border
                  paperSx={{
                  p: { xs: 1.5, md: 2 },
                  borderRadius: 2,
                  mb: 2,
                  border: '1px solid',
                  borderColor: 'divider',
                  }}
                  />
      {authError && <Alert severity="error" sx={{ mb: 2 }}>{authError}</Alert>}
      {inlineMsg && !authError && <Alert severity="info" sx={{ mb: 2 }}>{inlineMsg}</Alert>}

      {/* Academic Year */}
      <Paper elevation={2} sx={{ p: 2, mb: 3, borderRadius: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <TextField
            label="Academic Year"
            value={academicYear}
            onChange={(e) => setAcademicYear(clean(e.target.value))}
            helperText='Format: "2025-2026"'
            sx={{ width: 220 }}
          />
          <Chip label={`Active AY: ${academicYear}`} color="primary" variant="outlined" />
        </Stack>
      </Paper>

      {/* Departments */}
      <Paper elevation={2} sx={{ p: 2, mb: 3, borderRadius: 2 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>Departments</Typography>
        <Tabs
          value={activeDeptId}
          onChange={(_, val) => setActiveDeptId(val)}
          variant="scrollable"
          scrollButtons="auto"
        >
          {departments.map((d) => {
            const id = d._id || d.id;
            return <Tab key={id} label={d.departmentName || d.name || id} value={id} />;
          })}
        </Tabs>
      </Paper>

      {/* Programs list */}
      {!loading && !authError && (
        <>
          <Typography variant="h6" sx={{ mb: 1 }}>Programs in selected department</Typography>
          {filteredProgramsForActiveDept.length === 0 ? (
            <Alert severity="info">No programs found.</Alert>
          ) : (
            <Grid container spacing={2}>
              {filteredProgramsForActiveDept.map((p) => {
                const pid = p._id || p.id;
                const pname = p.programName || p.name || pid;
                const sems = semestersByProgram[pid] || [];
                const gDept = groupedView[activeDeptId]?.programs || {};
                const gProg = gDept[pid] || { bySemester: {} };
                return (
                  <Grid item xs={12} md={6} key={pid}>
                    <Card variant="outlined" sx={{ borderRadius: 3 }}>
                      <CardContent>
                        <Typography variant="subtitle1" fontWeight={600}>{pname}</Typography>
                        <Divider sx={{ mb: 2, mt: 1 }} />
                        <Stack direction="row" flexWrap="wrap" sx={{ gap: 2 }}>
                          {sems.length === 0 ? (
                            <Chip label="No semesters configured" color="default" />
                          ) : sems.map((s) => {
                            const doc = gProg.bySemester?.[s] || null;
                            const hasPdf = !!doc?.storage?.url;
                            return (
                                <Paper
                                key={s}
                                variant="outlined"
                                sx={{
                                    minWidth: {md:"40vw"},
                                    maxWidth:{xs:"85vw"},
                                    pr:2,
                                    display: 'flex', 
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    p: 1.5,
                                    borderRadius: 2,
                                    flex: '1 1 300px',
                                    transition: 'box-shadow 0.2s ease-in-out, border-color 0.2s ease-in-out',
                                    backgroundColor: (theme) =>
                                      hasPdf ? alpha(theme.palette.primary.main, 0.05) : 'background.paper',
                                    '&:hover': {
                                      borderColor: 'primary.main',
                                      boxShadow: (theme) => theme.shadows[4],
                                    },
                                  }}
                                >
                                <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                                  <Typography variant="subtitle1" fontWeight="medium">
                                    Semester {s}
                                  </Typography>
                                  {doc?.status === 'DRAFT' && (
                                    <Chip
                                      label="Draft"
                                      color="warning"
                                      size="small"
                                      sx={{ fontWeight: 'medium' }}
                                    />
                                  )}
                                </Stack>
                              
                                <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ mt: 2, maxWidth:{xs:"50vw"} }}>
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    color="inherit"
                                    disabled={!hasPdf}
                                    startIcon={<OpenInNewIcon />}
                                    onClick={() => setViewerUrl(doc.storage.url)}
                                    sx={{ textTransform: 'none', borderRadius: '16px' }}
                                  >
                                    View
                                  </Button>
                                  <Button
                                    size="small"
                                    variant={hasPdf ? "outlined" : "contained"}
                                    color="primary"
                                    startIcon={<CloudUploadIcon />}
                                    onClick={() => handleOpenUpload(activeDeptId, pid, s, doc)}
                                    sx={{ textTransform: 'none', borderRadius: '16px' }}
                                  >
                                    {hasPdf ? "Update" : "Upload"}
                                  </Button>
                                  <Button
                                    size="small"
                                    variant="contained"
                                    color="secondary"
                                    disabled={!hasPdf}
                                    startIcon={<DownloadIcon />}
                                    component={hasPdf ? "a" : "button"}
                                    href={hasPdf ? doc.storage.url : undefined}
                                    download={hasPdf ? (doc.storage.fileName || `syllabus_sem_${s}.pdf`) : undefined}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    sx={{ textTransform: 'none', borderRadius: '16px', boxShadow: 'none' }}
                                  >
                                    Download
                                  </Button>
                                </Stack>
                              </Paper>
                            );
                          })}
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>
                );
              })}
            </Grid>
          )}
        </>
      )}

      {/* PDF Viewer*/}
      <Dialog open={!!viewerUrl} onClose={() => setViewerUrl('')} fullWidth maxWidth="md">
        <DialogTitle>
          <Typography variant="h6">Syllabus Viewer</Typography>
          <IconButton onClick={() => setViewerUrl('')}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent sx={{ height: '80vh' }}>
          {viewerUrl && (
            <iframe src={viewerUrl} title="Syllabus PDF" width="100%" height="100%" style={{ border: 'none' }} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>
          <Typography variant="h6">{dialogMode === 'UPDATE' ? 'Update Syllabus' : 'Upload Syllabus'}</Typography>
          <IconButton onClick={() => setDialogOpen(false)}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Academic Year"
              value={academicYear}
              onChange={(e) => setAcademicYear(clean(e.target.value))}
              helperText='Format: "2025-2026"'
              fullWidth
            />
            <Select value={draftStatus} onChange={(e) => setDraftStatus(e.target.value)} fullWidth>
              <MenuItem value="DRAFT">Draft</MenuItem>
              <MenuItem value="PUBLISHED">Published</MenuItem>
            </Select>
            <Button variant="outlined" component="label" startIcon={<PictureAsPdfIcon />}>
              {dialogMode === 'UPDATE' ? 'Replace PDF' : 'Choose PDF'}
              <input type="file" hidden accept="application/pdf" onChange={onChooseFile} />
            </Button>
            {previewURL && (
              <iframe src={previewURL} title="Preview" width="100%" height="400" style={{ border: '1px solid #ccc', borderRadius: 6 }} />
            )}
            <Stack direction="row" spacing={2} justifyContent="flex-end">
              <Button
                variant="contained"
                startIcon={<CloudUploadIcon />}
                disabled={busy}
                onClick={handleSubmit}
              >
                {dialogMode === 'UPDATE' ? 'Update' : 'Publish / Save'}
              </Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>
    </Container>
  );
}
