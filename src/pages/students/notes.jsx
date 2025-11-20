/* eslint-disable react/prop-types */
/* eslint-disable no-unused-vars */
import React, { useEffect, useMemo, useState } from "react";
import { Box, Container, Typography, Alert, Card, CardContent, Button, Grid, Stack, TextField, Select, MenuItem, Chip, 
  InputAdornment, Skeleton, Dialog, DialogContent, DialogTitle, IconButton, useMediaQuery, useTheme, Paper, CardActions,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import CloseIcon from "@mui/icons-material/Close";
import ClearIcon from "@mui/icons-material/Clear";
import { motion } from "framer-motion";
import {
  collection,
  getDocs,
  query,
  limit,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db } from "../../firebase/Firebase";
import axios from "axios";
import PdfViewer from "../../components/PdfViewer";
import { HeaderBackButton } from "../../components/header";
import SecondaryHeader from "../../components/secondaryHeader";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const NS = "erp";
const VER = "v1";
const LAST_UID_KEY = `${NS}:lastUid:${VER}`;
const key = (uid, name) => `${NS}:${uid}:${name}:${VER}`;
const readCachedStudent = () => {
  if (typeof window === "undefined") return null;
  const uid = window.localStorage.getItem(LAST_UID_KEY);
  if (!uid) return null;
  try {
    const raw = window.localStorage.getItem(key(uid, "student"));
    if (!raw) return null;
    const payload = JSON.parse(raw);
    return payload?.v || null; 
  } catch {
    return null;
  }
};

function useDebounced(value, delay = 350) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debouncedValue;
}

const fmtDate = (val) => {
  try {
    let d = val;
    if (!d) return "";
    if (typeof d?.toDate === "function") d = d.toDate();
    else if (typeof d?.seconds === "number") d = new Date(d.seconds * 1000);
    if (!(d instanceof Date)) return "";
    return d.toLocaleString();
  } catch {
    return "";
  }
};

export default function ENotesViewer({ role = "student", containerProps = {} }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const auth = getAuth();
  const user = auth.currentUser;

  const [programs, setPrograms] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [catalogError, setCatalogError] = useState("");

  // Student profile
  const [studentProfile, setStudentProfile] = useState(null);
  const [onlyMyClass, setOnlyMyClass] = useState(false);

  // Notes list
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Filters
  const [programId, setProgramId] = useState("");
  const [programName, setProgramName] = useState("");
  const [semester, setSemester] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [tagsFilter, setTagsFilter] = useState([]);
  const [tagInput, setTagInput] = useState("");
  const [search, setSearch] = useState("");
  const [openPdf, setOpenPdf] = useState(null);

  const debouncedSearch = useDebounced(search, 400);
  // API headers
  const getAuthHeaders = async () => {
    const headers = { "Content-Type": "application/json", Accept: "application/json" };
    if (user) headers["Authorization"] = `Bearer ${await user.getIdToken()}`;
    return headers;
  };

  // Catalog fetchers
  const fetchPrograms = async () => {
    const res = await axios.get(`${API_BASE_URL}/api/programs`, { headers: await getAuthHeaders() });
    return res.data;
  };
  const fetchProgramSemesters = async (pid) => {
    const res = await axios.get(`${API_BASE_URL}/api/programs/${pid}/semesters`, { headers: await getAuthHeaders() });
    return res.data;
  };
  const fetchSubjectsFor = async (pid, sem) => {
    const res = await axios.get(`${API_BASE_URL}/api/programs/${pid}/semesters/${sem}/subjects`, { headers: await getAuthHeaders() });
    return res.data;
  };

  // Read student context from cache
  useEffect(() => {
    const merged = readCachedStudent();
    if (!merged) {
      setStudentProfile(null);
      return;
    }
    setStudentProfile({
      college: merged.college || merged.collegeId || "",
      program: merged.program || merged.Program || "",
      semester: String(merged.semester || merged.Semester || ""),
    });
  }, []);

  // Load notes
  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setLoadError("");
      try {
        const snap = await getDocs(query(collection(db, "notes"), limit(300)));
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        rows.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        if (active) setNotes(rows);
      } catch (e) {
        console.error("Notes fetch error:", e);
        if (active) setLoadError("Failed to load notes.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Load programs
  useEffect(() => {
    let active = true;
    (async () => {
      setCatalogError("");
      try {
        const progs = await fetchPrograms();
        if (!active) return;
        setPrograms(Array.isArray(progs) ? progs : []);
      } catch (e) {
        console.error("Programs load error:", e);
        if (active) setCatalogError("Failed to load catalog.");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Load semesters when program changes
  useEffect(() => {
    let active = true;
    if (!programId) {
      setSemesters([]);
      setSubjects([]);
      setSemester("");
      setSubjectId("");
      return;
    }
    (async () => {
      try {
        const sems = await fetchProgramSemesters(programId);
        if (!active) return;
        setSemesters(Array.isArray(sems) ? sems : []);
        setSemester("");
        setSubjectId("");
      } catch (e) {
        console.error("Semesters load error:", e);
        if (active) setSemesters([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [programId]);

  // Load subjects when semester changes
  useEffect(() => {
    let active = true;
    if (!programId || !semester) {
      setSubjects([]);
      setSubjectId("");
      return;
    }
    (async () => {
      try {
        const subs = await fetchSubjectsFor(programId, semester);
        if (!active) return;
        setSubjects(Array.isArray(subs) ? subs : []);
        setSubjectId("");
      } catch (e) {
        console.error("Subjects load error:", e);
        if (active) setSubjects([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [programId, semester]);

  // Filter handlers
  const handleProgramChange = (pid) => {
    const p = programs.find((x) => String(x._id) === String(pid));
    setProgramId(pid);
    setProgramName(p?.programName || p?.name || p?.title || "");
    setSemester("");
    setSubjectId("");
  };
  const handleSemesterChange = (sem) => {
    setSemester(sem);
    setSubjectId("");
  };
  const handleSubjectChange = (sid) => {
    setSubjectId(sid);
  };

  // Tag input
  const normalizedTags = (arr) =>
    Array.from(
      new Set(
        (arr || [])
          .map((t) => String(t).trim().toLowerCase())
          .filter(Boolean)
      )
    );

  const handleTagInputChange = (v) => {
    setTagInput(v);
    if (v.endsWith(" ") || v.endsWith(",")) {
      const parts = v
        .split(/[\s,]+/)
        .map((t) => t.trim())
        .filter(Boolean);
      setTagsFilter((prev) => normalizedTags([...prev, ...parts]));
      setTagInput("");
    }
  };
  const handleTagBlur = () => {
    if (!tagInput.trim()) return;
    const parts = tagInput
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    setTagsFilter((prev) => normalizedTags([...prev, ...parts]));
    setTagInput("");
  };
  const handleTagChipClick = (t) => {
    const key = String(t).toLowerCase();
    setTagsFilter((prev) =>
      prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]
    );
  };

  // “For Your Class” toggle (visible only when role === 'student')
  const canUseMyClass = !!(studentProfile?.college || studentProfile?.program || studentProfile?.semester);
  const toggleMyClass = () => {
    if (!canUseMyClass) return;
    const on = !onlyMyClass;
    setOnlyMyClass(on);
    if (on) {
      if (studentProfile?.program) {
        setProgramId(studentProfile.program);
        const p = programs.find((x) => String(x._id) === String(studentProfile.program));
        setProgramName(p?.programName || p?.name || p?.title || "");
      }
      if (studentProfile?.semester !== undefined && studentProfile?.semester !== null) {
        setSemester(String(studentProfile.semester));
      }
      setSubjectId("");
    }
  };

  const clearAll = () => {
    setOnlyMyClass(false);
    setProgramId("");
    setProgramName("");
    setSemester("");
    setSubjectId("");
    setTagsFilter([]);
    setTagInput("");
    setSearch("");
  };

  // Apply filters
  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return notes.filter((n) => {
      const nCollege = String(n.collegeId || "");
      const nProgId = String(n.programId || "");
      const nSem = String(n.semester || "");
      const nSubId = String(n.subjectId || "");
      const nTags = Array.isArray(n.tags) ? n.tags.map((t) => String(t).toLowerCase()) : [];
      const title = String(n.title || "").toLowerCase();
      const desc = String(n.description || "").toLowerCase();

      // For Your Class: restrict to student's college, auto-set program/semester already handled
      if (onlyMyClass && studentProfile?.college) {
        if (nCollege !== String(studentProfile.college)) return false;
      }

      // Program/Semester/Subject filters
      if (programId && nProgId.toLowerCase() !== programId.toLowerCase()) return false;
      if (semester && String(nSem) !== String(semester)) return false;
      if (subjectId && nSubId !== subjectId) return false;

      if (tagsFilter.length) {
        const need = tagsFilter.map((t) => t.toLowerCase());
        if (!need.every((t) => nTags.includes(t))) return false;
      }

      if (q) {
        const hay = `${title} ${desc} ${nSubId} ${nTags.join(" ")}`;
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [notes, debouncedSearch, programId, semester, subjectId, tagsFilter, onlyMyClass, studentProfile]);

  const isEmpty = !loading && !loadError && filtered.length === 0;

  // Menus
  const programMenuItems = programs.map((p) => (
    <MenuItem key={p._id} value={p._id}>
      {p.programName || p.name || p.title || p.code || p._id}
    </MenuItem>
  ));
  const semesterMenuItems = (Array.isArray(semesters) ? semesters : [])
    .map((s) => s.semesterNumber ?? s.semester ?? s.number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)
    .map((n) => (
      <MenuItem key={n} value={n}>
        Sem {n}
      </MenuItem>
    ));
  const subjectMenuItems = (Array.isArray(subjects) ? subjects : []).map((s) => (
    <MenuItem key={s._id} value={s._id}>
      {s.subjectName || s.name || s.title || s.code || s._id}
    </MenuItem>
  ));

  // PDF dialog
  const handleViewPdf = (url) => setOpenPdf(url || null);
  const handleClosePdf = () => setOpenPdf(null);

  return (
    <Container maxWidth="lg" sx={{ minHeight: "100vh", py: 8, bgcolor: "background.default" }} {...containerProps}>
      <motion.div
        initial={{ opacity: 0, y: -50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Stack spacing={6}>
          {/* Header */}
          <SecondaryHeader
                    title="Notes Library"
                    leftArea={
                      <HeaderBackButton />
                    }
                    rightArea={
                      <Stack direction="row" spacing={1}>
              {role === "student" && (
                <Button
                  variant={onlyMyClass ? "contained" : "outlined"}
                  color="primary"
                  onClick={toggleMyClass}
                  disabled={!canUseMyClass}
                  sx={{ borderRadius: 2 }}
                >
                  {onlyMyClass ? "Showing Your Class" : "For Your Class"}
                </Button>
              )}
              {(programId || tagsFilter.length > 0 || search || onlyMyClass) && (
                <Button
                  variant="outlined"
                  color="secondary"
                  startIcon={<ClearIcon />}
                  onClick={clearAll}
                  size="small"
                  sx={{ borderRadius: 1 }}
                >
                  Clear All Filters
                </Button>
              )}
            </Stack>
                    }/>

          {catalogError && (
            <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
              {catalogError}
            </Alert>
          )}

          {/* Filters */}
          <Paper
            elevation={4}
            sx={{
              p: 3,
              borderRadius: 3,
              bgcolor: "background.paper",
              boxShadow: "0 4px 20px rgba(0, 0, 0, 0.05)",
            }}
          >
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  fullWidth
                  placeholder="Search notes by title, description, subject, tags…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon color="action" />
                      </InputAdornment>
                    ),
                  }}
                  variant="outlined"
                  sx={{borderRadius: 2 }}
                  aria-label="Search notes"
                />
              </Grid>

              <Grid item xs={12} sm={6} md={2}>
                <Select
                  fullWidth
                  displayEmpty
                  value={programId}
                  onChange={(e) => handleProgramChange(e.target.value)}
                  variant="outlined"
                  sx={{ borderRadius: 2 }}
                  aria-label="Select program"
                >
                  <MenuItem value="">
                    <em>All Programs</em>
                  </MenuItem>
                  {programMenuItems}
                </Select>
              </Grid>

              <Grid item xs={12} sm={6} md={2}>
                <Select
                  fullWidth
                  displayEmpty
                  value={semester}
                  onChange={(e) => handleSemesterChange(e.target.value)}
                  disabled={!programId}
                  variant="outlined"
                  sx={{  borderRadius: 2 }}
                  aria-label="Select semester"
                >
                  <MenuItem value="">
                    <em>All Semesters</em>
                  </MenuItem>
                  {semesterMenuItems}
                </Select>
              </Grid>

              <Grid item xs={12} sm={6} md={2}>
                <Select
                  fullWidth
                  displayEmpty
                  value={subjects.some((s) => String(s._id) === String(subjectId)) ? subjectId : ""}
                  onChange={(e) => handleSubjectChange(e.target.value)}
                  disabled={!programId || !semester}
                  variant="outlined"
                  sx={{borderRadius: 2 }}
                  aria-label="Select subject"
                >
                  <MenuItem value="">
                    <em>All Subjects</em>
                  </MenuItem>
                  {subjectMenuItems}
                </Select>
              </Grid>

              <Grid item xs={12} sm={6} md={2}>
                <TextField
                  fullWidth
                  variant="outlined"
                  placeholder="Add tags (press space/comma)"
                  value={tagInput}
                  onChange={(e) => handleTagInputChange(e.target.value)}
                  onBlur={handleTagBlur}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleTagBlur();
                    }
                  }}
                  sx={{ borderRadius: 2 }}
                  aria-label="Add tags"
                />
              </Grid>
            </Grid>
          </Paper>

          {/* Active Filters (only custom tags) */}
          {tagsFilter.length > 0 && (
            <Paper
              elevation={2}
              sx={{
                p: 2,
                borderRadius: 2,
                mb: 4,
                boxShadow: "0 2px 10px rgba(0, 0, 0, 0.05)",
              }}
            >
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Active Tags:
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, p: 1, minHeight: 48 }}>
                {tagsFilter.map((t) => (
                  <Chip
                    key={t}
                    label={t}
                    onDelete={() => handleTagChipClick(t)}
                    color="secondary"
                    sx={{ color: "white", borderRadius: 1 }}
                  />
                ))}
              </Box>
            </Paper>
          )}

          {/* PDF Viewer */}
          <Dialog
            open={!!openPdf}
            onClose={handleClosePdf}
            fullWidth
            maxWidth={isMobile ? "xs" : "xl"}
            fullScreen={isMobile}
            sx={{
              "& .MuiDialog-paper": {
                margin: isMobile ? 0 : "32px",
                minWidth: isMobile ? "100vw" : "90vw",
                minHeight: isMobile ? "100vh" : "90vh",
                maxHeight: "90vh",
                maxWidth: "90vw",
                borderRadius: isMobile ? 0 : 3,
                boxShadow: "0 4px 20px rgba(0, 0, 0, 0.1)",
              },
            }}
          >
            <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Typography variant="h6" fontWeight={600}>
                View Note
              </Typography>
              <IconButton onClick={handleClosePdf} aria-label="Close PDF viewer">
                <CloseIcon />
              </IconButton>
            </DialogTitle>
            <DialogContent sx={{ p: 2, pt: 1 }}>
              <PdfViewer
                fileUrl={openPdf}
                downloadable
                downloadFileName="Note.pdf"
                showFullscreenButton
                showHeader={false}
                height="82vh"
                pageMaxWidth={1000}
                pageWidthPct={0.9}
                containerSx={{ bgcolor: "background.paper", border: "none" }}
                pageSx={{ borderRadius: 1 }}
                renderAnnotationLayer
                renderTextLayer
              />
            </DialogContent>
          </Dialog>

          {/* Notes Section */}
          <Paper
            elevation={4}
            sx={{
              p: {  md: 5, xs: 3 },
              borderRadius: 3,
              bgcolor: "background.paper",
              boxShadow: "0 4px 20px rgba(0, 0, 0, 0.05)",
            }}
          >
            <Typography variant="h5" fontWeight={600} mb={4} sx={{ textAlign: "center" }}>
              Available Notes
            </Typography>

            {loading && (
              <Grid container spacing={3}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <Grid item xs={12} sm={6} md={4} key={i}>
                    <Card
                      variant="outlined"
                      sx={{
                        borderRadius: 3,
                        width: 300,
                        height: 240,
                        boxShadow: "0 2px 10px rgba(0, 0, 0, 0.05)",
                        mx: "auto",
                      }}
                    >
                      <Skeleton variant="rectangular" height={140} />
                      <Box sx={{ p: 2 }}>
                        <Skeleton width="60%" />
                        <Skeleton width="90%" />
                        <Skeleton width="40%" />
                      </Box>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            )}

            {loadError && (
              <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
                {loadError}
              </Alert>
            )}

            {!loading && !loadError && (
              <>
                {isEmpty ? (
                  <Card
                    variant="outlined"
                    sx={{
                      p: 4,
                      textAlign: "center",
                      borderRadius: 3,
                      boxShadow: "0 2px 10px rgba(0, 0, 0, 0.05)",
                    }}
                  >
                    <Typography variant="h6" fontWeight={600}>
                      No notes match the current filters
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      Try adjusting or clearing some filters to see more results.
                    </Typography>
                  </Card>
                ) : (
                  <Grid container spacing={5} sx={{ ml: { md: 3, xs: 0 } }}>
                    {filtered.map((note) => (
                      <Grid item xs={12} sm={6} md={4} key={note.id}>
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.3 }}
                        >
                          <Card
                            variant="outlined"
                            sx={{
                              borderRadius: 3,
                              width: { md: 300, xs: "80vw" },
                              height: 240,
                              display: "flex",
                              flexDirection: "column",
                              boxShadow: "0 2px 10px rgba(0, 0, 0, 0.05)",
                              "&:hover": { boxShadow: "0 4px 15px rgba(0, 0, 0, 0.1)" },
                              mx: "auto",
                            }}
                          >
                            <CardContent sx={{ flexGrow: 1 }}>
                              <Typography
                                variant="h6"
                                fontWeight={600}
                                noWrap
                                title={note.title || "Untitled"}
                              >
                                {note.title || "Untitled"}
                              </Typography>

                              <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{
                                  mt: 1,
                                  height: 40,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  display: "-webkit-box",
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: "vertical",
                                }}
                                title={note.description || "No description"}
                              >
                                {note.description || "No description"}
                              </Typography>

                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ display: "block", mt: 2 }}
                              >
                                {note.programId} {note.semester ? `- Sem ${note.semester}` : ""} |{" "}
                                {note.subjectId || "No Subject"}
                              </Typography>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ display: "block" }}
                              >
                                {fmtDate(note.noteDate)}
                              </Typography>

                              {/* Tag chips on card */}
                              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 1 }}>
                                {(Array.isArray(note.tags) ? note.tags : [])
                                  .slice(0, 4)
                                  .map((t) => {
                                    const key = String(t).toLowerCase();
                                    const active = tagsFilter.includes(key);
                                    return (
                                      <Chip
                                        key={t}
                                        label={t}
                                        size="small"
                                        onClick={() => handleTagChipClick(t)}
                                        variant={active ? "filled" : "outlined"}
                                        sx={{
                                          cursor: "pointer",
                                          transition: "all 0.2s ease-in-out",
                                          fontWeight: 500,
                                          borderRadius: 1,
                                          ...(!active && {
                                            color: "secondary.main",
                                            borderColor: "secondary.main",
                                            "&:hover": {
                                              bgcolor: "secondary.light",
                                              color: "secondary.dark",
                                              borderColor: "secondary.dark",
                                            },
                                          }),
                                          ...(active && {
                                            bgcolor: "secondary.light",
                                            color: "secondary.dark",
                                            border: "1px solid",
                                            borderColor: "secondary.dark",
                                            "&:hover": { bgcolor: "secondary.main", color: "white" },
                                          }),
                                        }}
                                      />
                                    );
                                  })}
                              </Box>
                            </CardContent>

                            <CardActions sx={{ justifyContent: "space-between", px: 2, pb: 2 }}>
                              <Button
                                size="small"
                                startIcon={<OpenInNewIcon />}
                                onClick={() => handleViewPdf(note.fileURL)}
                                color="primary"
                                disabled={!note.fileURL}
                              >
                                Open
                              </Button>
                            </CardActions>
                          </Card>
                        </motion.div>
                      </Grid>
                    ))}
                  </Grid>
                )}
              </>
            )}
          </Paper>
        </Stack>
      </motion.div>
    </Container>
  );
}
