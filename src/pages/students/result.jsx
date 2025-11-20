/* eslint-disable no-unused-vars */
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Container, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Box, CircularProgress, Alert, Card, CardContent, Grid, Modal, LinearProgress,
  Button, Chip, Stack, FormControl, InputLabel, Select, MenuItem, Divider, IconButton,
  Tooltip, useTheme
} from "@mui/material";
import {
  Subject as SubjectIcon,
  Refresh as RefreshIcon, History as HistoryIcon,
} from "@mui/icons-material";
import { auth } from "../../firebase/Firebase";
import StudentHeader from "../../components/StudentHeader";
import SecondaryHeader from "../../components/secondaryHeader";
import { HeaderBackButton } from "../../components/header";

const NS = "erp";
const VER = "v1";
const key = (uid, name) => `${NS}:${uid}:${name}:${VER}`;
const parseCache = (raw) => {
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
};

// Normalize scores to /100 
const computeSubjectOutOf100 = (scoresMap) => {
  if (!scoresMap) return { totalObtained: 0, totalMax: 0, outOf100: 0 };
  let totalObtained = 0;
  let totalMax = 0;
  Object.keys(scoresMap).forEach((k) => {
    const comp = scoresMap[k];
    if (!comp) return;
    const obtained = typeof comp.obtained === 'number' ? comp.obtained : 0;
    const max = typeof comp.max === 'number' ? comp.max : 0;
    totalObtained += obtained;
    totalMax += max;
  });
  const outOf100 = totalMax > 0 ? Math.round((totalObtained / totalMax) * 100) : 0;
  return { totalObtained, totalMax, outOf100 };
};

const Results = () => {
  const theme = useTheme();
  const [student, setStudent] = useState(null); // merged student object from local cache
  const [currentSemester, setCurrentSemester] = useState(null);
  const [subjectResults, setSubjectResults] = useState([]);
  const [availableSemesters, setAvailableSemesters] = useState([]);
  const [selectedViewSemester, setSelectedViewSemester] = useState('current');
  const [publishStatus, setPublishStatus] = useState(null);
  const [previewStatus, setPreviewStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError] = useState(null);
  const [openSubjectModal, setOpenSubjectModal] = useState(false);
  const [modalSubject, setModalSubject] = useState(null);
  const [sortBy, setSortBy] = useState('default');
  const [showInfoBanner, setShowInfoBanner] = useState(false);
  const [showPreviewBanner, setShowPreviewBanner] = useState(false);

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

  const readMergedStudentFromLocal = () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return null;
    const mergedRaw = localStorage.getItem(key(uid, "student"));
    const mergedEntry = parseCache(mergedRaw);
    const merged = mergedEntry?.v || null;
    if (merged) return merged;
    const legacyRaw = localStorage.getItem(`userDetails_${uid}`);
    try { return legacyRaw ? JSON.parse(legacyRaw) : null; } catch { return null; }
  };

  useEffect(() => {
    fetchResults();
  }, [selectedViewSemester]);

  const fetchResults = async () => {
    try {
      setLoading(true);
      setError(null);
      setLoadingStep('Loading student profile...');

      const user = auth.currentUser;
      if (!user) {
        setError("Please log in to view results.");
        setLoading(false);
        return;
      }

      const merged = readMergedStudentFromLocal();
      if (!merged) {
        setError("Student data not found locally. Please re-login.");
        setLoading(false);
        return;
      }
      setStudent(merged);
      // get semester to view
      const semToView = selectedViewSemester === 'current'
        ? String(merged.Semester || "")
        : String(selectedViewSemester);
      setCurrentSemester(String(merged.Semester || ""));

      // Build available previous semesters list
      const curSemNum = parseInt(merged.Semester, 10);
      const prevSems = [];
      if (!Number.isNaN(curSemNum)) {
        for (let i = 1; i < curSemNum; i++) prevSems.push(String(i));
      }
      setAvailableSemesters(prevSems);

      // Checking publish and preview visibility first
      setLoadingStep('Checking result visibility...');
      const statusParams = {
        collegeId: merged.collegeId,
        departmentId: merged.Department,
        programId: merged.Program || merged.program,
        semester: semToView
      };

      const [pubRes, prevRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/results/publish-status`, { params: statusParams }),
        axios.get(`${API_BASE_URL}/api/results/publish-preview-status`, { params: statusParams })
      ]);

      setPublishStatus(pubRes.data || { published: false });
      setPreviewStatus(prevRes.data || { previewPublished: false });

      const isVisible = (pubRes.data && pubRes.data.published) ||
                        (prevRes.data && prevRes.data.previewPublished);

      if (!isVisible) {
        setSubjectResults([]);
        setLoading(false);
        setLoadingStep('');
        return;
      }

      // Load subjects for program + semester
      setLoadingStep('Loading subjects for this semester...');
      const programForSubjects = merged.Program || merged.program;
      const subjectsRes = await axios.get(`${API_BASE_URL}/api/programs/${programForSubjects}/semesters/${semToView}/subjects`);
      const subjectList = subjectsRes.data || [];

      // For each subject, get marks map and extract only current student's scores
      setLoadingStep('Loading subject-wise results...');
      const resultsForSubjects = [];
      const studentId = String(merged?._academic?._id || "");
      for (const subj of subjectList) {
        const marksRes = await axios.get(`${API_BASE_URL}/api/results/student-marks`, {
          params: {
            collegeId: merged.collegeId,
            program: programForSubjects,
            semester: semToView,
            subject: subj._id
          }
        });

        const subjectScoresMap = studentId ? (marksRes.data?.studentMarks?.[studentId] || {}) : {};
        const { totalObtained, totalMax, outOf100 } = computeSubjectOutOf100(subjectScoresMap);

        resultsForSubjects.push({
          subjectId: subj._id,
          subjectName: subj.subjectName,
          scores: subjectScoresMap,
          totalObtained,
          totalMax,
          outOf100
        });
      }

      setSubjectResults(resultsForSubjects);
    } catch (err) {
      setError("Failed to fetch results. " + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  const handleRefresh = () => {
    fetchResults();
  };

  const handleOpenSubject = (subject) => {
    setModalSubject(subject);
    setOpenSubjectModal(true);
  };

  const handleCloseSubject = () => {
    setOpenSubjectModal(false);
    setModalSubject(null);
  };

  const getSemesterDisplayText = () => {
    if (selectedViewSemester === 'current') return `Current Semester (${currentSemester})`;
    return `Semester ${selectedViewSemester}`;
  };

  // Overall semester percentage
  const overallStats = useMemo(() => {
    const sumObtained = subjectResults.reduce((acc, s) => acc + (s.totalObtained || 0), 0);
    const sumMax = subjectResults.reduce((acc, s) => acc + (s.totalMax || 0), 0);
    const percent = sumMax > 0 ? ((sumObtained / sumMax) * 100).toFixed(1) : '0.0';
    return { sumObtained, sumMax, percent };
  }, [subjectResults]);

  const getScoreColor = (val) => {
    const pct = Number(val);
    if (Number.isNaN(pct)) return theme.palette.text.secondary;
    if (pct < 45) return theme.palette.error.main;
    if (pct < 75) return theme.palette.warning.main;
    return theme.palette.success.main;
  };

  // Sorting
  const sortedSubjects = useMemo(() => {
    const arr = [...subjectResults];
    switch (sortBy) {
      case 'name':
        arr.sort((a, b) => a.subjectName.localeCompare(b.subjectName));
        break;
      case 'score':
        arr.sort((a, b) => b.outOf100 - a.outOf100);
        break;
      default:
        break;
    }
    return arr;
  }, [subjectResults, sortBy]);

  const isPublished = !!publishStatus?.published;
  const isPreview = !!previewStatus?.previewPublished;
  const notVisible = !isPublished && !isPreview;

  useEffect(() => {
    setShowInfoBanner(notVisible);
    if (notVisible) {
      const t = setTimeout(() => setShowInfoBanner(false), 10000);
      return () => clearTimeout(t);
    }
  }, [notVisible]);

  useEffect(() => {
    const activePreview = !notVisible && isPreview && !isPublished;
    setShowPreviewBanner(activePreview);
    if (activePreview) {
      const t = setTimeout(() => setShowPreviewBanner(false), 10000);
      return () => clearTimeout(t);
    }
  }, [notVisible, isPreview, isPublished]);

  if (loading) {
    return (
      <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" minHeight="100vh" sx={{ bgcolor: theme.palette.background.default }}>
        <CircularProgress size={60} />
        <Typography sx={{ mt: 2 }} variant="h6" color="text.secondary">
          {loadingStep || 'Loading results...'}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ backgroundColor: theme.palette.background.default, minHeight: "100vh", py: 4 }}>
      <Container maxWidth="xl">
        <SecondaryHeader
          title="Results Dashboard"
          leftArea={
            <HeaderBackButton />
          }
          rightArea={
            <Stack direction="row" spacing={2} alignItems="center">
              <FormControl size="small" sx={{ maxWidth:{xs:"50%", md:"500px"} }}>
                <InputLabel>View Semester</InputLabel>
                <Select
                  value={selectedViewSemester}
                  label="View Semester"
                  onChange={(e) => setSelectedViewSemester(e.target.value)}
                  startAdornment={<HistoryIcon sx={{ mr: 1 }} />}
                >
                  <MenuItem value="current">Current Semester</MenuItem>
                  {availableSemesters.map((sem) => (
                    <MenuItem key={sem} value={sem}>
                      Semester {sem} (Previous)
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Tooltip title="Refresh Data">
                <IconButton
                  onClick={handleRefresh}
                  color="primary"
                  sx={{ bgcolor: theme.palette.background.paper, boxShadow: 1 }}
                >
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
            </Stack>
          }
        />

        {/* Banners */}
        {notVisible && showInfoBanner && (
          <Alert severity="info" sx={{ mb: 3, borderRadius: 2 }}>
            Results for {getSemesterDisplayText()} are not yet available. Please check back later when the college publishes or previews the results.
          </Alert>
        )}

        {!notVisible && isPreview && !isPublished && showPreviewBanner && (
          <Alert severity="warning" sx={{ mb: 3, borderRadius: 2 }}>
            Preview results are visible for {getSemesterDisplayText()}. These are not final and may change before publication.
          </Alert>
        )}

        {/* Error */}
        {error && <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>{error}</Alert>}

        {/* Student header */}
        {!error && student && (
          <StudentHeader />
        )}

        {/* Hide analytics/cards if not visible yet */}
        {!notVisible && (
          <>
            {/* Overall Results Summary */}
            <Card sx={{ mb: 3, borderRadius: 2, boxShadow: 3 }}>
              <CardContent>
                <Typography variant="h6" fontWeight="bold" gutterBottom>
                  Overall Semester Summary
                </Typography>
                <Grid container spacing={3} alignItems="center">
                  <Grid item xs={12} md={6}>
                    <Typography variant="h4" fontWeight="bold" color="primary.main">
                      {overallStats.percent}%
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={parseFloat(overallStats.percent) || 0}
                      sx={{
                        height: 12,
                        borderRadius: 6,
                        mt: 1,
                        '& .MuiLinearProgress-bar': {
                          backgroundColor: getScoreColor(overallStats.percent)
                        }
                      }}
                    />
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      Computed from total {overallStats.sumObtained} of {overallStats.sumMax} marks across all subjects
                    </Typography>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Stack direction="row" spacing={2} flexWrap="wrap" justifyContent={{ xs: "flex-start", md: "flex-end" }}>
                      <Chip label={`Total Obtained: ${overallStats.sumObtained}`} color="success" variant="outlined" />
                      <Chip label={`Total Max: ${overallStats.sumMax}`} color="primary" variant="outlined" />
                      {isPreview && !isPublished && (
                        <Chip label="Preview" color="warning" variant="filled" />
                      )}
                      {isPublished && (
                        <Chip label="Published" color="success" variant="filled" />
                      )}
                    </Stack>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>

            {/* Controls */}
            {subjectResults.length > 0 && (
              <Card sx={{ mb: 3, borderRadius: 2, boxShadow: 3 }}>
                <CardContent>
                  <Typography variant="h6" fontWeight="bold" gutterBottom>
                    Sort Subjects
                  </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    <Button
                      size="small"
                      onClick={() => setSortBy('default')}
                      variant={sortBy === 'default' ? 'contained' : 'outlined'}
                    >
                      Default
                    </Button>
                    <Button
                      size="small"
                      onClick={() => setSortBy('name')}
                      variant={sortBy === 'name' ? 'contained' : 'outlined'}
                    >
                      Name
                    </Button>
                    <Button
                      size="small"
                      onClick={() => setSortBy('score')}
                      variant={sortBy === 'score' ? 'contained' : 'outlined'}
                    >
                      Score
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            )}

            {/* Subject-wise Results */}
            <>
              <Typography variant="h5" fontWeight="bold" gutterBottom sx={{ mb: 3 }}>
                Subject-wise Results - {getSemesterDisplayText()}
              </Typography>

              {subjectResults.length === 0 ? (
                <Alert severity="info" sx={{ borderRadius: 2 }}>
                  {selectedViewSemester === 'current'
                    ? "No result components have been published yet for the current semester."
                    : `No results found for Semester ${selectedViewSemester}.`
                  }
                </Alert>
              ) : (
                <Grid container spacing={3} sx={{ mb: 4 }}>
                  {sortedSubjects.map((subject) => (
                    <Grid item xs={12} sm={6} md={4} lg={3} key={subject.subjectId}>
                      <Card
                        sx={{
                          backgroundColor: theme.palette.background.paper,
                          boxShadow: 3,
                          borderRadius: 3,
                          textAlign: "center",
                          p: 3,
                          cursor: "pointer",
                          minWidth:{md:"30vw", xs:"90vw"},
                          transition: "all 0.3s ease-in-out",
                          border: `2px solid ${getScoreColor(subject.outOf100)}`,
                          "&:hover": {
                            transform: "translateY(-4px)",
                            boxShadow: 8
                          }
                        }}
                        onClick={() => handleOpenSubject(subject)}
                      >
                        <Box sx={{ position: 'relative', display: 'inline-flex', mb: 2 }}>
                          <CircularProgress
                            variant="determinate"
                            value={subject.outOf100}
                            size={100}
                            thickness={4}
                            sx={{ color: getScoreColor(subject.outOf100) }}
                          />
                          <Box
                            sx={{
                              position: 'absolute',
                              inset: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexDirection: 'column'
                            }}
                          >
                            <Typography
                              variant="h6"
                              fontWeight="bold"
                              sx={{ color: getScoreColor(subject.outOf100) }}
                            >
                              {subject.outOf100}%
                            </Typography>
                          </Box>
                        </Box>

                        <Typography variant="h6" sx={{ fontWeight: "bold", color: "text.primary", mb: 1 }}>
                          {subject.subjectName}
                        </Typography>

                        <Stack direction="row" justifyContent="center" spacing={1}>
                          <Chip label={`${subject.totalObtained}/${subject.totalMax}`} size="small" color="primary" />
                        </Stack>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              )}
            </>

            {/* Subject Details Modal */}
            <Modal open={openSubjectModal} onClose={handleCloseSubject}>
              <Paper
                sx={{
                  position: "absolute",
                  top: "50%",
                  left: {xs: "45%", md: "50%"},
                  transform: "translate(-50%, -50%)",
                  width: { xs: "95%", sm: "80%", md: "70%" },
                  maxWidth: "90vw",
                  bgcolor: theme.palette.background.paper,
                  borderRadius: "16px",
                  boxShadow: 24,
                  p: 4,
                  maxHeight: "80vh",
                  overflowY: "auto",
                }}
              >
                {modalSubject && (
                  <>
                    <Typography variant="h5" fontWeight="bold" gutterBottom color="primary.main" sx={{ mb: 3 }}>
                      <SubjectIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                      {modalSubject.subjectName} - Detailed Scores ({getSemesterDisplayText()})
                    </Typography>

                    <TableContainer component={Paper}>
                      <Table>
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ fontWeight: "bold", bgcolor: theme.palette.background.default }}>Component</TableCell>
                            <TableCell sx={{ fontWeight: "bold", bgcolor: theme.palette.background.default }}>Obtained</TableCell>
                            <TableCell sx={{ fontWeight: "bold", bgcolor: theme.palette.background.default }}>Max</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {[
                            { key: 'midSem', label: 'Mid Semester' },
                            { key: 'endSem', label: 'End Semester' },
                            { key: 'attendance', label: 'Attendance' },
                            { key: 'practical', label: 'Practical' },
                            { key: 'assignment1', label: 'Assignment 1' },
                            { key: 'assignment2', label: 'Assignment 2' },
                            { key: 'internal', label: 'Internal Assessment' }
                          ].map((row) => {
                            const sc = modalSubject.scores?.[row.key] || { obtained: null, max: 0 };
                            const obtained = sc.obtained ?? '-';
                            const max = sc.max ?? 0;
                            return (
                              <TableRow key={row.key} hover>
                                <TableCell>{row.label}</TableCell>
                                <TableCell>{obtained}</TableCell>
                                <TableCell>{max}</TableCell>
                              </TableRow>
                            );
                          })}
                          <TableRow>
                            <TableCell sx={{ fontWeight: 'bold' }}>Subject Total (Normalized)</TableCell>
                            <TableCell colSpan={2} sx={{ fontWeight: 'bold' }}>
                              {modalSubject.outOf100}% (from {modalSubject.totalObtained}/{modalSubject.totalMax})
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </>
                )}
              </Paper>
            </Modal>
          </>
        )}
      </Container>
    </Box>
  );
};

export default Results;