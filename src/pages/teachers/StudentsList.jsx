/* eslint-disable no-unused-vars */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Card, CardContent, Typography, FormControl, InputLabel, Select, MenuItem, Button,
  Snackbar, Alert, CircularProgress, Stack, Chip, IconButton, Tooltip,
  Divider, TextField, Dialog, DialogTitle, DialogContent, DialogActions, Switch, List, ListItem,
  ListItemIcon, ListItemText, ListItemSecondaryAction, Grid, FormControlLabel, Avatar
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  CloudDownload as DownloadIcon,
  Settings as SettingsIcon,
  RestartAlt as ResetIcon,
  School as SchoolIcon,
  Apartment as CollegeIcon,
  ViewColumn as ColumnIcon,
  DragIndicator as DragIcon
} from '@mui/icons-material';
import axios from 'axios';
import { auth, db } from '../../firebase/Firebase';
import { collection, query as fsQuery, where, getDocs } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { HeaderBackButton } from "../../components/header";
import SecondaryHeader from "../../components/secondaryHeader";
import StudentsGrid from '../../components/table';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const ALL_VALUE = '*';
const MAX_SEMS = [1,2,3,4,5,6,7,8];

const NS = "erp";
const VER = "v1";
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes

const cache = {
  set(key, data, ttlMs = CACHE_TTL) {
    const payload = { v: data, exp: Date.now() + ttlMs };
    try {
      localStorage.setItem(`${NS}:${key}:${VER}`, JSON.stringify(payload));
    } catch {
      console.warn(`[cache:set:fail] ${key}`);
    }
  },
  get(key) {
    const k = `${NS}:${key}:${VER}`;
    try {
      const raw = localStorage.getItem(k);
      if (!raw) {
        return null;
      }
      const payload = JSON.parse(raw);
      if (payload?.exp && Date.now() > payload.exp) {
        localStorage.removeItem(k);
        return null;
      }
      return payload.v ?? null;
    } catch {
      console.warn(`[cache:get:fail] ${key}`);
      return null;
    }
  }
};

// Helpers
const toCode = (p) => (p?.code || p?.programCode || p?._id || '').toString();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const toggleValue = (arr, v) => (arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
const autoFitColumns = (rows) => {
  if (!rows.length) return [];
  const headers = Object.keys(rows[0] || {});
  const colWidths = headers.map(h => ({ wch: Math.max(h.length, 10) }));
  rows.forEach(row => {
    headers.forEach((h, i) => {
      const val = row[h] == null ? '' : String(row[h]);
      colWidths[i].wch = Math.max(colWidths[i].wch, val.length + 2);
    });
  });
  return colWidths;
};

// Default columns 
const defaultColumns = [
  {
    field: 'studentCard',
    headerName: 'Student',
    width: 320,
    sortable: false,
    valueGetter: (...args) => {
if (args.length >= 2) {
        const [, row] = args;
        return row?.firstName || '';
      }
      const params = args[0] || {};
      return params?.row?.firstName || '';
    },
    renderCell: (params) => {
      const { profilePicUrl, firstName, lastName, email } = params.row || {};
      const initials = `${(firstName || '').charAt(0)}${(lastName || '').charAt(0)}`.trim().toUpperCase();
      return (
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 0.25, minWidth: 0 }}>
          <Avatar
            src={profilePicUrl || undefined}
            alt={firstName || ''}
            sx={{ width: 32, height: 32, fontSize: 14, bgcolor: 'primary.light', color: 'primary.contrastText' }}
            imgProps={{ loading: 'lazy', referrerPolicy: 'no-referrer' }}
          >
            {initials || 'S'}
          </Avatar>
          <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 600,
                lineHeight: 1,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {(firstName || '') + ' ' + (lastName || '')}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                mt:0.5,
                lineHeight: 1,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {email || '—'}
            </Typography>
            </Box>
        </Stack>
      );
    }
  },
  { field: 'enrollmentNo', headerName: 'Enrollment No', width: 160 },
  { field: 'firstName', headerName: 'First Name', width: 140 },
  { field: 'lastName', headerName: 'Last Name', width: 140 },
  { field: 'email', headerName: 'Email', width: 220 },
  { field: 'abcId', headerName: 'ABC ID', width: 150 },
  { field: 'firebaseId', headerName: 'Firebase Id', width: 240 },
  { field: 'collegeId', headerName: 'College Id', width: 120 },
  { field: 'collegeName', headerName: 'College Name', width: 220 },
  { field: 'departmentName', headerName: 'Department', width: 180 },
  { field: 'programName', headerName: 'Program', width: 180 },
  { field: 'programCode', headerName: 'Program Code', width: 140 },
  { field: 'semester', headerName: 'Semester', width: 110 },
  { field: 'gender', headerName: 'Gender', width: 100 },
  { field: 'dob', headerName: 'DOB', width: 120 },
  { field: 'phone', headerName: 'Phone', width: 140 },
  { field: 'role', headerName: 'Role', width: 100 },
];

// eslint-disable-next-line react/prop-types
const StudentsList = ({ adminMode = false }) => {

  const { role, userDetails, loading: authLoading } = useAuth();
  

  const [associate, setAssociate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

  const [colleges, setColleges] = useState([]);
  const [selectedCollege, setSelectedCollege] = useState('');
  const [departments, setDepartments] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [selectedDeptIds, setSelectedDeptIds] = useState([]);
  const [selectedProgramIds, setSelectedProgramIds] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [selectedSemesters, setSelectedSemesters] = useState([]);

  const [rows, setRows] = useState([]);
  const [columns, setColumns] = useState(defaultColumns);
  const [columnVisibilityModel, setColumnVisibilityModel] = useState({});
  const [columnOrder, setColumnOrder] = useState(defaultColumns.map(c => c.field));
  const [sortModel, setSortModel] = useState([]);

  const [search, setSearch] = useState('');
  const [openColumnManager, setOpenColumnManager] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        setLoadingStep('Initializing…');

        if (adminMode) {
          const cacheKey = "colleges";
          let data = cache.get(cacheKey);
          if (!data) {
            const res = await axios.get(`${API_BASE_URL}/api/colleges`);
            data = res.data || [];
            cache.set(cacheKey, data);
          }
          setColleges(data);
          return;
        }

        if (authLoading) return;
        
        const isCollegeAssociate = userDetails?.isCollegeAssociate || role === "CollegeAssociate";
        if (!isCollegeAssociate || !userDetails) {
          setSnackbar({ open: true, message: 'Access denied. College Associate role required.', severity: 'error' });
          return;
        }
        setAssociate(userDetails);
        const assocCollege = userDetails.college || userDetails.collegeId || '';
        setSelectedCollege(assocCollege);
        
        if (!assocCollege) {
          setSnackbar({ open: true, message: 'No collegeId in profile', severity: 'warning' });
        }
      } finally {
        setLoading(false);
        setLoadingStep('');
      }
    };
    init();
  }, [adminMode, authLoading, userDetails, role]);

  // Departments with cache
  useEffect(() => {
    const run = async () => {
      if (!selectedCollege) { 
        setDepartments([]); 
        setPrograms([]); 
        return; 
      }
      try {
        setLoading(true);
        setLoadingStep('Loading departments…');
        const cacheKey = `college-${selectedCollege}-departments`;
        let data = cache.get(cacheKey);
        if (!data) {
          const deptRes = await axios.get(`${API_BASE_URL}/api/colleges/${selectedCollege}/departments`);
          data = deptRes.data || [];
          cache.set(cacheKey, data);
        }
        setDepartments([{ _id: ALL_VALUE, departmentName: 'All Departments' }, ...data]);
        setSelectedDeptIds([]);
        setPrograms([]); setSelectedProgramIds([]);
        setSemesters([]); setSelectedSemesters([]);
        setRows([]);
      } finally {
        setLoading(false);
        setLoadingStep('');
      }
    };
    run();
  }, [selectedCollege]);

  // Programs with cache
  useEffect(() => {
    const run = async () => {
      if (!selectedCollege) return;
      if (!selectedDeptIds.length) { setPrograms([]); setSelectedProgramIds([]); return; }
      const deptIds = selectedDeptIds.includes(ALL_VALUE)
        ? departments.filter(d => d._id !== ALL_VALUE).map(d => d._id)
        : selectedDeptIds;
      try {
        setLoading(true);
        setLoadingStep('Loading programs…');
        const all = [];
        for (const depId of deptIds) {
          const cacheKey = `college-${selectedCollege}-dept-${depId}-programs`;
          let list = cache.get(cacheKey);
          if (!list) {
            const progRes = await axios.get(`${API_BASE_URL}/api/departments/${selectedCollege}/${depId}/programs`);
            list = progRes.data || [];
            cache.set(cacheKey, list);
          }
          all.push(...list);
        }
        const map = new Map();
        all.forEach(p => map.set(p._id || p.id, p));
        const unique = Array.from(map.values());
        setPrograms([{ _id: ALL_VALUE, programName: 'All Programs', code: ALL_VALUE }, ...unique]);
        setSelectedProgramIds([]);
        setSemesters([]); setSelectedSemesters([]);
        setRows([]);
      } finally {
        setLoading(false);
        setLoadingStep('');
      }
    };
    run();
  }, [selectedDeptIds, departments, selectedCollege]);

  // Semesters with cache
  useEffect(() => {
    const run = async () => {
      if (!selectedProgramIds.length) { setSemesters([]); setSelectedSemesters([]); return; }
      const concrete = selectedProgramIds.filter(id => id !== ALL_VALUE);
      if (concrete.length === 1) {
        try {
          setLoading(true);
          setLoadingStep('Loading semesters…');
          const pid = concrete[0];
          const cacheKey = `program-${pid}-semesters`;
          let list = cache.get(cacheKey);
          if (!list) {
            const resp = await axios.get(`${API_BASE_URL}/api/programs/${pid}/semesters`);
            list = (resp.data || []).map(s => s.semesterNumber).filter(Boolean);
            cache.set(cacheKey, list);
          }
          setSemesters(list);
        } catch {
          setSemesters([]);
          setSnackbar({ open: true, message: 'Failed to load semesters for program', severity: 'error' });
        } finally {
          setLoading(false);
          setLoadingStep('');
        }
      } else {
        setSemesters(MAX_SEMS);
      }
      setSelectedSemesters([]);
      setRows([]);
    };
    run();
  }, [selectedProgramIds]);

  const canLoad = useMemo(
    () => Boolean(selectedCollege && selectedDeptIds.length && selectedProgramIds.length && selectedSemesters.length),
    [selectedCollege, selectedDeptIds, selectedProgramIds, selectedSemesters]
  );

  // Load students 
  const loadStudents = async () => {
    if (!canLoad) {
      setSnackbar({ open: true, message: 'Select department(s), program(s), and semester(s)', severity: 'warning' });
      return;
    }
    try {
      setLoading(true);
      setLoadingStep('Fetching Firebase students…');
      const qFb = fsQuery(collection(db, 'Students'), where('collegeId', '==', selectedCollege), where('role', '==', 'Student'));
      const fbSnap = await getDocs(qFb);
      const fbList = fbSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const fbById = new Map(fbList.map(d => [d.firebaseId, d]));

      const selectedProgs = selectedProgramIds.includes(ALL_VALUE)
        ? programs.filter(p => p._id !== ALL_VALUE)
        : programs.filter(p => selectedProgramIds.includes(p._id || p.id));
      const sems = selectedSemesters.map(s => String(s));

      const outMap = new Map();

      setLoadingStep('Cross-referencing with Mongo…');
      for (const prog of selectedProgs) {
        const programCode = toCode(prog);
        for (const sem of sems) {
          const res = await axios.post(`${API_BASE_URL}/api/attendance/get-students`, {
            teacherCollege: selectedCollege,
            teacherProgram: programCode,
            selectedSemester: sem,
            firebaseStudents: fbList.map(f => ({
              firebaseId: f.firebaseId,
              firstName: f.firstName,
              lastName: f.lastName,
              email: f.email,
              profilePicUrl: f.profilePicUrl || '',
              collegeName: f.collegeName || '',
              collegeId: f.collegeId,
              enrollmentNo: f.enrollmentNo || f.EnrollmentNo || '',
              program: f.program || '',
              semester: f.semester ?? f.Semester ?? '',
              department: f.department || null,
              abcId: f.abcId || '',
              gender: f.gender || '',
              dob: f.dob || '',
              phone: f.phone || '',
              role: f.role || 'Student',
            }))
          });
          const merged = res.data?.students || [];
          merged.forEach(m => {
            const fb = fbById.get(m.firebaseId) || {};
            const key = m.firebaseId;
            outMap.set(key, {
              id: key,
              enrollmentNo: m.enrollmentNo || fb.enrollmentNo || '',
              firstName: fb.firstName || '',
              lastName: fb.lastName || '',
              email: fb.email || '',
              abcId: fb.abcId || '',
              firebaseId: m.firebaseId || '',
              collegeId: fb.collegeId || selectedCollege,
              collegeName: fb.collegeName || '',
              departmentName: m.department?.departmentName || m.department || '',
              programName: m.program?.programName || m.program || prog.programName || '',
              programCode: programCode !== ALL_VALUE ? programCode : (fb.program || ''),
              semester: m.semester || '',
              gender: fb.gender || '',
              dob: fb.dob || '',
              phone: fb.phone || '',
              role: fb.role || 'Student',
              profilePicUrl: fb.profilePicUrl || '',
            });
          });
          await sleep(10);
        }
      }

      const resultRows = Array.from(outMap.values());
      setRows(resultRows);
      setSnackbar({ open: true, message: `Loaded ${resultRows.length} students.`, severity: 'success' });
    } catch (e) {
      console.error(e);
      setSnackbar({ open: true, message: e?.response?.data?.error || 'Failed to load students', severity: 'error' });
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  // Search
  const displayedRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      (r.enrollmentNo || '').toLowerCase().includes(q) ||
      (r.firstName || '').toLowerCase().includes(q) ||
      (r.lastName || '').toLowerCase().includes(q) ||
      (r.email || '').toLowerCase().includes(q) ||
      (r.departmentName || '').toLowerCase().includes(q) ||
      (r.programName || '').toLowerCase().includes(q) ||
      (r.programCode || '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  // Export current view
  const exportEditedTable = async () => {
    if (!displayedRows.length) { setSnackbar({ open: true, message: 'Nothing to export', severity: 'warning' }); return; }
    const visibleCols = columnOrder
      .map(f => columns.find(c => c.field === f))
      .filter(c => !!c && (columnVisibilityModel[c.field] !== false));
    const headers = visibleCols.map(c => c.headerName || c.field);
    const exportRows = displayedRows.map(r => {
      const obj = {}; visibleCols.forEach(c => { obj[c.headerName || c.field] = r[c.field] ?? ''; }); return obj;
    });
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(exportRows);
      ws['!cols'] = autoFitColumns(exportRows);
      XLSX.utils.book_append_sheet(wb, ws, 'Students');
      XLSX.writeFile(wb, `students_${selectedCollege || 'college'}_${Date.now()}.xlsx`);
      setSnackbar({ open: true, message: 'Excel downloaded', severity: 'success' });
    } catch {
      const csvHeader = headers;
      const csvRows = [
        csvHeader.join(','),
        ...exportRows.map(r => csvHeader.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(',')),
      ].join('\n');
      const blob = new Blob([csvRows], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = `students_${selectedCollege || 'college'}_${Date.now()}.csv`; a.click();
      URL.revokeObjectURL(url);
      setSnackbar({ open: true, message: 'CSV downloaded (XLSX not available)', severity: 'info' });
    }
  };

  // Column manager local state
  const [localCols, setLocalCols] = useState(defaultColumns.map(c => ({ ...c })));
  const [localVis, setLocalVis] = useState({});
  const [localOrder, setLocalOrder] = useState(defaultColumns.map(c => c.field));

  useEffect(() => {
    if (openColumnManager) {
      setLocalCols(columns.map(c => ({ ...c })));
      setLocalVis({ ...columnVisibilityModel });
      setLocalOrder([...columnOrder]);
    }
  }, [openColumnManager, columns, columnVisibilityModel, columnOrder]);

  const applyColumnEdits = () => {
    setColumns(localCols);
    setColumnVisibilityModel(localVis);
    setColumnOrder(localOrder);
    setOpenColumnManager(false);
  };

  const resetTable = () => {
    setColumns(defaultColumns);
    setColumnVisibilityModel({});
    setColumnOrder(defaultColumns.map(c => c.field));
    setSortModel([]);
    setSearch('');
    setSnackbar({ open: true, message: 'Table reset to default', severity: 'success' });
  };

  // Multi-select helpers without checkboxes
  const renderMultiValue = (selected, allLabel) => {
    if (Array.isArray(selected) && selected.includes(ALL_VALUE)) return allLabel;
    return `${selected?.length || 0} selected`;
  };
  const handleDeptToggle = (value) => {
    if (value === ALL_VALUE) { setSelectedDeptIds(prev => prev.includes(ALL_VALUE) ? [] : [ALL_VALUE]); return; }
    setSelectedDeptIds(prev => toggleValue(prev.filter(v => v !== ALL_VALUE), value));
  };
  const handleProgToggle = (value) => {
    if (value === ALL_VALUE) { setSelectedProgramIds(prev => prev.includes(ALL_VALUE) ? [] : [ALL_VALUE]); return; }
    setSelectedProgramIds(prev => toggleValue(prev.filter(v => v !== ALL_VALUE), value));
  };
  const handleSemToggle = (value) => { setSelectedSemesters(prev => toggleValue(prev, value)); };

  return (
    <Box sx={{ p: 3, pt: adminMode ? 0 : 3, mt: adminMode ? 0 : undefined, minHeight: '100vh', maxWidth: "100vw", mx: 'auto' }}>
      {!adminMode && (
         <SecondaryHeader
                title=" Students Lists"
                leftArea={<HeaderBackButton to="/teachers" />}       
                dense
              />
      )}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }} sx={{ width: '100%', flexWrap: 'wrap', gap:adminMode ? 1 : 0 }}>
              {adminMode ? (
                <FormControl sx={{ minWidth: 250, flexGrow: { xs: 1, md: 0 } }}>
                  <InputLabel>College</InputLabel>
                  <Select value={selectedCollege} label="College" onChange={(e) => setSelectedCollege(e.target.value)}>
                    {colleges.map(c => (
                      <MenuItem key={c._id || c.id} value={c._id || c.id}>{c.name || c._id || c.id}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              ) : (
                <Chip icon={<CollegeIcon />} color="primary" variant="outlined" label={`College: ${associate?.college || 'N/A'}`} />
              )}

              <FormControl sx={{ minWidth: 250, flexGrow: { xs: 1, md: 0 }}} disabled={!selectedCollege}>
                <InputLabel>Departments</InputLabel>
                <Select
                  multiple
                  value={selectedDeptIds}
                  label="Departments"
                  onChange={() => {}}
                  renderValue={(sel) => renderMultiValue(sel, 'All Departments')}
                  MenuProps={{ PaperProps: { sx: { maxHeight: 360 } } }}
                >
                  {departments.map(d => {
                    const val = d._id || d.id;
                    const selected = selectedDeptIds.includes(val);
                    return (
                      <MenuItem
                        key={val}
                        value={val}
                        onClick={(e) => { e.stopPropagation(); handleDeptToggle(val); }}
                        sx={{
                          py: 1, pl: 2,
                          fontWeight: selected ? 700 : 400,
                          bgcolor: selected ? 'primary.lighter' : 'transparent',
                          '&:hover': { bgcolor: selected ? 'primary.light' : 'action.hover' }
                        }}
                      >
                        {d.departmentName || d.name}
                      </MenuItem>
                    );
                  })}
                </Select>
              </FormControl>

              <FormControl sx={{ minWidth: 250, flexGrow: { xs: 1, md: 0 }}} disabled={!selectedDeptIds.length}>
                <InputLabel>Programs</InputLabel>
                <Select
                  multiple
                  value={selectedProgramIds}
                  label="Programs"
                  onChange={() => {}}
                  renderValue={(sel) => renderMultiValue(sel, 'All Programs')}
                  MenuProps={{ PaperProps: { sx: { maxHeight: 360 } } }}
                >
                  {programs.map(p => {
                    const val = p._id || p.id;
                    const selected = selectedProgramIds.includes(val);
                    return (
                      <MenuItem
                        key={val}
                        value={val}
                        onClick={(e) => { e.stopPropagation(); handleProgToggle(val); }}
                        sx={{
                          py: 1, pl: 2,
                          fontWeight: selected ? 700 : 400,
                          bgcolor: selected ? 'primary.lighter' : 'transparent',
                          '&:hover': { bgcolor: selected ? 'primary.light' : 'action.hover' }
                        }}
                      >
                        {p.programName || p.name || p.code || p.programCode || p._id}
                      </MenuItem>
                    );
                  })}
                </Select>
              </FormControl>

              <FormControl sx={{ minWidth: 220, flexGrow: { xs: 1, md: 0 }}} disabled={!selectedProgramIds.length}>
                <InputLabel>Semesters</InputLabel>
                <Select
                  multiple
                  value={selectedSemesters}
                  label="Semesters"
                  onChange={() => {}}
                  renderValue={(sel) => `${sel?.length || 0} selected`}
                  MenuProps={{ PaperProps: { sx: { maxHeight: 360 } } }}
                >
                  {(semesters || []).map(s => {
                    const selected = selectedSemesters.includes(s);
                    return (
                      <MenuItem
                        key={s}
                        value={s}
                        onClick={(e) => { e.stopPropagation(); handleSemToggle(s); }}
                        sx={{
                          py: 1, pl: 2,
                          fontWeight: selected ? 700 : 400,
                          bgcolor: selected ? 'primary.lighter' : 'transparent',
                          '&:hover': { bgcolor: selected ? 'primary.light' : 'action.hover' }
                        }}
                      >
                        Semester {s}
                      </MenuItem>
                    );
                  })}
                </Select>
              </FormControl>

              <Box sx={{ flex: 1 }} />

              <Tooltip title="Refresh / Load">
                <span>
                  <Button
                    variant="contained"
                    startIcon={loading ? <CircularProgress size={18} /> : <RefreshIcon />}
                    onClick={loadStudents}
                    disabled={!canLoad || loading}
                    sx={{ minWidth: 160 }}
                  >
                    {loading ? (loadingStep || 'Loading…') : 'Load Students'}
                  </Button>
                </span>
              </Tooltip>
                <Stack direction="row" spacing={1}  sx={{pt: 1}}>
              <Tooltip title="Column Manager">
                <span>
                  <IconButton color="primary" onClick={() => setOpenColumnManager(true)}>
                    <SettingsIcon />
                  </IconButton>
                </span>
              </Tooltip>

              <Tooltip title="Reset to Default">
                <span>
                  <IconButton color="warning" onClick={resetTable}>
                    <ResetIcon />
                  </IconButton>
                </span>
              </Tooltip>

              <Tooltip title="Download Edited Table">
                <span>
                  <Button
                    variant="outlined"
                    color="success"
                    startIcon={<DownloadIcon />}
                    onClick={exportEditedTable}
                    disabled={!rows.length}
                  >
                    Export
                  </Button>
                </span>
              </Tooltip>
              </Stack>
            </Stack>

            <Divider />

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
              <Chip label={`Total: ${rows.length}`} color="primary" variant="outlined" />
              <TextField
                value={search}
                onChange={e => setSearch(e.target.value)}
                size="small"
                label="Search (name / email / enroll / dept / program)"
                sx={{ minWidth: 360 }}
              />
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <StudentsGrid
        rows={displayedRows}
        columns={columns}
        columnVisibilityModel={columnVisibilityModel}
        onColumnVisibilityModelChange={setColumnVisibilityModel}
        sortModel={sortModel}
        onSortModelChange={setSortModel}
        columnOrder={columnOrder}
        onColumnOrderChange={setColumnOrder}
        height={'100%'}
        pageSizeOptions={[10, 25, 50, 100]}
        initialPageSize={25}
        getRowHeight={() => 50}
        paperSx={{ borderRadius: 2 }}
        gridSx={{
          '& .MuiDataGrid-columnHeaders': {
            backgroundColor: 'grey.100',
            color: 'text.primary',
            fontWeight: 700,
            borderBottom: '1px solid',
            borderColor: 'divider',
          },
        }}
      />

      {/* Column Manager Dialog */}
      <Dialog open={openColumnManager} onClose={() => setOpenColumnManager(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ColumnIcon /> Configure Columns
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Toggle visibility, rename headers, and reorder columns by dragging headers in the grid; the export uses your current view.
          </Typography>
          <List dense>
            {columns.map((col, idx) => (
              <ListItem key={col.field} divider>
                <ListItemIcon>
                  <DragIcon sx={{ color: 'text.disabled' }} />
                </ListItemIcon>
                <ListItemText
                  primary={
                    <TextField
                      size="small"
                      label="Header"
                      value={col.headerName}
                      onChange={(e) => {
                        const copy = [...columns];
                        copy[idx] = { ...copy[idx], headerName: e.target.value };
                        setColumns(copy);
                      }}
                      sx={{ mr: 2, minWidth: 240 }}
                    />
                  }
                  secondary={col.field}
                />
                <ListItemSecondaryAction>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={columnVisibilityModel[col.field] !== false}
                        onChange={(e) => setColumnVisibilityModel(v => ({ ...v, [col.field]: e.target.checked }))}
                      />
                    }
                    label="Visible"
                  />
                  <Button
                    size="small"
                    color="error"
                    onClick={() => {
                      setColumnVisibilityModel(v => ({ ...v, [col.field]: false }));
                    }}
                    sx={{ ml: 2 }}
                  >
                    Delete
                  </Button>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenColumnManager(false)}>Close</Button>
        </DialogActions>
      </Dialog>

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

export default StudentsList;