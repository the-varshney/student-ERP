/* eslint-disable react/prop-types */
/* eslint-disable no-unused-vars */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box, Paper, Typography, Tabs, Tab, Stack, Divider, Button, IconButton, Tooltip,
  Snackbar, Alert, CircularProgress, TextField, Select, MenuItem, InputLabel, FormControl,
  Dialog, DialogTitle, DialogContent, DialogActions, Chip
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  Save as SaveIcon,
} from '@mui/icons-material';
import axios from 'axios';
import { auth, db } from '../../firebase/Firebase';
import { doc, getDoc } from 'firebase/firestore';
import { HeaderBackButton } from '../../components/header';
import SecondaryHeader from '../../components/secondaryHeader';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// helpers
const neat = (v) => (v == null ? '' : v);
const byId = (list, id) => list.find(x => (x._id || x.id) === id);
const uniq = (arr) => Array.from(new Set(arr || []));
const sortByKeyAsc = (arr, key) => [...(arr || [])].sort((a, b) => String(a?.[key] || '').localeCompare(String(b?.[key] || '')));

const emptyCollege = { _id: '', name: '', address: '', departments: [] };
const emptyDept = { _id: '', departmentName: '' };
const emptyProgram = { _id: '', programName: '', semesters: [] };
const emptySubject = { _id: '', subjectName: '', credit: '' };

const ConfirmDialog = ({ open, title, content, onClose, onConfirm }) => (
  <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
    <DialogTitle>{title}</DialogTitle>
    <DialogContent dividers>
      <Typography variant="body2">{content}</Typography>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="contained" color="error" onClick={onConfirm} startIcon={<DeleteIcon />}>Delete</Button>
    </DialogActions>
  </Dialog>
);

const ManageDeptProgramsDialog = ({
  open,
  onClose,
  college,
  allDepartments,
  allPrograms,
  onSave,
}) => {
  const [local, setLocal] = useState(college?.departments || []);
  const [selectedDept, setSelectedDept] = useState('');

  useEffect(() => {
    if (open) {
      setLocal(college?.departments || []);
      setSelectedDept('');
    }
  }, [open, college]);

  const addDeptIfMissing = (deptId) => {
    setLocal(prev => {
      if (prev.some(d => d.deptId === deptId)) return prev;
      return [...prev, { deptId, offeredProgramIds: [] }];
    });
  };

  const removeDept = (deptId) => {
    setLocal(prev => prev.filter(d => d.deptId !== deptId));
    if (selectedDept === deptId) setSelectedDept('');
  };

  const setDeptPrograms = (deptId, progIds) => {
    setLocal(prev => prev.map(d => d.deptId === deptId ? { ...d, offeredProgramIds: uniq(progIds) } : d));
  };

  const selectedDeptEntry = local.find(d => d.deptId === selectedDept);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Manage Departments & Programs for {college?.name || college?._id}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 260 }}>
              <InputLabel>Add Department</InputLabel>
              <Select
                label="Add Department"
                value=""
                onChange={(e) => addDeptIfMissing(e.target.value)}
              >
                {allDepartments.map(d => (
                  <MenuItem key={d._id} value={d._id}>{d.departmentName} ({d._id})</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>

          <Divider />

          <Stack spacing={1}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Assigned Departments</Typography>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
              {local.map(d => (
                <Chip
                  key={d.deptId}
                  label={`${d.deptId} — ${byId(allDepartments, d.deptId)?.departmentName || ''}`}
                  color={selectedDept === d.deptId ? 'primary' : 'default'}
                  onClick={() => setSelectedDept(d.deptId)}
                  onDelete={() => removeDept(d.deptId)}
                />
              ))}
              {!local.length && <Typography variant="body2" color="text.secondary">No departments assigned.</Typography>}
            </Stack>
          </Stack>

          {selectedDept && (
            <Stack spacing={1}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                Programs offered in {selectedDept} ({byId(allDepartments, selectedDept)?.departmentName || ''})
              </Typography>
              <FormControl size="small" fullWidth>
                <InputLabel>Offered Programs</InputLabel>
                <Select
                  multiple
                  value={selectedDeptEntry?.offeredProgramIds || []}
                  label="Offered Programs"
                  onChange={(e) => setDeptPrograms(selectedDept, e.target.value)}
                  renderValue={(vals) => `${vals.length} selected`}
                >
                  {allPrograms.map(p => (
                    <MenuItem key={p._id} value={p._id}>{p.programName} ({p._id})</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button variant="contained" startIcon={<SaveIcon />} onClick={() => onSave(local)}>Save</Button>
      </DialogActions>
    </Dialog>
  );
};

const ManageProgramSemestersDialog = ({
  open,
  onClose,
  program,
  allSubjects,
  onSave,
}) => {
  const [local, setLocal] = useState(program?.semesters || []);

  useEffect(() => {
    if (open) setLocal(program?.semesters || []);
  }, [open, program]);

  const addSemester = () => {
    const maxNum = Math.max(0, ...local.map(s => s.semesterNumber || 0));
    setLocal(prev => [...prev, { semesterNumber: maxNum + 1, subjectIds: [] }]);
  };
  const removeSemester = (num) => setLocal(prev => prev.filter(s => s.semesterNumber !== num));
  const updateSemesterNum = (oldNum, newNum) => {
    const n = parseInt(newNum, 10);
    if (!Number.isFinite(n) || n <= 0) return;
    setLocal(prev => prev.map(s => s.semesterNumber === oldNum ? { ...s, semesterNumber: n } : s));
  };
  const setSubjectsForSem = (num, subIds) => {
    setLocal(prev => prev.map(s => s.semesterNumber === num ? { ...s, subjectIds: uniq(subIds) } : s));
  };

  const sorted = useMemo(() => [...local].sort((a, b) => (a.semesterNumber || 0) - (b.semesterNumber || 0)), [local]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Manage Semesters — {program?.programName} ({program?._id})</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" startIcon={<AddIcon />} onClick={addSemester}>Add Semester</Button>
          </Stack>

          {!sorted.length && (
            <Typography variant="body2" color="text.secondary">No semesters yet. Click “Add Semester”.</Typography>
          )}

          {sorted.map(s => (
            <Paper key={s.semesterNumber} variant="outlined" sx={{ p: 1.5, borderRadius: 1.5 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField
                  size="small"
                  type="number"
                  label="Semester Number"
                  value={s.semesterNumber}
                  onChange={(e) => updateSemesterNum(s.semesterNumber, e.target.value)}
                  sx={{ width: 180 }}
                />
                <FormControl size="small" fullWidth>
                  <InputLabel>Subjects</InputLabel>
                  <Select
                    multiple
                    value={s.subjectIds || []}
                    label="Subjects"
                    onChange={(e) => setSubjectsForSem(s.semesterNumber, e.target.value)}
                    renderValue={(vals) => `${vals.length} selected`}
                  >
                    {allSubjects.map(sub => (
                      <MenuItem key={sub._id} value={sub._id}>
                        {sub.subjectName} ({sub._id})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Tooltip title="Remove Semester">
                  <IconButton color="error" onClick={() => removeSemester(s.semesterNumber)}>
                    <DeleteIcon />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Paper>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button variant="contained" startIcon={<SaveIcon />} onClick={() => onSave(sorted)}>Save</Button>
      </DialogActions>
    </Dialog>
  );
};

// Reusable header
const SectionHeader = ({ title, search, onSearchChange, onAdd, onRefresh }) => (
  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} justifyContent="space-between" sx={{ mb: 1 }}>
    <Typography variant="h6" sx={{ fontWeight: 800 }}>{title}</Typography>
    <Stack direction="row" spacing={1} alignItems="center">
      <TextField size="small" label="Search" value={search} onChange={onSearchChange} sx={{ minWidth: 220 }} />
      {onRefresh && (
        <Tooltip title="Refresh">
          <span><IconButton onClick={onRefresh}><RefreshIcon /></IconButton></span>
        </Tooltip>
      )}
      {onAdd && (
        <Button variant="contained" startIcon={<AddIcon />} onClick={onAdd}>Add</Button>
      )}
    </Stack>
  </Stack>
);

function CollegesTab({
  list,
  colleges,
  departments,
  programs,
  search,
  setSearch,
  loadAll,
  editCollege, setEditCollege,
  openDeptProgDlg, setOpenDeptProgDlg,
  mapCollege, setMapCollege,
  upsert,
  setConfirm,
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
      <SectionHeader
        title="Colleges"
        search={search}
        onSearchChange={(e) => setSearch(e.target.value)}
        onAdd={() => setEditCollege({ ...emptyCollege })}
        onRefresh={loadAll}
      />
      <Divider sx={{ mb: 1 }} />
      {!list.length ? (
        <Typography variant="body2" color="text.secondary">No colleges found.</Typography>
      ) : (
        <Stack spacing={1}>
          {list.map(c => (
            <Paper key={c._id} variant="outlined" sx={{ p: 1.5, borderRadius: 1.5 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} justifyContent="space-between">
                <Stack spacing={0.25}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{c.name} ({c._id})</Typography>
                  <Typography variant="body2" color="text.secondary">{c.address}</Typography>
                  <Typography variant="body2">Departments: {c.departments?.length || 0}</Typography>
                </Stack>
                <Stack direction="row" spacing={1}>
                  <Tooltip title="Manage Departments & Programs">
                    <Button variant="outlined" onClick={() => { setMapCollege(c); setOpenDeptProgDlg(true); }}>Map</Button>
                  </Tooltip>
                  <Tooltip title="Edit">
                    <IconButton onClick={() => setEditCollege({ ...c })}><EditIcon /></IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton color="error" onClick={() => setConfirm({ open: true, what: 'colleges', id: c._id })}><DeleteIcon /></IconButton>
                  </Tooltip>
                </Stack>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}

      <Dialog open={!!editCollege} onClose={() => setEditCollege(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{colleges.some(x => x._id === editCollege?._id) ? 'Edit College' : 'Add College'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.25}>
            <TextField size="small" label="College ID" value={editCollege?._id || ''} onChange={(e) => setEditCollege(v => ({ ...v, _id: e.target.value }))} disabled={colleges.some(x => x._id === editCollege?._id)} />
            <TextField size="small" label="Name" value={editCollege?.name || ''} onChange={(e) => setEditCollege(v => ({ ...v, name: e.target.value }))} />
            <TextField size="small" label="Address" value={editCollege?.address || ''} onChange={(e) => setEditCollege(v => ({ ...v, address: e.target.value }))} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditCollege(null)}>Close</Button>
          <Button variant="contained" startIcon={<SaveIcon />} onClick={() => upsert('colleges', editCollege)}>Save</Button>
        </DialogActions>
      </Dialog>

      <ManageDeptProgramsDialog
        open={openDeptProgDlg}
        onClose={() => setOpenDeptProgDlg(false)}
        college={mapCollege}
        allDepartments={departments}
        allPrograms={programs}
        onSave={async (deps) => {
          const payload = { ...mapCollege, departments: deps };
          await upsert('colleges', payload);
          setOpenDeptProgDlg(false);
        }}
      />
    </Paper>
  );
}

function DepartmentsTab({
  list,
  departments,
  search,
  setSearch,
  loadAll,
  editDept, setEditDept,
  upsert,
  setConfirm,
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
      <SectionHeader
        title="Departments"
        search={search}
        onSearchChange={(e) => setSearch(e.target.value)}
        onAdd={() => setEditDept({ ...emptyDept })}
        onRefresh={loadAll}
      />
      <Divider sx={{ mb: 1 }} />
      {!list.length ? (
        <Typography variant="body2" color="text.secondary">No departments found.</Typography>
      ) : (
        <Stack spacing={1}>
          {list.map(d => (
            <Paper key={d._id} variant="outlined" sx={{ p: 1.5, borderRadius: 1.5 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} justifyContent="space-between">
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{d.departmentName} ({d._id})</Typography>
                <Stack direction="row" spacing={1}>
                  <Tooltip title="Edit">
                    <IconButton onClick={() => setEditDept({ ...d })}><EditIcon /></IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton color="error" onClick={() => setConfirm({ open: true, what: 'departments', id: d._id })}><DeleteIcon /></IconButton>
                  </Tooltip>
                </Stack>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}

      <Dialog open={!!editDept} onClose={() => setEditDept(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{departments.some(x => x._id === editDept?._id) ? 'Edit Department' : 'Add Department'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.25}>
            <TextField size="small" label="Department ID" value={editDept?._id || ''} onChange={(e) => setEditDept(v => ({ ...v, _id: e.target.value }))} disabled={departments.some(x => x._id === editDept?._id)} />
            <TextField size="small" label="Department Name" value={editDept?.departmentName || ''} onChange={(e) => setEditDept(v => ({ ...v, departmentName: e.target.value }))} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDept(null)}>Close</Button>
          <Button variant="contained" startIcon={<SaveIcon />} onClick={() => upsert('departments', editDept)}>Save</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

function ProgramsTab({
  list,
  programs,
  search,
  setSearch,
  loadAll,
  editProgram, setEditProgram,
  openSemDlg, setOpenSemDlg,
  semProgram, setSemProgram,
  subjects,
  upsert,
  setConfirm,
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
      <SectionHeader
        title="Programs"
        search={search}
        onSearchChange={(e) => setSearch(e.target.value)}
        onAdd={() => setEditProgram({ ...emptyProgram })}
        onRefresh={loadAll}
      />
      <Divider sx={{ mb: 1 }} />
      {!list.length ? (
        <Typography variant="body2" color="text.secondary">No programs found.</Typography>
      ) : (
        <Stack spacing={1}>
          {list.map(p => (
            <Paper key={p._id} variant="outlined" sx={{ p: 1.5, borderRadius: 1.5 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} justifyContent="space-between">
                <Stack spacing={0.25}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{p.programName} ({p._id})</Typography>
                  <Typography variant="body2">Semesters: {p.semesters?.length || 0}</Typography>
                </Stack>
                <Stack direction="row" spacing={1}>
                  <Tooltip title="Manage Semesters & Subjects">
                    <Button variant="outlined" onClick={() => { setSemProgram(p); setOpenSemDlg(true); }}>Semesters</Button>
                  </Tooltip>
                  <Tooltip title="Edit">
                    <IconButton onClick={() => setEditProgram({ ...p })}><EditIcon /></IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton color="error" onClick={() => setConfirm({ open: true, what: 'programs', id: p._id })}><DeleteIcon /></IconButton>
                  </Tooltip>
                </Stack>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}

      <Dialog open={!!editProgram} onClose={() => setEditProgram(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{programs.some(x => x._id === editProgram?._id) ? 'Edit Program' : 'Add Program'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.25}>
            <TextField size="small" label="Program ID" value={editProgram?._id || ''} onChange={(e) => setEditProgram(v => ({ ...v, _id: e.target.value }))} disabled={programs.some(x => x._id === editProgram?._id)} />
            <TextField size="small" label="Program Name" value={editProgram?.programName || ''} onChange={(e) => setEditProgram(v => ({ ...v, programName: e.target.value }))} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditProgram(null)}>Close</Button>
          <Button variant="contained" startIcon={<SaveIcon />} onClick={() => upsert('programs', editProgram)}>Save</Button>
        </DialogActions>
      </Dialog>

      <ManageProgramSemestersDialog
        open={openSemDlg}
        onClose={() => setOpenSemDlg(false)}
        program={semProgram}
        allSubjects={subjects}
        onSave={async (sems) => {
          const payload = { ...semProgram, semesters: sems };
          await upsert('programs', payload);
          setOpenSemDlg(false);
        }}
      />
    </Paper>
  );
}

function SubjectsTab({
  list,
  subjects,
  search,
  setSearch,
  loadAll,
  editSubject, setEditSubject,
  upsert,
  setConfirm,
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
      <SectionHeader
        title="Subjects"
        search={search}
        onSearchChange={(e) => setSearch(e.target.value)}
        onAdd={() => setEditSubject({ ...emptySubject })}
        onRefresh={loadAll}
      />
      <Divider sx={{ mb: 1 }} />
      {!list.length ? (
        <Typography variant="body2" color="text.secondary">No subjects found.</Typography>
      ) : (
        <Stack spacing={1}>
          {list.map(s => (
            <Paper key={s._id} variant="outlined" sx={{ p: 1.5, borderRadius: 1.5 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} justifyContent="space-between">
                <Stack spacing={0.25}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{s.subjectName} ({s._id})</Typography>
                  <Typography variant="body2">Credit: {s.credit}</Typography>
                </Stack>
                <Stack direction="row" spacing={1}>
                  <Tooltip title="Edit">
                    <IconButton onClick={() => setEditSubject({ ...s })}><EditIcon /></IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton color="error" onClick={() => setConfirm({ open: true, what: 'subjects', id: s._id })}><DeleteIcon /></IconButton>
                  </Tooltip>
                </Stack>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}

      <Dialog open={!!editSubject} onClose={() => setEditSubject(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{subjects.some(x => x._id === editSubject?._id) ? 'Edit Subject' : 'Add Subject'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.25}>
            <TextField size="small" label="Subject ID" value={editSubject?._id || ''} onChange={(e) => setEditSubject(v => ({ ...v, _id: e.target.value }))} disabled={subjects.some(x => x._id === editSubject?._id)} />
            <TextField size="small" label="Subject Name" value={editSubject?.subjectName || ''} onChange={(e) => setEditSubject(v => ({ ...v, subjectName: e.target.value }))} />
            <TextField size="small" type="number" label="Credit" value={editSubject?.credit ?? ''} onChange={(e) => setEditSubject(v => ({ ...v, credit: Number(e.target.value) }))} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditSubject(null)}>Close</Button>
          <Button variant="contained" startIcon={<SaveIcon />} onClick={() => upsert('subjects', editSubject)}>Save</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

const AdminCatalogManager = () => {
  const [loadingGate, setLoadingGate] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

  const [colleges, setColleges] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [subjects, setSubjects] = useState([]);

  const [search, setSearch] = useState('');

  const [editCollege, setEditCollege] = useState(null);
  const [editDept, setEditDept] = useState(null);
  const [editProgram, setEditProgram] = useState(null);
  const [editSubject, setEditSubject] = useState(null);

  const [confirm, setConfirm] = useState({ open: false, what: '', id: '' });

  const [openDeptProgDlg, setOpenDeptProgDlg] = useState(false);
  const [mapCollege, setMapCollege] = useState(null);

  const [openSemDlg, setOpenSemDlg] = useState(false);
  const [semProgram, setSemProgram] = useState(null);

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

  const loadAll = useCallback(async () => {
    try {
      setBusy(true);
      const [c, d, p, s] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/colleges`),
        axios.get(`${API_BASE_URL}/api/departments`),
        axios.get(`${API_BASE_URL}/api/programs`),
        axios.get(`${API_BASE_URL}/api/subjects`),
      ]);
      setColleges(sortByKeyAsc(c.data || [], '_id'));
      setDepartments(sortByKeyAsc(d.data || [], '_id'));
      setPrograms(sortByKeyAsc(p.data || [], '_id'));
      setSubjects(sortByKeyAsc(s.data || [], '_id'));
    } catch (e) {
      setSnackbar({ open: true, message: 'Failed to load catalogs', severity: 'error' });
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { if (isAdmin) loadAll(); }, [isAdmin, loadAll]);

  const filtered = (list, keys) => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return (list || []).filter(it => keys.some(k => String(it?.[k] || '').toLowerCase().includes(q)));
  };

  // CRUD handlers
  const upsert = async (kind, payload) => {
    try {
      const id = payload?._id;
      if (!id) throw new Error('ID is required');
      const base = `${API_BASE_URL}/api/${kind}`;
      const exists = kind === 'colleges'
        ? colleges.some(x => x._id === id)
        : kind === 'departments'
        ? departments.some(x => x._id === id)
        : kind === 'programs'
        ? programs.some(x => x._id === id)
        : subjects.some(x => x._id === id);

      if (exists) {
        await axios.put(`${base}/${encodeURIComponent(id)}`, payload);
        setSnackbar({ open: true, message: `Updated ${kind.slice(0, -1)} ${id}`, severity: 'success' });
      } else {
        await axios.post(base, payload);
        setSnackbar({ open: true, message: `Created ${kind.slice(0, -1)} ${id}`, severity: 'success' });
      }
      await loadAll();
    } catch (e) {
      setSnackbar({ open: true, message: e?.response?.data?.error || `Failed to save ${kind.slice(0, -1)}`, severity: 'error' });
    }
  };

  const removeOne = async (kind, id) => {
    try {
      await axios.delete(`${API_BASE_URL}/api/${kind}/${encodeURIComponent(id)}`);
      setSnackbar({ open: true, message: `Deleted ${kind.slice(0, -1)} ${id}`, severity: 'success' });
      await loadAll();
    } catch (e) {
      setSnackbar({ open: true, message: e?.response?.data?.error || `Failed to delete ${kind.slice(0, -1)}`, severity: 'error' });
    }
  };

  // confirm delete handler
  const confirmDelete = async () => {
    const { what, id } = confirm;
    setConfirm({ open: false, what: '', id: '' });
    if (!what || !id) return;
    await removeOne(what, id);
  };

  if (loadingGate) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }
  if (!isAdmin) return null;

  // Pre-filter lists
  const collegesList = filtered(colleges, ['_id', 'name', 'address']);
  const departmentsList = filtered(departments, ['_id', 'departmentName']);
  const programsList = filtered(programs, ['_id', 'programName']);
  const subjectsList = filtered(subjects, ['_id', 'subjectName']);

  return (
    <Box sx={{ p: { xs: 1.5, md: 2.5 }, maxWidth: 1200, mx: 'auto' }}>
      <SecondaryHeader
          title="Admin Catalog Manager"
          leftArea={
            <Stack direction="row" spacing={1} alignItems="center">
              <HeaderBackButton size="small" />
            </Stack>
          }
          tabs={[
            { label: 'Colleges', value: 0 },
            { label: 'Departments', value: 1 },
            { label: 'Programs', value: 2 },
            { label: 'Subjects', value: 3 },
          ]}
          tabValue={tab}
          onTabChange={(_, v) => setTab(v)}
          elevation={0}
          border
          paperSx={{ p: 2, borderRadius: 2, mb: 2 }}
        />

      {tab === 0 && (
        <CollegesTab
          list={collegesList}
          colleges={colleges}
          departments={departments}
          programs={programs}
          search={search}
          setSearch={setSearch}
          loadAll={loadAll}
          editCollege={editCollege}
          setEditCollege={setEditCollege}
          openDeptProgDlg={openDeptProgDlg}
          setOpenDeptProgDlg={setOpenDeptProgDlg}
          mapCollege={mapCollege}
          setMapCollege={setMapCollege}
          upsert={upsert}
          setConfirm={setConfirm}
        />
      )}

      {tab === 1 && (
        <DepartmentsTab
          list={departmentsList}
          departments={departments}
          search={search}
          setSearch={setSearch}
          loadAll={loadAll}
          editDept={editDept}
          setEditDept={setEditDept}
          upsert={upsert}
          setConfirm={setConfirm}
        />
      )}

      {tab === 2 && (
        <ProgramsTab
          list={programsList}
          programs={programs}
          search={search}
          setSearch={setSearch}
          loadAll={loadAll}
          editProgram={editProgram}
          setEditProgram={setEditProgram}
          openSemDlg={openSemDlg}
          setOpenSemDlg={setOpenSemDlg}
          semProgram={semProgram}
          setSemProgram={setSemProgram}
          subjects={subjects}
          upsert={upsert}
          setConfirm={setConfirm}
        />
      )}

      {tab === 3 && (
        <SubjectsTab
          list={subjectsList}
          subjects={subjects}
          search={search}
          setSearch={setSearch}
          loadAll={loadAll}
          editSubject={editSubject}
          setEditSubject={setEditSubject}
          upsert={upsert}
          setConfirm={setConfirm}
        />
      )}

      <ConfirmDialog
        open={confirm.open}
        title="Confirm Delete"
        content={`This action will permanently delete ${confirm.what?.slice(0, -1)} “${confirm.id}”. Continue?`}
        onClose={() => setConfirm({ open: false, what: '', id: '' })}
        onConfirm={confirmDelete}
      />

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

export default AdminCatalogManager;