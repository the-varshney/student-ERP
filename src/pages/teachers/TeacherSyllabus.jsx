/* eslint-disable no-unused-vars */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Box, Container, Typography, Alert, Card, CardContent, Button, Grid, Stack, TextField,
  Chip, InputAdornment, Divider, Skeleton, Dialog, DialogContent, alpha,
  DialogTitle, IconButton, Paper, Tabs, Tab, Select, MenuItem
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DownloadIcon from '@mui/icons-material/Download';
import CloseIcon from '@mui/icons-material/Close';
import { db } from '../../firebase/Firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import axios from 'axios';
import PdfViewer from '../../components/PdfViewer';
import { HeaderBackButton } from "../../components/header";
import SecondaryHeader from "../../components/secondaryHeader";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// Helpers
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const toInt = (v) => {
  const n = Number(v);
  if (Number.isFinite(n)) return n;
  const parsed = parseInt(String(v ?? '').replace(/\D/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
};
const computeDefaultAY = () => {
  const now = new Date();
  const y = now.getFullYear();
  return `${y}-${y + 1}`;
};

export default function TeacherSyllabus() {
  // Catalog data
  const [departments, setDepartments] = useState([]);
  const [activeDeptId, setActiveDeptId] = useState('');
  const [programsByDept, setProgramsByDept] = useState({});
  const [semestersByProgram, setSemestersByProgram] = useState({});
  const [academicYear, setAcademicYear] = useState(computeDefaultAY());

  // UI state
  const [loading, setLoading] = useState(true);
  const [inlineMsg, setInlineMsg] = useState('');
  const [search, setSearch] = useState('');
  const [groupedView, setGroupedView] = useState({});

  // View dialog
  const [viewerUrl, setViewerUrl] = useState('');
  const [viewerTitle, setViewerTitle] = useState('');

  // departments, programs, semesters
  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        setInlineMsg('');

        // Departments
        const deptRes = await axios.get(`${API_BASE_URL}/api/departments`);
        const depts = Array.isArray(deptRes.data) ? deptRes.data : [];
        setDepartments(depts);
        if (depts.length > 0) setActiveDeptId(depts[0]._id || depts[0].id || '');

        // Programs + semesters
        const progMap = {};
        const semMap = {};
        for (const d of depts) {
          const deptId = d._id || d.id;
          try {
            const progRes = await axios.get(`${API_BASE_URL}/api/departments/${deptId}/programs`);
            const progs = Array.isArray(progRes.data) ? progRes.data : [];
            progMap[deptId] = progs;

            for (const p of progs) {
              const pid = p._id || p.id;
              try {
                const semRes = await axios.get(`${API_BASE_URL}/api/programs/${pid}/semesters`);
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
        setInlineMsg('Failed to load catalog. Please check network and try again.');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  // Build grouped syllabus view for selected AY
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

      // Keep latest by program+semester by updatedAt
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
      setInlineMsg('Failed to load syllabuses for the selected academic year.');
    } finally {
      setLoading(false);
    }
  }, [departments, programsByDept, semestersByProgram, academicYear]);

  useEffect(() => {
    buildGroupedView();
  }, [buildGroupedView]);

  // Derived
  const programsForActiveDept = useMemo(
    () => programsByDept[activeDeptId] || [],
    [programsByDept, activeDeptId]
  );
  const filteredProgramsForActiveDept = useMemo(() => {
    const q = clean(search).toLowerCase();
    if (!q) return programsForActiveDept;
    return programsForActiveDept.filter((p) =>
      String(p.programName || p.name || '').toLowerCase().includes(q)
    );
  }, [programsForActiveDept, search]);

  const handleOpenViewer = (doc, semLabel) => {
    setViewerUrl(doc?.storage?.url || '');
    const title = doc?.title || `Syllabus • Sem ${semLabel} • ${academicYear}`;
    setViewerTitle(title);
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4}} minHeight="100vh">
      <SecondaryHeader
        title="Teacher • Syllabus"
        leftArea={<HeaderBackButton href="/teacher" />}
        rightArea={(
       <Stack direction="row">
        <TextField
          placeholder="Search program by name…"
          size="small"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
          sx={{ width:{xs:"50%", md:"100%"} }}
        />
      </Stack>
        )}
        titleSx={{ color: 'primary.main' }}
      />

      {inlineMsg && <Alert severity="info" sx={{ mb: 2 }}>{inlineMsg}</Alert>}

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

      {/* Loading */}
      {loading && (
        <Grid container spacing={2}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Grid item xs={12} sm={6} md={3} key={i}>
              <Card variant="outlined">
                <Skeleton variant="rectangular" height={120} />
                <Box sx={{ p: 2 }}>
                  <Skeleton width="70%" />
                  <Skeleton width="40%" />
                </Box>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Programs list */}
      {!loading && (
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
                        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{pname}</Typography>
                          <Chip size="small" label={`AY: ${academicYear}`} color="primary" variant="outlined" />
                        </Stack>
                        <Divider sx={{ mb: 2 }} />

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
                                  minWidth: { md: '40vw' },
                                  maxWidth: { xs: '85vw' },
                                  pr: 2,
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
                                <Stack direction="row" alignItems="center" spacing={1}>
                                  <Typography variant="subtitle1" fontWeight="medium">
                                    Semester {s}
                                  </Typography>
                                  {doc?.status === 'DRAFT' && (
                                    <Chip label="Draft" color="warning" size="small" sx={{ fontWeight: 'medium' }} />
                                  )}
                                </Stack>

                                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mt: { xs: 1, md: 0 } }}>
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    color="inherit"
                                    disabled={!hasPdf}
                                    startIcon={<OpenInNewIcon />}
                                    onClick={() => doc && handleOpenViewer(doc, s)}
                                    sx={{ textTransform: 'none', borderRadius: '16px' }}
                                  >
                                    View
                                  </Button>

                                  <Button
                                    size="small"
                                    variant="contained"
                                    color="secondary"
                                    disabled={!hasPdf}
                                    startIcon={<DownloadIcon />}
                                    component={hasPdf ? 'a' : 'button'}
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

      {/* PDF Viewer Dialog */}
      <Dialog open={!!viewerUrl} onClose={() => setViewerUrl('')} fullWidth maxWidth="lg">
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6" fontWeight={600}>
            {viewerTitle || 'Syllabus Viewer'}
          </Typography>
          <IconButton onClick={() => setViewerUrl('')}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ p: 0, height: '90vh' }}>
          {viewerUrl ? (
            <PdfViewer fileUrl={viewerUrl} showFullscreenButton />
          ) : (
            <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3 }}>
              <Alert severity="warning">No file to preview.</Alert>
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </Container>
  );
}
