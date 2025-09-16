import React, { useEffect, useMemo, useState } from "react";
import { Box, Card, CardContent, Typography, FormControl, InputLabel, Select, MenuItem, Button, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, Paper, Chip, Avatar, Alert, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions, 
  TextField, Snackbar, Stack, IconButton, FormControlLabel, Switch, Rating, Tooltip,alpha, useTheme
} from "@mui/material";
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Sort as SortIcon,
} from "@mui/icons-material";
import ReplayIcon from "@mui/icons-material/Replay";
import FormatListNumberedIcon from "@mui/icons-material/FormatListNumbered";
import { db } from "../../firebase/Firebase";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { motion } from "framer-motion";
import { useAuth } from "../../context/AuthContext";
 import { HeaderBackButton } from "../../components/header";
 import SecondaryHeader from "../../components/secondaryHeader";
 import TeacherHeader from "../../components/TeacherHeader";

const createId = (seed = "") =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}${seed
    .toString()
    .slice(0, 4)}`;

const DEFAULT_QUESTIONS_TEXT = [
  "How clear was the topic explanation?",
  "How effective was the teacher’s communication?",
  "How engaging was the teaching style?",
  "How well were your doubts addressed?",
  "How relevant was the course content?",
  "How organized was the course structure?",
  "How approachable was the teacher?",
  "How well did the teacher encourage participation?",
  "How fair was the assessment process?",
  "How much did you learn in this course?",
];

const makeDefaultQuestions = () =>
  DEFAULT_QUESTIONS_TEXT.map((text) => ({ id: createId(text), text }));

const toISODate = (d) => {
  try {
    if (!d) return "";
    if (typeof d?.toDate === "function") d = d.toDate();
    if (d instanceof Date) return d.toISOString().split("T")[0];
    return new Date(d).toISOString().split("T")[0];
  } catch {
    return "";
  }
};

const makeConfigKey = (collegeId, subjectId, semester) =>
  `${String(collegeId || "NA")}_${String(subjectId)}_${String(semester)}`;
const makeLegacyConfigKey = (subjectId, semester) =>
  `${String(subjectId)}_${String(semester)}`;

// Component
export default function FeedbackManagement() {
  const theme = useTheme();
  const { userDetails: teacherData, role, loading: authLoading } = useAuth();
  // Catalog
  const [programs, setPrograms] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [semesters, setSemesters] = useState([]);

  // Selections
  const [selectedProgram, setSelectedProgram] = useState("");
  const [selectedSemester, setSelectedSemester] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");

  // Config state
  const [questions, setQuestions] = useState(makeDefaultQuestions());
  const [newQuestion, setNewQuestion] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [deadline, setDeadline] = useState("");

  // Results
  const [feedbackResults, setFeedbackResults] = useState({
    averages: [],
    comments: [],
    individual: [],
  });

  // UI state
  const [loading, setLoading] = useState(false);
  const [configDialog, setConfigDialog] = useState(false);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "info",
  });
  const [sortBy, setSortBy] = useState("default");

//Load teacher profile & catalog 
useEffect(() => {
  if (authLoading) return;
  if (!teacherData || role !== "Teacher") {
    setSnackbar({ open: true, message: "Access restricted to teachers only", severity: "error" });
    return;
  }

  const prog = teacherData.program ? [String(teacherData.program)] : [];
  setPrograms(prog);

  const subs = Array.isArray(teacherData.subjects) ? teacherData.subjects : [];
  setSubjects(subs);

  const sems = Array.from(
    new Set(subs.map((s) => Number(s.semester)).filter((n) => Number.isFinite(n)))
  ).sort((a, b) => a - b);
  setSemesters(sems);
}, [teacherData, role, authLoading]);

  const filteredSubjects = useMemo(() => {
    if (!selectedSemester) return [];
    return subjects.filter(
      (s) => String(s.semester) === String(selectedSemester)
    );
  }, [subjects, selectedSemester]);

  //load existing config for selected subject/semester 
  useEffect(() => {
    const loadConfig = async () => {
      if (!selectedSubject || !selectedSemester || !teacherData) return;

      try {
        const newKey = makeConfigKey(
          teacherData.college,
          selectedSubject,
          selectedSemester
        );
        let snap = await getDoc(doc(db, "FeedbackConfig", newKey));
        if (!snap.exists()) {
          const legacyKey = makeLegacyConfigKey(
            selectedSubject,
            selectedSemester
          );
          snap = await getDoc(doc(db, "FeedbackConfig", legacyKey));
        }

        if (snap.exists()) {
          const cfg = snap.data();
          setQuestions(
            (Array.isArray(cfg.questions) ? cfg.questions : DEFAULT_QUESTIONS_TEXT).map(
              (t) => ({ id: createId(t), text: String(t) })
            )
          );
          setEnabled(!!cfg.enabled);
          setDeadline(toISODate(cfg.deadline));
        } else {
          setQuestions(makeDefaultQuestions());
          setEnabled(false);
          setDeadline("");
        }
      } catch (e) {
        console.error("Config load error", e);
        setSnackbar({
          open: true,
          message: "Failed to load feedback configuration",
          severity: "error",
        });
      }
    };
    loadConfig();
  }, [selectedSubject, selectedSemester, teacherData]);

  // Actions: Questions 
  const handleAddQuestion = () => {
    const q = newQuestion.trim();
    if (!q) {
      setSnackbar({
        open: true,
        message: "Please enter a valid question",
        severity: "warning",
      });
      return;
    }
    const exists = questions.some(
      (x) => x.text.trim().toLowerCase() === q.toLowerCase()
    );
    if (exists) {
      setSnackbar({
        open: true,
        message: "Duplicate question",
        severity: "warning",
      });
      return;
    }
    setQuestions((prev) => [...prev, { id: createId(q), text: q }]);
    setNewQuestion("");
  };

  const handleDeleteQuestion = (id) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  const handleResetDefaults = () => {
    setQuestions(makeDefaultQuestions());
  };

  // Save Config //
  const handleSaveConfig = async () => {
    if (!selectedSubject || !selectedSemester) {
      setSnackbar({
        open: true,
        message: "Please select subject and semester",
        severity: "warning",
      });
      return;
    }
    if (!deadline) {
      setSnackbar({
        open: true,
        message: "Please choose a deadline",
        severity: "warning",
      });
      return;
    }
    const deduped = Array.from(
      new Set(questions.map((q) => q.text.trim()).filter(Boolean))
    );
    if (deduped.length === 0) {
      setSnackbar({
        open: true,
        message: "At least one question is required",
        severity: "warning",
      });
      return;
    }

    const d = new Date(deadline);
    if (!Number.isFinite(d.getTime())) {
      setSnackbar({
        open: true,
        message: "Invalid deadline date",
        severity: "warning",
      });
      return;
    }

    setLoading(true);
    try {
      const key = makeConfigKey(
        teacherData?.college,
        selectedSubject,
        selectedSemester
      );
      const payload = {
        college: teacherData?.college || null,
        program: selectedProgram || teacherData?.program || null,
        course: selectedSubject,
        semester: Number(selectedSemester),
        questions: deduped,
        enabled: !!enabled,
        deadline: Timestamp.fromDate(d),
        updatedAt: Timestamp.now(),
      };
      await setDoc(doc(db, "FeedbackConfig", key), payload);
      setSnackbar({
        open: true,
        message: "Feedback configuration saved successfully",
        severity: "success",
      });
      setConfigDialog(false);
    } catch (e) {
      console.error("Save config error", e);
      setSnackbar({
        open: true,
        message: "Failed to save feedback configuration",
        severity: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  // View Results //
  const handleViewResults = async () => {
    if (!selectedSubject || !selectedSemester) {
      setSnackbar({
        open: true,
        message: "Please select subject and semester",
        severity: "warning",
      });
      return;
    }

    setLoading(true);
    try {
      const qRef = query(
        collection(db, "Feedback"),
        where("course", "==", selectedSubject),
        where("semester", "==", Number(selectedSemester))
      );
      const snap = await getDocs(qRef);

      const results = [];
      const sums = Array(questions.length).fill(0);
      let count = 0;

      snap.forEach((d) => {
        const data = d.data();
        // ratings should be an array aligned to questions indices
        const ratings = Array.isArray(data.ratings)
          ? data.ratings
          : Object.values(data.ratings || {});
        results.push({
          studentId: data.studentId,
          // studentName is intentionally ignored in UI for anonymity
          comments: data.comments,
          ratings: ratings.map((r) => Number(r) || 0),
        });
        ratings.forEach((r, i) => {
          if (i < sums.length) sums[i] += Number(r) || 0;
        });
        count++;
      });

      const averages = sums.map((sum) =>
        count > 0 ? (sum / count).toFixed(2) : "0.00"
      );
      setFeedbackResults({
        averages,
        comments: results.map((r) => r.comments).filter(Boolean),
        individual: results,
      });
      setSnackbar({
        open: true,
        message: `Loaded ${results.length} feedback responses`,
        severity: "success",
      });
    } catch (e) {
      console.error("Load results error", e);
      setSnackbar({
        open: true,
        message: "Failed to load feedback results",
        severity: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const sortedFeedback = useMemo(() => {
    const arr = [...feedbackResults.individual];
    switch (sortBy) {
      case "rating": {
        const avg = (x) =>
          x.ratings.length
            ? x.ratings.reduce((s, r) => s + r, 0) / x.ratings.length
            : 0;
        arr.sort((a, b) => avg(b) - avg(a));
        break;
      }
      default:
        // as-is
        break;
    }
    return arr;
  }, [feedbackResults.individual, sortBy]);

  const stats = useMemo(() => {
    const total = feedbackResults.individual.length;
    const withComments = feedbackResults.comments.length;
    const avgOverall =
      feedbackResults.averages.length > 0
        ? (
            feedbackResults.averages.reduce((s, a) => s + Number(a || 0), 0) /
            feedbackResults.averages.length
          ).toFixed(2)
        : "0.00";
    return { total, withComments, averageRating: avgOverall };
  }, [feedbackResults]);

  // Render //
  if (authLoading || !teacherData) {
  return (
  <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px" gap={2}>
  <CircularProgress />
  <Typography>Loading teacher data...</Typography>
  </Box>
  );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1400, minHeight: "100vh", mx: "auto" }}>
      <SecondaryHeader
        title="Feedback Management"
        leftArea={<HeaderBackButton to="/teachers" />}
        subtitle="Configure feedback forms for your subjects and view collected feedback."
        dense
        border
      />

      {/* Teacher Info */}
       <TeacherHeader sx={{background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 1)}, ${alpha(theme.palette.secondary.main, 0.4)})`,}}
                extraTexts={[
                  { text: `Teacher ID: ${teacherData?.teacherId || '—'}` },
                  { text: `College: ${teacherData?.college || '—'}` }
                ]}
      />
      {/* Configuration */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Feedback Form Configuration
          </Typography>

          <Stack spacing={2} sx={{ mt: 2 }}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <FormControl fullWidth>
                <InputLabel>Program</InputLabel>
                <Select
                  value={selectedProgram}
                  label="Program"
                  onChange={(e) => {
                    setSelectedProgram(e.target.value);
                    setSelectedSemester("");
                    setSelectedSubject("");
                    setFeedbackResults({ averages: [], comments: [], individual: [] });
                  }}
                >
                  {programs.map((p) => (
                    <MenuItem key={p} value={p}>
                      {p}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl fullWidth disabled={!selectedProgram}>
                <InputLabel>Semester</InputLabel>
                <Select
                  value={selectedSemester}
                  label="Semester"
                  onChange={(e) => {
                    setSelectedSemester(e.target.value);
                    setSelectedSubject("");
                    setFeedbackResults({ averages: [], comments: [], individual: [] });
                  }}
                >
                  {semesters.map((s) => (
                    <MenuItem key={s} value={s}>
                      Semester {s}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl fullWidth disabled={!selectedSemester}>
                <InputLabel>Subject</InputLabel>
                <Select
                  value={selectedSubject}
                  label="Subject"
                  onChange={(e) => {
                    setSelectedSubject(e.target.value);
                    setFeedbackResults({ averages: [], comments: [], individual: [] });
                  }}
                >
                  {filteredSubjects.map((sub) => (
                    <MenuItem key={sub.subjectId} value={sub.subjectId}>
                      {sub.subjectName}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>

            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <Button
                variant="contained"
                onClick={() => setConfigDialog(true)}
                disabled={!selectedProgram || !selectedSemester || !selectedSubject}
                fullWidth
                sx={{ height: 56 }}
                startIcon={<AddIcon />}
              >
                Configure Feedback Form
              </Button>
              <Button
                variant="contained"
                onClick={handleViewResults}
                disabled={
                  !selectedProgram || !selectedSemester || !selectedSubject || loading
                }
                fullWidth
                sx={{ height: 56 }}
                startIcon={<SortIcon />}
              >
                {loading ? "Loading Results..." : "View Feedback Results"}
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {/* Results summary */}
      {feedbackResults.individual.length > 0 && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Box
              sx={{
                display: "flex",
                gap: 2,
                flexDirection: { xs: "column", md: "row" },
              }}
            >
              <Paper variant="outlined" sx={{ p: 2, flex: 1, bgcolor: "action.hover" }}>
                <Typography variant="h6" gutterBottom>
                  Feedback Summary ({feedbackResults.individual.length} Responses)
                </Typography>
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 1 }}>
                  <Chip label={`Responses: ${stats.total}`} color="success" size="small" />
                  <Chip
                    label={`Comments: ${stats.withComments}`}
                    color="primary"
                    size="small"
                  />
                  <Chip
                    label={`Avg Rating: ${stats.averageRating}/5`}
                    color="info"
                    size="small"
                  />
                </Box>
              </Paper>

              <Paper variant="outlined" sx={{ p: 2, flex: 1, bgcolor: "action.hover" }}>
                <Typography
                  variant="h6"
                  gutterBottom
                  sx={{ display: "flex", alignItems: "center" }}
                >
                  Sort Feedback By
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  <Button
                    size="small"
                    onClick={() => setSortBy("default")}
                    variant={sortBy === "default" ? "contained" : "outlined"}
                    startIcon={<ReplayIcon />}
                    color="secondary"
                  >
                    Default
                  </Button>
                  <Button
                    size="small"
                    onClick={() => setSortBy("rating")}
                    variant={sortBy === "rating" ? "contained" : "outlined"}
                    startIcon={<FormatListNumberedIcon />}
                    color="info"
                  >
                    Average Rating
                  </Button>
                </Stack>
              </Paper>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Results table */}
      {feedbackResults.individual.length > 0 && (
        <TableContainer component={Paper} sx={{ mb: 3 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Respondent</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Average</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Comments</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Per‑Question</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedFeedback.map((fb, idx) => {
                const avg =
                  fb.ratings.length > 0
                    ? (fb.ratings.reduce((s, r) => s + r, 0) / fb.ratings.length).toFixed(2)
                    : "0.00";
                const label = `Student ${idx + 1}`;

                return (
                  <TableRow
                    key={`${fb.studentId || "respondent"}-${idx}-${createId()}`}
                    hover
                    sx={{
                      "&:hover": { backgroundColor: "action.hover" },
                    }}
                  >
                    <TableCell>
                      <Box display="flex" alignItems="center" gap={2}>
                        <Avatar sx={{ width: 36, height: 36, bgcolor: "primary.main" }}>
                          {idx + 1}
                        </Avatar>
                        <Typography variant="body2" fontWeight={600}>
                          {label}
                        </Typography>
                      </Box>
                    </TableCell>

                    <TableCell>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Rating
                          value={Number(avg)}
                          precision={0.1}
                          max={5}
                          readOnly
                          size="small"
                        />
                        <Chip
                          label={`${avg}/5`}
                          size="small"
                          variant="outlined"
                          color="info"
                          sx={{ fontWeight: 600 }}
                        />
                      </Stack>
                    </TableCell>

                    <TableCell sx={{ maxWidth: 340 }}>
                      {fb.comments ? (
                        <Tooltip title={fb.comments}>
                          <Typography
                            variant="body2"
                            sx={{
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                            }}
                          >
                            {fb.comments}
                          </Typography>
                        </Tooltip>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          No comment
                        </Typography>
                      )}
                    </TableCell>

                    <TableCell>
                      <Box display="flex" flexWrap="wrap" gap={0.5}>
                        {fb.ratings.map((r, i) => (
                          <Chip
                            key={i}
                            label={`Q${i + 1}: ${r}`}
                            size="small"
                            variant="outlined"
                            sx={{
                              fontWeight: 600,
                              borderColor:
                                r >= 4 ? "success.main" : r >= 3 ? "warning.main" : "error.main",
                              color:
                                r >= 4 ? "success.main" : r >= 3 ? "warning.main" : "error.main",
                            }}
                          />
                        ))}
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Config dialog */}
      <Dialog
        open={configDialog}
        onClose={() => setConfigDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Configure Feedback Form</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ mt: 1, mb: 2 }}>
            <Typography variant="body1" gutterBottom>
              Enable Feedback
            </Typography>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                  />
                }
                label={enabled ? "Enabled" : "Disabled"}
              />
            </motion.div>
          </Box>

          <TextField
            label="Deadline"
            type="date"
            fullWidth
            margin="normal"
            InputLabelProps={{ shrink: true }}
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />

          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ mt: 2 }}
          >
            <Typography variant="h6">Questions</Typography>
            <Button
              size="small"
              color="secondary"
              startIcon={<ReplayIcon />}
              onClick={handleResetDefaults}
            >
              Reset to Defaults
            </Button>
          </Stack>

          <Stack spacing={1.25} sx={{ mt: 1 }}>
            {questions.map((q) => (
              <Box
                key={q.id}
                sx={{ display: "flex", alignItems: "center", gap: 1 }}
              >
                <Typography flex={1} variant="body2">
                  {q.text}
                </Typography>
                <IconButton
                  aria-label="delete question"
                  onClick={() => handleDeleteQuestion(q.id)}
                  size="small"
                >
                  <DeleteIcon color="error" fontSize="small" />
                </IconButton>
              </Box>
            ))}
          </Stack>

          <Box sx={{ display: "flex", alignItems: "center", mt: 2, gap: 1 }}>
            <TextField
              label="Add New Question"
              fullWidth
              value={newQuestion}
              onChange={(e) => setNewQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddQuestion();
                }
              }}
            />
            <IconButton
              aria-label="add question"
              onClick={handleAddQuestion}
              disabled={!newQuestion.trim()}
            >
              <AddIcon color="primary" />
            </IconButton>
          </Box>
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setConfigDialog(false)}>Cancel</Button>
          <Button
            onClick={handleSaveConfig}
            variant="contained"
            disabled={loading}
          >
            {loading ? "Saving..." : "Save Configuration"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
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
    </Box>
  );
}