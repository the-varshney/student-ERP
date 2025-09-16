/* eslint-disable no-unused-vars */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import {
  Box, Card, CardContent, Typography, Stack, FormControl, InputLabel, Select, MenuItem,
  Button, TextField, Divider, Snackbar, Alert, CircularProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Tabs, Tab,
  Grid, Chip, Switch, FormControlLabel, Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import {
  CloudUpload as CloudUploadIcon,
  Save as SaveIcon,
  Publish as PublishIcon,
  ArrowBack as ArrowBackIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';
import { auth, db, storage } from '../../firebase/Firebase';
import {
  doc, getDoc, collection, addDoc, setDoc, serverTimestamp, query, where, getDocs
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import axios from 'axios';
import * as XLSX from 'xlsx';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { useAuth } from '../../context/AuthContext';
import SecondaryHeader from "../../components/secondaryHeader";
import { HeaderBackButton } from "../../components/header";
dayjs.extend(utc);
dayjs.extend(timezone);

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const TZ = 'Asia/Kolkata';

const isExcelExt = (name = '') => /\.xlsx?$/i.test(String(name || ''));
const guessExcelMime = (name = '', fallback = '') => {
  if (/\.xlsx$/i.test(name)) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (/\.xls$/i.test(name)) return 'application/vnd.ms-excel';
  return fallback || 'application/octet-stream';
};

const fileKind = (file) => {
  const name = String(file?.name || '');
  const type = String(file?.type || '');
  if (type.startsWith('image/')) return 'image';
  if (type === 'application/pdf') return 'pdf';
  const excelMimes = new Set([
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.ms-excel.sheet.macroEnabled.12',
    'application/octet-stream',
  ]);
  if (type && (type.includes('spreadsheet') || excelMimes.has(type))) return 'excel';
  if (isExcelExt(name)) return 'excel';
  return 'unknown';
};

const sanitizeName = (s) => String(s || '').replace(/[^a-zA-Z0-9._-]/g, '_');

const autoMapHeaders = (headers) => {
  const h = headers.map((x) => String(x || '').trim().toLowerCase());
  const find = (...keys) => {
    const idx = h.findIndex((x) => keys.some((k) => x.includes(k)));
    return idx >= 0 ? headers[idx] : '';
  };
  return {
    day: find('day', 'weekday'),
    start: find('start', 'from', 'begin'),
    end: find('end', 'to', 'finish'),
    subject: find('subject', 'course', 'paper', 'class'),
    room: find('room', 'hall', 'venue'),
    faculty: find('faculty', 'teacher', 'instructor', 'professor')
  };
};

const normalizeRows = (rows, map) => {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const pick = (r, key) => (map[key] ? r[map[key]] : '');
  return rows
    .map((r) => ({
      day: String(pick(r, 'day') ?? '').trim(),
      start: String(pick(r, 'start') ?? '').trim(),
      end: String(pick(r, 'end') ?? '').trim(),
      subject: String(pick(r, 'subject') ?? '').trim(),
      room: String(pick(r, 'room') ?? '').trim(),
      faculty: String(pick(r, 'faculty') ?? '').trim()
    }))
    .filter((r) => r.subject);
};

const toInt = (v) => {
  const n = Number(v);
  if (Number.isFinite(n)) return n;
  const parsed = parseInt(String(v ?? '').replace(/\D/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const computeDefaultYearYY = () => {
  const now = new Date();
  const y = now.getFullYear();
  return {
    startYY: String(y).slice(-2),
    endYY: String(y + 1).slice(-2),
  };
};

//matrix parser
const DAY_ORDER = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7 };

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

const normalizeCode = (s) => String(s ?? '').replace(/[^A-Z0-9]/gi, '').toUpperCase();

const locateMatrixHeader = (grid) => {
  for (let i = 0; i < grid.length; i++) {
    const row = grid[i] || [];
    for (let j = 0; j < row.length; j++) {
      if (clean(row[j]).toLowerCase() === 'time slot') {
        return { headerIdx: i, timeCol: j };
      }
    }
  }
  return { headerIdx: -1, timeCol: -1 };
};

const locateLegendStart = (grid, fromRow) => {
  let legendTitleIdx = -1;
  for (let i = fromRow; i < grid.length; i++) {
    const first = clean(grid[i]?.[0] || '');
    if (first.toLowerCase().startsWith('subject and faculty details')) {
      legendTitleIdx = i;
      break;
    }
  }
  if (legendTitleIdx < 0) return { legendTitleIdx: -1, mapStartIdx: -1 };
  let headerIdx = -1;
  for (let i = legendTitleIdx + 1; i < grid.length; i++) {
    const first = clean(grid[i]?.[0] || '');
    if (first.toLowerCase() === 'subject code') {
      headerIdx = i;
      break;
    }
  }
  const mapStartIdx = headerIdx >= 0 ? headerIdx + 1 : -1;
  return { legendTitleIdx, mapStartIdx };
};

const buildSubjectMap = (grid, mapStartIdx) => {
  const subjMap = {};
  if (mapStartIdx < 0) return subjMap;
  for (let i = mapStartIdx; i < grid.length; i++) {
    const r = grid[i] || [];
    const codeRaw = clean(r[0]);
    const name = clean(r[1]);
    const fac = clean(r[2]);
    if (!codeRaw && !name && !fac) break;
    if (codeRaw) {
      const key = normalizeCode(codeRaw);
      if (key) subjMap[key] = { name, faculty: fac };
    }
  }
  return subjMap;
};

const parseTimeSlot = (s) => {
  const m = clean(s).match(/(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)/i);
  if (!m) return null;
  return { start: clean(m[1]), end: clean(m[2]) };
};

const extractCodeRoom = (cellText) => {
  const text = clean(cellText);
  let code = '';
  const startCode = text.match(/^([A-Z]{2,}-?\d{2,3}[A-Z0-9-]*)/i);
  if (startCode) code = startCode[1].toUpperCase();
  if (!code) {
    const anyCode = text.match(/([A-Z]{2,}-?\d{2,3}[A-Z0-9-]*)/i);
    if (anyCode) code = anyCode[1].toUpperCase();
  }
  const rooms = [...text.matchAll(/\(([^)]+)\)/g)];
  const room = rooms.length ? clean(rooms[rooms.length - 1][1]) : '';
  return { code, room, textRaw: text };
};

const normalizeMatrix = (grid) => {
  const { headerIdx, timeCol } = locateMatrixHeader(grid);
  if (headerIdx < 0 || timeCol < 0) return { rows: [], stats: { days: [], legend: false } };

  const headerRow = grid[headerIdx] || [];
  const days = [];
  for (let k = timeCol + 1; k < headerRow.length; k++) {
    const s = clean(headerRow[k]);
    if (s) days.push(s);
  }

  const { legendTitleIdx, mapStartIdx } = locateLegendStart(grid, headerIdx + 1);
  const subjectMap = buildSubjectMap(grid, mapStartIdx);
  const legendFound = Object.keys(subjectMap).length > 0;

  const endRow = legendTitleIdx >= 0 ? legendTitleIdx : grid.length;
  const out = [];

  for (let i = headerIdx + 1; i < endRow; i++) {
    const row = grid[i] || [];
    const slot = parseTimeSlot(row[timeCol]);
    if (!slot) continue;
    const { start, end } = slot;

    for (let dIdx = 0; dIdx < days.length; dIdx++) {
      const cidx = timeCol + 1 + dIdx;
      const cell = clean(row[cidx]);
      if (!cell || cell === '-') continue;
      if (/lunch break/i.test(cell)) {
        out.push({ day: days[dIdx], start, end, subject: 'LUNCH BREAK', room: '', faculty: '' });
        continue;
      }
      const { code, room, textRaw } = extractCodeRoom(cell);
      const norm = code ? normalizeCode(code) : '';
      const legend = norm ? subjectMap[norm] : undefined;
      const subjName = legend?.name ? `${code} (${legend.name})` : (code || textRaw.replace(/\(([^)]+)\)/g, '').trim());
      const faculty = legend?.faculty || '';
      out.push({ day: days[dIdx], start, end, subject: subjName, room, faculty });
    }
  }

  const toMinutes = (t) => {
    const m = clean(t).match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
    if (!m) return 0;
    let hh = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    const ap = m[3].toUpperCase();
    if (ap === 'PM' && hh !== 12) hh += 12;
    if (ap === 'AM' && hh === 12) hh = 0;
    return hh * 60 + mm;
  };
  out.sort((a, b) => {
    const da = DAY_ORDER[a.day?.toLowerCase()] || 999;
    const db = DAY_ORDER[b.day?.toLowerCase()] || 999;
    if (da !== db) return da - db;
    return toMinutes(a.start) - toMinutes(b.start);
  });

  return { rows: out, stats: { days, legend: legendFound } };
};

const sharedPivot = (rows, gridDays) => {
  const DAY_ORDER_SHARED = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7 };
  const toMinutesLocal = (t) => {
    const m = clean(t).match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
    if (!m) return 0;
    let hh = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    const ap = m[3].toUpperCase();
    if (ap === 'PM' && hh !== 12) hh += 12;
    if (ap === 'AM' && hh === 12) hh = 0;
    return hh * 60 + mm;
  };

  const dayList = (Array.isArray(gridDays) && gridDays.length > 0
    ? gridDays
    : Array.from(new Set(rows.map(r => r.day)))).filter(Boolean);

  const days = [...dayList].sort((a, b) =>
    (DAY_ORDER_SHARED[a?.toLowerCase()] || 999) - (DAY_ORDER_SHARED[b?.toLowerCase()] || 999)
  );

  const slotSet = new Set();
  rows.forEach(r => {
    if (r.start && r.end) slotSet.add(`${r.start} - ${r.end}`);
  });
  const slots = Array.from(slotSet).sort((a, b) => toMinutesLocal(a.split(' - ')[0]) - toMinutesLocal(b.split(' - ')[0]));

  const map = {};
  slots.forEach(s => { map[s] = {}; days.forEach(d => { map[s][d] = null; }); });
  rows.forEach(r => {
    const slot = `${r.start} - ${r.end}`;
    if (!map[slot]) map[slot] = {};
    map[slot][r.day] = r;
  });

  return { days, slots, map };
};

const renderCellText = (r) => {
  if (!r) return '';
  const subj = String(r.subject || '').trim();
  if (subj.toLowerCase() === 'lunch break') return 'LUNCH BREAK';
  const m = subj.match(/^([A-Z]{2,}-?\d{2,3}[A-Z0-9-]*)\s*\((.+)\)$/i);
  const base = m ? `${m[1].toUpperCase()}: ${m[2]}` : subj;
  const lines = [base];
  if (r.room) lines.push(`(${String(r.room).trim()})`);
  if (r.faculty) lines.push(`~${String(r.faculty).trim()}`);
  return lines.join('\n');
};

// View Modal Component
const ViewModal = ({ open, onClose, existingDoc, programs }) => {
  const isExcel = existingDoc?.type === 'excel' && existingDoc?.normalized?.enabled;
  const rows = useMemo(() => {
    if (!isExcel) return [];
    const arr = Array.isArray(existingDoc.normalized.rows) ? existingDoc.normalized.rows : [];
    return arr;
  }, [isExcel, existingDoc]);
  const pivotData = useMemo(() => sharedPivot(rows, []), [rows]);
  const updatedAtLabel = useMemo(() => {
    if (!existingDoc?.uploadedAt) return '';
    const d =
    typeof existingDoc.uploadedAt.toDate === "function"
      ? existingDoc.uploadedAt.toDate()
      : new Date(existingDoc.uploadedAt);
      return isNaN(d.getTime()) ? "" : d.toLocaleString();
  }, [existingDoc]);

  if (!existingDoc) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth scroll="body">
      <DialogTitle>Current Timetable</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Chip label={`Program: ${programs.find(p => String(p._id) === String(existingDoc.class?.programId))?.programName || existingDoc.class?.programName || '—'}`} size="small" />
            <Chip label={`Semester: ${existingDoc.class?.semester || '—'}`} size="small" />
            <Chip label={`Year: ${existingDoc.class?.academicYear || '—'}`} size="small" />
            <Chip label={`Type: ${String(existingDoc.type).toUpperCase()}`} size="small" />
            {updatedAtLabel && <Chip label={`Updated: ${updatedAtLabel}`} size="small" variant="outlined" />}
          </Stack>
          {isExcel && rows.length > 0 ? (
            <TableContainer component={Paper} sx={{ maxHeight: 520, borderRadius: 1 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 160, fontWeight: 700 }}>Time Slot</TableCell>
                    {pivotData.days.map((d) => (
                      <TableCell key={d} sx={{ fontWeight: 700 }}>{d}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pivotData.slots.map((slot) => (
                    <TableRow key={slot} hover>
                      <TableCell sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                        {slot}
                      </TableCell>
                      {pivotData.days.map((d) => (
                        <TableCell key={`${slot}-${d}`} sx={{ whiteSpace: 'pre-line', lineHeight: 1.35 }}>
                          {renderCellText(pivotData.map[slot]?.[d]) || '—'}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  {pivotData.slots.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={1 + pivotData.days.length} align="center">
                        No rows to display.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          ) : existingDoc.type === 'pdf' ? (
            <Box sx={{ height: 520 }}>
              <object data={existingDoc.storage?.url || ''} type="application/pdf" width="100%" height="100%">
                <p>PDF preview not supported.</p>
              </object>
            </Box>
          ) : existingDoc.type === 'image' ? (
            <Box sx={{ textAlign: 'center' }}>
              <img src={existingDoc.storage?.url || ''} alt="Timetable" style={{ maxWidth: '100%', borderRadius: 8 }} />
            </Box>
          ) : (
            <Alert severity="info">Parsed view not available for this type.</Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        {existingDoc.storage?.url && (
          <Button
            startIcon={<DownloadIcon />}
            component="a"
            href={existingDoc.storage.url}
            download={existingDoc.storage.fileName || 'timetable'}
          >
            Download Original
          </Button>
        )}
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

ViewModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  existingDoc: PropTypes.shape({
    id: PropTypes.string,
    type: PropTypes.oneOf(['excel', 'image', 'pdf']),
    status: PropTypes.string,
    class: PropTypes.shape({
      programId: PropTypes.string,
      programName: PropTypes.string,
      semester: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
      academicYear: PropTypes.string,
    }),
    storage: PropTypes.shape({
      url: PropTypes.string,
      fileName: PropTypes.string,
    }),
    normalized: PropTypes.shape({
      enabled: PropTypes.bool,
      rows: PropTypes.arrayOf(
        PropTypes.shape({
          day: PropTypes.string,
          start: PropTypes.string,
          end: PropTypes.string,
          subject: PropTypes.string,
          room: PropTypes.string,
          faculty: PropTypes.string,
        })
      ),
    }),
    uploadedAt: PropTypes.oneOfType([PropTypes.object, PropTypes.string]),
  }),
  programs: PropTypes.arrayOf(
    PropTypes.shape({
      _id: PropTypes.string,
      programName: PropTypes.string,
    })
  ).isRequired,
};

ViewModal.defaultProps = {
  existingDoc: null,
  programs: [],
};

//Component
const TimetableUploader = () => {
  const { role, userDetails, loading: authLoading } = useAuth();
  const [associate, setAssociate] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [activeDeptId, setActiveDeptId] = useState('');
  const [programs, setPrograms] = useState([]);
  const [programsLoading, setProgramsLoading] = useState(false);
  const [departmentId, setDepartmentId] = useState('');
  const [programId, setProgramId] = useState('');
  const [semester, setSemester] = useState('');
  const [semesters, setSemesters] = useState([]);
  const [{ startYY, endYY }, setYearSuffix] = useState(computeDefaultYearYY());
  const academicYear = useMemo(() => `20${startYY}-20${endYY}`, [startYY, endYY]);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const [existingLoading, setExistingLoading] = useState(false);
  const [existingDoc, setExistingDoc] = useState(null);
  const [mode, setMode] = useState('create');
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [kind, setKind] = useState('unknown');
  const [previewURL, setPreviewURL] = useState('');
  const [excelHeaders, setExcelHeaders] = useState([]);
  const [excelRows, setExcelRows] = useState([]);
  const [columnMap, setColumnMap] = useState({ day: '', start: '', end: '', subject: '', room: '', faculty: '' });
  const [gridMode, setGridMode] = useState(false);
  const [gridRows, setGridRows] = useState([]);
  const [gridLegendFound, setGridLegendFound] = useState(false);
  const [gridDays, setGridDays] = useState([]);
  const [includeLunch, setIncludeLunch] = useState(true);

  const getAuthHeaders = useCallback(async () => {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    const user = auth.currentUser;
    if (user) headers['Authorization'] = `Bearer ${await user.getIdToken()}`;
    return headers;
  }, []);

  useEffect(() => {
  const bootstrap = async () => {
    if (authLoading) return;
    
    try {
      setLoading(true);
      setLoadingText('Loading profile...');
      
      const isCollegeAssociate = userDetails?.isCollegeAssociate || role === "CollegeAssociate";
      if (!isCollegeAssociate || !userDetails?.college) {
        setSnackbar({ open: true, message: 'Access denied. College Associate role with assigned college required.', severity: 'error' });
        return;
      }

      setAssociate(userDetails);
      setLoadingText('Loading departments...');
      const deptRes = await axios.get(
        `${API_BASE_URL}/api/colleges/${userDetails.college}/departments`,
        { headers: await getAuthHeaders() }
      );
      const list = Array.isArray(deptRes.data) ? deptRes.data : [];
      setDepartments(list);
      if (list.length > 0) {
        const firstId = list[0]._id || list[0].id;
        setActiveDeptId(firstId);
        setDepartmentId(firstId);
      }
    } catch {
      setSnackbar({ open: true, message: 'Failed to init associate data', severity: 'error' });
    } finally {
      setLoading(false);
      setLoadingText('');
    }
  };
  bootstrap();
}, [authLoading, userDetails, role, getAuthHeaders]);

  const loadPrograms = useCallback(async (deptId) => {
    if (!associate?.college || !deptId) return;
    try {
      setProgramsLoading(true);
      const progRes = await axios.get(
        `${API_BASE_URL}/api/departments/${associate.college}/${deptId}/programs`,
        { headers: await getAuthHeaders() }
      );
      setPrograms(Array.isArray(progRes.data) ? progRes.data : []);
    } catch {
      setPrograms([]);
      setSnackbar({ open: true, message: 'Failed to load programs', severity: 'error' });
    } finally {
      setProgramsLoading(false);
    }
  }, [associate, getAuthHeaders]);

  useEffect(() => {
    if (activeDeptId) {
      loadPrograms(activeDeptId);
      setProgramId('');
      setSemester('');
      setSemesters([]);
      setDepartmentId(activeDeptId);
      setExistingDoc(null);
      setMode('create');
    }
  }, [activeDeptId, loadPrograms]);

  const loadSemesters = useCallback(async (progId) => {
    if (!progId) return;
    try {
      setLoading(true);
      setLoadingText('Loading semesters...');
      const semRes = await axios.get(
        `${API_BASE_URL}/api/programs/${progId}/semesters`,
        { headers: await getAuthHeaders() }
      );
      setSemesters(Array.isArray(semRes.data) ? semRes.data : []);
    } catch {
      setSemesters([]);
      setSnackbar({ open: true, message: 'Failed to load semesters', severity: 'error' });
    } finally {
      setLoading(false);
      setLoadingText('');
    }
  }, [getAuthHeaders]);

  const checkExisting = useCallback(async () => {
    if (!associate?.college || !programId || !semester || !academicYear) return;
    setExistingLoading(true);
    setExistingDoc(null);
    try {
      const colRef = collection(db, 'timetables');
      const q = query(colRef, where('collegeId', '==', associate.college));
      const snap = await getDocs(q);
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const byLatest = [...all].sort((a, b) => {
        const ta = a.uploadedAt?.toMillis ? a.uploadedAt.toMillis() : 0;
        const tb = b.uploadedAt?.toMillis ? b.uploadedAt.toMillis() : 0;
        return tb - ta;
      });

      const wantedAY = academicYear;
      const wantedSem = toInt(semester);
      const selectedProgram = programs.find((p) => String(p._id) === String(programId));
      const wantedProgramId = String(programId);
      const wantedProgramName = selectedProgram?.programName || '';

      const isMatch = (d) => {
        const cls = d.class || {};
        const sem = toInt(cls.semester);
        const pid = cls.programId ? String(cls.programId) : '';
        const pname = cls.programName ? String(cls.programName) : '';
        return (
          cls.academicYear === wantedAY &&
          sem === wantedSem &&
          (pid === wantedProgramId || (wantedProgramName && pname === wantedProgramName))
        );
      };

      const published = byLatest.find((d) => d.status === 'PUBLISHED' && isMatch(d));
      if (published) {
        setExistingDoc(published);
        return;
      }
      const any = byLatest.find((d) => isMatch(d));
      if (any) setExistingDoc(any);
    } catch {
      setExistingDoc(null);
    } finally {
      setExistingLoading(false);
    }
  }, [associate, programId, semester, academicYear, programs]);

  useEffect(() => {
    setExistingDoc(null);
    if (programId && semester && academicYear) {
      checkExisting();
    }
  }, [programId, semester, academicYear, checkExisting]);

  const canProceed = useMemo(() => {
    return Boolean(departmentId && programId && semester && academicYear);
  }, [departmentId, programId, semester, academicYear]);

  const handleChooseFile = (e) => {
    const f = e.target.files?.[0] || null;
    if (!f) return;
    let k = fileKind(f);
    if (k === 'unknown' && isExcelExt(f.name)) k = 'excel';
    if (k === 'unknown') {
      setSnackbar({ open: true, message: 'Unsupported file type. Please select image/PDF/Excel.', severity: 'warning' });
      setFile(null);
      setKind('unknown');
      setPreviewURL('');
      setExcelHeaders([]);
      setExcelRows([]);
      setColumnMap({ day: '', start: '', end: '', subject: '', room: '', faculty: '' });
      setGridMode(false);
      setGridRows([]);
      setGridLegendFound(false);
      setGridDays([]);
      return;
    }

    setFile(f);
    setKind(k);

    if (k === 'image' || k === 'pdf') {
      setPreviewURL(URL.createObjectURL(f));
      setExcelHeaders([]);
      setExcelRows([]);
      setColumnMap({ day: '', start: '', end: '', subject: '', room: '', faculty: '' });
      setGridMode(false);
      setGridRows([]);
      setGridLegendFound(false);
      setGridDays([]);
    } else {
      setPreviewURL('');
    }

    if (k === 'excel') {
      parseExcel(f);
    } else {
      setExcelHeaders([]);
      setExcelRows([]);
      setColumnMap({ day: '', start: '', end: '', subject: '', room: '', faculty: '' });
      setGridMode(false);
      setGridRows([]);
      setGridLegendFound(false);
      setGridDays([]);
    }
  };

  const parseExcel = async (f) => {
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, blankrows: false });

      const { rows, stats } = normalizeMatrix(grid);
      if (rows.length > 0) {
        setGridMode(true);
        setGridRows(rows);
        setGridLegendFound(stats.legend);
        setGridDays(stats.days);
        setExcelHeaders([]);
        setExcelRows([]);
        setColumnMap({ day: '', start: '', end: '', subject: '', room: '', faculty: '' });
        if (!stats.legend) {
          setSnackbar({ open: true, severity: 'info', message: 'Parsed timetable, but legend not found — faculty may be empty.' });
        }
        return;
      }

      const json = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
      if (!json || json.length === 0) {
        setSnackbar({ open: true, message: 'Excel is empty.', severity: 'warning' });
        return;
      }
      const rawHeaders = json[0] || [];
      const headers = rawHeaders.map((h) => clean(h));
      const rows2 = json.slice(1).map((arr) => {
        const obj = {};
        headers.forEach((h, i) => (obj[h] = arr?.[i] ?? ''));
        return obj;
      });
      setGridMode(false);
      setGridRows([]);
      setGridLegendFound(false);
      setGridDays([]);
      setExcelHeaders(headers);
      setExcelRows(rows2);
      setColumnMap(autoMapHeaders(headers));
    } catch (err) {
      setSnackbar({ open: true, message: 'Failed to parse Excel.', severity: 'error' });
    }
  };

  const normalized = useMemo(() => {
    if (kind !== 'excel') return [];
    const base = gridMode ? gridRows : normalizeRows(excelRows, columnMap);
    if (gridMode && !includeLunch) return base.filter((r) => clean(r.subject).toLowerCase() !== 'lunch break');
    return base;
  }, [gridMode, gridRows, excelRows, columnMap, kind, includeLunch]);

  const excelReady = useMemo(() => {
    if (kind !== 'excel') return false;
    if (gridMode) return normalized.length > 0;
    return Boolean(columnMap.subject);
  }, [columnMap, kind, gridMode, normalized.length]);

  const uploadToStorage = async () => {
    if (!file || !associate?.college) throw new Error('Missing file/college');
    const safeName = sanitizeName(file.name);
    const path = `timetables/${associate.college}/${programId}/sem-${toInt(semester)}/${Date.now()}_${safeName}`;
    const contentType = file.type || guessExcelMime(file.name, 'application/octet-stream');
    const storageRef = ref(storage, path);
    const snap = await uploadBytes(storageRef, file, { contentType });
    const url = await getDownloadURL(snap.ref);
    return {
      path,
      url,
      fileName: file.name,
      mimeType: contentType,
      size: file.size
    };
  };

  const saveDoc = async (status) => {
    if (!associate?.college) {
      setSnackbar({ open: true, message: 'Associate college not found.', severity: 'error' });
      return;
    }
    if (!file) {
      setSnackbar({ open: true, message: 'Please choose a file.', severity: 'warning' });
      return;
    }
    if (!canProceed) {
      setSnackbar({ open: true, message: 'Please select class details.', severity: 'warning' });
      return;
    }
    if (kind === 'excel' && !excelReady) {
      setSnackbar({ open: true, message: 'Map or auto-detect Excel before saving.', severity: 'warning' });
      return;
    }

    try {
      setLoading(true);
      setLoadingText(status === 'PUBLISHED' ? 'Publishing...' : 'Saving draft...');
      const storageInfo = await uploadToStorage();
      const selectedProgram = programs.find((p) => String(p._id) === String(programId));

      const payload = {
        collegeId: associate.college,
        status,
        type: kind,
        class: {
          departmentId,
          programId,
          programName: selectedProgram?.programName || '',
          semester: toInt(semester),
          academicYear
        },
        storage: storageInfo,
        normalized: {
          enabled: kind === 'excel',
          schema: ['day', 'start', 'end', 'subject', 'room', 'faculty'],
          rows: kind === 'excel' ? normalized : []
        },
        columnMap: kind === 'excel' ? (gridMode ? null : columnMap) : null,
        uploadedBy: auth.currentUser?.uid || '',
        uploadedAt: serverTimestamp(),
        source: 'associate-portal'
      };

      if (mode === 'update' && existingDoc?.id) {
        const docRef = doc(db, 'timetables', existingDoc.id);
        await setDoc(docRef, payload, { merge: true });
        setSnackbar({ open: true, message: 'Timetable updated successfully!', severity: 'success' });
      } else {
        const colRef = collection(db, 'timetables');
        await addDoc(colRef, payload);
        setSnackbar({
          open: true,
          message: status === 'PUBLISHED' ? 'Timetable published successfully!' : 'Draft saved successfully!',
          severity: 'success'
        });
      }

      setFile(null);
      setKind('unknown');
      setPreviewURL('');
      setExcelHeaders([]);
      setExcelRows([]);
      setColumnMap({ day: '', start: '', end: '', subject: '', room: '', faculty: '' });
      setGridMode(false);
      setGridRows([]);
      setGridLegendFound(false);
      setGridDays([]);
      await checkExisting();
      setStep(1);
      setMode('create');
    } catch (err) {
      setSnackbar({ open: true, message: 'Upload failed. Please try again.', severity: 'error' });
    } finally {
      setLoading(false);
      setLoadingText('');
    }
  };

  const pivot = useMemo(() => {
    return sharedPivot(normalized, gridDays);
  }, [normalized, gridDays]);

  const renderAvailability = () => {
    if (!programId || !semester) return null;

    return (
      <Card variant="outlined" sx={{ mt: 2, borderRadius: 2 }}>
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={2}>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Timetable Availability
              </Typography>
              {existingLoading ? (
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                  <CircularProgress size={18} />
                  <Typography variant="body2">Checking…</Typography>
                </Stack>
              ) : existingDoc ? (
                <>
                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                    Found {existingDoc.status} timetable • {existingDoc.type?.toUpperCase()} • {existingDoc.storage?.fileName || '—'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Academic Year: {existingDoc.class?.academicYear || '—'} | Last Update: {dayjs(existingDoc.uploadedAt).tz(TZ).format('YYYY-MM-DD HH:mm:ss') || '—'}
                  </Typography>
                </>
              ) : (
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  No timetable found for the selected Program, Semester and Academic Year.
                </Typography>
              )}
            </Box>
            <Stack direction="row" spacing={1} sx={{ minWidth: { sm: 320 } }}>
              {existingDoc ? (
                <>
                  <Button
                    variant="outlined"
                    onClick={() => setViewModalOpen(true)}
                  >
                    View Current
                  </Button>
                  <Button
                    variant="contained"
                    onClick={() => {
                      setMode('update');
                      setStep(2);
                    }}
                  >
                    Update
                  </Button>
                </>
              ) : (
                <Button
                  variant="contained"
                  onClick={() => {
                    setMode('create');
                    setStep(2);
                  }}
                  disabled={!canProceed}
                >
                  Upload New Timetable
                </Button>
              )}
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    );
  };

  const renderClassPicker = () => (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Select Class
        </Typography>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mt: 1 }}>
          <Tabs
            value={activeDeptId}
            onChange={(_, val) => setActiveDeptId(val)}
            variant="scrollable"
            scrollButtons="auto"
            aria-label="Departments"
          >
            {departments.map((d) => {
              const id = d._id || d.id;
              return <Tab key={id} label={d.departmentName || d.name} value={id} />;
            })}
          </Tabs>
        </Box>
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle1" gutterBottom>
            Programs in selected department
          </Typography>
          {programsLoading ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
              <CircularProgress size={18} />
              <Typography variant="body2">Loading programs…</Typography>
            </Box>
          ) : programs.length === 0 ? (
            <Typography variant="body2">No programs found for this department.</Typography>
          ) : (
            <Grid container spacing={2}>
              {programs.map((p) => (
                <Grid item xs={12} sm={6} md={4} lg={3} key={p._id}>
                  <Card
                    variant={String(programId) === String(p._id) ? 'elevation' : 'outlined'}
                    sx={{
                      borderRadius: 2,
                      ...(String(programId) === String(p._id) ? { boxShadow: '0 0 0 2px rgba(25,118,210,0.35)' } : {})
                    }}
                  >
                    <CardContent>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
                        {p.programName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Program ID: {p._id}
                      </Typography>
                      <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} alignItems="center">
                        <Button
                          size="small"
                          variant={String(programId) === String(p._id) ? 'contained' : 'outlined'}
                          onClick={() => {
                            setProgramId(p._id);
                            setSemester('');
                            setSemesters([]);
                            setExistingDoc(null);
                            setMode('create');
                            loadSemesters(p._id);
                          }}
                        >
                          {String(programId) === String(p._id) ? 'Selected' : 'Select'}
                        </Button>
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </Box>
        <Stack spacing={2} sx={{ mt: 3 }}>
          <FormControl fullWidth disabled={!programId}>
            <InputLabel>Semester</InputLabel>
            <Select
              label="Semester"
              value={semester}
              onChange={(e) => {
                setSemester(e.target.value);
                setExistingDoc(null);
                setMode('create');
              }}
            >
              <MenuItem value="">
                <em>Select Semester</em>
              </MenuItem>
              {semesters.map((s) => {
                const val = s.semesterNumber ?? s;
                return (
                  <MenuItem key={val} value={val}>
                    Semester {val}
                  </MenuItem>
                );
              })}
            </Select>
          </FormControl>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Academic Year"
              value={academicYear}
              fullWidth
              InputProps={{ readOnly: true }}
              helperText="Auto-filled from current year. Edit the YY parts below if needed."
            />
            <TextField
              label="Start YY"
              value={startYY}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 2);
                setYearSuffix((p) => ({ ...p, startYY: v }));
              }}
              inputProps={{ inputMode: 'numeric', maxLength: 2 }}
              sx={{ width: { xs: '100%', sm: 120 } }}
              helperText="e.g., 25"
            />
            <TextField
              label="End YY"
              value={endYY}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 2);
                setYearSuffix((p) => ({ ...p, endYY: v }));
              }}
              inputProps={{ inputMode: 'numeric', maxLength: 2 }}
              sx={{ width: { xs: '100%', sm: 120 } }}
              helperText="e.g., 26"
            />
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Chip label={`Department: ${departments.find(d => (d._id || d.id) === departmentId)?.departmentName || departments.find(d => (d._id || d.id) === departmentId)?.name || '—'}`} />
            <Chip label={`Program: ${programs.find(p => String(p._id) === String(programId))?.programName || '—'}`} />
            <Chip label={`Semester: ${semester || '—'}`} />
            <Chip label={`Year: ${academicYear || '—'}`} />
          </Stack>
          {renderAvailability()}
        </Stack>
      </CardContent>
    </Card>
  );

  const renderUploader = () => (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6">
            {mode === 'update' ? 'Update Timetable' : 'Upload Timetable'} (Semester {toInt(semester)}, {academicYear})
          </Typography>
          <Button variant="text" startIcon={<ArrowBackIcon />} onClick={() => setStep(1)}>
            Back
          </Button>
        </Box>
        <Divider sx={{ my: 2 }} />
        <Stack spacing={2}>
          <Button
            component="label"
            variant="outlined"
            startIcon={<CloudUploadIcon />}
          >
            Choose File (Image / PDF / Excel)
            <input
              type="file"
              hidden
              onChange={handleChooseFile}
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,image/*,application/pdf"
            />
          </Button>
          {file && (
            <Typography variant="body2">
              Selected: {file.name} • {(file.size / 1024).toFixed(1)} KB
            </Typography>
          )}
          {kind === 'image' && previewURL && (
            <Box sx={{ mt: 1 }}>
              <img
                src={previewURL}
                alt="timetable"
                style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid #eee' }}
              />
            </Box>
          )}
          {kind === 'pdf' && file && (
            <Box sx={{ mt: 1, height: 520 }}>
              <object
                data={previewURL || URL.createObjectURL(file)}
                type="application/pdf"
                width="100%"
                height="100%"
              >
                <p>PDF preview is not supported by this browser.</p>
              </object>
            </Box>
          )}
          {kind === 'excel' && (
            <Box>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <Chip
                  color={gridMode ? 'success' : 'default'}
                  label={gridMode ? 'Detected timetable matrix (auto-mapped)' : 'Manual mapping required'}
                  size="small"
                />
                {gridMode && (
                  <>
                    <Chip label={`${gridRows.length} rows`} size="small" />
                    <Chip label={`Days: ${gridDays.join(', ') || '—'}`} size="small" />
                    <Chip color={gridLegendFound ? 'success' : 'warning'} label={gridLegendFound ? 'Legend mapped' : 'No legend found'} size="small" />
                  </>
                )}
              </Stack>
              {gridMode && (
                <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 1 }}>
                  <FormControlLabel
                    control={<Switch checked={includeLunch} onChange={(e) => setIncludeLunch(e.target.checked)} />}
                    label="Include lunch break rows"
                  />
                  {!gridLegendFound && (
                    <Typography variant="body2" color="text.secondary">
                      Faculty will be empty if legend is missing; add “Subject and Faculty Details” at the bottom of the sheet.
                    </Typography>
                  )}
                </Stack>
              )}
              {!gridMode && (
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
                  {['day', 'start', 'end', 'subject', 'room', 'faculty'].map((k) => (
                    <FormControl key={k} fullWidth>
                      <InputLabel>{k.charAt(0).toUpperCase() + k.slice(1)}</InputLabel>
                      <Select
                        label={k.charAt(0).toUpperCase() + k.slice(1)}
                        value={columnMap[k] || ''}
                        onChange={(e) => setColumnMap((m) => ({ ...m, [k]: e.target.value }))}
                      >
                        <MenuItem value="">
                          <em>Not mapped</em>
                        </MenuItem>
                        {excelHeaders.map((h) => (
                          <MenuItem key={h} value={h}>
                            {h}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  ))}
                </Stack>
              )}
              <Typography variant="subtitle1" gutterBottom sx={{ mt: 1 }}>
                Normalized Preview ({normalized.length} rows)
              </Typography>
              <TableContainer component={Paper} sx={{ maxHeight: 420, borderRadius: 1 }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: 160, fontWeight: 700 }}>Time Slot</TableCell>
                      {pivot.days.map((d) => (
                        <TableCell key={d} sx={{ fontWeight: 700 }}>{d}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pivot.slots.map((slot) => (
                      <TableRow key={slot} hover>
                        <TableCell sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                          {slot}
                        </TableCell>
                        {pivot.days.map((d) => (
                          <TableCell key={`${slot}-${d}`}>
                            {renderCellText(pivot.map[slot]?.[d]) || '—'}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                    {pivot.slots.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={1 + pivot.days.length} align="center">
                          {gridMode
                            ? 'No rows detected from matrix. Check Time Slot row and day columns.'
                            : 'No rows to display. Map at least Subject column.'}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
          <Divider sx={{ my: 2 }} />
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              color="secondary"
              startIcon={<SaveIcon />}
              onClick={() => saveDoc('DRAFT')}
              disabled={loading || !file}
            >
              Save as Draft
            </Button>
            <Button
              variant="contained"
              color="primary"
              startIcon={<PublishIcon />}
              onClick={() => saveDoc('PUBLISHED')}
              disabled={loading || !file || (kind === 'excel' && !excelReady)}
            >
              Publish
            </Button>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );

  if (authLoading || !associate) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="300px">
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Loading associate data...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth:"100vw",minHeight:"100vh", mx: 'auto' }}>
      <SecondaryHeader title=" Upload Class Timetable" leftArea={<HeaderBackButton/>}/>
      {step === 1 ? renderClassPicker() : renderUploader()}
      <ViewModal
        open={viewModalOpen}
        onClose={() => setViewModalOpen(false)}
        existingDoc={existingDoc}
        programs={programs}
      />
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert
          elevation={6}
          variant="filled"
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          severity={snackbar.severity || 'info'}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default TimetableUploader;