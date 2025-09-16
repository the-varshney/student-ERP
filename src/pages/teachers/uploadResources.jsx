/* eslint-disable no-unused-vars */
import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import {
  Container, Typography, Paper, Stack, TextField, Button, MenuItem, Select, Chip, LinearProgress, Box, FormHelperText, Divider, Card, 
  CardContent, CardActions, IconButton, Tabs, Tab, RadioGroup, FormControlLabel, Radio, Alert,
} from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import VideoFileIcon from "@mui/icons-material/VideoFile";
import ImageIcon from "@mui/icons-material/Image";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import { motion } from "framer-motion";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { db, storage } from "../../firebase/Firebase";
import { useAuth } from '../../context/AuthContext';
import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  query,
  where,
  deleteDoc,
  serverTimestamp,
  orderBy,
  updateDoc,
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
import EResourcesViewer from "../students/Eresources"; 

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MAX_THUMB_BYTES = 5 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENTS = 5;

// HELPERS
function extractYouTubeId(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|[?&amp;]v=)([^#&amp;?]*).*/;
  const match = url.match(regExp);
  return match && match[2]?.length === 11 ? match[2] : null;
}
function getYouTubeThumbnail(id) {
  return `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
}

// RESOURCE CARD
const ResourceCard = ({ resource, showDelete, onDelete, showEdit, onEdit }) => {
  const [thumbSrc, setThumbSrc] = useState(resource.thumbnailUrl || "");
  const handlePlayClick = () => {
    const url = resource.youtubeUrl || resource.videoUrl;
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <Card
      sx={{
        width: "100%",
        maxWidth: "500px",
        margin: "auto",
        borderRadius: 2,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        transition: "box-shadow 0.3s",
        boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
        "&:hover": { boxShadow: "0 6px 14px rgba(0,0,0,0.12)" },
      }}
    >
      {!!thumbSrc && (
        <Box
          sx={{
            position: "relative",
            width: "100%",
            aspectRatio: "16 / 9",
            bgcolor: "#000",
            cursor: "pointer",
          }}
          onClick={handlePlayClick}
        >
          <Box
            component="img"
            alt={resource.title}
            src={thumbSrc}
            onError={() => {
              if (thumbSrc?.includes("/maxresdefault.jpg")) {
                setThumbSrc(thumbSrc.replace("/maxresdefault.jpg", "/hqdefault.jpg"));
              }
            }}
            sx={{ width: "100%", height: "100%", objectFit: "contain", backgroundColor: "#000" }}
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
            }}
          >
            <PlayCircleOutlineIcon sx={{ fontSize: 48, color: "white" }} />
          </Box>
        </Box>
      )}

      <CardContent sx={{ p: 1.5 }}>
        <Typography variant="subtitle1" fontWeight={600} noWrap>
          {resource.title}
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            mt: 0.5,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {resource.description || "No description"}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
          {(resource.programId || "No Program")} {resource.semester ? `- Sem ${resource.semester}` : ""} |{" "}
          {resource.subjectId || "No Subject"}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
          {resource.resourceDate?.toDate?.().toLocaleString?.() || ""}
        </Typography>
        {resource.attachments?.length > 0 && (
          <Typography variant="caption" color="primary" sx={{ display: "block", mt: 0.5 }}>
            +{resource.attachments.length} attachments
          </Typography>
        )}
      </CardContent>

      <CardActions sx={{ justifyContent: "space-between", px: 1.5, pb: 1.5 }}>
        <Button size="small" startIcon={<OpenInNewIcon />} onClick={handlePlayClick}>
          Watch
        </Button>
        <Box>
          {showEdit && (
            <IconButton size="small" color="primary" onClick={() => onEdit?.(resource)} aria-label="edit">
              <EditIcon fontSize="small" />
            </IconButton>
          )}
          {showDelete && (
            <IconButton size="small" color="error" onClick={() => onDelete?.(resource)} aria-label="delete">
              <DeleteIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
      </CardActions>
    </Card>
  );
};

ResourceCard.propTypes = {
  resource: PropTypes.object.isRequired,
  showDelete: PropTypes.bool,
  onDelete: PropTypes.func,
  showEdit: PropTypes.bool,
  onEdit: PropTypes.func,
};

// MAIN COMPONENT
export default function CollegeResources() {
  const auth = getAuth();
  const [firebaseUser, setFirebaseUser] = useState(null);

  // Data states
  const [teacherProfile, setTeacherProfile] = useState(null);
  const [programs, setPrograms] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [myResources, setMyResources] = useState([]);
  const [allResources, setAllResources] = useState([]);

  // Form / UI states
  const [form, setForm] = useState({
    title: "",
    description: "",
    programId: "",
    semester: "",
    subjectId: "",
    tags: [],
    resourceDate: new Date(),
    resourceType: "youtube",
    youtubeUrl: "",
  });
  const { role, userDetails, loading: authLoading } = useAuth();
  const [videoFile, setVideoFile] = useState(null);
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [attachmentFiles, setAttachmentFiles] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("upload");

  // Edit state
  const [editResourceId, setEditResourceId] = useState(null);
  const [editOriginal, setEditOriginal] = useState(null);

  // AUTH
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => setFirebaseUser(u || null));
  }, [auth]);

  // PROFILE
  useEffect(() => {
    if (authLoading) return;
    
    const isCollegeAssociate = userDetails?.isCollegeAssociate || role === "CollegeAssociate" || role === "Teacher";
    if (isCollegeAssociate && userDetails) {
      setTeacherProfile(userDetails);
    } else {
      setTeacherProfile(null);
    }
  }, [authLoading, userDetails, role]);

  // API AUTH HEADERS
  const getAuthHeaders = async () => {
    const headers = { "Content-Type": "application/json" };
    if (firebaseUser) headers["Authorization"] = `Bearer ${await firebaseUser.getIdToken()}`;
    return headers;
  };

  // PROGRAMS
  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/api/programs`, { headers: await getAuthHeaders() });
        setPrograms(res.data || []);
      } catch (err) {
        console.error("Programs fetch error", err);
      }
    })();
  }, []);

  // SEMESTERS
  useEffect(() => {
    if (!form.programId) {
      setSemesters([]);
      setForm((s) => ({ ...s, semester: "", subjectId: "" }));
      return;
    }
    (async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/api/programs/${form.programId}/semesters`, {
          headers: await getAuthHeaders(),
        });
        setSemesters(res.data || []);
        setForm((s) => ({ ...s, semester: "", subjectId: "" }));
      } catch (err) {
        console.error("Semester fetch error", err);
      }
    })();
  }, [form.programId]);

  // SUBJECTS
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
        setSubjects(res.data || []);
        setForm((s) => ({ ...s, subjectId: "" }));
      } catch (err) {
        console.error("Subjects fetch error", err);
      }
    })();
  }, [form.programId, form.semester]);

  // MY RESOURCES
  useEffect(() => {
    if (!firebaseUser) return;
    const qMy = query(collection(db, "eresources"), where("createdBy", "==", firebaseUser.uid));
    const unsub = onSnapshot(
      qMy,
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setMyResources(data);
      },
      () => setMyResources([])
    );
    return () => unsub();
  }, [firebaseUser]);

  // ALL RESOURCES
  useEffect(() => {
    const qAll = query(collection(db, "eresources"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      qAll,
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setAllResources(data);
      },
      () => setAllResources([])
    );
    return () => unsub();
  }, []);

  // TAGS INPUT
  const handleTagsInput = (val) => {
    setInputValue(val);
    if (val.endsWith(",") || val.endsWith(" ")) {
      const newTags = val
        .split(/[\s,]+/)
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
      setForm((s) => ({ ...s, tags: [...new Set([...s.tags, ...newTags])] }));
      setInputValue("");
    }
  };
  const handleDeleteTag = (tag) => setForm((s) => ({ ...s, tags: s.tags.filter((t) => t !== tag) }));

  // ATTACHMENTS
  const handleAttachmentChange = (e) => {
    const newFiles = Array.from(e.target.files || []);
    if (attachmentFiles.length + newFiles.length > MAX_ATTACHMENTS) {
      toast.error(`Maximum ${MAX_ATTACHMENTS} attachments allowed.`);
      return;
    }
    setAttachmentFiles((prev) => [...prev, ...newFiles]);
  };
  const removeAttachment = (index) => setAttachmentFiles((prev) => prev.filter((_, i) => i !== index));

  // VALIDATIONS
  const validateYouTubeUrl = (url) => {
    if (!url) return "YouTube URL is required";
    const id = extractYouTubeId(url);
    if (!id) return "Invalid YouTube URL";
    return "";
  };
  const validateVideoFile = (f) => {
    if (!f) return "Video file is required";
    if (!f.type.startsWith("video/")) return "Only video files are allowed";
    if (f.size > MAX_VIDEO_BYTES) return "Video size must be ≤ 100MB";
    return "";
  };
  const validateThumbnailFile = (f) => {
    if (!f) return "Thumbnail is required for uploaded videos";
    if (!f.type.startsWith("image/")) return "Thumbnail must be an image";
    if (f.size > MAX_THUMB_BYTES) return "Thumbnail size must be ≤ 5MB";
    return "";
  };
  const validateAttachmentFile = (f) => {
    if (f.size > MAX_ATTACHMENT_BYTES) return "Attachment size must be ≤ 10MB";
    return "";
  };

  // RESET FORM
  const resetForm = () => {
    setForm({
      title: "",
      description: "",
      programId: "",
      semester: "",
      subjectId: "",
      tags: [],
      resourceDate: new Date(),
      resourceType: "youtube",
      youtubeUrl: "",
    });
    setVideoFile(null);
    setThumbnailFile(null);
    setAttachmentFiles([]);
    setInputValue("");
    setError("");
  };

  // SUBMIT (Create or Update)
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!firebaseUser) return setError("Sign in required to upload resources.");
    if (!form.title.trim()) return setError("Title is required");

    const isYouTube = form.resourceType === "youtube";
    if (isYouTube) {
      const ytError = validateYouTubeUrl(form.youtubeUrl);
      if (ytError) return setError(ytError);
      const attachErrors = attachmentFiles.some((f) => !!validateAttachmentFile(f));
      if (attachErrors) return setError("One or more attachments exceed size limit.");
    } else {
      const videoError = editResourceId ? null : validateVideoFile(videoFile); // video required only on create
      const thumbError = editResourceId ? null : validateThumbnailFile(thumbnailFile); // thumb required only on create
      const attachErrors = attachmentFiles.some((f) => !!validateAttachmentFile(f));
      if (videoError) return setError(videoError);
      if (thumbError) return setError(thumbError);
      if (attachErrors) return setError("One or more attachments exceed size limit.");
    }

    try {
      setUploading(true);
      let resourceId = editResourceId || doc(collection(db, "eresources")).id;
      const docRef = doc(db, "eresources", resourceId);

      // Existing values in edit mode
      let nextVideoUrl = editOriginal?.videoUrl || "";
      let nextThumbUrl = editOriginal?.thumbnailUrl || "";
      let nextAttachments = Array.isArray(editOriginal?.attachments) ? [...editOriginal.attachments] : [];

      // Uploads
      if (isYouTube) {
        const videoId = extractYouTubeId(form.youtubeUrl);
        nextThumbUrl = getYouTubeThumbnail(videoId);
        nextVideoUrl = form.youtubeUrl;

        if (attachmentFiles.length > 0) {
          nextAttachments = [];
          for (let i = 0; i < attachmentFiles.length; i++) {
            const file = attachmentFiles[i];
            const aPath = `eresources/${resourceId}/attach-${i}-${encodeURIComponent(file.name)}`;
            const aRef = ref(storage, aPath);
            const aTask = uploadBytesResumable(aRef, file, { contentType: file.type });
            await new Promise((resolve, reject) => {
              aTask.on("state_changed", () => {}, reject, resolve);
            });
            const aUrl = await getDownloadURL(aRef);
            nextAttachments.push({ name: file.name, type: file.type, url: aUrl });
          }
        }
      } else {
        // If a new video is selected, replace video
        if (videoFile) {
          const videoPath = `eresources/${resourceId}/${encodeURIComponent(videoFile.name)}`;
          const videoRef = ref(storage, videoPath);
          const videoTask = uploadBytesResumable(videoRef, videoFile, { contentType: videoFile.type });
          nextVideoUrl = await new Promise((resolve, reject) => {
            videoTask.on(
              "state_changed",
              (snap) => setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
              reject,
              async () => resolve(await getDownloadURL(videoTask.snapshot.ref))
            );
          });
        }

        // If a new thumbnail is selected, replace thumbnail
        if (thumbnailFile) {
          const thumbPath = `eresources/${resourceId}/thumb-${Date.now()}-${encodeURIComponent(thumbnailFile.name)}`;
          const thumbRef = ref(storage, thumbPath);
          const thumbTask = uploadBytesResumable(thumbRef, thumbnailFile, { contentType: thumbnailFile.type });
          await new Promise((resolve, reject) => {
            thumbTask.on("state_changed", () => {}, reject, resolve);
          });
          nextThumbUrl = await getDownloadURL(thumbRef);
        }

        // If new attachments are selected, replace attachments
        if (attachmentFiles.length > 0) {
          nextAttachments = [];
          for (let i = 0; i < attachmentFiles.length; i++) {
            const file = attachmentFiles[i];
            const aPath = `eresources/${resourceId}/attach-${i}-${encodeURIComponent(file.name)}`;
            const aRef = ref(storage, aPath);
            const aTask = uploadBytesResumable(aRef, file, { contentType: file.type });
            await new Promise((resolve, reject) => {
              aTask.on("state_changed", () => {}, reject, resolve);
            });
            const aUrl = await getDownloadURL(aRef);
            nextAttachments.push({ name: file.name, type: file.type, url: aUrl });
          }
        }
      }

      const basePayload = {
        title: form.title.trim(),
        description: form.description.trim(),
        programId: form.programId,
        semester: form.semester,
        subjectId: form.subjectId,
        tags: form.tags,
        resourceDate: form.resourceDate,
        resourceType: form.resourceType,
        ...(isYouTube ? { youtubeUrl: nextVideoUrl } : { videoUrl: nextVideoUrl }),
        thumbnailUrl: nextThumbUrl,
        attachments: nextAttachments,
      };

      if (editResourceId) {
        await updateDoc(docRef, {
          ...basePayload,
          updatedAt: serverTimestamp(),
        });
        toast.success("Resource updated successfully");
      } else {
        await setDoc(docRef, {
          ...basePayload,
          collegeId: teacherProfile?.college || null,
          createdBy: firebaseUser.uid,
          createdAt: serverTimestamp(),
        });
        toast.success("Resource uploaded successfully");
      }

      // Reset
      setEditResourceId(null);
      setEditOriginal(null);
      resetForm();
      setProgress(0);
      setActiveTab("mine");
    } catch (err) {
      console.error("Save resource error:", err);
      setError("Save failed. Try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (resource) => {
    try {
      await deleteDoc(doc(db, "eresources", resource.id));

      if (resource.resourceType !== "youtube") {
        if (resource.videoUrl) {
          const videoParts = resource.videoUrl.split(`eresources/${resource.id}/`);
          if (videoParts) {
            const videoStorageRef = ref(storage, `eresources/${resource.id}/${videoParts.split("?")}`);
            await deleteObject(videoStorageRef).catch(() => {});
          }
        }
        if (resource.thumbnailUrl) {
          const thumbParts = resource.thumbnailUrl.split(`eresources/${resource.id}/`);
          if (thumbParts) {
            const thumbStorageRef = ref(storage, `eresources/${resource.id}/${thumbParts.split("?")}`);
            await deleteObject(thumbStorageRef).catch(() => {});
          }
        }
      }
      for (const attach of resource.attachments || []) {
        const attachParts = attach.url?.split?.(`eresources/${resource.id}/`);
        if (attachParts) {
          const attachStorageRef = ref(storage, `eresources/${resource.id}/${attachParts.split("?")}`);
          await deleteObject(attachStorageRef).catch(() => {});
        }
      }
      toast.success("Resource deleted");
    } catch (err) {
      console.error("Delete failed", err);
      toast.error("Failed to delete resource");
    }
  };

  const handleEdit = (resource) => {
    setEditResourceId(resource.id);
    setEditOriginal(resource);
    setForm({
      title: resource.title || "",
      description: resource.description || "",
      programId: resource.programId || "",
      semester: resource.semester || "",
      subjectId: resource.subjectId || "",
      tags: resource.tags || [],
      resourceDate: resource.resourceDate?.toDate?.() || new Date(),
      resourceType: resource.resourceType || "youtube",
      youtubeUrl: resource.youtubeUrl || "",
    });
    setVideoFile(null);
    setThumbnailFile(null);
    setAttachmentFiles([]);
    setActiveTab("upload");
  };

  // UI RENDER
  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack spacing={4}>
        <Paper elevation={4} sx={{ p: 2, borderRadius: 3 }}>
          <Tabs
            value={activeTab}
            onChange={(e, v) => setActiveTab(v)}
            centered
            sx={{
              "& .MuiTab-root": { textTransform: "none", fontWeight: 600, fontSize: "1rem" },
              "& .Mui-selected": { color: "primary.main" },
              "& .MuiTabs-indicator": { backgroundColor: "primary.main" },
            }}
          >
            <Tab label="Upload Resources" value="upload" />
            <Tab label="My Resources" value="mine" />
            <Tab label="View Resources" value="view" />
          </Tabs>
        </Paper>

        {/* Upload */}
        {activeTab === "upload" && (
          <Paper elevation={4} sx={{ p: { xs: 2, md: 3 }, borderRadius: 3 }}>
            <Stack spacing={2}>
              <Typography variant="h5" fontWeight={700} color="primary">
                {editResourceId ? "Edit E-Resource" : "Upload E-Resources"}
              </Typography>

              {editResourceId && (
                <Alert
                  severity="info"
                  sx={{ borderRadius: 2 }}
                  action={
                    <Button
                      color="inherit"
                      size="small"
                      onClick={() => {
                        setEditResourceId(null);
                        setEditOriginal(null);
                        resetForm();
                      }}
                    >
                      Cancel Edit
                    </Button>
                  }
                >
                  You are editing an existing resource. Make changes and click Save Changes.
                </Alert>
              )}

              <form onSubmit={handleSubmit}>
                <Stack spacing={3}>
                  {/* Basic Information */}
                  <Box>
                    <Typography variant="subtitle1" mb={1} fontWeight={600}>
                      Basic Information
                    </Typography>
                    <Stack spacing={2}>
                      <TextField
                        label="Title/Topic"
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
                    <Typography variant="subtitle1" mb={1} fontWeight={600}>
                      Class Details
                    </Typography>
                    <Stack spacing={2}>
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
                          onChange={(e) => setForm({ ...form, semester: e.target.value, subjectId: "" })}
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
                        value={form.subjectId}
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
                          border: "1px solid #e0e0e0",
                          p: 1,
                          borderRadius: 1,
                          minHeight: 48,
                          alignItems: "center",
                        }}
                      >
                        {form.tags.map((tag) => (
                          <Chip
                            key={tag}
                            label={tag}
                            onDelete={() => handleDeleteTag(tag)}
                            sx={{ bgcolor: "primary.light", color: "white", fontWeight: 500 }}
                          />
                        ))}
                        <TextField
                          variant="standard"
                          placeholder="Add tags (press comma/space)"
                          value={inputValue}
                          onChange={(e) => handleTagsInput(e.target.value)}
                          onBlur={() => handleTagsInput(inputValue)}
                          InputProps={{ disableUnderline: true }}
                          sx={{ flexGrow: 1, minWidth: 150 }}
                        />
                      </Box>

                      {/* Date & Time */}
                      <LocalizationProvider dateAdapter={AdapterDateFns}>
                        <MobileDateTimePicker
                          label="Resource/Event Date & Time"
                          value={form.resourceDate}
                          onChange={(newValue) => setForm({ ...form, resourceDate: newValue })}
                          slotProps={{ textField: { fullWidth: true } }}
                        />
                      </LocalizationProvider>
                    </Stack>
                  </Box>

                  <Divider />

                  {/* Resource Type */}
                  <Box>
                    <Typography variant="subtitle1" mb={1} fontWeight={600}>
                      Resource Type
                    </Typography>
                    <RadioGroup
                      value={form.resourceType}
                      onChange={(e) => {
                        const v = e.target.value;
                        setForm({ ...form, resourceType: v });
                        if (v === "youtube") {
                          setVideoFile(null);
                          setThumbnailFile(null);
                        } else {
                          // Switching to video upload clears any YouTube link
                          setForm((s) => ({ ...s, youtubeUrl: "" }));
                        }
                      }}
                    >
                      <FormControlLabel value="youtube" control={<Radio />} label="YouTube Link" />
                      <FormControlLabel value="video" control={<Radio />} label="Upload Video" />
                    </RadioGroup>
                  </Box>

                  <Divider />

                  {/* Video / YouTube Inputs */}
                  <Box>
                    <Typography variant="subtitle1" mb={1} fontWeight={600}>
                      {form.resourceType === "youtube" ? "YouTube" : "Video Upload"}
                    </Typography>

                    {form.resourceType === "youtube" ? (
                      <Stack spacing={1.5}>
                        <TextField
                          label="YouTube URL"
                          value={form.youtubeUrl}
                          onChange={(e) => setForm({ ...form, youtubeUrl: e.target.value })}
                          fullWidth
                          placeholder="https://www.youtube.com/watch?v=..."
                        />

                        {/* Optional related files for YouTube */}
                        <Button
                          variant="outlined"
                          component="label"
                          startIcon={<UploadFileIcon />}
                          sx={{ py: 1, borderRadius: 2 }}
                        >
                          {attachmentFiles.length > 0
                            ? `${attachmentFiles.length} files selected`
                            : "Add Related Files (optional, max 5, 10MB each)"}
                          <input
                            hidden
                            type="file"
                            multiple
                            accept="image/*,application/pdf,.doc,.docx,.txt"
                            onChange={handleAttachmentChange}
                          />
                        </Button>
                        {attachmentFiles.length > 0 && (
                          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                            {attachmentFiles.map((file, index) => (
                              <Chip
                                key={index}
                                label={file.name}
                                onDelete={() => removeAttachment(index)}
                                color="primary"
                                size="small"
                              />
                            ))}
                          </Box>
                        )}
                        <Typography variant="caption" color="text.secondary">
                          Upload handouts, PDFs or related files for this YouTube video (optional).
                        </Typography>
                      </Stack>
                    ) : (
                      <Stack spacing={1.5}>
                        <Button variant="outlined" component="label" startIcon={<VideoFileIcon />} sx={{ py: 1, borderRadius: 2 }}>
                          {videoFile ? videoFile.name : editResourceId ? "Replace Video (optional)" : "Choose Video (mp4, webm etc., max 100MB)"}
                          <input hidden type="file" accept="video/*" onChange={(e) => setVideoFile(e.target.files?.[0] || null)} />
                        </Button>
                        <Button variant="outlined" component="label" startIcon={<ImageIcon />} sx={{ py: 1, borderRadius: 2 }}>
                          {thumbnailFile ? thumbnailFile.name : editResourceId ? "Replace Thumbnail (optional)" : "Choose Thumbnail (image, max 5MB)"}
                          <input hidden type="file" accept="image/*" onChange={(e) => setThumbnailFile(e.target.files?.[0] || null)} />
                        </Button>
                        <Button variant="outlined" component="label" startIcon={<UploadFileIcon />} sx={{ py: 1, borderRadius: 2 }}>
                          {attachmentFiles.length > 0
                            ? `${attachmentFiles.length} files selected`
                            : editResourceId
                            ? "Replace Attachments (optional)"
                            : "Add Related Files (max 5, 10MB each)"}
                          <input
                            hidden
                            type="file"
                            multiple
                            accept="image/*,application/pdf,.doc,.docx,.txt"
                            onChange={handleAttachmentChange}
                          />
                        </Button>
                        {attachmentFiles.length > 0 && (
                          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                            {attachmentFiles.map((file, index) => (
                              <Chip key={index} label={file.name} onDelete={() => removeAttachment(index)} color="primary" size="small" />
                            ))}
                          </Box>
                        )}
                        {editResourceId && (editOriginal?.attachments?.length ?? 0) > 0 && attachmentFiles.length === 0 && (
                          <Typography variant="caption" color="text.secondary">
                            Existing attachments will be kept. Choose new files to replace them.
                          </Typography>
                        )}
                      </Stack>
                    )}
                  </Box>

                  {error && <FormHelperText error>{error}</FormHelperText>}
                  {uploading && (
                    <Stack spacing={1}>
                      <LinearProgress variant="determinate" value={progress} sx={{ borderRadius: 2 }} />
                      <Typography variant="caption" color="text.secondary">
                        Uploading {progress}%
                      </Typography>
                    </Stack>
                  )}

                  {/* Actions */}
                  <Stack direction="row" justifyContent="flex-end" spacing={1.5}>
                    <Button
                      variant="outlined"
                      onClick={() => {
                        setEditResourceId(null);
                        setEditOriginal(null);
                        resetForm();
                      }}
                      disabled={uploading}
                      sx={{ borderRadius: 2 }}
                    >
                      {editResourceId ? "Cancel" : "Reset"}
                    </Button>
                    <Button type="submit" variant="contained" disabled={uploading} sx={{ borderRadius: 2, px: 3 }}>
                      {editResourceId ? "Save Changes" : "Upload Resource"}
                    </Button>
                  </Stack>
                </Stack>
              </form>
            </Stack>
          </Paper>
        )}

        {/* My Resources: Using a responsive Stack (2 per row on sm+, 1 on mobile) */}
        {activeTab === "mine" && (
          <Paper elevation={4} sx={{ p: { xs: 2, md: 3 }, borderRadius: 3 }}>
            <Typography variant="h6" fontWeight={600} mb={2} color="primary" textAlign="center">
              My E-Resources
            </Typography>
            {myResources.length === 0 ? (
              <Typography color="text.secondary" textAlign="center">
                You haven’t uploaded any resources yet.
              </Typography>
            ) : (
              <Stack direction="row" flexWrap="wrap" spacing={2} useFlexGap sx={{ justifyContent: "center" }}>
                {myResources.map((resource) => (
                  <Box
                    key={resource.id}
                    sx={{
                      width: { xs: "100%", sm: "calc(50% - 8px)" },
                      mb: 2,
                    }}
                  >
                    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.25 }}>
                      <ResourceCard
                        resource={resource}
                        showDelete
                        showEdit
                        onDelete={handleDelete}
                        onEdit={handleEdit}
                      />
                    </motion.div>
                  </Box>
                ))}
              </Stack>
            )}
          </Paper>
        )}

        {/* View Resources: replaced with the reusable EResourcesViewer component */}
        {activeTab === "view" && (
          <EResourcesViewer role="generic" />
        )}
      </Stack>
    </Container>
  );
}

CollegeResources.propTypes = {};
