import React, { useState, useEffect } from "react";
import { Container, Typography, Paper, Stack, TextField, Button, MenuItem, Select, Chip, LinearProgress, Box, FormHelperText, Divider, 
  Card, CardContent, CardActions, Grid, IconButton, Tabs, Tab, useTheme,
} from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import DeleteIcon from "@mui/icons-material/Delete";
import { motion } from "framer-motion";
import { getAuth } from "firebase/auth";
import { db, storage } from "../../firebase/Firebase";
import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import axios from "axios";
import { toast } from "react-toastify";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { MobileDateTimePicker } from "@mui/x-date-pickers/MobileDateTimePicker";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import ENotesViewer from "../students/notes";
import { HeaderBackButton} from "../../components/header";
import SecondaryHeader from "../../components/secondaryHeader";
import { useAuth } from "../../context/AuthContext"; 
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB max

export default function UploadNotes() {
  const auth = getAuth();
  const user = auth.currentUser;

  const theme = useTheme();
  const [form, setForm] = useState({
    title: "",
    description: "",
    programId: "",
    semester: "",
    subjectId: "",
    tags: [],
    noteDate: new Date(),
  });
 
  const { userDetails: teacherProfile} = useAuth();
  const [programs, setPrograms] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [myNotes, setMyNotes] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("upload");
  
  // API Auth headers
  const getAuthHeaders = async () => {
    const headers = { "Content-Type": "application/json" };
    if (user) headers["Authorization"] = `Bearer ${await user.getIdToken()}`;
    return headers;
  };

  // Fetch Programs
  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/api/programs`, {
          headers: await getAuthHeaders(),
        });
        setPrograms(res.data);
      } catch (err) {
        console.error("Programs fetch error", err);
      }
    })();
  }, []);

  // Fetch Semesters when program changes
  useEffect(() => {
    if (!form.programId) {
      setSemesters([]);
      setForm((s) => ({ ...s, semester: "", subjectId: "" }));
      return;
    }
    (async () => {
      try {
        const res = await axios.get(
          `${API_BASE_URL}/api/programs/${form.programId}/semesters`,
          { headers: await getAuthHeaders() }
        );
        setSemesters(res.data);
        setForm((s) => ({ ...s, semester: "", subjectId: "" }));
      } catch (err) {
        console.error("Semester fetch error", err);
      }
    })();
  }, [form.programId]);

  // Fetch Subjects when semester changes
  useEffect(() => {
    if (!form.programId || !form.semester) {
      setSubjects([]);
      setForm((s) => ({ ...s, subjectId: "" }));
      return;
    }
    (async () => {
      try {
        const res = await axios.get(
          `${API_BASE_URL}/api/programs/${form.programId}/semesters/${form.semester}/subjects`,
          { headers: await getAuthHeaders() }
        );
        setSubjects(res.data);
        setForm((s) => ({ ...s, subjectId: "" }));
      } catch (err) {
        console.error("Subjects fetch error", err);
      }
    })();
  }, [form.programId, form.semester]);

  // Fetch My Notes
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const q = query(collection(db, "notes"), where("createdBy", "==", user.uid));
        const snap = await getDocs(q);
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setMyNotes(data);
      } catch (err) {
        console.error("Failed to fetch notes", err);
      }
    })();
  }, [user, uploading]);

  // Handle Tags
  const handleTagsInput = (val) => {
    setInputValue(val);
    if (val.endsWith(",") || val.endsWith(" ")) {
      const newTags = val.split(/[\s,]+/).map((t) => t.trim().toLowerCase()).filter(Boolean);
      setForm((s) => ({ ...s, tags: [...new Set([...s.tags, ...newTags])] }));
      setInputValue("");
    }
  };

  const handleDeleteTag = (tag) => {
    setForm((s) => ({ ...s, tags: s.tags.filter((t) => t !== tag) }));
  };

  // File Validation
  const validateFile = (f) => {
    if (!f) return "File is required";
    if (f.size > MAX_FILE_BYTES) return "File size must be ≤ 10MB";
    return "";
  };

  // Upload Handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!user) return setError("Sign in required to upload notes.");
    if (!form.title.trim()) return setError("Title is required");
    const fileError = validateFile(file);
    if (fileError) return setError(fileError);

    try {
      setUploading(true);
      const docRef = doc(collection(db, "notes"));
      const noteId = docRef.id;

      // Upload file
      const filePath = `notes/${noteId}/${encodeURIComponent(file.name)}`;
      const storageRef = ref(storage, filePath);
      const uploadTask = uploadBytesResumable(storageRef, file, {
        contentType: file.type,
      });

      const fileURL = await new Promise((resolve, reject) => {
        uploadTask.on(
          "state_changed",
          (snap) => setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
          reject,
          async () => resolve(await getDownloadURL(uploadTask.snapshot.ref))
        );
      });

      const collegeId = teacherProfile?.college || null;
      const teacherProgram = teacherProfile?.program || null;

      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        programId: form.programId || teacherProgram,
        semester: form.semester,
        subjectId: form.subjectId,
        tags: form.tags,
        noteDate: form.noteDate,
        fileURL,
        fileName: file.name,
        fileType: file.type,
        collegeId,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      };

      await setDoc(docRef, payload);
      toast.success("Note uploaded successfully");

      setForm({
        title: "",
        description: "",
        programId: "",
        semester: "",
        subjectId: "",
        tags: [],
        noteDate: new Date(),
      });
      setFile(null);
      setProgress(0);
    } catch (err) {
      console.error("Upload notes error:", err);
      setError("Upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  };

  // Delete Note
  const handleDelete = async (note) => {
    try {
      await deleteDoc(doc(db, "notes", note.id));
      if (note.fileURL) {
        const storageRef = ref(storage, `notes/${note.id}/${note.fileName}`);
        await deleteObject(storageRef).catch(() => {});
      }
      toast.success("Note deleted");
      setMyNotes((prev) => prev.filter((n) => n.id !== note.id));
    } catch (err) {
      console.error("Delete failed", err);
      toast.error("Failed to delete note");
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 6 }} minHeight="100vh">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <Stack spacing={6}>
          {/* Tabs for switching between Upload and View */}
          <Paper
            elevation={4}
            sx={{
              p: 2,
              borderRadius: 3,
              bgcolor: "background.paper",
              boxShadow: "0 4px 20px rgba(0, 0, 0, 0.05)",
            }}
          >
            <Tabs
              value={activeTab}
              onChange={(e, newValue) => setActiveTab(newValue)}
              centered
              sx={{
                "& .MuiTab-root": {
                  textTransform: "none",
                  fontWeight: 600,
                  fontSize: "1.1rem",
                  borderRadius: 2,
                },
                "& .Mui-selected": {
                  color: "primary.main",
                },
                "& .MuiTabs-indicator": {
                  backgroundColor: "primary.main",
                },
              }}
            >
              <Tab label="Upload Notes" value="upload" />
              <Tab label="View Notes" value="view" />
            </Tabs>
          </Paper>

          {/* Upload Notes Section */}
          {activeTab === "upload" && (
            <>
              {/* Upload Form */}
              <Paper elevation={4} sx={{ p: 5, borderRadius: 4}}>
                
                <SecondaryHeader
                                title="Upload Class Notes"      
                                subtitle="Share class materials with students (PDFs, PPTs, Docs, Images, etc.)"                          
                                titleSx={{ color: theme.palette.primary.main }}
                                leftArea={
                                  <HeaderBackButton />
                                }
                                />

                <form onSubmit={handleSubmit}>
                  <Stack spacing={4}>
                    {/* Basic Info */}
                    <Box>
                      <Typography variant="h6" mb={2}>
                        Basic Information
                      </Typography>
                      <Stack spacing={3}>
                        <TextField
                          label="Title"
                          value={form.title}
                          onChange={(e) => setForm({ ...form, title: e.target.value })}
                          required
                          fullWidth
                        />
                        <TextField
                          label="Short Description (optional)"
                          value={form.description}
                          onChange={(e) => setForm({ ...form, description: e.target.value })}
                          fullWidth
                          multiline
                          minRows={2}
                        />
                      </Stack>
                    </Box>

                    <Divider />

                    {/* Class Details */}
                    <Box>
                      <Typography variant="h6" mb={2}>
                        Class Details
                      </Typography>
                      <Stack spacing={3}>
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                          <Select
                            fullWidth
                            value={form.programId}
                            displayEmpty
                            onChange={(e) =>
                              setForm({ ...form, programId: e.target.value, semester: "", subjectId: "" })
                            }
                          >
                            <MenuItem value="">
                              <em>Select Program</em>
                            </MenuItem>
                            {programs.map((p) => (
                              <MenuItem key={p._id} value={p._id}>
                                {p.programName}
                              </MenuItem>
                            ))}
                          </Select>

                          <Select
                            fullWidth
                            value={form.semester}
                            displayEmpty
                            onChange={(e) =>
                              setForm({ ...form, semester: e.target.value, subjectId: "" })
                            }
                            disabled={!form.programId}
                          >
                            <MenuItem value="">
                              <em>Select Semester</em>
                            </MenuItem>
                            {semesters.map((sem) => (
                              <MenuItem key={sem._id || sem.semesterNumber} value={sem.semesterNumber}>
                                Semester {sem.semesterNumber}
                              </MenuItem>
                            ))}
                          </Select>
                        </Stack>

                        <Select
                          fullWidth
                          value={subjects.some((s) => String(s._id) === String(form.subjectId)) ? form.subjectId : ""}
                          displayEmpty
                          onChange={(e) => setForm({ ...form, subjectId: e.target.value })}
                          disabled={!form.programId || !form.semester}
                        >
                          <MenuItem value="">
                            <em>Select Subject</em>
                          </MenuItem>
                          {subjects.map((s) => (
                            <MenuItem key={s._id} value={s._id}>
                              {s.subjectName}
                            </MenuItem>
                          ))}
                        </Select>

                        {/* Tags */}
                        <Box
                          sx={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 1,
                            border: "1px solid #ccc",
                            p: 1,
                            borderRadius: 1,
                            minHeight: "56px",
                            alignItems: "center",
                          }}
                        >
                          {form.tags.map((tag) => (
                            <Chip
                              key={tag}
                              label={tag}
                              onDelete={() => handleDeleteTag(tag)}
                              sx={{
                                bgcolor: "primary.light",
                                color: "primary.contrastText",
                                fontWeight: 500,
                              }}
                            />
                          ))}
                          <TextField
                            variant="standard"
                            placeholder="Add tags (press comma/space)"
                            value={inputValue}
                            onChange={(e) => handleTagsInput(e.target.value)}
                            onBlur={() => handleTagsInput(inputValue)}
                            InputProps={{ disableUnderline: true }}
                            sx={{ flexGrow: 1, minWidth: "150px" }}
                          />
                        </Box>

                        {/* Date */}
                        <LocalizationProvider dateAdapter={AdapterDateFns}>
                          <MobileDateTimePicker
                            label="Class Date & Time"
                            value={form.noteDate}
                            onChange={(newValue) => setForm({ ...form, noteDate: newValue })}
                            slotProps={{ textField: { fullWidth: true } }}
                          />
                        </LocalizationProvider>
                      </Stack>
                    </Box>

                    <Divider />

                    <Box>
                      <Typography variant="h6" mb={2}>
                        Upload File
                      </Typography>
                      <Stack spacing={2}>
                        <Button variant="outlined" component="label" startIcon={<UploadFileIcon />} sx={{ py: 1.5, borderRadius: 2 }}>
                          {file ? file.name : "Choose File (pdf, ppt, docx, image etc.)"}
                          <input hidden type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                        </Button>
                        {error && <FormHelperText error>{error}</FormHelperText>}
                        {uploading && (
                          <Stack spacing={1}>
                            <LinearProgress variant="determinate" value={progress} sx={{ borderRadius: 2 }} />
                            <Typography variant="caption" color="text.secondary">
                              Uploading {progress}%
                            </Typography>
                          </Stack>
                        )}
                      </Stack>
                    </Box>

                    {/* Buttons */}
                    <Stack direction="row" justifyContent="flex-end" spacing={2}>
                      <Button
                        variant="outlined"
                        onClick={() => {
                          setForm({
                            title: "",
                            description: "",
                            programId: "",
                            semester: "",
                            subjectId: "",
                            tags: [],
                            noteDate: new Date(),
                          });
                          setFile(null);
                          setError("");
                        }}
                        disabled={uploading}
                        sx={{ borderRadius: 2 }}
                      >
                        Reset
                      </Button>
                      <Button type="submit" variant="contained" disabled={uploading} sx={{ borderRadius: 2, px: 4 }}>
                        Upload Note
                      </Button>
                    </Stack>
                  </Stack>
                </form>
              </Paper>

              {/* My Uploaded Notes */}
              <Paper elevation={4} sx={{ p: 5, borderRadius: 4 }}>
                <Typography variant="h5" fontWeight={600} mb={3} color="primary" textAlign="center">
                  My Uploaded Notes
                </Typography>
                {myNotes.length === 0 ? (
                  <Typography color="text.secondary" textAlign="center">
                    You haven’t uploaded any notes yet.
                  </Typography>
                ) : (
                  <Grid container spacing={3}>
                    {myNotes.map((note) => (
                      <Grid item xs={12} sm={6} md={4} key={note.id}>
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }}>
                          <Card
                            variant="outlined"
                            sx={{
                                borderRadius: 3,
                                width: { md: 300, xs: 280 },
                                height: 240,
                                display: "flex",
                                flexDirection: "column",
                                boxShadow: "0 2px 10px rgba(0, 0, 0, 0.05)",
                                "&:hover": { boxShadow: "0 4px 15px rgba(0, 0, 0, 0.1)" },
                                mx: "auto",
                              }}
                          >
                            <CardContent sx={{ flexGrow: 1 }}>
                              <Typography variant="h6" fontWeight={600} noWrap>
                                {note.title}
                              </Typography>
                              <Typography
                                variant="body2"
                                color="text.secondary"
                                gutterBottom
                                sx={{ mt: 1, height: 40, overflow: "hidden", textOverflow: "ellipsis" }}
                              >
                                {note.description || "No description"}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
                                {note.programId} {note.semester ? `- Sem ${note.semester}` : ""} | {note.subjectId || "No Subject"}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                                {note.noteDate?.toDate?.().toLocaleString?.() || ""}
                              </Typography>
                            </CardContent>
                            <CardActions sx={{ justifyContent: "space-between", px: 2, pb: 2 }}>
                              <Button size="small" startIcon={<OpenInNewIcon />} onClick={() => window.open(note.fileURL, "_blank")} color="primary">
                                Open
                              </Button>
                              <IconButton size="small" color="error" onClick={() => handleDelete(note)}>
                                <DeleteIcon />
                              </IconButton>
                            </CardActions>
                          </Card>
                        </motion.div>
                      </Grid>
                    ))}
                  </Grid>
                )}
              </Paper>
            </>
          )}

          <Paper elevation={-90} sx={{ p: 0, borderRadius: 4, bgcolor: "white" }}>
          {activeTab === "view" && (
            <ENotesViewer role="generic" />
          )}
          </Paper>
        </Stack>
      </motion.div>
    </Container>
  );
}
