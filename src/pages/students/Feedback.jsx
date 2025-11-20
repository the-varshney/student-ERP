import React, { useEffect, useMemo, useState, useCallback } from "react";
import {Container, Paper, Stack, Typography, Alert, Chip, TextField, Button, Box, CircularProgress, Snackbar, Dialog, 
  DialogTitle, DialogContent, DialogActions, Grid, useTheme, IconButton, Tooltip
    } from "@mui/material";
import { Rating } from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import ReplayIcon from "@mui/icons-material/Replay";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import RefreshIcon from "@mui/icons-material/Refresh";
import { getAuth } from "firebase/auth";
import { db } from "../../firebase/Firebase";
import { collection, query, where, getDocs, doc, getDoc, setDoc, Timestamp,
} from "firebase/firestore";
import axios from "axios";
import StudentHeader from "../../components/StudentHeader";
import SecondaryHeader from '../../components/secondaryHeader';
import { HeaderBackButton } from '../../components/header';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const NS = "erp";
const VER = "v1";
const key = (uid, name) => `${NS}:${uid}:${name}:${VER}`;
const parseCache = (raw) => {
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
};
const readMergedStudentFromLocal = () => {
  const uid = getAuth().currentUser?.uid;
  if (!uid) return null;
  const mergedRaw = typeof window !== "undefined" ? window.localStorage.getItem(key(uid, "student")) : null;
  const mergedEntry = parseCache(mergedRaw);
  const merged = mergedEntry?.v || null;
  if (merged) return merged;
  const legacyRaw = typeof window !== "undefined" ? window.localStorage.getItem(`userDetails_${uid}`) : null;
  try { return legacyRaw ? JSON.parse(legacyRaw) : null; } catch { return null; }
};
const normalizeStudent = (merged) => {
  if (!merged) return null;
  const programId = merged.Program || merged.program || "";
  const semester = String(merged.Semester || merged.semester || "");
  return {
    collegeId: merged.collegeId || "",
    program: programId,
    semester,
    firstName: merged.firstName || "",
    lastName: merged.lastName || "",
    fullName: `${merged.firstName || ""} ${merged.lastName || ""}`.trim(),
  };
};

const toDisplayDateTime = (val) => {
  try {
    let d = val;
    if (!d) return "";
    if (typeof d?.toDate === "function") d = d.toDate();
    if (typeof d?.seconds === "number") d = new Date(d.seconds * 1000);
    if (!(d instanceof Date)) d = new Date(d);
    return d.toLocaleString();
  } catch {
    return "";
  }
};
const deadlinePassed = (deadline) => {
  try {
    if (!deadline) return false;
    const d = typeof deadline?.toDate === "function" ? deadline.toDate() : new Date(deadline);
    return Date.now() > d.getTime();
  } catch {
    return false;
  }
};
const uniq = (arr) => Array.from(new Set(arr));
const byEarliestDeadline = (a, b) => {
  const da = typeof a.deadline?.toDate === "function" ? a.deadline.toDate() : new Date(a.deadline || 0);
  const dbb = typeof b.deadline?.toDate === "function" ? b.deadline.toDate() : new Date(b.deadline || 0);
  return da - dbb;
};

export default function StudentFeedback() {
  const theme = useTheme();
  const auth = getAuth();
  const user = auth.currentUser;

  // Student profile 
  const [student, setStudent] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // Available forms
  const [configs, setConfigs] = useState([]);
  const [loadingConfigs, setLoadingConfigs] = useState(false);

  // Derived semester 
  const [selectedSemester, setSelectedSemester] = useState("");
  // Subject name mapping via catalog
  const [subjects, setSubjects] = useState([]);
  const [catalogErr, setCatalogErr] = useState("");
  const [teacherNames, setTeacherNames] = useState({}); // key: course_semester -> name

  const [submittedIndex, setSubmittedIndex] = useState({}); 

  // Form dialog
  const [openForm, setOpenForm] = useState(null); 
  const [ratings, setRatings] = useState([]); 
  const [comments, setComments] = useState("");
  const [existingDocId, setExistingDocId] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "info",
  });

  // Load student profile from cache 
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoadingProfile(true);
        if (!user) return;
        const merged = readMergedStudentFromLocal();
        if (!merged) {
          setStudent(null);
          return;
        }
        const s = normalizeStudent(merged);
        if (!active) return;
        setStudent(s);
        if (s.semester) setSelectedSemester(String(s.semester));
      } finally {
        if (active) setLoadingProfile(false);
      }
    })();
    return () => { active = false; };
  }, [user]);

  // Fetch feedback configs for the student's college/program
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (!student?.collegeId || !student?.program) {
          setConfigs([]);
          return;
        }
        setLoadingConfigs(true);

        const results = [];
        try {
          const q1 = query(
            collection(db, "FeedbackConfig"),
            where("enabled", "==", true),
            where("college", "==", String(student.collegeId))
          );
          const s1 = await getDocs(q1);
          s1.forEach((d) => results.push({ id: d.id, ...d.data() }));
        } catch (e) {
          console.debug("FeedbackConfig (college) query fallback hit:", e);
        }
        try {
          const q2 = query(
            collection(db, "FeedbackConfig"),
            where("enabled", "==", true),
            where("collegeId", "==", String(student.collegeId))
          );
          const s2 = await getDocs(q2);
          s2.forEach((d) => results.push({ id: d.id, ...d.data() }));
        } catch (e) {
          console.debug("FeedbackConfig (collegeId) query fallback hit:", e);
        }

        const dedup = [];
        const seen = new Set();
        for (const r of results) {
          const key = `${r.id}|${r.course}|${r.semester}`;
          if (!seen.has(key)) {
            seen.add(key);
            dedup.push(r);
          }
        }
        const filtered = dedup.filter((r) => {
          if (!r.program) return true;
          return String(r.program).toLowerCase() === String(student.program).toLowerCase();
        });
        filtered.sort(byEarliestDeadline);
        if (!active) return;
        setConfigs(filtered);

        if (!student.semester) {
          const sems = uniq(
            filtered
              .map((r) => Number(r.semester))
              .filter((n) => Number.isFinite(n))
              .sort((a, b) => a - b)
          );
          if (sems.length === 1) {
            setSelectedSemester(String(sems[0]));
          } else if (sems.length > 1) {
            const upcoming = filtered.filter((x) => !deadlinePassed(x.deadline));
            if (upcoming.length) {
              const sem = Number(upcoming[0]?.semester);
              if (Number.isFinite(sem)) setSelectedSemester(String(sem));
            } else {
              setSelectedSemester(String(sems[0]));
            }
          }
        }
      } catch (e) {
        console.error("Configs load error:", e);
        setConfigs([]);
        setSnackbar({
          open: true,
          severity: "error",
          message: "Failed to load available feedback.",
        });
      } finally {
        if (active) setLoadingConfigs(false);
      }
    })();
    return () => { active = false; };
  }, [student?.collegeId, student?.program, student?.semester]);

  // teacher names for listing and dialog
  useEffect(() => {
    let active = true;
    (async () => {
      const map = {};
      for (const cfg of configs) {
        const key = `${cfg.course}_${cfg.semester}`;
        let name = cfg.teacherName;
        if (!name && cfg.teacherId) {
          try {
            const tSnap = await getDoc(doc(db, "Teachers", cfg.teacherId));
            if (tSnap.exists()) {
              const t = tSnap.data();
              name =
                t.fullName ||
                [t.firstName, t.lastName].filter(Boolean).join(" ") ||
                cfg.teacherId;
            }
          } catch (e) {
            console.debug("Teacher lookup fallback:", e);
          }
        }
        if (name) map[key] = name;
      }
      if (active) setTeacherNames(map);
    })();
    return () => { active = false; };
  }, [configs]);

  // Build an index of student's submissions for the selected semester
  useEffect(() => {
    let active = true;
    (async () => {
      if (!user || !selectedSemester) {
        setSubmittedIndex({});
        return;
      }
      try {
        const qRef = query(
          collection(db, "Feedback"),
          where("studentId", "==", user.uid),
          where("semester", "==", Number(selectedSemester))
        );
        const snap = await getDocs(qRef);
        const map = {};
        snap.forEach((d) => {
          const data = d.data();
          const k = `${data.course}_${data.semester}`;
          map[k] = { id: d.id, exists: true };
        });
        if (active) setSubmittedIndex(map);
      } catch (e) {
        console.error("Submissions index error:", e);
        if (active) setSubmittedIndex({});
      }
    })();
    return () => { active = false; };
  }, [user, selectedSemester]);

  // Load subject list for mapping subject names from program and selectedSemester
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setCatalogErr("");
        setSubjects([]);
        if (!student?.program || !selectedSemester) return;

        const headers = { "Content-Type": "application/json", Accept: "application/json" };
        if (user) headers["Authorization"] = `Bearer ${await user.getIdToken()}`;

        const res = await axios.get(
          `${API_BASE_URL}/api/programs/${student.program}/semesters/${selectedSemester}/subjects`,
          { headers }
        );
        if (!active) return;
        setSubjects(Array.isArray(res.data) ? res.data : []);
      } catch (e) {
        console.error("Subjects load error:", e);
        if (active) setCatalogErr("Failed to load subject catalog. Names may fallback to course codes.");
      }
    })();
    return () => { active = false; };
  }, [student?.program, selectedSemester, user]);

  // Subject display name
  const subjectNameFor = (courseCode) => {
    const s =
      subjects.find(
        (x) =>
          String(x._id) === String(courseCode) ||
          String(x.code || "").toLowerCase() === String(courseCode).toLowerCase() ||
          String(x.subjectId || "").toLowerCase() === String(courseCode).toLowerCase()
      ) || null;
    return s?.subjectName || s?.name || s?.title || String(courseCode);
  };

  // Filter configs by selected semester
  const visibleConfigs = useMemo(() => {
    if (!selectedSemester) return [];
    return configs.filter((c) => String(c.semester) === String(selectedSemester));
  }, [configs, selectedSemester]);

  // Open a form dialog (prefill previous if exists)
  const openFormFor = async (cfg) => {
    try {
      setOpenForm(cfg);
      const qs = Array.isArray(cfg.questions) ? cfg.questions : [];
      setRatings(qs.map(() => 0));
      setComments("");
      setExistingDocId(null);

      if (!user) return;
      const docId = `${user.uid}_${cfg.course}_${cfg.semester}`;
      const prev = await getDoc(doc(db, "Feedback", docId));
      if (prev.exists()) {
        const data = prev.data();
        let existing = Array.isArray(data.ratings) ? data.ratings : Object.values(data.ratings || {});
        existing = existing.slice(0, qs.length);
        while (existing.length < qs.length) existing.push(0);
        setRatings(existing);
        setComments(data.comments || "");
        setExistingDocId(docId);
      }
    } catch (e) {
      console.error("Open form error:", e);
      setSnackbar({ open: true, severity: "error", message: "Failed to open the feedback form." });
    }
  };
  const closeForm = () => {
    setOpenForm(null);
    setRatings([]);
    setComments("");
    setExistingDocId(null);
  };
  const setRatingAt = (idx, val) => {
    setRatings((prev) => {
      const next = [...prev];
      next[idx] = Number(val) || 0;
      return next;
    });
  };

  const readOnly = !!existingDocId;

  const canSubmit = useMemo(() => {
    if (!openForm) return false;
    if (readOnly) return false;
    if (!openForm.enabled || deadlinePassed(openForm.deadline)) return false;
    const qs = Array.isArray(openForm.questions) ? openForm.questions : [];
    return ratings.length === qs.length && ratings.every((r) => r >= 1 && r <= 5);
  }, [openForm, ratings, readOnly]);

  const handleSubmit = async () => {
    if (!user || !openForm || !student) return;
    if (!canSubmit) {
      setSnackbar({
        open: true,
        severity: "warning",
        message: "Please rate all questions before submitting.",
      });
      return;
    }
    try {
      setSubmitting(true);
      const docId = `${user.uid}_${openForm.course}_${openForm.semester}`;
      const payload = {
        collegeId: student.collegeId || null,
        programId: student.program || null,
        course: openForm.course,
        semester: Number(openForm.semester),
        ratings: ratings.map((r) => Number(r)),
        comments: String(comments || ""),
        studentId: user.uid,
        studentName: student.fullName || "Anonymous",
        updatedAt: Timestamp.now(),
        submittedAt: Timestamp.now(),
      };
      await setDoc(doc(db, "Feedback", docId), payload);
      setSnackbar({ open: true, severity: "success", message: "Feedback submitted successfully." });
      setExistingDocId(docId); 


      setSubmittedIndex((prev) => ({
        ...prev,
        [`${openForm.course}_${openForm.semester}`]: { id: docId, exists: true },
      }));
    } catch (e) {
      console.error("Submit error:", e);
      setSnackbar({ open: true, severity: "error", message: "Submission failed. Try again." });
    } finally {
      setSubmitting(false);
    }
  };
  
  const handleRefresh = useCallback(() => {
    setLoadingConfigs(true);
    setConfigs([]);
  }, []);

  // Loading state
  if (loadingProfile) {
    return (
      <Container maxWidth="md" sx={{ py: 8, bgcolor: theme.palette.background.default }}>
        <Box display="flex" alignItems="center" justifyContent="center" minHeight="40vh" gap={2}>
          <CircularProgress />
          <Typography color="text.secondary">Loading profile…</Typography>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 6, bgcolor: theme.palette.background.default, minHeight: '100vh' }}>
      <Stack spacing={4}>
        <SecondaryHeader
          title="Your Available Feedback"
          leftArea={<HeaderBackButton />}
          rightArea={
            <Tooltip title="Refresh Forms">
              <span>
                <IconButton onClick={handleRefresh} color="primary" disabled={loadingConfigs}>
                  <RefreshIcon />
                </IconButton>
              </span>
            </Tooltip>
          }
        />

        {/* Student context header*/}
        <StudentHeader
          extraTexts={[
            { text: `College: ${student?.collegeId || "-"}` },
          ]}
        />
        {catalogErr && <Alert severity="warning" sx={{ mt: -1, borderRadius: 2 }}>{catalogErr}</Alert>}

        {/* Forms list */}
        <Paper elevation={4} sx={{ p: 3, borderRadius: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Open Forms
          </Typography>

          {loadingConfigs ? (
            <Box display="flex" alignItems="center" justifyContent="center" py={6} gap={2}>
              <CircularProgress size={24} />
              <Typography>Loading available feedback…</Typography>
            </Box>
          ) : !selectedSemester ? (
            <Alert severity="info" sx={{ borderRadius: 2 }}>
              No semester determined yet; please contact administration if this persists.
            </Alert>
          ) : visibleConfigs.length === 0 ? (
            <Alert severity="info" sx={{ borderRadius: 2 }}>No feedback forms for Semester {selectedSemester}.</Alert>
          ) : (
            <Grid container spacing={3}>
              {visibleConfigs.map((cfg) => {
                const closed = deadlinePassed(cfg.deadline) || !cfg.enabled;
                const subjectName = subjectNameFor(cfg.course);
                const k = `${cfg.course}_${cfg.semester}`;
                const teacherLabel = teacherNames[k] || cfg.teacherName || "Not specified";
                const hasSubmitted = !!submittedIndex[k]?.exists;

                return (
                  <Grid item xs={12} sm={6} md={6} key={`${cfg.id}-${cfg.course}-${cfg.semester}`}>
                    <Paper
                      variant="outlined"
                      sx={{
                        p: 3, 
                        borderRadius: 2.5,
                        minHeight: 210, 
                        display: "flex",
                        flexDirection: "column",
                        gap: 1.5,
                        transition: "box-shadow 0.2s ease",
                        "&:hover": { boxShadow: theme.shadows[8] },
                      }}
                    >
                      <Typography
                        variant="subtitle1"
                        fontWeight={700}
                        sx={{
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                        title={subjectName}
                      >
                        {subjectName}
                      </Typography>

                      <Typography variant="body2" color="text.secondary" noWrap>
                        Code: {cfg.course}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" noWrap>
                        Teacher: {teacherLabel}
                      </Typography>

                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" gap={1}>
                        {cfg.enabled && !deadlinePassed(cfg.deadline) ? (
                          <Chip icon={<CheckCircleOutlineIcon />} label="Open" color="success" size="small" />
                        ) : (
                          <Chip
                            icon={<ErrorOutlineIcon />}
                            label={deadlinePassed(cfg.deadline) ? "Closed" : "Disabled"}
                            color="error"
                            size="small"
                          />
                        )}
                        {!!cfg.deadline && (
                          <Chip
                            icon={<InfoOutlinedIcon />}
                            label={`Deadline: ${toDisplayDateTime(cfg.deadline)}`}
                            variant="outlined"
                            size="small"
                          />
                        )}
                        <Chip label={`Sem ${cfg.semester}`} variant="outlined" size="small" />
                        {hasSubmitted && <Chip label="Submitted" color="primary" size="small" variant="outlined" />}
                      </Stack>

                      <Stack direction="row" spacing={1} sx={{ mt: "auto" }}>
                        <Button
                          size="small"
                          variant="contained"
                          startIcon={<OpenInNewIcon />}
                          onClick={() => openFormFor(cfg)}
                          disabled={closed && !hasSubmitted}
                        >
                          {hasSubmitted ? "View Feedback" : closed ? "Unavailable" : "Open Form"}
                        </Button>
                      </Stack>
                    </Paper>
                  </Grid>
                );
              })}
            </Grid>
          )}
        </Paper>
      </Stack>

      {/* Form dialog */}
      <Dialog open={!!openForm} onClose={closeForm} maxWidth="md" fullWidth>
        <DialogTitle>
          {openForm ? `Feedback — ${subjectNameFor(openForm.course)}` : "Feedback"}
        </DialogTitle>
        <DialogContent dividers>
          {!openForm ? (
            <Typography variant="body2">No form selected.</Typography>
          ) : (
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                <Chip label={`Subject: ${subjectNameFor(openForm.course)}`} variant="outlined" size="small" />
                <Chip label={`Code: ${openForm.course}`} variant="outlined" size="small" />
                <Chip label={`Semester: ${openForm.semester}`} variant="outlined" size="small" />
                <Chip
                  label={`Teacher: ${teacherNames[`${openForm.course}_${openForm.semester}`] || openForm.teacherName || "Not specified"}`}
                  variant="outlined"
                  size="small"
                />
                {openForm.enabled && !deadlinePassed(openForm.deadline) ? (
                  <Chip label="Open" color="success" size="small" />
                ) : (
                  <Chip label={deadlinePassed(openForm.deadline) ? "Closed" : "Disabled"} color="error" size="small" />
                )}
                {existingDocId && <Chip label="Previously submitted" color="primary" size="small" variant="outlined" />}
                {!!openForm.deadline && (
                  <Chip
                    label={`Deadline: ${toDisplayDateTime(openForm.deadline)}`}
                    variant="outlined"
                    size="small"
                  />
                )}
              </Stack>

              {(openForm.questions || []).map((q, idx) => (
                <Box
                  key={`${idx}-${String(q).slice(0, 12)}`}
                  sx={{
                    p: 2,
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 2,
                    bgcolor: "background.paper",
                  }}
                >
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    alignItems={{ sm: "center" }}
                    spacing={1.5}
                    justifyContent="space-between"
                  >
                    <Typography variant="body1" sx={{ flex: 1, pr: 1 }}>
                      Q{idx + 1}. {q}
                    </Typography>
                    <Rating
                      name={`q-${idx}`}
                      value={Number(ratings[idx]) || 0}
                      onChange={(_e, val) => (!readOnly ? setRatingAt(idx, val || 0) : null)}
                      max={5}
                      readOnly={readOnly}
                    />
                  </Stack>
                </Box>
              ))}

              <TextField
                label="Comments"
                placeholder="Share suggestions or comments…"
                value={comments}
                onChange={(e) => (!readOnly ? setComments(e.target.value) : null)}
                fullWidth
                multiline
                minRows={3}
                InputProps={readOnly ? { readOnly: true } : undefined}
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          {!readOnly && (
            <Button
              variant="outlined"
              startIcon={<ReplayIcon />}
              onClick={() => {
                if (!openForm) return;
                setRatings((openForm.questions || []).map(() => 0));
                setComments("");
              }}
            >
              Reset
            </Button>
          )}
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting || readOnly}
          >
            {readOnly ? "Submitted" : submitting ? "Submitting…" : "Submit Feedback"}
          </Button>
          <Button onClick={closeForm}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3500}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <Alert
          elevation={6}
          variant="filled"
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          severity={snackbar.severity}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container>
  );
}