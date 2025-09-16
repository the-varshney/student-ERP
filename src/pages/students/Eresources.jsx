/* eslint-disable react/prop-types */
/* eslint-disable no-unused-vars */
import React, { useEffect, useMemo, useState } from "react";
import { Box, Container, Typography, Alert, Card, CardContent, Button, Stack, TextField, Select, MenuItem, Chip, InputAdornment, 
    Skeleton, Dialog, DialogContent, DialogTitle, IconButton, useMediaQuery, useTheme, Paper, CardActions, ToggleButtonGroup, ToggleButton,
    } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import CloseIcon from "@mui/icons-material/Close";
import ClearIcon from "@mui/icons-material/Clear";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import { motion } from "framer-motion";
import {
  collection,
  getDocs,
  query,
  limit,
  orderBy,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db } from "../../firebase/Firebase";
import axios from "axios";
import SecondaryHeader from "../../components/secondaryHeader";
import { HeaderBackButton } from "../../components/header";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const NS = "erp";
const VER = "v1";
const STORE = typeof window !== "undefined" ? window.localStorage : null;
const LAST_UID_KEY = `${NS}:lastUid:${VER}`;
const key = (uid, name) => `${NS}:${uid}:${name}:${VER}`;
const readCachedStudent = () => {
  if (!STORE) return null;
  const uid = STORE.getItem(LAST_UID_KEY);
  if (!uid) return null;
  const raw = STORE.getItem(key(uid, "student"));
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw);
    return payload?.v || null;
  } catch {
    return null;
  }
};
const normalizeStudentForViewer = (merged) => {
  if (!merged) return null;
  return {
    college: merged.collegeId || "",
    program: merged.Program || merged.program || "",
    semester: String(merged.Semester || merged.semester || ""),
  };
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

// Return the 11-char YouTube ID
const extractYouTubeId = (url = "") => {
  const regExp =
    /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|[?&]v=)([^#&?]*).*/i;
  const match = url.match(regExp);
  return match && match[2]?.length === 11 ? match[2] : null;
};

//E-Resources Viewer
export default function EResourcesViewer({ role = "generic" }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const auth = getAuth();
  const user = auth.currentUser;
  // Catalog state
  const [programs, setPrograms] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [catalogError, setCatalogError] = useState("");
  // Student profile (from CACHE for “For Your Class”)
  const [studentProfile, setStudentProfile] = useState(null);
  const [onlyMyClass, setOnlyMyClass] = useState(false);
  // Resources list
  const [resources, setResources] = useState([]);
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
  const [typeFilter, setTypeFilter] = useState("all"); // all | youtube | uploaded
  // Viewers
  const [openPlayer, setOpenPlayer] = useState(null); // { kind: 'youtube'|'video', src, title, attachments }
  const [openAttachments, setOpenAttachments] = useState(null); 

  const debouncedSearch = useDebounced(search, 400);

  const getAuthHeaders = async () => {
    const headers = { "Content-Type": "application/json", Accept: "application/json" };
    if (user) headers["Authorization"] = `Bearer ${await user.getIdToken()}`;
    return headers;
  };

  // Catalog fetch
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

  // Load student context from cache
  useEffect(() => {
    const merged = readCachedStudent();
    const normalized = normalizeStudentForViewer(merged);
    setStudentProfile(normalized);
  }, []);

  // Load resources once
  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setLoadError("");
      try {
        const snap = await getDocs(
          query(
            collection(db, "eresources"),
            orderBy("createdAt", "desc"),
            limit(300)
          )
        );
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (!active) return;
        setResources(rows);
      } catch (e) {
        console.error("Resources fetch error:", e);
        if (active) setLoadError("Failed to load resources.");
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

  // Load subjects when semester change
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
  const normalizedTagsLocal = (arr) =>
    Array.from(
      new Set((arr || []).map((t) => String(t).trim().toLowerCase()).filter(Boolean))
    );
  const handleTagInputChange = (v) => {
    setTagInput(v);
    if (v.endsWith(" ") || v.endsWith(",")) {
      const parts = v
        .split(/[\s,]+/)
        .map((t) => t.trim())
        .filter(Boolean);
      setTagsFilter((prev) => normalizedTagsLocal([...prev, ...parts]));
      setTagInput("");
    }
  };
  const handleTagBlur = () => {
    if (!tagInput.trim()) return;
    const parts = tagInput
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    setTagsFilter((prev) => normalizedTagsLocal([...prev, ...parts]));
    setTagInput("");
  };
  const handleTagChipToggle = (t) => {
    const key = String(t).toLowerCase();
    setTagsFilter((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));
  };

  const handleTypeFilter = (_e, v) => {
    if (v) setTypeFilter(v);
  };

  // “For Your Class” toggle
  const canUseMyClass = !!(studentProfile?.college || studentProfile?.program || studentProfile?.semester);
  const toggleMyClass = () => {
    if (!canUseMyClass) return;
    const on = !onlyMyClass;
    setOnlyMyClass(on);
    if (on) {
      if (studentProfile?.program) {
        setProgramId(String(studentProfile.program));
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
    setTypeFilter("all");
    setSearch("");
  };

  // Apply filters
  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();

    return resources.filter((r) => {
      const rCollege = String(r.collegeId || "");
      const rProgId = String(r.programId || "");
      const rSem = String(r.semester || "");
      const rSubId = String(r.subjectId || "");
      const rTags = Array.isArray(r.tags) ? r.tags.map((t) => String(t).toLowerCase()) : [];
      const rType = String(r.resourceType || "").toLowerCase(); // youtube | video
      const title = String(r.title || "").toLowerCase();
      const desc = String(r.description || "").toLowerCase();

      // For Your Class: restrict to student's college
      if (onlyMyClass && studentProfile?.college) {
        if (rCollege !== String(studentProfile.college)) return false;
      }
      // Program/Semester/Subject
      if (programId && rProgId.toLowerCase() !== programId.toLowerCase()) return false;
      if (semester && String(rSem) !== String(semester)) return false;
      if (subjectId && rSubId !== subjectId) return false;
      // Type filter
      if (typeFilter === "youtube" && rType !== "youtube") return false;
      if (typeFilter === "uploaded" && rType === "youtube") return false;
      // Tags (all selected)
      if (tagsFilter.length) {
        const need = tagsFilter.map((t) => t.toLowerCase());
        if (!need.every((t) => rTags.includes(t))) return false;
      }
      // Keyword
      if (q) {
        const hay = `${title} ${desc} ${rSubId} ${rTags.join(" ")}`;
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [resources, debouncedSearch, programId, semester, subjectId, typeFilter, tagsFilter, onlyMyClass, studentProfile]);

  const isEmpty = !loading && !loadError && filtered.length === 0;

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

  // Player
  const handleOpenPlayer = (res) => {
    if (res.resourceType === "youtube" && res.youtubeUrl) {
      const id = extractYouTubeId(res.youtubeUrl);
      if (!id) return window.open(res.youtubeUrl, "_blank", "noopener,noreferrer");
      const src = `https://www.youtube-nocookie.com/embed/${id}?rel=0`;
      setOpenPlayer({ kind: "youtube", src, title: res.title, attachments: res.attachments || [] });
    } else if (res.videoUrl) {
      setOpenPlayer({ kind: "video", src: res.videoUrl, title: res.title, attachments: res.attachments || [] });
    }
  };
  const handleClosePlayer = () => setOpenPlayer(null);

  const handleOpenAttachments = (res) => setOpenAttachments(res.attachments || []);
  const handleCloseAttachments = () => setOpenAttachments(null);

  // Cards
  const attachmentCount = (res) => (Array.isArray(res.attachments) ? res.attachments.length : 0);

  return (
    <Container maxWidth="lg" sx={{ minHeight: "100vh", py: 8, bgcolor: theme.palette.background.default }}>
      <motion.div initial={{ opacity: 0, y: -50 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <SecondaryHeader
            title="E-Resources Library"
            leftArea={<HeaderBackButton />}
            rightArea={
              <Stack direction="row" spacing={1} alignItems="center">
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
                {(programId || tagsFilter.length > 0 || search || onlyMyClass || typeFilter !== "all") && (
                  <Button
                    variant="outlined"
                    color="secondary"
                    startIcon={<ClearIcon />}
                    onClick={clearAll}
                    size="small"
                    sx={{ borderRadius: 2 }}
                  >
                    Clear All Filters
                  </Button>
                )}
              </Stack>
            }
          />
        <Stack spacing={4}>        
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
              bgcolor: theme.palette.background.paper,
              boxShadow: theme.shadows[4],
            }}
          >
            <Stack spacing={2}>
              <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                <TextField
                  fullWidth
                  placeholder="Search videos by title, description, subject, tags…"
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
                  sx={{ bgcolor: theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.background.paper, borderRadius: 2 }}
                  aria-label="Search e-resources"
                />

                <Select
                  fullWidth
                  displayEmpty
                  value={programId}
                  onChange={(e) => handleProgramChange(e.target.value)}
                  variant="outlined"
                  sx={{ bgcolor: theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.background.paper, borderRadius: 2 }}
                  aria-label="Select program"
                >
                  <MenuItem value="">
                    <em>All Programs</em>
                  </MenuItem>
                  {programMenuItems}
                </Select>

                <Select
                  fullWidth
                  displayEmpty
                  value={semester}
                  onChange={(e) => handleSemesterChange(e.target.value)}
                  disabled={!programId}
                  variant="outlined"
                  sx={{ bgcolor: theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.background.paper, borderRadius: 2 }}
                  aria-label="Select semester"
                >
                  <MenuItem value="">
                    <em>All Semesters</em>
                  </MenuItem>
                  {semesterMenuItems}
                </Select>

                <Select
                  fullWidth
                  displayEmpty
                  value={subjects.some((s) => String(s._id) === String(subjectId)) ? subjectId : ""}
                  onChange={(e) => handleSubjectChange(e.target.value)}
                  disabled={!programId || !semester}
                  variant="outlined"
                  sx={{ bgcolor: theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.background.paper, borderRadius: 2 }}
                  aria-label="Select subject"
                >
                  <MenuItem value="">
                    <em>All Subjects</em>
                  </MenuItem>
                  {subjectMenuItems}
                </Select>

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
                  sx={{ bgcolor: theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.background.paper, borderRadius: 2 }}
                  aria-label="Add tags"
                />
              </Stack>

              <Stack direction="row" alignItems="center" spacing={2} flexWrap="wrap">
                <Typography variant="body2" color="text.secondary">
                  Type:
                </Typography>
                <ToggleButtonGroup
                  value={typeFilter}
                  exclusive
                  size="small"
                  onChange={handleTypeFilter}
                  color="primary"
                >
                  <ToggleButton value="all">All</ToggleButton>
                  <ToggleButton value="youtube">YouTube</ToggleButton>
                  <ToggleButton value="uploaded">Uploaded</ToggleButton>
                </ToggleButtonGroup>
              </Stack>
            </Stack>
          </Paper>

          {/* Active tag filters */}
          {tagsFilter.length > 0 && (
            <Paper
              elevation={2}
              sx={{
                p: 2,
                borderRadius: 2,
                bgcolor: theme.palette.background.paper,
                mb: 2,
                boxShadow: theme.shadows[2],
              }}
            >
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Active Tags:
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, p: 1, minHeight: 40 }}>
                {tagsFilter.map((t) => (
                  <Chip
                    key={t}
                    label={t}
                    onDelete={() => handleTagChipToggle(t)}
                    color="secondary"
                    sx={{ color: theme.palette.secondary.contrastText, borderRadius: 1 }}
                  />
                ))}
              </Box>
            </Paper>
          )}

          {!loading && !loadError && (
            <Typography variant="body2" color="text.secondary">
              Showing {filtered.length} of {resources.length} resources
            </Typography>
          )}

          {/* Player box */}
          <Dialog
            open={!!openPlayer}
            onClose={handleClosePlayer}
            fullWidth
            maxWidth={isMobile ? "xs" : "lg"}
            fullScreen={isMobile}
            sx={{
              "& .MuiDialog-paper": {
                margin: isMobile ? "0" : "32px",
                width: isMobile ? "100vw" : "85vw",
                height: isMobile ? "100vh" : "100vh",
                maxHeight: "100vh",
                maxWidth: "100vw",
                borderRadius: isMobile ? 0 : 3,
                boxShadow: theme.shadows[24],
                bgcolor: theme.palette.background.paper
              },
            }}
          >
            <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", maxHeight: 10, top: 0, left: 0, right: 0, bgcolor: theme.palette.background.paper, zIndex: 1, p: 2 }}>
              <Typography variant="h6" fontWeight={600} sx={{ ml: 3 }}>
                {openPlayer?.title || "Watch"}
              </Typography>
              <IconButton onClick={handleClosePlayer} aria-label="Close video">
                <CloseIcon />
              </IconButton>
            </DialogTitle>
            <DialogContent sx={{ p: 0, display: "flex", flexDirection: "column", gap: 1.5 }}>
              <Box sx={{ position: "relative", width: "100", aspectRatio: "16/9", bgcolor: "black" }}>
                {openPlayer?.kind === "youtube" ? (
                  <iframe
                    src={openPlayer.src}
                    title={openPlayer.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    style={{ width: "100%", height: "100%", border: "none" }}
                  />
                ) : (
                  <video src={openPlayer?.src} controls style={{ width: "100%", height: "100%" }} />
                )}
              </Box>

              {!!(openPlayer?.attachments?.length) && (
                <Box sx={{ px: 2, pb: 2 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                    Attachments
                  </Typography>
                  <Stack direction="row" flexWrap="wrap" gap={1}>
                    {openPlayer.attachments.map((a, idx) => (
                      <Chip
                        key={idx}
                        icon={<AttachFileIcon />}
                        label={a.name || `Attachment ${idx + 1}`}
                        onClick={() => window.open(a.url, "_blank", "noopener,noreferrer")}
                        variant="outlined"
                        sx={{ borderRadius: 1 }}
                      />
                    ))}
                  </Stack>
                </Box>
              )}
            </DialogContent>
          </Dialog>

          {/* Attachments Dialog */}
          <Dialog open={!!openAttachments} onClose={handleCloseAttachments} fullWidth maxWidth="sm">
            <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Typography variant="h6" fontWeight={600}>
                Attachments
              </Typography>
              <IconButton onClick={handleCloseAttachments} aria-label="Close attachments">
                <CloseIcon />
              </IconButton>
            </DialogTitle>
            <DialogContent dividers>
              {!openAttachments?.length ? (
                <Typography variant="body2" color="text.secondary">
                  No attachments
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {openAttachments.map((a, i) => (
                    <Button
                      key={i}
                      startIcon={<AttachFileIcon />}
                      sx={{ justifyContent: "flex-start" }}
                      onClick={() => window.open(a.url, "_blank", "noopener,noreferrer")}
                    >
                      {a.name || `Attachment ${i + 1}`}
                    </Button>
                  ))}
                </Stack>
              )}
            </DialogContent>
          </Dialog>

          {/* Resources Section */}
          <Paper
            elevation={4}
            sx={{
              p: 4,
              borderRadius: 3,
              bgcolor: theme.palette.background.paper,
              boxShadow: theme.shadows[4],
            }}
          >
            <Typography variant="h5" fontWeight={600} mb={4} sx={{ textAlign: "center" }}>
              Available Videos
            </Typography>

            {loading && (
              <Stack direction="row" flexWrap="wrap" spacing={2} useFlexGap sx={{ justifyContent: "center" }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <Card
                    key={i}
                    variant="outlined"
                    sx={{
                      width: { xs: "100%", sm: "calc(50% - 8px)" },
                      borderRadius: 2,
                      mb: 2,
                      height: 280,
                      boxShadow: theme.shadows[2],
                      overflow: "hidden",
                    }}
                  >
                    <Skeleton variant="rectangular" height={170} />
                    <Box sx={{ p: 2 }}>
                      <Skeleton width="60%" />
                      <Skeleton width="90%" />
                      <Skeleton width="40%" />
                    </Box>
                  </Card>
                ))}
              </Stack>
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
                      boxShadow: theme.shadows[2],
                    }}
                  >
                    <Typography variant="h6" fontWeight={600}>
                      No resources match the current filters
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      Try adjusting or clearing some filters to see more results.
                    </Typography>
                  </Card>
                ) : (
                  <Stack direction="row" flexWrap="wrap" spacing={2} useFlexGap sx={{ justifyContent: "center" }}>
                    {filtered.map((res) => {
                      const isYouTube = String(res.resourceType || "").toLowerCase() === "youtube";
                      const videoHref = isYouTube ? res.youtubeUrl : res.videoUrl;

                      return (
                        <Box
                          key={res.id}
                          sx={{
                            width: { xs: "100%", sm: "calc(50% - 8px)" },
                            mb: 2,
                          }}
                        >
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.3 }}
                          >
                            <Card
                              variant="outlined"
                              sx={{
                                borderRadius: 2,
                                width: "100%",
                                display: "flex",
                                flexDirection: "column",
                                overflow: "hidden",
                                transition: "box-shadow 0.3s",
                                boxShadow: theme.shadows[2],
                                "&:hover": { boxShadow: theme.shadows[6] },
                              }}
                            >
                              {!!res.thumbnailUrl && (
                                <Box sx={{ position: "relative", width: "100%", aspectRatio: "16/9", bgcolor: theme.palette.grey[900] }}>
                                  <Box
                                    component="img"
                                    alt={res.title}
                                    src={res.thumbnailUrl}
                                    sx={{ width: "100%", height: "100%", objectFit: "cover" }}
                                  />
                                  <Box
                                    sx={{
                                      position: "absolute",
                                      inset: 0,
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      opacity: 0,
                                      bgcolor: "rgba(0,0,0,0.35)",
                                      transition: "opacity 0.25s",
                                      "&:hover": { opacity: 1 },
                                      cursor: "pointer",
                                    }}
                                    onClick={() => handleOpenPlayer(res)}
                                  >
                                    <PlayCircleOutlineIcon sx={{ fontSize: 60, color: "white" }} />
                                  </Box>
                                </Box>
                              )}

                              <CardContent sx={{ flexGrow: 1, bgcolor: theme.palette.background.paper }}>
                                <Typography
                                  variant="subtitle1"
                                  fontWeight={700}
                                  noWrap
                                  title={res.title || "Untitled"}
                                >
                                  {res.title || "Untitled"}
                                </Typography>

                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                  sx={{
                                    mt: 0.75,
                                    display: "-webkit-box",
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: "vertical",
                                    overflow: "hidden",
                                  }}
                                  title={res.description || "No description"}
                                >
                                  {res.description || "No description"}
                                </Typography>

                                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
                                  {res.programId} {res.semester ? `- Sem ${res.semester}` : ""} | {res.subjectId || "No Subject"}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                                  {fmtDate(res.resourceDate)}
                                </Typography>

                                {/* Tag chips on card */}
                                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 1 }}>
                                  {(Array.isArray(res.tags) ? res.tags : [])
                                    .slice(0, 4)
                                    .map((t) => {
                                      const key = String(t).toLowerCase();
                                      const active = tagsFilter.includes(key);
                                      return (
                                        <Chip
                                          key={t}
                                          label={t}
                                          onDelete={() => handleTagChipToggle(t)}
                                          color={active ? "primary" : "default"}
                                          size="small"
                                          sx={{
                                            borderRadius: 1,
                                            fontWeight: 500,
                                            ...(!active && {
                                                bgcolor: theme.palette.background.default,
                                                color: theme.palette.text.secondary,
                                                borderColor: theme.palette.divider,
                                                '&:hover': {
                                                    bgcolor: theme.palette.action.hover
                                                }
                                            })
                                          }}
                                        />
                                      );
                                    })}
                                  {!!attachmentCount(res) && (
                                    <Chip
                                      icon={<AttachFileIcon />}
                                      label={`+${attachmentCount(res)} files`}
                                      size="small"
                                      variant="outlined"
                                      onClick={() => setOpenAttachments(res.attachments || [])}
                                    />
                                  )}
                                </Box>
                              </CardContent>

                              <CardActions sx={{ justifyContent: "space-between", px: 2, pb: 2, bgcolor: theme.palette.background.paper }}>
                                <Stack direction="row" spacing={1}>
                                  <Button
                                    size="small"
                                    startIcon={<OpenInNewIcon />}
                                    onClick={() => (videoHref ? window.open(videoHref, "_blank", "noopener,noreferrer") : null)}
                                    color="primary"
                                    disabled={!videoHref}
                                    variant="outlined"
                                  >
                                    Open
                                  </Button>
                                  <Button
                                    size="small"
                                    startIcon={<PlayCircleOutlineIcon />}
                                    onClick={() => handleOpenPlayer(res)}
                                    color="primary"
                                    disabled={!videoHref}
                                    variant="outlined"
                                  >
                                    Watch
                                  </Button>
                                </Stack>
                                {isYouTube ? (
                                  <Chip size="small" label="YouTube" color="error" variant="outlined" />
                                ) : (
                                  <Chip size="small" label="Uploaded" color="primary" variant="outlined" />
                                )}
                              </CardActions>
                            </Card>
                          </motion.div>
                        </Box>
                      );
                    })}
                  </Stack>
                )}
              </>
            )}
          </Paper>
        </Stack>
      </motion.div>
    </Container>
  );
}