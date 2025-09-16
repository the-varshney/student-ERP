/* eslint-disable no-unused-vars */
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  Box, Card, CardContent, Typography, FormControl, InputLabel, Select, MenuItem, Button,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Snackbar,
  Alert, CircularProgress, Stack, Chip, IconButton, Divider, TextField,
  InputAdornment, LinearProgress, Dialog, DialogTitle, DialogContent, Grid, Avatar,alpha, useTheme
} from "@mui/material";
import {
  Refresh as RefreshIcon,
  CloudDownload as DownloadIcon,
  Visibility as PreviewIcon,
  CloudUpload as UploadIcon,
  Edit as EditIcon,
  Close as CloseIcon,
  Search as SearchIcon,
} from "@mui/icons-material";
import { useAuth } from '../../context/AuthContext';
import axios from "axios";
import { auth, db, storage } from "../../firebase/Firebase";
import {
  collection,
  addDoc,
  setDoc,
  getDocs,
  doc,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import SecondaryHeader from "../../components/secondaryHeader";
import { HeaderBackButton } from "../../components/header";
import PdfViewer from "../../components/PdfViewer";
import TeacherHeader from '../../components/TeacherHeader';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp";
const MAX_FILE_MB = 10;


const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const fmtDate = (val) => {
  if (!val) return "";
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString();
};


export default function AchievementsManager() {
  const theme=useTheme();
  // Associate profile
  const [associate, setAssociate] = useState(null);
  const { role, userDetails, loading: authLoading } = useAuth();

  const [departments, setDepartments] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [semesters, setSemesters] = useState([]);

  // Department → Program → Semester
  const [selectedDept, setSelectedDept] = useState("");
  const [selectedProgram, setSelectedProgram] = useState("");
  const [selectedProgramName, setSelectedProgramName] = useState("");
  const [selectedSemester, setSelectedSemester] = useState("");

  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "info" });

  // Class selecter
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);

  // Student achievements
  const [achievements, setAchievements] = useState([]);
  const [loadingAchievements, setLoadingAchievements] = useState(false);
  const [previousAchievementsOpen, setPreviousAchievementsOpen] = useState(false); // State for the dialog


  // Form state
  const [form, setForm] = useState({
    eventName: "",
    category: "Competition", // Competition | Workshop | Hackathon | Sports | Cultural | Other
    position: "Participant", // 1st | 2nd | 3rd | Participant | Special | Other
    certificateNo: "",
    level: "College", // College | District | State | National | International
    organizer: "",
    eventDate: "",
    description: "",
  });
  const [file, setFile] = useState(null);
  const [uploadPct, setUploadPct] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // Viewer
  const [viewerUrl, setViewerUrl] = useState("");
  // PDF dialog for previous achievements
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [pdfUrlToView, setPdfUrlToView] = useState("");


  // Bootstrap associate + departments
  useEffect(() => {
    const bootstrap = async () => {
      if (authLoading) return;
      
      try {
        setLoading(true);
        setLoadingStep("Loading profile...");
        
        const isCollegeAssociate = userDetails?.isCollegeAssociate || role === "CollegeAssociate";
        if (!isCollegeAssociate || !userDetails?.college) {
          setSnackbar({ open: true, message: "Access denied. College Associate role with assigned college required.", severity: "error" });
          return;
        }

        setAssociate(userDetails);

        setLoadingStep("Loading departments...");
        const deptRes = await axios.get(`${API_BASE_URL}/api/colleges/${userDetails.college}/departments`);
        setDepartments(deptRes.data || []);
      } catch (e) {
        setSnackbar({ open: true, message: "Failed to initialize", severity: "error" });
      } finally {
        setLoading(false);
        setLoadingStep("");
      }
    };
    bootstrap();
  }, [authLoading, userDetails, role]);

  const loadPrograms = async (deptId) => {
    try {
      setLoading(true);
      setLoadingStep("Loading programs...");
      const progRes = await axios.get(`${API_BASE_URL}/api/departments/${associate.college}/${deptId}/programs`);
      setPrograms(progRes.data || []);
    } catch (e) {
      setPrograms([]);
      setSnackbar({ open: true, message: "Failed to load programs", severity: "error" });
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  };

  const loadSemesters = async (programId) => {
    try {
      setLoading(true);
      setLoadingStep("Loading semesters...");
      if (!programId) {
        setSemesters([]);
        return;
      }
      const semRes = await axios.get(`${API_BASE_URL}/api/programs/${programId}/semesters`);
      const semsRaw = semRes?.data ?? [];
      const sems = (Array.isArray(semsRaw) ? semsRaw : [])
        .map((s) => {
          if (typeof s === "number") return s;
          if (s && typeof s.semester === "number") return s.semester;
          if (s && typeof s.semesterNumber === "number") return s.semesterNumber;
          if (s && typeof s.number === "number") return s.number;
          return null;
        })
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b);
      setSemesters(sems.length ? sems : [1, 2, 3, 4, 5, 6, 7, 8]); // safe fallback
    } catch (e) {
      setSemesters([1, 2, 3, 4, 5, 6, 7, 8]);
      setSnackbar({ open: true, message: "Failed to load semesters. Showing default list.", severity: "warning" });
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  };

  // Pull class roster from attendance API, merging Firebase and MongoDB like ResultUpdate
  const loadStudentsForSelection = async (deptId, programId, semester) => {
    if (!selectedProgramName) {
      setSnackbar({ open: true, message: "Program name not available. Please reselect.", severity: "warning" });
      return;
    }
    try {
      setLoading(true);
      setLoadingStep("Loading students from Firebase...");
      const studentsQuery = query(
        collection(db, 'Students'),
        where('collegeId', '==', associate.college),
        where('role', '==', 'Student')
      );
      const firebaseSnapshot = await getDocs(studentsQuery);
      const firebaseStudentsList = firebaseSnapshot.docs.map(d => ({
        firebaseId: d.data().firebaseId,
        firstName: d.data().firstName,
        lastName: d.data().lastName,
        email: d.data().email,
        profilePicUrl: d.data().profilePicUrl || '',
        collegeName: d.data().collegeName || '',
        collegeId: d.data().collegeId
      }));

      if (firebaseStudentsList.length === 0) {
        setSnackbar({ open: true, message: 'No students found in your college', severity: 'warning' });
        setLoading(false);
        return;
      }

      setLoadingStep('Cross-referencing with MongoDB...');
      const resp = await axios.post(`${API_BASE_URL}/api/attendance/get-students`, {
        teacherCollege: associate.college,
        teacherProgram: selectedProgramName,
        selectedSemester: semester,
        firebaseStudents: firebaseStudentsList
      });
      const enrichedStudents = resp.data.students || [];
      setStudents(enrichedStudents);
      setSelectedStudent(null);
      setAchievements([]);
      setSnackbar({ open: true, message: `Loaded ${enrichedStudents.length} students`, severity: 'success' });
    } catch (e) {
      console.error('Error loading students:', e);
      setStudents([]);
      setSnackbar({ open: true, message: "Failed to load students", severity: "error" });
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  };

  const filteredStudents = useMemo(() => {
    const q = clean(search).toLowerCase();
    if (!q) return students;
    return students.filter((stu) => {
      const name = `${stu.firstName || ""} ${stu.lastName || ""}`.toLowerCase();
      const enroll = String(stu.enrollmentNo || "").toLowerCase();
      const email = String(stu.email || "").toLowerCase();
      return name.includes(q) || enroll.includes(q) || email.includes(q);
    });
  }, [students, search]);

  // Load achievements for selected student 
  const loadAchievements = useCallback(async (stu) => {
    const firebaseId = stu?.firebaseId;
    if (!firebaseId) {
      setAchievements([]);
      return;
    }
    try {
      setLoadingAchievements(true);
      const qRef = query(
        collection(db, "Achievements"),
        where("studentFirebaseId", "==", String(firebaseId)),
        where("collegeId", "==", String(associate.college))
      );
      const snap = await getDocs(qRef);
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => {
        const ta = a.createdAt?.seconds || 0;
        const tb = b.createdAt?.seconds || 0;
        return tb - ta;
      });
      setAchievements(rows);
    } catch (e) {
      setAchievements([]);
    } finally {
      setLoadingAchievements(false);
    }
  }, [associate]);

  useEffect(() => {
    if (selectedStudent) loadAchievements(selectedStudent);
  }, [selectedStudent, loadAchievements]);

  const onPickFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const mb = f.size / (1024 * 1024);
    if (mb > MAX_FILE_MB) {
      setSnackbar({ open: true, message: `File too large. Max ${MAX_FILE_MB} MB`, severity: "warning" });
      return;
    }
    setFile(f);
  };

  const resetForm = () => {
    setForm({
      eventName: "",
      category: "Competition",
      position: "Participant",
      certificateNo: "",
      level: "College",
      organizer: "",
      eventDate: "",
      description: "",
    });
    setFile(null);
    setUploadPct(0);
    setUploading(false);
    setEditingId(null);
  };

  const handleSave = async () => {
    try {
      if (!associate?.college) return;
      if (!selectedStudent?._id) {
        setSnackbar({ open: true, message: "Select a student first", severity: "warning" });
        return;
      }
      if (!editingId && !file) {
        setSnackbar({ open: true, message: "Attach a certificate file", severity: "warning" });
        return;
      }

      const firebaseId = selectedStudent.firebaseId;
      if (!firebaseId) {
        setSnackbar({ open: true, message: "Missing student's firebaseId in roster data", severity: "warning" });
        return;
      }

      const payloadBase = {
        collegeId: associate.college,
        studentFirebaseId: firebaseId,
        studentName: `${selectedStudent.firstName || ""} ${selectedStudent.lastName || ""}`.trim(),
        enrollmentNo: selectedStudent.enrollmentNo || "",
        programId: selectedProgram,
        semester: String(selectedSemester),
        eventName: clean(form.eventName),
        category: clean(form.category),
        position: clean(form.position),
        certificateNo: clean(form.certificateNo),
        level: clean(form.level),
        organizer: clean(form.organizer),
        eventDate: form.eventDate ? new Date(form.eventDate).toISOString() : null,
        description: clean(form.description),
        updatedAt: serverTimestamp(),
      };

      let storageInfo = null;
      if (file) {
        setUploading(true);
        setUploadPct(0);
        const safeName = file.name.replace(/\s+/g, "_");
        const ts = Date.now();
        const path = `achievements/${associate.college}/${firebaseId}/${ts}_${safeName}`;
        const storageRef = ref(storage, path);
        const task = uploadBytesResumable(storageRef, file, { contentType: file.type });
        await new Promise((resolve, reject) => {
          task.on(
            "state_changed",
            (snap) => setUploadPct(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
            (err) => reject(err),
            async () => {
              const url = await getDownloadURL(task.snapshot.ref);
              storageInfo = { url, path, fileName: file.name, mimeType: file.type, size: file.size };
              resolve();
            }
          );
        });
        setUploading(false);
      }

      if (editingId) {
        await setDoc(
          doc(db, "Achievements", editingId),
          { ...payloadBase, ...(storageInfo ? { storage: storageInfo } : {}) },
          { merge: true }
        );
        setSnackbar({ open: true, message: "Achievement updated", severity: "success" });
      } else {
        const created = await addDoc(collection(db, "Achievements"), {
          ...payloadBase,
          createdAt: serverTimestamp(),
          storage: storageInfo,
        });
        await setDoc(
          doc(db, "Students", firebaseId, "Achievements", created.id),
          {
            achievementId: created.id,
            eventName: payloadBase.eventName,
            position: payloadBase.position,
            createdAt: serverTimestamp(),
          },
          { merge: true }
        );
        setSnackbar({ open: true, message: "Achievement added", severity: "success" });
      }

      await loadAchievements(selectedStudent);
      resetForm();
    } catch (e) {
      console.error(e);
      setUploading(false);
      setSnackbar({ open: true, message: "Failed to save achievement", severity: "error" });
    }
  };

  const beginEdit = (a) => {
    setEditingId(a.id);
    setForm({
      eventName: a.eventName || "",
      category: a.category || "Competition",
      position: a.position || "Participant",
      certificateNo: a.certificateNo || "",
      level: a.level || "College",
      organizer: a.organizer || "",
      eventDate: a.eventDate ? a.eventDate.slice(0, 10) : "",
      description: a.description || "",
    });
    setFile(null);
    setUploadPct(0);
    setUploading(false);
    setPreviousAchievementsOpen(false); 
  };

  const handleRefresh = () => {
    if (selectedStudent) loadAchievements(selectedStudent);
    else if (selectedDept && selectedProgram && selectedSemester) {
      loadStudentsForSelection(selectedDept, selectedProgram, selectedSemester);
    }
  };


  const openPdf = (url) => {
    if (!url) return;
    setPdfUrlToView(url);
    setPdfDialogOpen(true);
  };

  return (
    <Box sx={{ p: 3, minHeight: "100vh", maxWidth: 1500, mx: "auto" }}>
     <SecondaryHeader title="Achievements Manager" leftArea={<HeaderBackButton/>}/>

      {/* Associate card */}
      {associate && (
        <TeacherHeader sx={{background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 1)}, ${alpha(theme.palette.secondary.main, 0.4)})`,}}
        rightExtras={[
    <IconButton key="refresh-button" onClick={handleRefresh} color="inherit" sx={{ left:{md:"580%"}}}>
      <RefreshIcon />
    </IconButton>
  ]}
       />

      )}

      {/* selectors: Department → Program → Semester */}
      <Card variant="outlined" sx={{ mb: 3, borderRadius: 3, maxWidth:{xs:"90vw",md:"100vw"}}}>
        <CardContent>
          <Stack spacing={2} direction={{ xs: "column", md: "row" }}>
            <FormControl fullWidth>
              <InputLabel>Department</InputLabel>
              <Select
                value={selectedDept}
                label="Department"
                onChange={async (e) => {
                  const dept = e.target.value;
                  setSelectedDept(dept);
                  setSelectedProgram("");
                  setSelectedProgramName("");
                  setSelectedSemester("");
                  setSemesters([]);
                  setStudents([]);
                  setSelectedStudent(null);
                  setAchievements([]);
                  if (dept) await loadPrograms(dept);
                }}
              >
                {departments.map((d) => (
                  <MenuItem key={d._id || d.id} value={d._id || d.id}>
                    {d.departmentName || d.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth disabled={!selectedDept}>
              <InputLabel>Program</InputLabel>
              <Select
                value={selectedProgram}
                label="Program"
                onChange={async (e) => {
                  const progId = e.target.value;
                  const selectedProg = programs.find(p => (p._id || p.id) === progId);
                  setSelectedProgram(progId);
                  setSelectedProgramName(e.target.value);
                  setSelectedSemester("");
                  setSemesters([]);
                  setStudents([]);
                  setSelectedStudent(null);
                  setAchievements([]);
                  if (progId) await loadSemesters(progId);
                }}
              >
                {programs.map((p) => (
                  <MenuItem key={p._id || p.id} value={p._id || p.id}>
                    {p.programName || p.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth disabled={!selectedProgram}>
              <InputLabel>Semester</InputLabel>
              <Select
                value={selectedSemester}
                label="Semester"
                onChange={async (e) => {
                  const sem = e.target.value;
                  setSelectedSemester(sem);
                  setStudents([]);
                  setSelectedStudent(null);
                  setAchievements([]);
                  if (selectedDept && selectedProgram && sem && selectedProgramName) {
                    await loadStudentsForSelection(selectedDept, selectedProgram, sem);
                  }
                }}
              >
                {semesters.map((s) => (
                  <MenuItem key={s} value={s}>{`Semester ${s}`}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>

          <Divider sx={{ my: 2 }} />

          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" sx={{gap:1.5}}>
            <TextField
              placeholder="Search by name, enrollment, or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon color="action" />
                  </InputAdornment>
                ),
              }}
              sx={{ minWidth: 320 }}
            />
            <Chip label={`Students: ${filteredStudents.length}`} color="primary" />
            {selectedStudent && (
              <Chip
                color="secondary"
                label={`Selected: ${selectedStudent.firstName || ""} ${selectedStudent.lastName || ""}`}
              />
            )}
          </Stack>
        </CardContent>
      </Card>

      <Grid container spacing={3}>
        {/* Left: students table */}
        <Grid item xs={12} md={6} sx={{minWidth:{xs: "90vw", md:"40vw"}}}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>Students</Typography>
            {!filteredStudents.length ? (
              <Alert severity="info">No students loaded or no matches.</Alert>
            ) : (
              <TableContainer sx={{ maxHeight: "70vh" }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Student</TableCell>
                      <TableCell>Enrollment</TableCell>
                      <TableCell>Email</TableCell>
                      <TableCell align="right">Select</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredStudents.map((st) => (
                      <TableRow
                        key={st._id}
                        hover
                        selected={selectedStudent?._id === st._id}
                        sx={{ cursor: "pointer" }}
                        onClick={() => setSelectedStudent(st)}
                      >
                        <TableCell>
                          <Box display="flex" alignItems="center" gap={1.5}>
                            <Avatar src={st.profilePicUrl} sx={{ width: 36, height: 36 }}>
                              {(st.firstName || "?").charAt(0)}
                            </Avatar>
                            <Box>
                              <Typography variant="body2" fontWeight={600}>
                                {st.firstName} {st.lastName}
                              </Typography>
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell>{st.enrollmentNo || "-"}</TableCell>
                        <TableCell>{st.email || "-"}</TableCell>
                        <TableCell align="right">
                          <Button size="small" variant="outlined">Select</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>
        </Grid>

        {/* Right: achievement form */}
        <Grid item xs={12} md={6}>
          <Paper variant="outlined" sx={{ p: 2, mb: 3, minWidth:{xs:"90vw", md:"53vw"}}}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="h6">
                {editingId ? "Update Achievement" : "Add Achievement"}
              </Typography>
              {selectedStudent && achievements.length > 0 && (
                 <Button 
                    onClick={() => setPreviousAchievementsOpen(true)}
                    variant="outlined"
                    size="small"
                  >
                    {`See Previous (${achievements.length})`}
                 </Button>
              )}
            </Stack>

            {!selectedStudent ? (
              <Alert severity="info">Select a student from the list to add an achievement.</Alert>
            ) : (
              <Stack spacing={2}>
                <Stack direction="row" spacing={1} flexWrap="wrap" sx={{gap:1.5}}>
                  <Chip label={`Student: ${selectedStudent.firstName || ""} ${selectedStudent.lastName || ""}`} />
                  <Chip label={`Enroll: ${selectedStudent.enrollmentNo || "-"}`} />
                  <Chip label={`Program: ${selectedProgramName}`} />
                  <Chip label={`Sem: ${selectedSemester}`} />
                </Stack>

                <TextField
                  label="Event Name"
                  value={form.eventName}
                  onChange={(e) => setForm((p) => ({ ...p, eventName: e.target.value }))}
                  fullWidth
                  required
                />

                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField
                    select
                    label="Category"
                    value={form.category}
                    onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                    fullWidth
                  >
                    {["Competition", "Workshop", "Hackathon", "Sports", "Cultural", "Other"].map((opt) => (
                      <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                    ))}
                  </TextField>

                  <TextField
                    select
                    label="Position"
                    value={form.position}
                    onChange={(e) => setForm((p) => ({ ...p, position: e.target.value }))}
                    fullWidth
                  >
                    {["1st", "2nd", "3rd", "Participant", "Special", "Other"].map((opt) => (
                      <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                    ))}
                  </TextField>
                </Stack>

                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField
                    label="Certificate Number"
                    value={form.certificateNo}
                    onChange={(e) => setForm((p) => ({ ...p, certificateNo: e.target.value }))}
                    fullWidth
                  />
                  <TextField
                    select
                    label="Level"
                    value={form.level}
                    onChange={(e) => setForm((p) => ({ ...p, level: e.target.value }))}
                    fullWidth
                  >
                    {["College", "District", "State", "National", "International"].map((opt) => (
                      <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                    ))}
                  </TextField>
                </Stack>

                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField
                    label="Organizer"
                    value={form.organizer}
                    onChange={(e) => setForm((p) => ({ ...p, organizer: e.target.value }))}
                    fullWidth
                  />
                  <TextField
                    type="date"
                    label="Event Date"
                    InputLabelProps={{ shrink: true }}
                    value={form.eventDate}
                    onChange={(e) => setForm((p) => ({ ...p, eventDate: e.target.value }))}
                    fullWidth
                  />
                </Stack>

                <TextField
                  label="Description"
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  fullWidth
                  multiline
                  minRows={2}
                />

                <Stack spacing={1}>
                  <Button variant="outlined" component="label" startIcon={<UploadIcon />}>
                    {editingId ? "Replace Certificate" : "Choose Certificate"}
                    <input type="file" accept={ACCEPT} hidden onChange={onPickFile} />
                  </Button>
                  {file && (
                    <Typography variant="caption" sx={{ display: "block" }}>
                      Selected: {file.name} ({Math.round(file.size / 1024)} KB)
                    </Typography>
                  )}
                  {uploading && (
                    <Box>
                      <LinearProgress variant="determinate" value={uploadPct} sx={{ height: 8, borderRadius: 1 }} />
                      <Typography variant="caption" color="text.secondary">
                        Uploading… {uploadPct}%
                      </Typography>
                    </Box>
                  )}
                </Stack>

                <Stack direction="row" spacing={1}>
                  <Button variant="contained" onClick={handleSave} disabled={uploading}>
                    {editingId ? "Update Achievement" : "Save Achievement"}
                  </Button>
                  <Button variant="text" onClick={resetForm} disabled={uploading}>
                    Clear
                  </Button>
                </Stack>
              </Stack>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Existing viewer dialog (unchanged) */}
      <Dialog open={!!viewerUrl} onClose={() => setViewerUrl("")} fullWidth maxWidth="md">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent:"space-between" }}>
          <Typography variant="h6">Certificate Preview</Typography>
          <IconButton onClick={() => setViewerUrl("")}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0, height: "80vh" }}>
          {viewerUrl ? (
            viewerUrl.toLowerCase().includes(".pdf") || viewerUrl.toLowerCase().includes("application/pdf") ? (
              <iframe src={viewerUrl} title="Certificate" width="100%" height="100%" style={{ border: "none" }} />
            ) : (
              <Box sx={{ p: 1, display: "flex", alignItems: "center", justifyContent: "center", height: "100%", bgcolor: "#111" }}>
                <img
                  src={viewerUrl}
                  alt="Certificate"
                  style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                />
              </Box>
            )
          ) : (
            <Box sx={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Alert severity="warning">No file to preview.</Alert>
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* PdfViewer dialog using provided component */}
      <Dialog open={pdfDialogOpen} onClose={() => setPdfDialogOpen(false)} fullWidth maxWidth="lg">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent:"space-between" }}>
          <Typography variant="h6">Certificate</Typography>
          <IconButton onClick={() => setPdfDialogOpen(false)}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          {pdfUrlToView ? (
            <Box sx={{ p: { xs: 1, md: 2 } }}>
              <PdfViewer fileUrl={pdfUrlToView} />
            </Box>
          ) : (
            <Box sx={{ p: 3 }}>
              <Alert severity="warning">No PDF url found.</Alert>
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* NEW: Previous Achievements Dialog */}
      <Dialog open={previousAchievementsOpen} onClose={() => setPreviousAchievementsOpen(false)} fullWidth maxWidth="lg">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Typography variant="h6">
            Previous Achievements for {selectedStudent?.firstName}
          </Typography>
          <IconButton onClick={() => setPreviousAchievementsOpen(false)}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {loadingAchievements ? (
            <Box display="flex" alignItems="center" justifyContent="center" gap={2} sx={{ p: 3 }}>
              <CircularProgress size={24} />
              <Typography>Loading achievements…</Typography>
            </Box>
          ) : (
            <Stack spacing={1.5} sx={{ py: 2 }}>
              {achievements.map((a) => (
                <Card key={a.id} variant="outlined" sx={{ borderRadius: 3 }}>
                  <CardContent>
                    <Stack direction={{xs: 'column', sm: 'row'}} alignItems="center" justifyContent="space-between" spacing={2}>
                      <Stack spacing={0.5} flexGrow={1}>
                        <Typography variant="subtitle1" fontWeight={700}>
                          {a.eventName || "Achievement"}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {a.level || "Level"} • {a.category || "Category"} • {a.position || "Participant"}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {a.organizer ? `Organizer: ${a.organizer}` : ""}
                          {a.certificateNo ? ` • Cert#: ${a.certificateNo}` : ""}
                          {a.eventDate ? ` • ${fmtDate(a.eventDate)}` : ""}
                        </Typography>
                      </Stack>
                      <Stack direction="row" spacing={1} flexShrink={0}>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<PreviewIcon />}
                          disabled={!a?.storage?.url}
                          onClick={() => setViewerUrl(a.storage.url)}
                        >
                          View
                        </Button>
                        {a?.storage?.url?.toLowerCase?.().includes(".pdf") && (
                            <Button
                                size="small"
                                variant="contained"
                                onClick={() => openPdf(a.storage.url)}
                            >
                                See Certificate
                            </Button>
                        )}
                        <Button
                          size="small"
                          variant="contained"
                          startIcon={<DownloadIcon />}
                          disabled={!a?.storage?.url}
                          component={a?.storage?.url ? "a" : "button"}
                          href={a?.storage?.url || undefined}
                          download={a?.storage?.fileName || "certificate"}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Download
                        </Button>
                        <Button
                          size="small"
                          variant="text"
                          startIcon={<EditIcon />}
                          onClick={() => beginEdit(a)}
                        >
                          Edit
                        </Button>
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          )}
        </DialogContent>
      </Dialog>

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
          severity={snackbar.severity || "info"}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>

      {loading && (
        <Box sx={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(0,0,0,0.5)', zIndex: 1300 }}>
          <Paper sx={{ p: 3, textAlign: 'center' }}>
            <CircularProgress />
            <Typography sx={{ mt: 2 }}>{loadingStep || 'Loading...'}</Typography>
          </Paper>
        </Box>
      )}
    </Box>
  );
}
