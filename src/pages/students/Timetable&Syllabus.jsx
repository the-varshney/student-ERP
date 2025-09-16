import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  Box, Container, Typography, Chip, Stack, Button, IconButton,
  CircularProgress, Alert, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Snackbar, useTheme
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import DownloadIcon from "@mui/icons-material/Download";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import PdfViewer from "../../components/PdfViewer";
import { auth, db } from "../../firebase/Firebase";
import {
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import StudentHeader from "../../components/StudentHeader";
import SecondaryHeader from '../../components/secondaryHeader';
import { HeaderBackButton } from '../../components/header';

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = "Asia/Kolkata";

const NS = "erp";
const VER = "v1";
const key = (uid, name) => `${NS}:${uid}:${name}:${VER}`;
const parseCache = (raw) => { try { return raw ? JSON.parse(raw) : null; } catch { return null; } };

const toMillis = (ts) => {
  try {
    if (!ts) return 0;
    if (typeof ts.toMillis === "function") return ts.toMillis();
    if (typeof ts.toDate === "function") return ts.toDate().getTime();
    if (typeof ts.seconds === "number") return ts.seconds * 1000;
    const d = new Date(ts);
    return Number.isFinite(d.getTime()) ? d.getTime() : 0;
  } catch {
    return 0;
  }
};
const toInt = (v) => {
  const n = Number(v);
  if (Number.isFinite(n)) return n;
  const parsed = parseInt(String(v ?? "").replace(/\D/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
};
const computeCurrentAcademicYear = () => {
  const now = dayjs().tz(TZ);
  const y = now.year();
  return `${y}-${y + 1}`;
};
const byUploadedDesc = (a, b) => toMillis(b.uploadedAt) - toMillis(a.uploadedAt);
const matchesProgSem = (docItem, programIdOrName, semester) => {
  const cls = docItem.class || {};
  const sem = toInt(cls.semester);
  const pid = String(cls.programId || "");
  const pname = String(cls.programName || "");
  const target = String(programIdOrName || "");
  return sem === toInt(semester) && (pid === target || pname === target);
};
const matchesAY = (docItem, ay) =>
  String(docItem.class?.academicYear || "") === String(ay || "");

const readMergedStudentFromLocal = () => {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  const mergedRaw = localStorage.getItem(key(uid, "student"));
  const mergedEntry = parseCache(mergedRaw);
  const merged = mergedEntry?.v || null;
  if (merged) return merged;

  const legacyRaw = localStorage.getItem(`userDetails_${uid}`);
  try {
    return legacyRaw ? JSON.parse(legacyRaw) : null;
  } catch {
    return null;
  }
};

const normalizeStudentForUI = (merged) => {
  if (!merged) return null;
  return {
    firstName: merged.firstName || "",
    lastName: merged.lastName || "",
    email: merged.email || "",
    profilePicUrl: merged.profilePicUrl || "",
    collegeId: merged.collegeId || "",
    collegeName: merged.collegeName || "",
    program: {
      _id: merged.Program || merged.program || "",
      programName: merged.Program || merged.program || "",
    },
    department: {
      _id: merged.Department || merged.department || "",
      departmentName: merged.Department || merged.department || "",
    },
    semester: String(merged.Semester || merged.semester || ""),
    enrollmentNo: merged.EnrollmentNo || merged.enrollmentNo || "",
  };
};

export default function StudentClass() {
  const theme = useTheme();
  const [tab, setTab] = useState(0); // 0 = Timetable, 1 = Syllabus

  const [student, setStudent] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileErr, setProfileErr] = useState("");

  const [filters, setFilters] = useState({
    collegeId: "",
    programId: "",
    semester: "",
    academicYear: computeCurrentAcademicYear(),
  });

  const [loadingTT, setLoadingTT] = useState(false);
  const [timetable, setTimetable] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "info" });

  const [loadingSyllabus, setLoadingSyllabus] = useState(false);
  const [syllabusDoc, setSyllabusDoc] = useState(null);
  const [syllabusMsg, setSyllabusMsg] = useState("");
  const [syllabusErr, setSyllabusErr] = useState("");

  useEffect(() => {
    const bootstrap = async () => {
      try {
        setLoadingProfile(true);
        setProfileErr("");
        const user = auth.currentUser;
        if (!user) {
          setProfileErr("Please log in to view content.");
          return;
        }
        const merged = readMergedStudentFromLocal();
        if (!merged) {
          setProfileErr("Student profile not found in cache. Please re-login.");
          return;
        }
        const ui = normalizeStudentForUI(merged);
        setStudent(ui);

        setFilters((p) => ({
          ...p,
          collegeId: merged.collegeId || "",
          programId: String(merged.Program || merged.program || ""),
          semester: String(merged.Semester || merged.semester || ""),
          academicYear: computeCurrentAcademicYear(),
        }));
      } catch {
        setProfileErr("Failed to initialize profile from cache.");
      } finally {
        setLoadingProfile(false);
      }
    };
    bootstrap();
  }, []);

  const canQuery = useMemo(
    () => Boolean(filters.collegeId && filters.programId && filters.semester),
    [filters]
  );

  const fetchTimetable = useCallback(async () => {
    if (!canQuery) {
      setTimetable(null);
      return;
    }
    try {
      setLoadingTT(true);
      const qRef = query(
        collection(db, "timetables"),
        where("collegeId", "==", String(filters.collegeId)),
        where("status", "==", "PUBLISHED")
      );
      const snap = await getDocs(qRef);
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(byUploadedDesc);
      const forProgSem = docs.filter((d) => matchesProgSem(d, filters.programId, filters.semester));
      const preferred = forProgSem.find((d) => matchesAY(d, filters.academicYear));
      setTimetable(preferred || forProgSem[0] || null);
      if (!preferred && forProgSem.length === 0) {
        setSnackbar({ open: true, severity: "info", message: "No published timetable found for your Program/Semester." });
      }
    } catch {
      setTimetable(null);
      setSnackbar({ open: true, severity: "error", message: "Failed to load timetable." });
    } finally {
      setLoadingTT(false);
    }
  }, [filters, canQuery]);

  useEffect(() => {
    if (tab === 0) fetchTimetable();
  }, [fetchTimetable, tab]);

  const isExcel = timetable?.type === "excel" && timetable?.normalized?.enabled;
  const rows = useMemo(() => {
    if (!isExcel) return [];
    const arr = Array.isArray(timetable.normalized.rows) ? timetable.normalized.rows : [];
    const dayOrder = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7 };
    return [...arr].sort((a, b) => {
      const da = dayOrder[String(a.day || "").toLowerCase()] || 99;
      const dbb = dayOrder[String(b.day || "").toLowerCase()] || 99;
      if (da !== dbb) return da - dbb;
      const parsedA = dayjs(String(a.start).trim(), ["h:mm A", "hh:mm A", "H:mm"], true);
      const parsedB = dayjs(String(b.start).trim(), ["h:mm A", "hh:mm A", "H:mm"], true);
      return (parsedA.isValid() ? parsedA.valueOf() : 0) - (parsedB.isValid() ? parsedB.valueOf() : 0);
    });
  }, [isExcel, timetable]);

  const pivot = useMemo(() => {
    if (!isExcel || rows.length === 0) return { days: [], slots: [], map: {} };
    const DAY_ORDER = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7 };
    const days = Array.from(new Set(rows.map(r => r.day).filter(Boolean)))
      .sort((a, b) => (DAY_ORDER[String(a).toLowerCase()] || 999) - (DAY_ORDER[String(b).toLowerCase()] || 999));
    const slotSet = new Set();
    rows.forEach(r => { if (r.start && r.end) slotSet.add(`${r.start} - ${r.end}`); });
    const toMinutesSlot = (t) => {
      const parsed = dayjs(String(t).trim(), ["h:mm A", "hh:mm A", "H:mm"], true);
      return parsed.isValid() ? parsed.valueOf() : 0;
    };
    const slots = Array.from(slotSet).sort((a, b) => toMinutesSlot(a.split(" - ")[0]) - toMinutesSlot(b.split(" - ")[0]));
    const map = {};
    slots.forEach(s => { map[s] = {}; days.forEach(d => { map[s][d] = null; }); });
    rows.forEach(r => {
      const slot = `${r.start} - ${r.end}`;
      if (!map[slot]) map[slot] = {};
      map[slot][r.day] = r;
    });
    return { days, slots, map };
  }, [isExcel, rows]);

  const renderCellText = (r) => {
    if (!r) return "";
    const subj = String(r.subject || "").trim();
    if (subj.toLowerCase() === "lunch break") return "LUNCH BREAK";
    const m = subj.match(/^([A-Z]{2,}-?\d{2,3}[A-Z0-9-]*)\s*\((.+)\)$/i);
    const base = m ? `${m[1].toUpperCase()}: ${m[2]}` : subj;
    const lines = [base];
    if (r.room) lines.push(`(${String(r.room).trim()})`);
    if (r.faculty) lines.push(`~${String(r.faculty).trim()}`);
    return lines.join("\n");
  };

  const fetchSyllabus = useCallback(async () => {
    if (!canQuery) {
      setSyllabusDoc(null);
      return;
    }
    try {
      setLoadingSyllabus(true);
      setSyllabusErr("");
      setSyllabusMsg("");
      const ay = computeCurrentAcademicYear();

      const qRef = query(
        collection(db, "Syllabus"),
        where("programId", "==", String(filters.programId)),
        where("semester", "==", Number(filters.semester)),
        where("status", "==", "PUBLISHED")
      );
      const snap = await getDocs(qRef);
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(byUploadedDesc);

      const forCurrentAY = docs.filter(d => d.academicYear === ay);

      setSyllabusDoc(forCurrentAY[0] || docs[0] || null);
      if (!forCurrentAY.length && !docs.length) {
        setSyllabusMsg("No syllabus uploaded yet for your program and semester.");
      }
    } catch (e) {
      setSyllabusErr(e?.response?.data?.error || e.message || "Failed to load syllabus.");
    } finally {
      setLoadingSyllabus(false);
    }
  }, [filters, canQuery]);

  useEffect(() => {
    if (tab === 1) fetchSyllabus();
  }, [fetchSyllabus, tab]);

  const downloadInfo = useMemo(() => {
    if (tab === 0 && timetable?.storage?.url) {
      return {
        url: timetable.storage.url,
        fileName: timetable.storage.fileName || `timetable.file`,
        disabled: false,
      };
    }
    if (tab === 1 && syllabusDoc?.storage?.url) {
      return {
        url: syllabusDoc.storage.url,
        fileName: syllabusDoc.storage.fileName || `syllabus.pdf`,
        disabled: false,
      };
    }
    return { url: "", fileName: "", disabled: true };
  }, [tab, timetable, syllabusDoc]);

  const updatedAtLabel = useMemo(() => {
    if (!timetable?.uploadedAt) return "";
    const d = typeof timetable.uploadedAt.toDate === "function" ? timetable.uploadedAt.toDate() : new Date(timetable.uploadedAt);
    return isNaN(d.getTime()) ? "" : d.toLocaleString();
  }, [timetable]);

  const handleTabChange = (_, newValue) => {
    setTab(newValue);
  };
  
  const handleRefreshClick = () => {
    if (tab === 0) {
      fetchTimetable();
    } else {
      fetchSyllabus();
    }
  };

  if (loadingProfile) {
    return (
      <Box sx={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        bgcolor: theme.palette.background.default
      }}>
        <CircularProgress />
        <Typography variant="h6" sx={{ mt: 2 }} color="text.secondary">Loading profile...</Typography>
      </Box>
    );
  }

  if (profileErr) {
    return (
      <Box sx={{ p: 4, bgcolor: theme.palette.background.default, minHeight: "100vh" }}>
        <Alert severity="error">{profileErr}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ backgroundColor: theme.palette.background.default, minHeight: "100vh", py: 4 }}>
      <Container maxWidth="xl">
        <SecondaryHeader
          title="TimeTable & Syllabus"
          leftArea={<HeaderBackButton />}
          rightArea={
            <Stack direction="row" spacing={1}>
              <IconButton onClick={handleRefreshClick} color="primary" sx={{ bgcolor: theme.palette.background.paper, boxShadow: 1 }}>
                <RefreshIcon />
              </IconButton>
              <Button
                key="dl"
                variant="contained"
                startIcon={<DownloadIcon />}
                component="a"
                href={downloadInfo.url || undefined}
                target={downloadInfo.disabled ? undefined : "_blank"}
                rel={downloadInfo.disabled ? undefined : "noopener noreferrer"}
                download={downloadInfo.disabled ? undefined : downloadInfo.fileName}
                disabled={downloadInfo.disabled}
                sx={{ textTransform: "none" }}
              >
                Download
              </Button>
            </Stack>
          }
          tabs={[
            { label: 'Timetable', value: 0 },
            { label: 'Syllabus', value: 1 }
          ]}
          tabValue={tab}
          onTabChange={handleTabChange}
          renderBelow
        />
        
        {student && (
          <StudentHeader />
        )}

        <Box sx={{ mt: 3 }}>
          {/* Tab Content */}
          {tab === 0 && (
            <Box>
              {!canQuery ? (
                <Alert severity="info" sx={{ mt: 2, borderRadius: 2 }}>Missing program/semester info in profile cache.</Alert>
              ) : (
                <Paper elevation={0} sx={{ p: { xs: 1, sm: 2, md: 3 }, borderRadius: 3, border: "1px solid", borderColor: theme.palette.divider }}>
                  <Stack spacing={2}>
                    <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ gap: 1.5 }}>
                      {!!timetable?.class?.academicYear && <Chip label={`AY: ${timetable.class.academicYear}`} size="small" />}
                      {!!timetable?.type && <Chip label={`Type: ${String(timetable.type).toUpperCase()}`} size="small" />}
                      {!!updatedAtLabel && <Chip label={`Updated: ${updatedAtLabel}`} size="small" variant="outlined" />}
                    </Stack>

                    {loadingTT && <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>}
                    {!loadingTT && !timetable && <Alert severity="info">No published timetable was found for your Program/Semester.</Alert>}

                    {!loadingTT && timetable && (
                      isExcel ? (
                        rows.length > 0 ? (
                          <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: '70vh', borderRadius: 2, border: "1px solid", borderColor: theme.palette.divider }}>
                            <Table stickyHeader size="small">
                              <TableHead>
                                <TableRow>
                                  <TableCell sx={{ fontWeight: 700, width: 160, bgcolor: theme.palette.background.default }}>Time Slot</TableCell>
                                  {pivot.days.map(d => <TableCell key={d} sx={{ fontWeight: 700, bgcolor: theme.palette.background.default }}>{d}</TableCell>)}
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {pivot.slots.map(slot => (
                                  <TableRow key={slot}>
                                    <TableCell sx={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{slot}</TableCell>
                                    {pivot.days.map(d => (
                                      <TableCell key={`${slot}-${d}`} sx={{ whiteSpace: "pre-line", lineHeight: 1.35 }}>
                                        {renderCellText(pivot.map[slot]?.[d]) || "—"}
                                      </TableCell>
                                    ))}
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </TableContainer>
                        ) : <Alert severity="warning">Excel file is empty or could not be read.</Alert>
                      ) : timetable.type === 'pdf' && timetable.storage?.url ? (
                        <PdfViewer fileUrl={timetable.storage.url} />
                      ) : timetable.type === 'image' && timetable.storage?.url ? (
                        <Box component="img" src={timetable.storage.url} alt="Class Timetable" sx={{ maxWidth: "100%", borderRadius: 2, border: "1px solid #eee" }}/>
                      ) : (
                        <Alert severity="warning">Timetable file is available but the format is not viewable here. Please download it.</Alert>
                      )
                    )}
                  </Stack>
                </Paper>
              )}
            </Box>
          )}

          {/* Syllabus */}
          {tab === 1 && (
            <Box>
              {!canQuery ? (
                <Alert severity="info" sx={{ mt: 2, borderRadius: 2 }}>Missing program/semester info in profile cache.</Alert>
              ) : loadingSyllabus ? (
                <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
              ) : syllabusErr ? (
                <Alert severity="error">{syllabusErr}</Alert>
              ) : syllabusDoc?.storage?.url ? (
                <PdfViewer fileUrl={syllabusDoc.storage.url} />
              ) : (
                <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 3, border: "1px solid", borderColor: theme.palette.divider }}>
                  <Typography variant="h6" gutterBottom>Syllabus Not Available</Typography>
                  <Typography color="text.secondary">{syllabusMsg || "Once the syllabus is published, it will appear here."}</Typography>
                </Paper>
              )}
            </Box>
          )}
        </Box>
      </Container>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3500}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <Alert elevation={6} variant="filled" onClose={() => setSnackbar((s) => ({ ...s, open: false }))} severity={snackbar.severity}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}