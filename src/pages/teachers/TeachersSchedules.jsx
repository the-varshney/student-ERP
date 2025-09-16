/* eslint-disable no-unused-vars */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Box, Card, CardContent, Typography, Stack, FormControl, InputLabel, Select, MenuItem,
  Button, TextField, Alert, CircularProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Tabs, Tab, Grid, Chip, Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import {
  CloudUpload as CloudUploadIcon,
  Save as SaveIcon,
  Publish as PublishIcon,
  TableView as TableViewIcon,
  PictureAsPdf as PictureAsPdfIcon,
  Image as ImageIcon,
  Download as DownloadIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import { auth, db, storage } from '../../firebase/Firebase';
import {
  doc, getDoc, collection, setDoc, serverTimestamp, query, where, getDocs
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import * as XLSX from 'xlsx';
import SecondaryHeader from "../../components/secondaryHeader";
import { HeaderBackButton } from "../../components/header";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// Helpers
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
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
    faculty: find('faculty', 'teacher', 'instructor', 'professor'),
  };
};

const normalizeRowsFallback = (rows, map) => {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const pick = (r, key) => (map[key] ? r[map[key]] : '');
  return rows
    .map((r) => ({
      day: String(pick(r, 'day') ?? '').trim(),
      start: String(pick(r, 'start') ?? '').trim(),
      end: String(pick(r, 'end') ?? '').trim(),
      subject: String(pick(r, 'subject') ?? '').trim(),
      room: String(pick(r, 'room') ?? '').trim(),
      faculty: '', 
    }))
    .filter((r) => r.subject);
};

const DAY_ORDER = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7 };

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

const sharedPivot = (rows, gridDays) => {
  const dayList = (Array.isArray(gridDays) && gridDays.length > 0
    ? gridDays
    : Array.from(new Set(rows.map(r => r.day)))).filter(Boolean);
  const days = [...dayList].sort((a, b) =>
    (DAY_ORDER[a?.toLowerCase()] || 999) - (DAY_ORDER[b?.toLowerCase()] || 999)
  );
  const slotSet = new Set();
  rows.forEach(r => { if (r.start && r.end) slotSet.add(`${r.start} - ${r.end}`); });
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

// Extract subject CODE and last (...) as room from a matrix cell
const extractCodeRoom = (cellText) => {
  const text = clean(cellText);
  // Prefer code at the beginning
  let code = '';
  const startCode = text.match(/^([A-Z]{2,}-?\d{2,3}[A-Z0-9-]*)/i);
  if (startCode) code = startCode[1].toUpperCase();
  if (!code) {
    const anyCode = text.match(/([A-Z]{2,}-?\d{2,3}[A-Z0-9-]*)/i);
    if (anyCode) code = anyCode[1].toUpperCase();
  }
  // Room last parentheses group if any
  const rooms = [...text.matchAll(/\(([^)]+)\)/g)];
  const room = rooms.length ? clean(rooms[rooms.length - 1][1]) : '';
  return { code, room, textRaw: text };
};

const parseTimeSlot = (s) => {
  const m = clean(s).match(/(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)/i);
  if (!m) return null;
  return { start: clean(m[1]), end: clean(m[2]) };
};

// Matrix normalization 
const normalizeMatrix = (grid) => {
  let headerIdx = -1;
  let timeCol = -1;
  for (let i = 0; i < grid.length; i++) {
    const row = grid[i] || [];
    for (let j = 0; j < row.length; j++) {
      if (clean(row[j]).toLowerCase() === 'time slot') {
        headerIdx = i; timeCol = j; break;
      }
    }
    if (headerIdx >= 0) break;
  }
  if (headerIdx < 0 || timeCol < 0) return { rows: [], days: [] };

  const headerRow = grid[headerIdx] || [];
  const days = [];
  for (let k = timeCol + 1; k < headerRow.length; k++) {
    const s = clean(headerRow[k]);
    if (s) days.push(s);
  }

  const out = [];
  for (let i = headerIdx + 1; i < grid.length; i++) {
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
      // Build subject as "CODE: Name" if name is present
      let subjectText = '';
if (code) {
  // Remove the last parenthesis (room) from raw text
  const withoutRoom = textRaw.replace(/\(([^)]+)\)\s*$/, '').trim();

  // If "CODE: Name" pattern exists
  const nameMatchColon = withoutRoom.match(/^[A-Z]{2,}-?\d{2,3}[A-Z0-9-]*\s*:\s*(.+)/i);

  // If "CODE (Name)" pattern exists
  const nameMatchParen = withoutRoom.match(/^[A-Z]{2,}-?\d{2,3}[A-Z0-9-]*\s*\((.+)\)$/i);

  if (nameMatchColon) {
    subjectText = `${code}: ${nameMatchColon[1].trim()}`;
  } else if (nameMatchParen) {
    subjectText = `${code}: ${nameMatchParen[1].trim()}`;
  } else if (withoutRoom !== code) {
    subjectText = `${code}: ${withoutRoom.replace(code, '').trim()}`;
  } else {
    subjectText = code;
  }
} else { subjectText = textRaw.replace(/\(([^)]+)\)\s*$/, '').trim(); }
      out.push({ day: days[dIdx], start, end, subject: subjectText, room, faculty: '' });
    }
  }

  out.sort((a, b) => {
    const da = DAY_ORDER[a.day?.toLowerCase()] || 999;
    const db = DAY_ORDER[b.day?.toLowerCase()] || 999;
    if (da !== db) return da - db;
    return toMinutesLocal(a.start) - toMinutesLocal(b.start);
  });

  return { rows: out, days };
};

// Program key normalization: collapse "Bachelor ... (BCA)" and "BCA"
const extractAbbrev = (label) => {
  const m = String(label || '').match(/\(([^)]+)\)\s*$/);
  if (m && m[1]) return m[1].trim();
  return null;
};
const toProgKey = (nameOrLabel) => {
  const abbr = extractAbbrev(nameOrLabel);
  return (abbr || String(nameOrLabel || '')).trim() || 'Unknown';
};

// Only two months (odd/even semester)
const monthOptions = ['Jan', 'Jul'];

// Render subject text for preview. room on next line if present
const renderCellText = (r) => {
  if (!r) return '';
  const subjRaw = String(r.subject || '').trim();
  if (subjRaw.toLowerCase() === 'lunch break') return 'LUNCH BREAK';
  // Normalize “CODE (Name)” => “CODE: Name”; keep existing “CODE: Name”
  const m1 = subjRaw.match(/^([A-Z]{2,}-?\d{2,3}[A-Z0-9-]*)\s*\((.+)\)$/i);
  const m2 = subjRaw.match(/^([A-Z]{2,}-?\d{2,3}[A-Z0-9-]*)\s*:\s*(.+)$/i);
  const base = m1 ? `${m1[1].toUpperCase()}: ${m1[2]}` : (m2 ? `${m2[1].toUpperCase()}: ${m2[2]}` : subjRaw);
  const lines = [base];
  if (r.room) lines.push(`(${String(r.room).trim()})`);
  return lines.join('\n');
};

// Component
const TeacherSchedules = () => {
  const { role, userDetails, loading: authLoading } = useAuth();
  const [associate, setAssociate] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [activeDeptId, setActiveDeptId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [programs, setPrograms] = useState([]);
  const [programsLoading, setProgramsLoading] = useState(false);
  const [month, setMonth] = useState('Jan');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const academicRange = useMemo(() => {
    const startYear = parseInt(year, 10);
    return `${month} ${startYear}-${startYear + 1}`;
  }, [month, year]);

  const [teachers, setTeachers] = useState([]);
  const [search, setSearch] = useState('');

  const [schedByTeacher, setSchedByTeacher] = useState({});
  // Dialog (manage/upload) states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [targetTeacher, setTargetTeacher] = useState(null);
  const [existingSchedule, setExistingSchedule] = useState(null);
  const [schedLoading, setSchedLoading] = useState(false);

  const [viewOpen, setViewOpen] = useState(false);
  const [viewSchedule, setViewSchedule] = useState(null);

  const [file, setFile] = useState(null);
  const [kind, setKind] = useState('unknown');
  const [previewURL, setPreviewURL] = useState('');
  const [excelHeaders, setExcelHeaders] = useState([]);
  const [excelRows, setExcelRows] = useState([]);
  const [columnMap, setColumnMap] = useState({ day: '', start: '', end: '', subject: '', room: '', faculty: '' });
  const [gridMode, setGridMode] = useState(false);
  const [gridRows, setGridRows] = useState([]);
  const [gridDays, setGridDays] = useState([]);
  const [includeLunch, setIncludeLunch] = useState(true);

  const getAuthHeaders = useCallback(async () => {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    const user = auth.currentUser;
    if (user) headers['Authorization'] = `Bearer ${await user.getIdToken()}`;
    return headers;
  }, []);

    // Bootstrap associate and departments
    useEffect(() => {
      const bootstrap = async () => {
        if (authLoading) return;
        
        try {
          const isCollegeAssociate = userDetails?.isCollegeAssociate || role === "CollegeAssociate";
          if (!isCollegeAssociate || !userDetails?.college) {
            return;
          }

          setAssociate(userDetails);

          // Departments from API
          const deptRes = await axios.get(
            `${API_BASE_URL}/api/colleges/${userDetails.college}/departments`,
            { headers: await getAuthHeaders() }
          );
          const list = Array.isArray(deptRes.data) ? deptRes.data : [];
          setDepartments(list);
          if (list.length > 0) {
            const firstId = list[0]._id || list[0].id || '';
            setActiveDeptId(firstId);
            setDepartmentId(firstId);
          }
        } catch {
          setDepartments([]);
        }
      };
      bootstrap();
    }, [authLoading, userDetails, role, getAuthHeaders]);


  // Load programs list for labels
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
    } finally {
      setProgramsLoading(false);
    }
  }, [associate, getAuthHeaders]);

  useEffect(() => {
    if (activeDeptId) {
      setDepartmentId(activeDeptId);
      loadPrograms(activeDeptId);
    }
  }, [activeDeptId, loadPrograms]);

  // Load teachers directly from Firestore by college and department
  const loadTeachers = useCallback(async () => {
    if (!associate?.college || !departmentId) return;
    try {
      const qRef = query(
        collection(db, 'Teachers'),
        where('college', '==', String(associate.college)),
        where('department', '==', String(departmentId)),
        where('role', '==', 'Teacher')
      );
      const snap = await getDocs(qRef);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setTeachers(list);
    } catch {
      setTeachers([]);
    }
  }, [associate, departmentId]);

  useEffect(() => {
    loadTeachers();
  }, [loadTeachers]);

  // Build unified program headings
  const programHeads = useMemo(() => {
    // From API programs to friendly labels
    const apiMap = new Map();
    programs.forEach(p => {
      const raw = String(p.programName || p.name || '').trim();
      if (!raw) return;
      const key = toProgKey(raw);
      if (!apiMap.has(key)) apiMap.set(key, raw);
    });
    // From teachers to ensure presence even if API missing
    teachers.forEach(t => {
      const raw = String(t.program || 'Unknown').trim() || 'Unknown';
      const key = toProgKey(raw) || 'Unknown';
      if (!apiMap.has(key)) apiMap.set(key, raw);
    });
    const out = Array.from(apiMap.entries()).map(([key, label]) => ({ key, label }));
    out.sort((a, b) => String(a.label).localeCompare(String(b.label)));
    return out;
  }, [programs, teachers]);

  const grouped = useMemo(() => {
    const byKey = {};
    const q = clean(search).toLowerCase();
    teachers.forEach(t => {
      const raw = String(t.program || 'Unknown').trim() || 'Unknown';
      const key = toProgKey(raw) || 'Unknown';
      const name = `${t.firstName || ''} ${t.lastName || ''}`.toLowerCase();
      const match = !q || name.includes(q) || String(t.email || '').toLowerCase().includes(q) || String(t.teacherId || '').includes(q);
      if (!match) return;
      if (!byKey[key]) byKey[key] = [];
      byKey[key].push(t);
    });
    Object.keys(byKey).forEach(k => byKey[k].sort((a, b) => String(a.firstName || '').localeCompare(String(b.firstName || ''))));
    return byKey;
  }, [teachers, search]);

  //fetch schedule brief for a given teacher
  const fetchTeacherSchedule = useCallback(async (t) => {
    try {
      if (!associate?.college || !t?.uid) return null;
      const schedRef = doc(db, 'Schedules', String(associate.college), 'Teachers', String(t.uid));
      const snap = await getDoc(schedRef);
      if (!snap.exists()) return null;
      const data = snap.data();
      return {
        url: data?.storage?.url || '',
        fileName: data?.storage?.fileName || '',
        status: data?.status || '',
        type: data?.type || '',
      };
    } catch {
      return null;
    }
  }, [associate]);

  // Fetch full schedule doc for view modal
  const fetchTeacherScheduleDoc = useCallback(async (t) => {
    try {
      if (!associate?.college || !t?.uid) return null;
      const schedRef = doc(db, 'Schedules', String(associate.college), 'Teachers', String(t.uid));
      const snap = await getDoc(schedRef);
      return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    } catch {
      return null;
    }
  }, [associate]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!teachers || teachers.length === 0) {
        setSchedByTeacher({});
        return;
      }
      const entries = await Promise.all(
        teachers.map(async (t) => {
          const s = await fetchTeacherSchedule(t);
          return [t.uid || t.id, s];
        })
      );
      if (!cancelled) {
        const map = {};
        entries.forEach(([k, v]) => { map[k] = v; });
        setSchedByTeacher(map);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [teachers, fetchTeacherSchedule]);

  const handleChooseFile = async (e) => {
    const f = e.target.files?.[0] || null;
    if (!f) return;
    let k = fileKind(f);
    if (k === 'unknown' && isExcelExt(f.name)) k = 'excel';
    if (k === 'unknown') {
      setFile(null); setKind('unknown'); setPreviewURL('');
      setExcelHeaders([]); setExcelRows([]); setColumnMap({ day:'',start:'',end:'',subject:'',room:'',faculty:'' });
      setGridMode(false); setGridRows([]); setGridDays([]);
      return;
    }
    setFile(f); setKind(k);
    if (k === 'image' || k === 'pdf') {
      setPreviewURL(URL.createObjectURL(f));
      setExcelHeaders([]); setExcelRows([]); setColumnMap({ day:'',start:'',end:'',subject:'',room:'',faculty:'' });
      setGridMode(false); setGridRows([]); setGridDays([]);
    } else {
      setPreviewURL('');
      await parseExcel(f);
    }
  };

  const parseExcel = async (f) => {
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, blankrows: false });
      const asMatrix = normalizeMatrix(grid);
      if (asMatrix.rows.length > 0) {
        setGridMode(true);
        setGridRows(asMatrix.rows);
        setGridDays(asMatrix.days);
        setExcelHeaders([]); setExcelRows([]); setColumnMap({ day:'',start:'',end:'',subject:'',room:'',faculty:'' });
        return;
      }
      const json = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
      if (!json || json.length === 0) return;
      const rawHeaders = json[0] || [];
      const headers = rawHeaders.map((h) => clean(h));
      const rows2 = json.slice(1).map((arr) => {
        const obj = {};
        headers.forEach((h, i) => (obj[h] = arr?.[i] ?? ''));
        return obj;
      });
      setGridMode(false);
      setGridRows([]);
      setGridDays([]);
      setExcelHeaders(headers);
      setExcelRows(rows2);
      setColumnMap(autoMapHeaders(headers));
    } catch {
      // 
    }
  };

  const normalized = useMemo(() => {
    if (kind !== 'excel') return [];
    const base = gridMode ? gridRows : normalizeRowsFallback(excelRows, columnMap);
    if (gridMode && !includeLunch) return base.filter(r => clean(r.subject).toLowerCase() !== 'lunch break');
    return base;
  }, [kind, gridMode, gridRows, excelRows, columnMap, includeLunch]);

  const excelReady = useMemo(() => {
    if (kind !== 'excel') return false;
    if (gridMode) return normalized.length > 0;
    return Boolean(columnMap.subject);
  }, [kind, gridMode, normalized.length, columnMap]);

  const pivot = useMemo(() => sharedPivot(normalized, gridDays), [normalized, gridDays]);

  const openForTeacher = async (t) => {
    setTargetTeacher(t);
    setFile(null); setKind('unknown'); setPreviewURL('');
    setExcelHeaders([]); setExcelRows([]); setColumnMap({ day:'',start:'',end:'',subject:'',room:'',faculty:'' });
    setGridMode(false); setGridRows([]); setGridDays([]); setIncludeLunch(true);
    try {
      if (associate?.college && t?.uid) {
        const schedRef = doc(db, 'Schedules', String(associate.college), 'Teachers', String(t.uid));
        const schedSnap = await getDoc(schedRef);
        setExistingSchedule(schedSnap.exists() ? { id: schedSnap.id, ...schedSnap.data() } : null);
      }
    } catch {
      setExistingSchedule(null);
    }
    setDialogOpen(true);
  };

  const uploadToStorage = async () => {
    if (!file || !associate?.college || !targetTeacher?.uid) throw new Error('Missing data');
    const safe = sanitizeName(file.name);
    const path = `schedules/${associate.college}/${targetTeacher.uid}/${Date.now()}_${safe}`;
    const contentType = file.type || guessExcelMime(file.name, 'application/octet-stream');
    const storageRef = ref(storage, path);
    const snap = await uploadBytes(storageRef, file, { contentType });
    const url = await getDownloadURL(snap.ref);
    return { path, url, fileName: file.name, mimeType: contentType, size: file.size };
  };

  const saveSchedule = async (status) => {
    if (!associate?.college || !targetTeacher?.uid) return;
    if (!file && !existingSchedule) return;
    if (kind === 'excel' && !excelReady) return;
    try {
      setSchedLoading(true);
      const schedRef = doc(db, 'Schedules', String(associate.college), 'Teachers', String(targetTeacher.uid));
      let storageInfo = existingSchedule?.storage || null;
      if (file) storageInfo = await uploadToStorage();
      const payload = {
        collegeId: associate.college,
        teacher: {
          uid: targetTeacher.uid,
          teacherId: targetTeacher.teacherId || '',
          name: `${targetTeacher.firstName || ''} ${targetTeacher.lastName || ''}`.trim(),
          email: targetTeacher.email || '',
          program: targetTeacher.program || '',
          department: targetTeacher.department || '',
        },
        status,
        type: file ? kind : (existingSchedule?.type || 'unknown'),
        academicRange,
        storage: storageInfo,
        normalized: {
          enabled: (file ? (kind === 'excel') : (existingSchedule?.normalized?.enabled || false)),
          schema: ['day', 'start', 'end', 'subject', 'room', 'faculty'],
          rows: (file ? (kind === 'excel' ? normalized : []) : (existingSchedule?.normalized?.rows || [])),
        },
        uploadedBy: auth.currentUser?.uid || '',
        uploadedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        source: 'associate-portal',
      };
      await setDoc(schedRef, payload, { merge: true });
      setExistingSchedule(payload);
      setFile(null); setKind('unknown'); setPreviewURL('');
      setExcelHeaders([]); setExcelRows([]); setColumnMap({ day:'',start:'',end:'',subject:'',room:'',faculty:'' });
      setGridMode(false); setGridRows([]); setGridDays([]);
      // refresh availability cache for this teacher
      const upd = await fetchTeacherSchedule(targetTeacher);
      setSchedByTeacher((m) => ({ ...m, [targetTeacher.uid || targetTeacher.id]: upd }));
    } catch {
      // ignore
    } finally {
      setSchedLoading(false);
    }
  };

  // View modal derived rows/pivot
  const viewRows = useMemo(() => {
    const enabled = !!viewSchedule?.normalized?.enabled;
    const rows = Array.isArray(viewSchedule?.normalized?.rows) ? viewSchedule.normalized.rows : [];
    return enabled ? rows : [];
  }, [viewSchedule]);

  const viewPivot = useMemo(() => sharedPivot(viewRows, []), [viewRows]);

  return (
    <Box sx={{ p: 3, maxWidth: "100vw", minHeight:"100vh", mx: 'auto' }}>
        <SecondaryHeader title="Upload Teacher Schedule" leftArea={<HeaderBackButton/>}/>
      
      {/* Department and AY controls */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6">Select Department</Typography>
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

          {/* Academic Month-Year, limited to Jan/Jul */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 2 }}>
            <FormControl sx={{ minWidth: 160 }}>
              <InputLabel>Month</InputLabel>
              <Select label="Month" value={month} onChange={(e) => setMonth(e.target.value)}>
                {['Jan', 'Jul'].map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField
              label="Start Year"
              value={year}
              onChange={(e) => setYear(String(e.target.value).replace(/\D/g, '').slice(0, 4))}
              inputProps={{ inputMode: 'numeric', maxLength: 4 }}
              sx={{ width: 160 }}
              helperText="e.g., 2025"
            />
            <TextField
              label="Academic Range"
              value={academicRange}
              InputProps={{ readOnly: true }}
              fullWidth
              helperText="Month StartYear–StartYear+1"
            />
          </Stack>

          {/* Search */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 2 }}>
            <TextField
              fullWidth
              placeholder="Search teacher by name, email or ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1 }} /> }}
            />
          </Stack>
        </CardContent>
      </Card>

      {/* Teachers grouped by Program (merged API labels + teacher codes) */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Teachers by Program</Typography>

          {programsLoading ? (
            <Stack direction="row" alignItems="center" spacing={1}>
              <CircularProgress size={18} />
              <Typography variant="body2">Loading programs…</Typography>
            </Stack>
          ) : (
            <Stack spacing={3}>
              {programHeads.length === 0 ? (
                <Typography variant="body2">No programs or teachers found for this department.</Typography>
              ) : (
                programHeads.map((head) => {
                  const group = grouped[head.key] || [];
                  return (
                    <Box key={head.key}>
                      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                          {head.label}
                        </Typography>
                        <Chip size="small" label={`${group.length} teachers`} />
                      </Stack>
                      {group.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                          No teachers in this program or filtered out.
                        </Typography>
                      ) : (
                        <Grid container spacing={2}>
                          {group.map((t) => {
                            const key = t.uid || t.id;
                            const avail = schedByTeacher[key];
                            return (
                              <Grid item xs={12} sm={6} md={4} lg={3} key={key}>
                                <Card variant="outlined" sx={{ borderRadius: 2 }}>
                                  <CardContent>
                                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                      {t.firstName} {t.lastName}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      {t.email}
                                    </Typography>
                                    <Stack spacing={0.5} sx={{ mt: 1 }}>
                                      <Typography variant="body2">Teacher ID: {t.teacherId || '—'}</Typography>
                                      <Typography variant="body2">Program: {t.program || '—'}</Typography>
                                    </Stack>
                                    <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap' }}>
                                      {!!avail?.url && (
                                        <Button
                                          size="small"
                                          variant="outlined"
                                          onClick={async () => {
                                            const full = await fetchTeacherScheduleDoc(t);
                                            setViewSchedule(full);
                                            setViewOpen(true);
                                          }}
                                        >
                                          View Current
                                        </Button>
                                      )}
                                      <Button
                                        size="small"
                                        variant="contained"
                                        onClick={() => openForTeacher(t)}
                                      >
                                        {avail?.url ? 'Update Schedule' : 'Manage Schedule'}
                                      </Button>
                                    </Stack>
                                  </CardContent>
                                </Card>
                              </Grid>
                            );
                          })}
                        </Grid>
                      )}
                    </Box>
                  );
                })
              )}
            </Stack>
          )}
        </CardContent>
      </Card>

      {/* Dialog for upload/update/manage */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xl" fullWidth>
        <DialogTitle>
          {targetTeacher ? `Schedule • ${targetTeacher.firstName} ${targetTeacher.lastName}` : 'Schedule'}
        </DialogTitle>
        <DialogContent dividers>
          {targetTeacher && (
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
                <Chip label={`Teacher: ${targetTeacher.firstName} ${targetTeacher.lastName}`} />
                <Chip label={`ID: ${targetTeacher.teacherId || '—'}`} />
                <Chip label={`Program: ${targetTeacher.program || '—'}`} />
                <Chip label={`Academic: ${academicRange}`} color="primary" variant="outlined" />
                {existingSchedule?.status && <Chip label={`Existing: ${existingSchedule.status}`} color="success" />}
                {existingSchedule?.storage?.fileName && <Chip label={existingSchedule.storage.fileName} />}
              </Stack>

              {existingSchedule ? (
                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={existingSchedule.type === 'excel' ? <TableViewIcon /> : (existingSchedule.type === 'pdf' ? <PictureAsPdfIcon /> : <ImageIcon />)}
                    onClick={() => existingSchedule?.storage?.url && window.open(existingSchedule.storage.url, '_blank')}
                  >
                    Open Current
                  </Button>
                </Stack>
              ) : (
                <Alert severity="info">No existing schedule found for this teacher in {academicRange}.</Alert>
              )}

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
                <Button component="label" variant="outlined" startIcon={<CloudUploadIcon />}>
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
              </Stack>

              {kind === 'image' && previewURL && (
                <Box sx={{ mt: 1 }}>
                  <img src={previewURL} alt="schedule" style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid #eee' }} />
                </Box>
              )}

              {kind === 'pdf' && file && (
                <Box sx={{ mt: 1, height: 520 }}>
                  <object data={previewURL || URL.createObjectURL(file)} type="application/pdf" width="100%" height="100%">
                    <p>PDF preview is not supported by this browser.</p>
                  </object>
                </Box>
              )}

              {kind === 'excel' && (
                <Box>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                    <Chip color={gridMode ? 'success' : 'default'} label={gridMode ? 'Matrix detected' : 'Manual mapping'} size="small" />
                    {gridMode && (
                      <>
                        <Chip label={`${gridRows.length} rows`} size="small" />
                        <Chip label={`Days: ${gridDays.join(', ') || '—'}`} size="small" />
                      </>
                    )}
                  </Stack>

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
                              <TableCell key={`${slot}-${d}`} sx={{ whiteSpace: 'pre-line', lineHeight: 1.35 }}>
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
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          {existingSchedule?.storage?.url && (
            <Button
              startIcon={<DownloadIcon />}
              component="a"
              href={existingSchedule.storage.url}
              download={existingSchedule.storage.fileName || 'teacher-schedule'}
            >
              Download Current
            </Button>
          )}
          <Button
            variant="contained"
            color="secondary"
            startIcon={<SaveIcon />}
            disabled={schedLoading || (!file && !existingSchedule)}
            onClick={() => saveSchedule('DRAFT')}
          >
            Save Draft
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={<PublishIcon />}
            disabled={schedLoading || (!file && !existingSchedule) || (kind === 'excel' && !excelReady)}
            onClick={() => saveSchedule('PUBLISHED')}
          >
            Publish
          </Button>
          <Button onClick={() => setDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* View modal for current schedule with inline download */}
      <Dialog open={viewOpen} onClose={() => setViewOpen(false)} maxWidth="xl" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          Current Schedule
          <Box sx={{ color: 'text.secondary', fontWeight: 400, fontSize: 14 }}>
            {viewSchedule?.teacher?.name || ''}
          </Box>
          <Box sx={{ flex: 1 }} />
          {viewSchedule?.storage?.url && (
            <Button
              startIcon={<DownloadIcon />}
              component="a"
              href={viewSchedule.storage.url}
              download={viewSchedule.storage.fileName || 'teacher-schedule'}
            >
              Download
            </Button>
          )}
        </DialogTitle>
        <DialogContent dividers>
          {!viewSchedule ? (
            <Alert severity="info">No schedule found.</Alert>
          ) : viewSchedule.type === 'excel' && viewRows.length > 0 ? (
            <TableContainer component={Paper} sx={{ maxHeight: 640, borderRadius: 1 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 160, fontWeight: 700 }}>Time Slot</TableCell>
                    {viewPivot.days.map((d) => (
                      <TableCell key={d} sx={{ fontWeight: 700 }}>{d}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {viewPivot.slots.map((slot) => (
                    <TableRow key={slot} hover>
                      <TableCell sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                        {slot}
                      </TableCell>
                      {viewPivot.days.map((d) => (
                        <TableCell key={`${slot}-${d}`} sx={{ whiteSpace: 'pre-line', lineHeight: 1.35 }}>
                          {renderCellText(viewPivot.map[slot]?.[d]) || '—'}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  {viewPivot.slots.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={1 + viewPivot.days.length} align="center">
                        No rows to display.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          ) : viewSchedule.type === 'pdf' ? (
            <Box sx={{ mt: 1, height: 640 }}>
              <object data={viewSchedule.storage?.url || ''} type="application/pdf" width="100%" height="100%">
                <p>PDF preview not supported in this browser.</p>
              </object>
            </Box>
          ) : viewSchedule.type === 'image' ? (
            <Box sx={{ textAlign: 'center' }}>
              <img
                src={viewSchedule.storage?.url || ''}
                alt="Current schedule"
                style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid #eee' }}
              />
            </Box>
          ) : (
            <Alert severity="info">Parsed view not available for this schedule.</Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TeacherSchedules;
