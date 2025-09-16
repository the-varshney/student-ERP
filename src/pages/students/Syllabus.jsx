/* eslint-disable no-unused-vars */
import React, { useEffect, useMemo, useState, useCallback } from "react";
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
  Alert,
  Paper,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import RefreshIcon from "@mui/icons-material/Refresh";
import { auth, db } from "../../firebase/Firebase";
import { doc, getDoc, collection, getDocs, query, where } from "firebase/firestore";

const toInt = (v) => {
  const n = Number(v);
  if (Number.isFinite(n)) return n;
  const parsed = parseInt(String(v ?? "").replace(/\D/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
};
const computeDefaultAY = () => {
  const now = new Date();
  const y = now.getFullYear();
  return `${y}-${y + 1}`;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export default function StudentSyllabus() {
  // Student data
  const [studentFirebaseData, setStudentFirebaseData] = useState(null);
  const [studentMongo, setStudentMongo] = useState(null);
  // Context
  const [academicYear, setAcademicYear] = useState(computeDefaultAY());
  const [syllabusDoc, setSyllabusDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [inlineMsg, setInlineMsg] = useState("");
  const [error, setError] = useState("");

  // Auth headers for API calls
  const getAuthHeaders = useCallback(async () => {
    const headers = { "Content-Type": "application/json", Accept: "application/json" };
    const user = auth.currentUser;
    if (user) headers["Authorization"] = `Bearer ${await user.getIdToken()}`;
    return headers;
  }, []);

  const init = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      setInlineMsg("");

      const user = auth.currentUser;
      if (!user) {
        setError("Not authenticated.");
        setLoading(false);
        return;
      }

      // Load student profile from Firebase
      const stuSnap = await getDoc(doc(db, "Students", user.uid));
      if (!stuSnap.exists()) {
        setError("Student profile not found in Firebase.");
        setLoading(false);
        return;
      }
      const fb = stuSnap.data();
      setStudentFirebaseData(fb);

      // 2) Load student academic details from MongoDB
      const mongoRes = await axios.get(`${API_BASE_URL}/api/students/${fb.firebaseId}`, {
        headers: await getAuthHeaders(),
      });
      const mongo = mongoRes.data;
      setStudentMongo(mongo);

      // Program and Semester derived from fb + mongo
      const programId = String(fb.program || "");
      const semester = toInt(mongo?.semester);

      if (!programId || !semester) {
        setInlineMsg("Missing program or semester in student profile.");
        setSyllabusDoc(null);
        setLoading(false);
        return;
      }

      //Fetch latest syllabus doc for this AY + program + semester from Firestore
      const qRef = query(
        collection(db, "Syllabus"),
        where("academicYear", "==", String(academicYear)),
        where("programId", "==", String(programId)),
        where("semester", "==", Number(semester))
      );
      const snap = await getDocs(qRef);
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      let latest = null;
      for (const r of rows) {
        if (!latest) {
          latest = r;
        } else {
          const ta = r.updatedAt?.toMillis ? r.updatedAt.toMillis() : 0;
          const tb = latest.updatedAt?.toMillis ? latest.updatedAt.toMillis() : 0;
          if (ta > tb) latest = r;
        }
      }
      setSyllabusDoc(latest || null);

      if (!latest) {
        setInlineMsg("No syllabus uploaded yet for the current academic year.");
      }
    } catch (e) {
      console.error(e);
      setError(e?.response?.data?.error || e.message || "Failed to load syllabus.");
    } finally {
      setLoading(false);
    }
  }, [API_BASE_URL, academicYear, getAuthHeaders]);

  useEffect(() => {
    init();
  }, [init]);

  const pdfUrl = syllabusDoc?.storage?.url || "";
  const programDisplay = useMemo(() => {
    return studentFirebaseData?.program || "-";
  }, [studentFirebaseData]);

  const semesterDisplay = useMemo(() => {
    return studentMongo?.semester != null ? String(studentMongo.semester) : "-";
  }, [studentMongo]);

  return (
    <Box sx={{ backgroundColor: "#f5f6fa", minHeight: "100vh", py: 3 }}>
      <Container maxWidth="xl">
        {/* Header */}
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
            Syllabus
          </Typography>
          <IconButton onClick={init} color="primary" sx={{ bgcolor: "white", boxShadow: 1 }}>
            <RefreshIcon />
          </IconButton>
        </Box>

        {studentFirebaseData && (
          <Card sx={{ mb: 2, borderRadius: 3, boxShadow: "0 8px 24px rgba(0,0,0,0.06)" }}>
            <CardContent>
              <Grid container spacing={2} alignItems="center">
                <Grid item xs>
                  <Typography variant="h6" fontWeight="bold">
                    {studentFirebaseData.firstName} {studentFirebaseData.lastName}
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: "wrap", gap: 1 }}>
                    <Chip
                      label={`College: ${studentFirebaseData.collegeId || "-"}`}
                      variant="outlined"
                      color="primary"
                      sx={{ bgcolor: "white" }}
                    />
                    <Chip
                      label={`Program: ${programDisplay}`}
                      variant="outlined"
                      color="primary"
                      sx={{ bgcolor: "white" }}
                    />
                    <Chip
                      label={`Semester: ${semesterDisplay}`}
                      variant="outlined"
                      color="primary"
                      sx={{ bgcolor: "white" }}
                    />
                    <Chip
                      label={`AY: ${academicYear}`}
                      variant="outlined"
                      color="secondary"
                      sx={{ bgcolor: "white" }}
                    />
                    {syllabusDoc?.status === "DRAFT" && (
                      <Chip
                        label="Draft"
                        color="warning"
                        variant="filled"
                        sx={{ fontWeight: 600 }}
                      />
                    )}
                  </Stack>
                </Grid>
                <Grid item>
                  {pdfUrl && (
                    <Button
                      variant="contained"
                      startIcon={<DownloadIcon />}
                      component="a"
                      href={pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={syllabusDoc?.storage?.fileName || `syllabus_sem_${semesterDisplay}.pdf`}
                    >
                      Download
                    </Button>
                  )}
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        )}

        {inlineMsg && (
          <Alert severity="info" sx={{ mb: 2 }}>
            {inlineMsg}
          </Alert>
        )}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Main Viewer Area */}
        <Paper
          elevation={0}
          variant="outlined"
          sx={{
            borderRadius: 3,
            overflow: "hidden",
            backgroundColor: "white",
            minHeight: "80vh",
          }}
        >
          {loading ? (
            <Box
              sx={{
                minHeight: "80vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <CircularProgress />
              <Typography>Loading syllabus…</Typography>
            </Box>
          ) : pdfUrl ? (
            <iframe
              src={pdfUrl}
              title="Syllabus PDF"
              width="100%"
              height="100%"
              style={{
                border: "none",
                minHeight: "80vh",
              }}
            />
          ) : (
            <Box
              sx={{
                minHeight: "40vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
                p: 6,
              }}
            >
              <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
                No syllabus available
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Once the syllabus is uploaded for this academic year, it will appear here automatically.
              </Typography>
            </Box>
          )}
        </Paper>
      </Container>
    </Box>
  );
}
