/* eslint-disable no-unused-vars */
import React, { useEffect, useMemo, useState } from "react";
import {
  Box, Card, CardContent, Typography, FormControl, InputLabel, Select, MenuItem, Button,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Snackbar,
  Alert, CircularProgress, Stack, Chip, IconButton, Tooltip, Divider
} from "@mui/material";
import { useAuth } from '../../context/AuthContext';
import {
  Refresh as RefreshIcon,
  CheckCircle as PublishIcon,
  CloudDownload as DownloadIcon,
  Visibility as PreviewIcon
} from "@mui/icons-material";
import axios from "axios";
import SecondaryHeader from "../../components/secondaryHeader";
import { HeaderBackButton } from "../../components/header";

const NS = "erp";
const VER = "v1";
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes

const cache = {
  set(key, data, ttlMs = CACHE_TTL) {
    const payload = { v: data, exp: Date.now() + ttlMs };
    try {
      localStorage.setItem(`${NS}:${key}:${VER}`, JSON.stringify(payload));
    } catch { //
       }
  },
  get(key) {
    const k = `${NS}:${key}:${VER}`;
    try {
      const raw = localStorage.getItem(k);
      if (!raw) return null;
      const payload = JSON.parse(raw);
      if (payload?.exp && Date.now() > payload.exp) {
        localStorage.removeItem(k);
        return null;
      }
      return payload.v ?? null;
    } catch {
      return null;
    }
  }
};

// Components used for each result module
const RESULT_COMPONENTS = [
  { key: 'midSem', label: 'Mid' },
  { key: 'endSem', label: 'End' },
  { key: 'attendance', label: 'Attd' },
  { key: 'practical', label: 'Prac' },
  { key: 'assignment1', label: 'Asg-1' },
  { key: 'assignment2', label: 'Asg-2' },
  { key: 'internal', label: 'Internal' }
];

const getSubjectColors = (isDark) => {
  if (isDark) {
    return [
      '#1a237e', '#2e7d32', '#d84315', '#f57c00', 
      '#7b1fa2', '#00838f', '#c2185b'
    ];
  }
  return [
    '#F3F8FF', '#F7FFEE', '#FFF6F3', '#FFF9E8', 
    '#F5F0FF', '#EFFCFB', '#FFF0F7'
  ];
};

const AssociatePublishResults = () => {
  // Auth context
  const { role, userDetails, loading: authLoading } = useAuth();
  
  const [associate, setAssociate] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [semesters, setSemesters] = useState([1,2,3,4,5,6,7,8]);

  const [selectedDept, setSelectedDept] = useState('');
  const [selectedProgram, setSelectedProgram] = useState('');
  const [selectedSemester, setSelectedSemester] = useState('');

  const [subjects, setSubjects] = useState([]); 
  const [students, setStudents] = useState([]); 
  const [marks, setMarks] = useState({});
  const [publishStatus, setPublishStatus] = useState(null);  // { published, publishedAt, publishedBy }
  const [previewStatus, setPreviewStatus] = useState(null); 
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

  useEffect(() => {
    bootstrapAssociate();
  }, [authLoading, userDetails, role]);

  const bootstrapAssociate = async () => {
    if (authLoading) return;
    
    try {
      setLoading(true);
      setLoadingStep('Loading profile...');
      
      const isCollegeAssociate = userDetails?.isCollegeAssociate || role === "CollegeAssociate";
      if (!isCollegeAssociate || !userDetails?.college) {
        setSnackbar({ open: true, message: 'Access denied. College Associate role with assigned college required.', severity: 'error' });
        return;
      }

      setAssociate(userDetails);

      setLoadingStep('Loading departments...');
      const cacheKey = `college-${userDetails.college}-departments`;
      let data = cache.get(cacheKey);
      if (!data) {
        const deptRes = await axios.get(`${API_BASE_URL}/api/colleges/${userDetails.college}/departments`);
        data = deptRes.data || [];
        cache.set(cacheKey, data);
      }
      setDepartments(data);
    } catch (e) {
      setSnackbar({ open: true, message: 'Failed to init associate data', severity: 'error' });
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  const loadPrograms = async (deptId) => {
    try {
      setLoading(true);
      setLoadingStep('Loading programs...');
      const cacheKey = `college-${associate.college}-dept-${deptId}-programs`;
      let data = cache.get(cacheKey);
      if (!data) {
        const progRes = await axios.get(`${API_BASE_URL}/api/departments/${associate.college}/${deptId}/programs`);
        data = progRes.data || [];
        cache.set(cacheKey, data);
      }
      setPrograms(data);
    } catch (e) {
      setSnackbar({ open: true, message: 'Failed to load programs', severity: 'error' });
    } finally {
      setLoading(false); setLoadingStep('');
    }
  };

  const loadSubjects = async (programId, semester) => {
    try {
      setLoading(true);
      setLoadingStep('Loading subjects...');
      const cacheKey = `program-${programId}-sem-${semester}-subjects`;
      let data = cache.get(cacheKey);
      if (!data) {
        const subjRes = await axios.get(`${API_BASE_URL}/api/programs/${programId}/semesters/${semester}/subjects`);
        data = subjRes.data || [];
        cache.set(cacheKey, data);
      }
      setSubjects(data);
    } catch (e) {
      setSnackbar({ open: true, message: 'Failed to load subjects', severity: 'error' });
    } finally {
      setLoading(false); setLoadingStep('');
    }
  };

  const loadOverview = async () => {
    if (!associate?.college || !selectedDept || !selectedProgram || !selectedSemester) {
      setSnackbar({ open: true, message: 'Please select department, program and semester', severity: 'warning' });
      return;
    }
    try {
      setLoading(true);
      setLoadingStep('Building results overview...');
      const res = await axios.get(`${API_BASE_URL}/api/results/overview`, {
        params: {
          collegeId: associate.college,
          departmentId: selectedDept,
          programId: selectedProgram,
          semester: selectedSemester
        }
      });
      setStudents(res.data.students || []);
      setSubjects(res.data.subjects || []);
      setMarks(res.data.marks || {});
      setPublishStatus(res.data.publishStatus || null);
      setPreviewStatus(res.data.previewStatus || null);
      setSnackbar({ open: true, message: 'Overview loaded', severity: 'success' });
    } catch (e) {
      setSnackbar({ open: true, message: 'Failed to load overview', severity: 'error' });
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  const missingCount = useMemo(() => {
    let miss = 0;
    for (const stu of students) {
      const sm = marks[stu._id] || {};
      for (let sIndex = 0; sIndex < subjects.length; sIndex++) {
        const subj = subjects[sIndex];
        const subm = sm[subj._id] || {};
        for (const comp of RESULT_COMPONENTS) {
          const cell = subm[comp.key];
          if (!cell || cell.obtained === null || cell.obtained === undefined) miss++;
        }
      }
    }
    return miss;
  }, [students, subjects, marks]);

  const handlePublish = async () => {
    if (missingCount > 0) {
      setSnackbar({ open: true, message: 'Cannot publish: some components are missing', severity: 'warning' });
      return;
    }
    try {
      setLoading(true);
      setLoadingStep('Publishing...');
      await axios.post(`${API_BASE_URL}/api/results/publish`, {
        collegeId: associate.college,
        departmentId: selectedDept,
        programId: selectedProgram,
        semester: selectedSemester
      });
      setSnackbar({ open: true, message: 'Published successfully', severity: 'success' });
      const statusRes = await axios.get(`${API_BASE_URL}/api/results/publish-status`, {
        params: {
          collegeId: associate.college,
          departmentId: selectedDept,
          programId: selectedProgram,
          semester: selectedSemester
        }
      });
      setPublishStatus(statusRes.data || { published: true });
    } catch (e) {
      setSnackbar({ open: true, message: 'Publish failed', severity: 'error' });
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  // Publish Preview (allows incomplete results to be visible as preview)
  const handlePublishPreview = async () => {
    try {
      setLoading(true);
      setLoadingStep('Publishing preview...');
      await axios.post(`${API_BASE_URL}/api/results/publish-preview`, {
        collegeId: associate.college,
        departmentId: selectedDept,
        programId: selectedProgram,
        semester: selectedSemester
      });
      setSnackbar({ open: true, message: 'Preview published for students', severity: 'success' });
      const prevRes = await axios.get(`${API_BASE_URL}/api/results/publish-preview-status`, {
        params: {
          collegeId: associate.college,
          departmentId: selectedDept,
          programId: selectedProgram,
          semester: selectedSemester
        }
      });
      setPreviewStatus(prevRes.data || { previewPublished: true });
    } catch (e) {
      setSnackbar({ open: true, message: 'Preview publish failed', severity: 'error' });
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  const exportCSV = () => {
    if (!students.length || !subjects.length) {
      setSnackbar({ open: true, message: 'Nothing to export', severity: 'warning' });
      return;
    }
    const header = ['Enrollment No'];
    subjects.forEach(s => {
      RESULT_COMPONENTS.forEach(c => {
        header.push(`${s.subjectName} - ${c.label}`);
      });
    });
    const rows = [header];
    students.forEach(stu => {
      const sm = marks[stu._id] || {};
      const row = [stu.enrollmentNo || ''];
      subjects.forEach(sub => {
        const subm = sm[sub._id] || {};
        RESULT_COMPONENTS.forEach(c => {
          const cell = subm[c.key];
          row.push(cell && (cell.obtained !== null && cell.obtained !== undefined) ? cell.obtained : '');
        });
      });
      rows.push(row);
    });
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `results_${selectedProgram}_sem${selectedSemester}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Box sx={{ p: 3, minHeight: '100vh', maxWidth: 1500, mx: 'auto' }}>
      <SecondaryHeader title="Publish Results"
      leftArea={<HeaderBackButton/>}/>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack spacing={2} direction={{ xs: 'column', md: 'row' }}>
            <FormControl fullWidth>
              <InputLabel>Department</InputLabel>
              <Select
                value={selectedDept}
                label="Department"
                onChange={(e) => {
                  setSelectedDept(e.target.value);
                  setSelectedProgram('');
                  setSubjects([]); setStudents([]); setMarks({});
                  if (e.target.value) loadPrograms(e.target.value);
                }}
              >
                {departments.map(d => <MenuItem key={d._id || d.id} value={d._id || d.id}>{d.departmentName || d.name}</MenuItem>)}
              </Select>
            </FormControl>

            <FormControl fullWidth disabled={!selectedDept}>
              <InputLabel>Program</InputLabel>
              <Select
                value={selectedProgram}
                label="Program"
                onChange={(e) => {
                  setSelectedProgram(e.target.value);
                  setSubjects([]); setStudents([]); setMarks({});
                }}
              >
                {programs.map(p => <MenuItem key={p._id} value={p._id}>{p.programName}</MenuItem>)}
              </Select>
            </FormControl>

            <FormControl fullWidth disabled={!selectedProgram}>
              <InputLabel>Semester</InputLabel>
              <Select
                value={selectedSemester}
                label="Semester"
                onChange={(e) => {
                  setSelectedSemester(e.target.value);
                  setSubjects([]); setStudents([]); setMarks({});
                  if (e.target.value) loadSubjects(selectedProgram, e.target.value);
                }}
              >
                {semesters.map(s => <MenuItem key={s} value={s}>{`Semester ${s}`}</MenuItem>)}
              </Select>
            </FormControl>

            <Button
              variant="contained"
              startIcon={loading ? <CircularProgress size={18} /> : <RefreshIcon />}
              onClick={loadOverview}
              disabled={!selectedDept || !selectedProgram || !selectedSemester || loading}
              sx={{ minWidth: 160 }}
            >
              {loading ? (loadingStep || 'Loading...') : 'Load Overview'}
            </Button>
          </Stack>

          <Divider sx={{ my: 2 }} />

          <Stack direction="row" spacing={2} flexWrap="wrap">
            <Chip label={`Students: ${students.length}`} color="primary" />
            <Chip label={`Subjects: ${subjects.length}`} color="info" />
            <Chip label={`Missing Cells: ${missingCount}`} color={missingCount > 0 ? 'error' : 'success'} />
            {previewStatus?.previewPublished && (
              <Chip
                label={`Preview on ${new Date(previewStatus.previewAt).toLocaleString()}`}
                color="warning"
                variant="outlined"
              />
            )}
            {publishStatus?.published && (
              <Chip
                label={`Published on ${new Date(publishStatus.publishedAt).toLocaleString()}`}
                color="success"
                variant="outlined"
              />
            )}
            <Tooltip title="Export CSV">
              <span>
                <IconButton onClick={exportCSV} disabled={!students.length || !subjects.length}>
                  <DownloadIcon />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        </CardContent>
      </Card>

      {students.length > 0 && subjects.length > 0 && (
        <TableContainer component={Paper} sx={{ mb: 3 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell
                  rowSpan={2}
                  sx={{ fontWeight: 'bold',position: 'sticky', left: 0, zIndex: 3 }}
                >
                  Enrollment No
                </TableCell>
                {subjects.map((sub, idx) => {
                  const bg = getSubjectColors[idx % getSubjectColors.length];
                  return (
                    <TableCell
                      key={sub._id}
                      align="center"
                      sx={{ fontWeight: 'bold', bgcolor: bg, borderRight: '2px solid #e0e0e0' }}
                      colSpan={RESULT_COMPONENTS.length}
                    >
                      {sub.subjectName}
                    </TableCell>
                  );
                })}
              </TableRow>
              <TableRow>
                {subjects.flatMap((sub, idx) => {
                  const bg = getSubjectColors[idx % getSubjectColors.length];
                  return RESULT_COMPONENTS.map((c, ci) => (
                    <TableCell
                      key={`${sub._id}-${c.key}`}
                      align="center"
                      sx={{
                        fontWeight: 'bold',
                        bgcolor: bg,
                        borderRight: ci === RESULT_COMPONENTS.length - 1 ? '2px solid #e0e0e0' : '1px solid #eee'
                      }}
                    >
                      {c.label}
                    </TableCell>
                  ));
                })}
              </TableRow>
            </TableHead>
            <TableBody>
              {students.map(stu => {
                const row = marks[stu._id] || {};
                return (
                  <TableRow key={stu._id} hover>
                    <TableCell
                      sx={{
                        fontWeight: 600,
                        position: 'sticky',
                        left: 0,
                        zIndex: 2,
                      }}
                    >
                      {stu.enrollmentNo || 'N/A'}
                    </TableCell>
                    {subjects.flatMap((sub, idx) => {
                      return RESULT_COMPONENTS.map((c, ci) => {
                        const subm = row[sub._id] || {};
                        const cell = subm[c.key];
                        const missing = !cell || cell.obtained === null || cell.obtained === undefined;
                        return (
                          <TableCell
                            key={`${stu._id}-${sub._id}-${c.key}`}
                            align="center"
                            sx={{
                              bgcolor: missing ? 'error.lighter' : 'transparent',
                              color: missing ? 'error.dark' : 'inherit',
                              fontWeight: missing ? 700 : 400,
                              borderRight: ci === RESULT_COMPONENTS.length - 1 ? '2px solid #e0e0e0' : '1px solid #eee'
                            }}
                          >
                            {missing ? '-' : cell.obtained}
                          </TableCell>
                        );
                      });
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {students.length > 0 && subjects.length > 0 && (
        <Box display="flex" justifyContent="flex-end" gap={2}>
          <Button
            variant="outlined"
            color="warning"
            startIcon={<PreviewIcon />}
            onClick={handlePublishPreview}
            disabled={previewStatus?.previewPublished || loading}
            sx={{ minWidth: 200 }}
          >
            {previewStatus?.previewPublished ? 'Preview Published' : 'Publish Preview'}
          </Button>

          <Button
            variant="contained"
            color="success"
            startIcon={<PublishIcon />}
            onClick={handlePublish}
            disabled={missingCount > 0 || publishStatus?.published || loading}
            sx={{ minWidth: 180 }}
          >
            {publishStatus?.published ? 'Published' : 'Publish Results'}
          </Button>
        </Box>
      )}

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert
          elevation={6}
          variant="filled"
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity || 'info'}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default AssociatePublishResults;
