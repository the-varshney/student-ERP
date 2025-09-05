import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  Stack,
  Button,
  IconButton,
  CircularProgress,
  LinearProgress,
  Tooltip,
  Alert,
  Divider,
  TextField,
  Tabs,
  Tab,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Paper,
  TableContainer,
} from "@mui/material";
import {
  CloudUpload as UploadIcon,
  Download as DownloadIcon,
  Refresh as RefreshIcon,
  Assignment as AssignmentIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Policy as RulesIcon,
  Rule as RuleIcon,
} from "@mui/icons-material";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
dayjs.extend(relativeTime);
import { auth, db, storage } from "../../firebase/Firebase";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const TAB_KEYS = ["pending", "completed", "past"];

const StudentAssignments = () => {
  const [studentFirebaseData, setStudentFirebaseData] = useState(null);
  const [studentMongo, setStudentMongo] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Per-assignment UI state
  const [textAnswer, setTextAnswer] = useState({}); 
  const [uploading, setUploading] = useState({}); 
  const [progress, setProgress] = useState({}); 
  const [fileMeta, setFileMeta] = useState({}); 
  const [latestSubmission, setLatestSubmission] = useState({});

  const [activeTab, setActiveTab] = useState(0);
  const [selectedByTab, setSelectedByTab] = useState({
    pending: null,
    completed: null,
    past: null,
  });

  const nowISO = useMemo(() => dayjs().toISOString(), []);

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    try {
      setLoading(true);
      const user = auth.currentUser;
      if (!user) {
        setError("Not authenticated.");
        setLoading(false);
        return;
      }

      // Firebase (fb) student profile
      const stuDoc = await getDoc(doc(db, "Students", user.uid));
      if (!stuDoc.exists()) {
        setError("Student profile not found in Firebase.");
        setLoading(false);
        return;
      }
      const fb = stuDoc.data();
      setStudentFirebaseData(fb);

      // Academic details from MongoDB
      const mongoRes = await axios.get(`${API_BASE_URL}/api/students/${fb.firebaseId}`);
      setStudentMongo(mongoRes.data);

      //Firestore assignments filtered
      const assignmentsRef = collection(db, "assignments");
      const qA = query(
        assignmentsRef,
        where("collegeId", "==", fb.collegeId),
        where("program", "==", fb.program),
        where("semester", "==", Number(mongoRes.data.semester)),
        where("status", "==", "active")
      );
      const snap = await getDocs(qA);
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      list.sort((a, b) => {
        const aT = a.createdAt?.toMillis
          ? a.createdAt.toMillis()
          : a.createdAt
          ? new Date(a.createdAt).getTime()
          : 0;
        const bT = b.createdAt?.toMillis
          ? b.createdAt.toMillis()
          : b.createdAt
          ? new Date(b.createdAt).getTime()
          : 0;
        return bT - aT;
      });
      setAssignments(list);

      const subsByAssign = {};
      for (const a of list) {
        const subsRef = collection(db, "submissions");
        const qS = query(
          subsRef,
          where("assignmentId", "==", a.id),
          where("studentFirebaseId", "==", fb.firebaseId)
        );
        const sSnap = await getDocs(qS);
        let latest = null;
        sSnap.forEach((docSnap) => {
          const d = { id: docSnap.id, ...docSnap.data() };
          const dTime = dayjs(d.submittedAt || d.createdAt);
          const lTime = latest ? dayjs(latest.submittedAt || latest.createdAt) : null;
          if (!latest || dTime.isAfter(lTime)) {
            latest = d;
          }
        });
        if (latest) subsByAssign[a.id] = latest;
      }
      setLatestSubmission(subsByAssign);

      // Preselect latest item on each tab after initial loading
      setTimeout(() => {
        preselectFeatured("pending", list, subsByAssign);
        preselectFeatured("completed", list, subsByAssign);
        preselectFeatured("past", list, subsByAssign);
      }, 0);

      setError(null);
    } catch (err) {
      console.error(err);
      setError("Failed to load assignments: " + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const preselectFeatured = (tabKey, list, submissionsMap) => {
    const sections = partitionAssignments(list, submissionsMap);
    const arr = sections[tabKey] || [];
    const latest = arr[0] || null;
    setSelectedByTab((prev) => ({ ...prev, [tabKey]: latest?.id || null }));
  };

  const canSubmitBeforeDeadline = (deadlineISO) =>
    !deadlineISO ? true : dayjs(nowISO).isBefore(dayjs(deadlineISO));

  const getAcceptAttr = (assignment) => {
    const raw = (assignment.acceptedFileTypes || "").trim();
    return raw || "";
  };

  const extFromName = (name) => {
    const idx = name.lastIndexOf(".");
    if (idx === -1) return "";
    return name.slice(idx).toLowerCase();
  };

  const matchesAccepted = (file, acceptedListStr) => {
    if (!acceptedListStr) return true;
    const tokens = acceptedListStr
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (tokens.length === 0) return true;

    const fileExt = extFromName(file.name);
    const mime = (file.type || "").toLowerCase();

    for (const t of tokens) {
      const token = t.toLowerCase();
      if (token === "*/*") return true;

      if (token.endsWith("/*")) {
        const prefix = token.split("/")[0];
        if (mime.startsWith(prefix + "/")) return true;
      } else if (token.startsWith(".")) {
        if (fileExt === token) return true;
      } else if (token.includes("/")) {
        if (mime === token) return true;
      } else if (token.includes(".")) {
        const split = token.split(",").map((s) => s.trim());
        if (split.some((ext) => ext && ext === fileExt)) return true;
      }
    }
    return false;
  };

  const pickFile = (assignmentId) => {
    const el = document.getElementById(`file-input-${assignmentId}`);
    if (el) el.click();
  };

  const onFileSelected = async (assignment, e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;

    // file size validation
    const maxSizeMB = 25;
    if (file.size > maxSizeMB * 1024 * 1024) {
      setError(`File too large. Max ${maxSizeMB} MB.`);
      return;
    }

    // Check accepted types
    const acceptStr = getAcceptAttr(assignment);
    if (!matchesAccepted(file, acceptStr)) {
      setError(`This file type is not allowed. Allowed: ${acceptStr || "Any"}`);
      return;
    }

    try {
      setError(null);
      setUploading((p) => ({ ...p, [assignment.id]: true }));
      setProgress((p) => ({ ...p, [assignment.id]: 0 }));

      // Upload to firebase Storage
      const ts = Date.now();
      const safeName = file.name.replace(/\s+/g, "_");
      const storagePath = `submissions/${assignment.id}/${studentFirebaseData.firebaseId}/${ts}_${safeName}`;
      const storageRef = ref(storage, storagePath);
      const task = uploadBytesResumable(storageRef, file, {
        contentType: file.type,
        customMetadata: {
          assignmentId: assignment.id,
          studentId: studentFirebaseData.firebaseId,
          subjectId: assignment.subjectId,
        },
      });

      task.on(
        "state_changed",
        (snap) => {
          const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
          setProgress((p) => ({ ...p, [assignment.id]: pct }));
        },
        (err) => {
          console.error(err);
          setError("Upload failed: " + err.message);
          setUploading((p) => ({ ...p, [assignment.id]: false }));
        },
        async () => {
          const url = await getDownloadURL(task.snapshot.ref);
          setFileMeta((prev) => ({
            ...prev,
            [assignment.id]: {
              url,
              name: file.name,
              type: file.type,
              size: file.size,
              storagePath,
            },
          }));
          setUploading((p) => ({ ...p, [assignment.id]: false }));
          setProgress((p) => ({ ...p, [assignment.id]: 0 }));
        }
      );
    } catch (ex) {
      console.error(ex);
      setError("Unexpected upload error: " + ex.message);
      setUploading((p) => ({ ...p, [assignment.id]: false }));
      setProgress((p) => ({ ...p, [assignment.id]: 0 }));
    }
  };

  const submitResponse = async (assignment) => {
    try {
      const deadlineOK = canSubmitBeforeDeadline(assignment.deadline);
      if (!deadlineOK) {
        setError("Deadline has passed. Submission is closed.");
        return;
      }

      // rule for resubmission
      const hasPrev = !!latestSubmission[assignment.id];
      const allowResubmission =
        assignment.allowResubmission !== undefined ? assignment.allowResubmission : true;
      if (hasPrev && !allowResubmission) {
        setError("Resubmission is disabled for this assignment.");
        return;
      }

      // inputs
      const file = fileMeta[assignment.id] || null;
      const text = (textAnswer[assignment.id] || "").trim();

      const allowTextAnswer =
        assignment.allowTextAnswer !== undefined ? assignment.allowTextAnswer : true;
      const requireFileUpload =
        assignment.requireFileUpload !== undefined ? assignment.requireFileUpload : false;

      // enforce rules
      if (!allowTextAnswer && !file) {
        setError("Text answers are disabled. Please upload a file.");
        return;
      }
      if (requireFileUpload && !file) {
        setError("A file is required for this assignment.");
        return;
      }
      if (!file && !text) {
        setError("Please upload a file or write an answer before submitting.");
        return;
      }

      const payload = {
        assignmentId: assignment.id,
        title: assignment.title,
        subjectId: assignment.subjectId,
        subjectName: assignment.subjectName,
        teacherId: assignment.teacherId,
        teacherName: assignment.teacherName,

        collegeId: assignment.collegeId,
        program: assignment.program,
        semester: String(assignment.semester),

        studentFirebaseId: auth.currentUser?.uid,
        studentMongoId: studentMongo?._id,
        enrollmentNo: studentMongo?.enrollmentNo,
        studentName: `${studentFirebaseData.firstName} ${studentFirebaseData.lastName}`,

        textAnswer: allowTextAnswer ? text || null : null,
        fileUrl: file?.url || null,
        fileMeta: file
          ? {
              fileName: file.name,
              fileType: file.type,
              fileSize: file.size,
              storagePath: file.storagePath,
            }
          : null,

        maxMarks: assignment.maxMarks ?? null,
        isLate: dayjs().isAfter(dayjs(assignment.deadline)),
        status: "pending",
        submittedAt: new Date().toISOString(),
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, "submissions"), payload);

      setLatestSubmission((prev) => ({
        ...prev,
        [assignment.id]: payload,
      }));

      setTextAnswer((prev) => ({ ...prev, [assignment.id]: "" }));
      setFileMeta((prev) => ({ ...prev, [assignment.id]: null }));
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Failed to submit response: " + (err.response?.data?.error || err.message));
    }
  };

  // Partition assignments into sections for tabs
  const partitionAssignments = (list, subsMap) => {
    const pending = [];
    const completed = [];
    const past = [];
    for (const a of list) {
      const isOver = a.deadline ? dayjs().isAfter(dayjs(a.deadline)) : false;
      const hasSubmission = !!subsMap[a.id];
      if (isOver) past.push(a);
      else if (hasSubmission) completed.push(a);
      else pending.push(a);
    }
    return { pending, completed, past };
  };

  const derived = useMemo(
    () => partitionAssignments(assignments, latestSubmission),
    [assignments, latestSubmission]
  );

  const onSelectAssignment = (tabKey, assignmentId) => {
    setSelectedByTab((prev) => ({ ...prev, [tabKey]: assignmentId }));
  };

  const currentTabKey = TAB_KEYS[activeTab];

  const featuredAssignment = useMemo(() => {
    const arr = derived[currentTabKey] || [];
    if (arr.length === 0) return null;
    const selectedId = selectedByTab[currentTabKey];
    const selected =
      selectedId ? arr.find((a) => a.id === selectedId) : arr[0];
    return selected || arr[0] || null;
  }, [derived, selectedByTab, currentTabKey]);

  const otherAssignments = useMemo(() => {
    const arr = derived[currentTabKey] || [];
    if (!featuredAssignment) return arr;
    return arr.filter((a) => a.id !== featuredAssignment.id);
  }, [derived, currentTabKey, featuredAssignment]);

  const renderAssignmentDetails = (a) => {
    const isOver = a.deadline ? dayjs().isAfter(dayjs(a.deadline)) : false;
    return (
      <Stack spacing={1.6}>
        <Typography variant="h5" fontWeight="bold">
          {a.title}
        </Typography>
        <Typography variant="body1" color="text.secondary">
          {a.description || "No description"}
        </Typography>

        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary">
            Deadline
          </Typography>
          <Typography variant="body1">
            {a.deadline
              ? `${dayjs(a.deadline).format("DD MMM YYYY, HH:mm")} (${dayjs().to(a.deadline)})`
              : "N/A"}
          </Typography>
        </Stack>

        <Stack direction="row" spacing={6} flexWrap="wrap">
          <Stack>
            <Typography variant="body2" color="text.secondary">
              Max Marks
            </Typography>
            <Typography variant="body1">{a.maxMarks ?? "-"}</Typography>
          </Stack>
          <Stack>
            <Typography variant="body2" color="text.secondary">
              Teacher
            </Typography>
            <Typography variant="body1">{a.teacherName || "-"}</Typography>
          </Stack>
          <Stack>
            <Typography variant="body2" color="text.secondary">
              Subject
            </Typography>
            <Typography variant="body1">{a.subjectName || "-"}</Typography>
          </Stack>
          <Stack>
            <Typography variant="body2" color="text.secondary">
              Status
            </Typography>
            <Typography variant="body1" color={isOver ? "error.main" : "success.main"}>
              {isOver ? "Deadline Passed" : "Open"}
            </Typography>
          </Stack>
        </Stack>

        {a.resourceUrl && (
          <Stack direction="row" spacing={1}>
            <Button
              variant="text"
              startIcon={<DownloadIcon />}
              href={a.resourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              sx={{ textTransform: "none" }}
            >
              Download Resource
            </Button>
          </Stack>
        )}

        {/* Rules */}
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Chip
            size="small"
            icon={<RulesIcon />}
            label={(a.allowTextAnswer ?? true) ? "Text: Enabled" : "Text: Disabled"}
            variant="outlined"
            color={(a.allowTextAnswer ?? true) ? "success" : "default"}
          />
          <Chip
            size="small"
            icon={<RuleIcon />}
            label={(a.requireFileUpload ?? false) ? "File Required" : "File Optional"}
            variant="outlined"
            color={(a.requireFileUpload ?? false) ? "warning" : "default"}
          />
          <Chip
            size="small"
            label={(a.allowResubmission ?? true) ? "Resubmission ON" : "Resubmission OFF"}
            variant="outlined"
            color={(a.allowResubmission ?? true) ? "primary" : "default"}
          />
          {a.acceptedFileTypes && (
            <Chip size="small" label={`Allowed: ${a.acceptedFileTypes}`} variant="outlined" />
          )}
        </Stack>
      </Stack>
    );
  };

  const renderSubmissionArea = (a) => {
    const latest = latestSubmission[a.id];
    const allowedByTime = canSubmitBeforeDeadline(a.deadline);
    const allowResubmission = a.allowResubmission !== undefined ? a.allowResubmission : true;
    const allowTextAnswer = a.allowTextAnswer !== undefined ? a.allowTextAnswer : true;
    const requireFileUpload = a.requireFileUpload !== undefined ? a.requireFileUpload : false;
    const isUploading = uploading[a.id] || false;
    const pct = progress[a.id] || 0;
    const file = fileMeta[a.id];
    const acceptStr = getAcceptAttr(a);
    const resubAllowedNow = allowedByTime && (allowResubmission || !latest);

    return (
      <Stack spacing={1.5}>
        <Divider sx={{ my: 2 }} />

        {latest ? (
          <Alert
            icon={latest.isLate ? <WarningIcon /> : <CheckCircleIcon />}
            severity={latest.isLate ? "warning" : "success"}
            sx={{ mt: 1 }}
          >
            Last submitted: {dayjs(latest.submittedAt).format("DD MMM YYYY, HH:mm")}{" "}
            {latest.isLate ? "(Late)" : ""}
            {latest.fileMeta?.fileName ? ` • File: ${latest.fileMeta.fileName}` : ""}
            {latest.textAnswer ? " • Text Answer included" : ""}
          </Alert>
        ) : (
          <Alert severity="info" sx={{ mt: 1 }}>
            No submission yet.
          </Alert>
        )}

        {allowTextAnswer && (
          <TextField
            label={requireFileUpload ? "Write answer (optional, file required)" : "Write answer"}
            multiline
            minRows={4}
            value={textAnswer[a.id] || ""}
            onChange={(e) => setTextAnswer((p) => ({ ...p, [a.id]: e.target.value }))}
          />
        )}

        <input
          id={`file-input-${a.id}`}
          type="file"
          style={{ display: "none" }}
          accept={acceptStr || undefined}
          onChange={(e) => onFileSelected(a, e)}
        />

        {file ? (
          <Alert severity="success">Selected file: {file.name}</Alert>
        ) : (
          <Stack direction="row" spacing={1} alignItems="center">
            <Button
              variant="outlined"
              startIcon={<UploadIcon />}
              onClick={() => pickFile(a.id)}
              disabled={isUploading}
              sx={{ textTransform: "none", fontWeight: "bold" }}
            >
              Choose File
            </Button>
            {a.acceptedFileTypes && (
              <Typography variant="caption" color="text.secondary">
                Allowed: {a.acceptedFileTypes}
              </Typography>
            )}
          </Stack>
        )}

        {isUploading && (
          <Box sx={{ mt: 1 }}>
            <LinearProgress variant="determinate" value={pct} sx={{ height: 10, borderRadius: 2 }} />
            <Typography variant="caption" color="text.secondary">
              Uploading… {pct}%
            </Typography>
          </Box>
        )}

        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button
            variant="contained"
            onClick={() => submitResponse(a)}
            disabled={!resubAllowedNow || isUploading}
            sx={{ textTransform: "none", fontWeight: "bold" }}
            startIcon={<UploadIcon />}
          >
            {!allowedByTime
              ? "Deadline Passed"
              : latest && !allowResubmission
              ? "Resubmission Disabled"
              : "Submit Response"}
          </Button>
          {latest && allowedByTime && allowResubmission && (
            <Chip size="small" label="Resubmission ON" color="primary" variant="outlined" />
          )}
        </Stack>
      </Stack>
    );
  };

  const renderFeaturedCard = (a) => {
    if (!a) return null;
    return (
      <Card sx={{ borderRadius: 3, boxShadow: "0 10px 36px rgba(0,0,0,0.10)" }}>
        <CardContent sx={{ p: { xs: 2.5, md: 3.5 }, maxWidth: '44vw', minWidth: {xs: '90vw', md: '44vw'} }}>
          {renderAssignmentDetails(a)}
          <Stack sx={{mt: 2,}}></Stack>
          {renderSubmissionArea(a)}
        </CardContent>
      </Card>
    );
  };

  const renderListTable = (list, tabKey) => {
    if (!list || list.length === 0) {
      return null;
    }
    return (
      <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 540, maxWidth: {xs: '90vw', md: '47vw'}}}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell>Title</TableCell>
              <TableCell>Subject</TableCell>
              <TableCell>Deadline</TableCell>
              <TableCell>Marks</TableCell>
              <TableCell>Teacher</TableCell>
              <TableCell align="right">Open</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {list.map((a) => {
              const isSelected = selectedByTab[tabKey] === a.id;
              return (
                <TableRow
                  key={a.id}
                  hover
                  selected={isSelected}
                  sx={{ cursor: "pointer" }}
                  onClick={() => onSelectAssignment(tabKey, a.id)}
                >
                  <TableCell>
                    <Typography variant="body2" fontWeight={600} noWrap title={a.title}>
                      {a.title}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary" noWrap title={a.subjectName}>
                      {a.subjectName}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {a.deadline ? dayjs(a.deadline).format("DD MMM, HH:mm") : "N/A"}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{a.maxMarks ?? "-"}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap title={a.teacherName}>
                      {a.teacherName}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Button variant="text" size="small">View</Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    );
  };

  if (loading) {
    return (
      <Box display="flex" minHeight="60vh" alignItems="center" justifyContent="center">
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Loading assignments…</Typography>
      </Box>
    );
  }

  // Determine if we have "other assignments" to show on right
  const hasOther = otherAssignments && otherAssignments.length > 0;

  return (
    <Box sx={{ backgroundColor: "#f5f5f5", minHeight: "100vh", py: 4 }}>
      <Container maxWidth="xl">
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            mb: 2,
            gap: 2,
            flexWrap: "wrap",
          }}
        >
          <Typography variant="h4" fontWeight="bold" color="primary.main">
            Assignments
          </Typography>
          <Tooltip title="Refresh">
            <IconButton onClick={init} color="primary" sx={{ bgcolor: "white", boxShadow: 1 }}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {/*header */}
        {studentFirebaseData && (
          <Card sx={{ mb: 3, bgcolor: "primary.main", color: "white" }}>
            <CardContent>
              <Grid container spacing={2} alignItems="center">
                <Grid item>
                  <AssignmentIcon fontSize="large" />
                </Grid>
                <Grid item xs>
                  <Typography variant="h6" fontWeight="bold">
                    {studentFirebaseData.firstName} {studentFirebaseData.lastName}
                  </Typography>
                  <Stack direction="row" sx={{ mt: 1, flexWrap: "wrap", gap: 2}}>
                    <Chip
                      label={`College: ${studentFirebaseData.collegeId}`}
                      sx={{ bgcolor: "white", color: "primary.main" }}
                      variant="outlined"
                    />
                    <Chip
                      label={`Program: ${studentFirebaseData.program}`}
                      sx={{ bgcolor: "white", color: "primary.main" }}
                      variant="outlined"
                    />
                    <Chip
                      label={`Semester: ${studentMongo?.semester ?? "N/A"}`}
                      sx={{ bgcolor: "white", color: "primary.main" }}
                      variant="outlined"
                    />
                    {studentMongo?.enrollmentNo && (
                      <Chip
                        label={`Enroll: ${studentMongo.enrollmentNo}`}
                        sx={{ bgcolor: "white", color: "primary.main" }}
                        variant="outlined"
                      />
                    )}
                  </Stack>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <Card sx={{ mb: 2 }}>
          <Tabs
            value={activeTab}
            onChange={(_, v) => setActiveTab(v)}
            variant="fullWidth"
            sx={{ "& .MuiTab-root": { textTransform: "none", fontWeight: 600 } }}
          >
            <Tab label="Pending" />
            <Tab label="Completed" />
            <Tab label="Past Deadline" />
          </Tabs>
        </Card>

        {/* Section layout: Featured left, optional list at right */}
        <Grid container spacing={3}>
          <Grid item xs={12} md={hasOther ? 7 : 12} lg={hasOther ? 8 : 12}>
            {featuredAssignment ? (
              renderFeaturedCard(featuredAssignment)
            ) : (
              <Alert severity="info">No assignments in this section.</Alert>
            )}
          </Grid>

          {hasOther && (
            <Grid item xs={12} md={5} lg={4}>
              <Card>
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 1 }}>
                    {currentTabKey === "pending"
                      ? "Other Pending Assignments"
                      : currentTabKey === "completed"
                      ? "Other Completed Assignments"
                      : "Other Past Assignments"}
                  </Typography>
                  {renderListTable(otherAssignments, currentTabKey)}
                </CardContent>
              </Card>
            </Grid>
          )}
        </Grid>
      </Container>
    </Box>
  );
};

export default StudentAssignments;
