/* eslint-disable no-unused-vars */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Card, CardContent, Typography, FormControl, InputLabel, Select, MenuItem, Button,
  Snackbar, Alert, CircularProgress, Stack, Chip, IconButton, Tooltip, Divider, TextField,
  Dialog, DialogTitle, DialogContent, DialogActions, Switch, List, ListItem, ListItemIcon,
  ListItemText, ListItemSecondaryAction, FormControlLabel, Avatar, Tabs, Tab
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  CloudDownload as DownloadIcon,
  Settings as SettingsIcon,
  RestartAlt as ResetIcon,
  People as PeopleIcon,
  School as SchoolIcon,
  ViewColumn as ColumnIcon,
  DragIndicator as DragIcon
} from '@mui/icons-material';
import axios from 'axios';
import { db } from '../../firebase/Firebase';
import { collection, query as fsQuery, where, getDocs } from 'firebase/firestore';
import SecondaryHeader from '../../components/secondaryHeader';
import { HeaderBackButton } from '../../components/header';
import StudentsGrid from '../../components/table';
import StudentsList from '../teachers/StudentsList';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const ALL_VALUE = '*';
const toCode = (p) => (p?.code || p?.programCode || p?._id || '').toString();
const toggleValue = (arr, v) => (arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
const autoFitColumns = (rows) => {
  if (!rows?.length) return [];
  const headers = Object.keys(rows || {});
  const colWidths = headers.map(h => ({ wch: Math.max(h.length, 10) }));
  rows.forEach(row => {
    headers.forEach((h, i) => {
      const val = row[h] == null ? '' : String(row[h]);
      colWidths[i].wch = Math.max(colWidths[i].wch, val.length + 2);
    });
  });
  return colWidths;
};

// Inline avatar + name + email cell
// eslint-disable-next-line react/prop-types
const NameEmailCell = ({ row, fallback = 'U' }) => {
  const { profilePicUrl, firstName, lastName, email } = row || {};
  const initials = `${(firstName || '').charAt(0)}${(lastName || '').charAt(0)}`.trim().toUpperCase() || fallback;
  return (
    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 0.25, minWidth: 0 }}>
      <Avatar
        src={profilePicUrl || undefined}
        alt={firstName || ''}
        sx={{ width: 32, height: 32, fontSize: 14, bgcolor: 'primary.light', color: 'primary.contrastText' }}
        imgProps={{ loading: 'lazy', referrerPolicy: 'no-referrer' }}
      >
        {initials}
      </Avatar>
      <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
        <Typography
          variant="body2"
          sx={{ fontWeight: 600, lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {(firstName || '') + ' ' + (lastName || '')}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {email || '—'}
        </Typography>
      </Box>
    </Stack>
  );
};

// Teachers grid columns
const teacherColumnsDefault = [
  {
    field: 'teacherCard',
    headerName: 'Teacher',
    width: 320,
    sortable: false,
    valueGetter: (...args) => {
      if (args.length >= 2) {
        const [, row] = args;
        return row?.firstName || '';
      }
      const params = args || {};
      return params?.row?.firstName || '';
    },
    renderCell: (params) => <NameEmailCell row={params.row} fallback="T" />,
  },
  { field: 'firstName', headerName: 'First Name', width: 140 },
  { field: 'lastName', headerName: 'Last Name', width: 140 },
  { field: 'email', headerName: 'Email', width: 220 },
  { field: 'phone', headerName: 'Phone', width: 140 },
  { field: 'firebaseId', headerName: 'Firebase Id', width: 240 },
  { field: 'collegeId', headerName: 'College Id', width: 120 },
  { field: 'collegeName', headerName: 'College Name', width: 220 },
  { field: 'departmentName', headerName: 'Department', width: 180 },
  { field: 'programName', headerName: 'Program', width: 180 },
  { field: 'programCode', headerName: 'Program Code', width: 140 },
  { field: 'subjectCodesText', headerName: 'Subject Code(s)', width: 220, sortable: false,
    valueGetter: (...args) => {
      if (args.length >= 2) { const [, row] = args; return row?.subjectCodesText || ''; }
      const params = args || {}; return params?.row?.subjectCodesText || '';
    },
    renderCell: (params) => (
      <Typography
        variant="caption"
        sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}
        title={params.row?.subjectCodesText || ''}
      >
        {params.row?.subjectCodesText || '—'}
      </Typography>
    ),
  },
  { field: 'semestersText', headerName: 'Semester(s)', width: 140,
    sortable: false,
    valueGetter: (...args) => {
      if (args.length >= 2) { const [, row] = args; return row?.semestersText || ''; }
      const params = args || {}; return params?.row?.semestersText || '';
    },
    renderCell: (params) => (
      <Typography
        variant="caption"
        sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}
        title={params.row?.semestersText || ''}
      >
        {params.row?.semestersText || '—'}
      </Typography>
    ),
  },
  { field: 'role', headerName: 'Role', width: 120 },
];

const AdminDirectory = () => {
  const [tab, setTab] = useState(0);
  const [colleges, setColleges] = useState([]);
  const [tDepartments, setTDepartments] = useState([]);
  const [tPrograms, setTPrograms] = useState([]);
  // Teachers filters
  const [tCollege, setTCollege] = useState('');
  const [tDeptIds, setTDeptIds] = useState([]);
  const [tProgramIds, setTProgramIds] = useState([]);
  // Teachers grid state
  const [tRows, setTRows] = useState([]);
  const [tColumns, setTColumns] = useState(teacherColumnsDefault);
  const [tColumnVisibilityModel, setTColumnVisibilityModel] = useState({});
  const [tColumnOrder, setTColumnOrder] = useState(teacherColumnsDefault.map(c => c.field));
  const [tSortModel, setTSortModel] = useState([]);
  const [tSearch, setTSearch] = useState('');
  const [tOpenColumnManager, setTOpenColumnManager] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

  // Load colleges
  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        setLoadingStep('Loading colleges…');
        const res = await axios.get(`${API_BASE_URL}/api/colleges`);
        setColleges(res.data || []);
      } catch {
        setSnackbar({ open: true, message: 'Failed to load colleges', severity: 'error' });
      } finally {
        setLoading(false);
        setLoadingStep('');
      }
    };
    run();
  }, []);

  // load departments
  useEffect(() => {
    const run = async () => {
      if (!tCollege) { setTDepartments([]); setTPrograms([]); setTDeptIds([]); setTProgramIds([]); setTRows([]); return; }
      try {
        setLoading(true);
        setLoadingStep('Loading departments…');
        const deptRes = await axios.get(`${API_BASE_URL}/api/colleges/${tCollege}/departments`);
        setTDepartments([{ _id: ALL_VALUE, departmentName: 'All Departments' }, ...(deptRes.data || [])]);
        setTDeptIds([]); setTPrograms([]); setTProgramIds([]); setTRows([]);
      } catch {
        setSnackbar({ open: true, message: 'Failed to load departments', severity: 'error' });
      } finally {
        setLoading(false); setLoadingStep('');
      }
    };
    run();
  }, [tCollege]);

  //load programs
  useEffect(() => {
    const run = async () => {
      if (!tCollege) return;
      if (!tDeptIds.length) { setTPrograms([]); setTProgramIds([]); return; }
      const deptIds = tDeptIds.includes(ALL_VALUE)
        ? tDepartments.filter(d => d._id !== ALL_VALUE).map(d => d._id)
        : tDeptIds;
      try {
        setLoading(true);
        setLoadingStep('Loading programs…');
        const all = [];
        for (const depId of deptIds) {
          const progRes = await axios.get(`${API_BASE_URL}/api/departments/${tCollege}/${depId}/programs`);
          all.push(...(progRes.data || []));
        }
        const map = new Map();
        all.forEach(p => map.set(p._id || p.id, p));
        setTPrograms([{ _id: ALL_VALUE, programName: 'All Programs', code: ALL_VALUE }, ...Array.from(map.values())]);
        setTProgramIds([]);
        setTRows([]);
      } catch {
        setSnackbar({ open: true, message: 'Failed to load programs', severity: 'error' });
      } finally {
        setLoading(false); setLoadingStep('');
      }
    };
    run();
  }, [tDeptIds, tDepartments, tCollege]);

  const canLoadTeachers = useMemo(() => Boolean(tCollege), [tCollege]);

  const extractSemesterNumber = (sub) => {
    if (!sub || typeof sub !== 'object') return null;
    if (typeof sub.semester === 'number') return sub.semester;
    if (typeof sub.semesterNumber === 'number') return sub.semesterNumber;
    const k = Object.keys(sub).find(key => /^semester\d+$/i.test(key));
    if (k) {
      const val = sub[k];
      return typeof val === 'number' && val ? val : parseInt(String(k).replace(/\D/g, ''), 10);
    }
    return null;
  };

  // Load teachers from Firestore
  const loadTeachers = async () => {
    if (!tCollege) {
      setSnackbar({ open: true, message: 'Select a college', severity: 'warning' });
      return;
    }
    try {
      setLoading(true);
      setLoadingStep('Fetching teachers…');

      const colRef = collection(db, 'Teachers');

      const [snapA, snapB] = await Promise.all([
        getDocs(fsQuery(colRef, where('collegeId', '==', tCollege))),
        getDocs(fsQuery(colRef, where('college', '==', tCollege))),
      ]);

      const seen = new Set();
      const list = [...snapA.docs, ...snapB.docs]
        .filter(d => {
          if (seen.has(d.id)) return false;
          seen.add(d.id);
          return true;
        })
        .map(d => ({ id: d.id, ...d.data() }));

      // Only teachers
      const onlyTeachers = list.filter(
        t => String(t.role || '').toLowerCase() === 'teacher'
      );
      // Department/program filters
      const deptFilterActive = tDeptIds.length && !tDeptIds.includes(ALL_VALUE);
      const progFilterActive = tProgramIds.length && !tProgramIds.includes(ALL_VALUE);
      // Build department lookup maps from API list
      const concreteDepartments = (tDepartments || []).filter(d => (d?._id || d?.id) && (d._id !== ALL_VALUE));
      const deptById = new Map(concreteDepartments.map(d => [String(d._id || d.id), d]));
      const deptNameToId = new Map(
        concreteDepartments.map(d => [String(d.departmentName || d.name || '').toLowerCase(), String(d._id || d.id)])
      );
      // Selected dept sets
      const selectedDeptIds = deptFilterActive ? tDeptIds.map(String) : [];
      const selectedDeptIdSet = new Set(selectedDeptIds);
      const selectedDeptNameSet = new Set(
        (deptFilterActive
          ? concreteDepartments.filter(d => selectedDeptIdSet.has(String(d._id || d.id)))
          : []
        ).map(d => String(d.departmentName || d.name || '').toLowerCase())
      );
      // Selected program code set
      const progCodes = progFilterActive
        ? new Set(
            tPrograms
              .filter(p => tProgramIds.includes(p._id || p.id))
              .map(p => toCode(p))
          )
        : null;

      const normalizeDepartment = (t) => {
        let departmentId = t.departmentId || t.departmentID || t.deptId || (t.department && typeof t.department === 'object' ? (t.department._id || t.department.id) : null) || null;
        let departmentName =
          t.departmentName ||
          (t.department && typeof t.department === 'object' ? (t.department.departmentName || t.department.name) : null) ||
          (typeof t.department === 'string' ? t.department : '') ||'';
        if (!departmentId && typeof t.department === 'string') {
          const raw = t.department.trim();
          if (deptById.has(raw)) {
            departmentId = raw;
            const d = deptById.get(raw);
            if (!departmentName) departmentName = d?.departmentName || d?.name || '';
          } else {
            const foundId = deptNameToId.get(raw.toLowerCase());
            if (foundId) {
              departmentId = foundId;
              const d = deptById.get(foundId);
              if (!departmentName) departmentName = d?.departmentName || d?.name || '';
            }
          }
        }
        // If we have id but not name
        if (departmentId && !departmentName && deptById.has(String(departmentId))) {
          const d = deptById.get(String(departmentId));
          departmentName = d?.departmentName || d?.name || '';
        }

        return {
          departmentId: departmentId ? String(departmentId) : '',
          departmentName: departmentName ? String(departmentName) : '',
        };
      };

      const rows = onlyTeachers
        .map(t => {
          const { departmentId, departmentName } = normalizeDepartment(t);
          const programName = t.programName || (t.program && typeof t.program === 'object' ? t.program.programName : '') || t.program || '';
          const programCode = t.programCode || (t.program && typeof t.program === 'object' ? (t.program.code || t.program.programCode) : '') || t.program || '';

          const subjectsArr = Array.isArray(t.subjects) ? t.subjects : [];
          const subjectCodes = subjectsArr
            .map(s => s.subjectId || s.subjectCode || s.code || '')
            .filter(Boolean);

          const semesters = subjectsArr
            .map(extractSemesterNumber)
            .filter(v => v != null);

          const subjectCodesText = Array.from(new Set(subjectCodes)).join(', ');
          const semestersText = Array.from(new Set(semesters)).sort((a, b) => a - b).join(', ');

          return {
            id: t.uid || t.id,
            firstName: t.firstName || '',
            lastName: t.lastName || '',
            email: t.email || '',
            firebaseId: t.uid || t.id || '',
            collegeId: t.collegeId || t.college || tCollege || '',
            collegeName: t.collegeName || t.college || '',
            departmentId,
            departmentName,
            programName,
            programCode,
            phone: t.phone || (t.contactNumber != null ? String(t.contactNumber) : ''),
            role: t.role || 'Teacher',
            profilePicUrl: t.profilePicUrl || '',
            subjectCodesText,
            semestersText,
          };
        })
        .filter(r => {
          const passDept =
            !deptFilterActive ||
            selectedDeptIdSet.has(String(r.departmentId)) ||
            selectedDeptNameSet.has(String(r.departmentName || '').toLowerCase());

          const passProg =
            !progFilterActive ||
            progCodes?.has(String(r.programCode));

          return passDept && passProg;
        });

      setTRows(rows);
      setSnackbar({ open: true, message: `Loaded ${rows.length} teachers.`, severity: 'success' });
    } catch (e) {
      console.error(e);
      setSnackbar({ open: true, message: 'Failed to load teachers', severity: 'error' });
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  // Teachers search
  const tDisplayedRows = useMemo(() => {
    const q = tSearch.trim().toLowerCase();
    if (!q) return tRows;
    return tRows.filter(r =>
      (r.firstName || '').toLowerCase().includes(q) ||
      (r.lastName || '').toLowerCase().includes(q) ||
      (r.email || '').toLowerCase().includes(q) ||
      (r.departmentName || '').toLowerCase().includes(q) ||
      (r.programName || '').toLowerCase().includes(q) ||
      (r.programCode || '').toLowerCase().includes(q) ||
      (r.collegeName || '').toLowerCase().includes(q) ||
      (r.subjectCodesText || '').toLowerCase().includes(q) ||
      (r.semestersText || '').toLowerCase().includes(q)
    );
  }, [tRows, tSearch]);

  // Export teachers
  const exportTeachersView = async () => {
    if (!tDisplayedRows.length) {
      setSnackbar({ open: true, message: 'Nothing to export', severity: 'warning' });
      return;
    }
    const visibleCols = tColumnOrder
      .map(f => tColumns.find(c => c.field === f))
      .filter(c => !!c && (tColumnVisibilityModel[c.field] !== false));
    const headers = visibleCols.map(c => c.headerName || c.field);
    const exportRows = tDisplayedRows.map(r => {
      const obj = {};
      visibleCols.forEach(c => { obj[c.headerName || c.field] = r[c.field] ?? ''; });
      return obj;
    });
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(exportRows);
      ws['!cols'] = autoFitColumns(exportRows);
      XLSX.utils.book_append_sheet(wb, ws, 'Teachers');
      XLSX.writeFile(wb, `teachers_${tCollege || 'college'}_${Date.now()}.xlsx`);
      setSnackbar({ open: true, message: 'Excel downloaded', severity: 'success' });
    } catch {
      const csvRows = [
        headers.join(','),
        ...exportRows.map(r => headers.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(',')),
      ].join('\n');
      const blob = new Blob([csvRows], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = `teachers_${tCollege || 'college'}_${Date.now()}.csv`; a.click();
      URL.revokeObjectURL(url);
      setSnackbar({ open: true, message: 'CSV downloaded (XLSX not available)', severity: 'info' });
    }
  };

  // Column manager
  const [tLocalCols, setTLocalCols] = useState(teacherColumnsDefault.map(c => ({ ...c })));
  const [tLocalVis, setTLocalVis] = useState({});
  const [tLocalOrder, setTLocalOrder] = useState(teacherColumnsDefault.map(c => c.field));
  useEffect(() => {
    if (tOpenColumnManager) {
      setTLocalCols(tColumns.map(c => ({ ...c })));
      setTLocalVis({ ...tColumnVisibilityModel });
      setTLocalOrder([...tColumnOrder]);
    }
  }, [tOpenColumnManager]);
  const applyTeacherColumnEdits = () => {
    setTColumns(tLocalCols);
    setTColumnVisibilityModel(tLocalVis);
    setTColumnOrder(tLocalOrder);
    setTOpenColumnManager(false);
  };
  const resetTeachersTable = () => {
    setTColumns(teacherColumnsDefault);
    setTColumnVisibilityModel({});
    setTColumnOrder(teacherColumnsDefault.map(c => c.field));
    setTSortModel([]);
    setTSearch('');
    setSnackbar({ open: true, message: 'Teachers table reset to default', severity: 'success' });
  };

  // Multi-select helpers
  const renderMultiValue = (selected, allLabel) => {
    if (Array.isArray(selected) && selected.includes(ALL_VALUE)) return allLabel;
    return `${selected?.length || 0} selected`;
  };
  const tToggleDept = (value) => {
    if (value === ALL_VALUE) { setTDeptIds(prev => prev.includes(ALL_VALUE) ? [] : [ALL_VALUE]); return; }
    setTDeptIds(prev => toggleValue(prev.filter(v => v !== ALL_VALUE), value));
  };
  const tToggleProg = (value) => {
    if (value === ALL_VALUE) { setTProgramIds(prev => prev.includes(ALL_VALUE) ? [] : [ALL_VALUE]); return; }
    setTProgramIds(prev => toggleValue(prev.filter(v => v !== ALL_VALUE), value));
  };

  return (
    <Box sx={{ p: 3, minHeight: '100vh', maxWidth: 1700, mx: 'auto' }}>
      <SecondaryHeader
          title="Admin Directory"
          leftArea={<><HeaderBackButton/><PeopleIcon color="primary" /></>}
          rightArea={
          <Tabs value={tab} onChange={(_, v) => setTab(v)} textColor="primary" indicatorColor="primary">
          <Tab icon={<PeopleIcon />} iconPosition="start" label="Teachers" />
          <Tab icon={<SchoolIcon />} iconPosition="start" label="Students" />
          </Tabs>
          }
          elevation={0}
          border
          paperSx={{ mb: 2 }}
          />
      {tab === 0 && (
        <>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Stack spacing={2}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }} sx={{ width: '100%', flexWrap: 'wrap', gap:1}}>
                  <FormControl sx={{ minWidth: 280, flexGrow: { xs: 1, md: 0 } }}>
                    <InputLabel>College</InputLabel>
                    <Select value={tCollege} label="College" onChange={(e) => setTCollege(e.target.value)}>
                      {colleges.map(c => (
                        <MenuItem key={c._id || c.id} value={c._id || c.id}>{c.name || c._id || c.id}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <FormControl sx={{ minWidth: 280, flexGrow: { xs: 1, md: 0 } }} disabled={!tCollege}>
                    <InputLabel>Departments</InputLabel>
                    <Select
                      multiple
                      value={tDeptIds}
                      label="Departments"
                      onChange={() => {}}
                      renderValue={(sel) => renderMultiValue(sel, 'All Departments')}
                      MenuProps={{ PaperProps: { sx: { maxHeight: 360 } } }}
                    >
                      {tDepartments.map(d => {
                        const val = d._id || d.id;
                        const selected = tDeptIds.includes(val);
                        return (
                          <MenuItem
                            key={val}
                            value={val}
                            onClick={(e) => { e.stopPropagation(); tToggleDept(val); }}
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

                  <FormControl sx={{ minWidth: 280, flexGrow: { xs: 1, md: 0 } }} disabled={!tDeptIds.length}>
                    <InputLabel>Programs</InputLabel>
                    <Select
                      multiple
                      value={tProgramIds}
                      label="Programs"
                      onChange={() => {}}
                      renderValue={(sel) => renderMultiValue(sel, 'All Programs')}
                      MenuProps={{ PaperProps: { sx: { maxHeight: 360 } } }}
                    >
                      {tPrograms.map(p => {
                        const val = p._id || p.id;
                        const selected = tProgramIds.includes(val);
                        return (
                          <MenuItem
                            key={val}
                            value={val}
                            onClick={(e) => { e.stopPropagation(); tToggleProg(val); }}
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

                  <Box sx={{ flex: 1 }} />

                  <Tooltip title="Refresh / Load">
                    <span>
                      <Button
                        variant="contained"
                        startIcon={loading ? <CircularProgress size={18} /> : <RefreshIcon />}
                        onClick={loadTeachers}
                        disabled={!canLoadTeachers || loading}
                        sx={{ minWidth: 160 }}
                      >
                        {loading ? (loadingStep || 'Loading…') : 'Load Teachers'}
                      </Button>
                    </span>
                  </Tooltip>
                    <Stack direction="row" spacing={1} alignItems="center">
                  <Tooltip title="Column Manager">
                    <span>
                      <IconButton color="primary" onClick={() => setTOpenColumnManager(true)}>
                        <SettingsIcon />
                      </IconButton>
                    </span>
                  </Tooltip>

                  <Tooltip title="Reset to Default">
                    <span>
                      <IconButton color="warning" onClick={resetTeachersTable}>
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
                        onClick={exportTeachersView}
                        disabled={!tRows.length}
                      >
                        Export
                      </Button>
                    </span>
                  </Tooltip>
                  </Stack>
                </Stack>

                <Divider />

                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
                  <Chip label={`Total: ${tRows.length}`} color="primary" variant="outlined" />
                  <TextField
                    value={tSearch}
                    onChange={e => setTSearch(e.target.value)}
                    size="small"
                    label="Search (name / email / dept / program / college)"
                    sx={{ minWidth: {xs:"100%", md:360} }}
                  />
                </Stack>
              </Stack>
            </CardContent>
          </Card>

          <StudentsGrid
            rows={tDisplayedRows}
            columns={tColumns}
            columnVisibilityModel={tColumnVisibilityModel}
            onColumnVisibilityModelChange={setTColumnVisibilityModel}
            sortModel={tSortModel}
            onSortModelChange={setTSortModel}
            columnOrder={tColumnOrder}
            onColumnOrderChange={setTColumnOrder}
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
              '& .MuiDataGrid-columnSeparator': { color: 'divider' },
              '& .MuiDataGrid-row': {
                '&:nth-of-type(odd)': { backgroundColor: 'grey.50' },
                '&:hover': { backgroundColor: 'action.hover' },
              },
              '& .MuiDataGrid-cell': {
                borderBottom: '1px solid',
                borderColor: 'grey.100',
              },
              '& .MuiDataGrid-footerContainer': {
                borderTop: '1px solid',
                borderColor: 'divider',
                bgcolor: 'grey.50',
              },
            }}
          />

          {/* Teachers Column Manager */}
          <Dialog open={tOpenColumnManager} onClose={() => setTOpenColumnManager(false)} maxWidth="md" fullWidth>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ColumnIcon /> Configure Columns
            </DialogTitle>
            <DialogContent dividers>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Toggle visibility, rename headers, and reorder columns by dragging headers in the grid; the export uses your current view.
              </Typography>
              <List dense>
                {tColumns.map((col, idx) => (
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
                            const copy = [...tColumns];
                            copy[idx] = { ...copy[idx], headerName: e.target.value };
                            setTColumns(copy);
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
                            checked={tColumnVisibilityModel[col.field] !== false}
                            onChange={(e) => setTColumnVisibilityModel(v => ({ ...v, [col.field]: e.target.checked }))}
                          />
                        }
                        label="Visible"
                      />
                      <Button
                        size="small"
                        color="error"
                        onClick={() => {
                          setTColumnVisibilityModel(v => ({ ...v, [col.field]: false }));
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
              <Button onClick={() => setTOpenColumnManager(false)}>Close</Button>
            </DialogActions>
          </Dialog>
        </>
      )}

      {tab === 1 && (
        <StudentsList adminMode />
      )}

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

export default AdminDirectory;
