/* eslint-disable no-unused-vars */
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Container,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Box,
  CircularProgress,
  Alert,
  Card,
  CardContent,
  Grid,
  Modal,
  LinearProgress,
  Button,
  Chip,
  Avatar,
  Stack,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  IconButton,
  Tooltip
} from "@mui/material";
import {
  CalendarToday as CalendarIcon,
  Person as PersonIcon,
  Subject as SubjectIcon,
  Email as EmailIcon,
  Badge as BadgeIcon,
  School as SchoolIcon,
  MenuBook as BookIcon,
  Refresh as RefreshIcon,
  History as HistoryIcon
} from "@mui/icons-material";
import { auth, db } from '../../firebase/Firebase';
import { doc, getDoc } from 'firebase/firestore';

// Helper to compute a normalized score out of 100 for a subject
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
  const [studentFirebaseData, setStudentFirebaseData] = useState(null);
  const [studentAcademic, setStudentAcademic] = useState(null);
  const [currentSemester, setCurrentSemester] = useState(null);
  const [subjectResults, setSubjectResults] = useState([]);
  const [availableSemesters, setAvailableSemesters] = useState([]);
  const [selectedViewSemester, setSelectedViewSemester] = useState('current');
  const [publishStatus, setPublishStatus] = useState(null); 
  const [previewStatus, setPreviewStatus] = useState(null);

  // UI/UX state
  const [loading, setLoading] = useState(true);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError] = useState(null);
  const [openSubjectModal, setOpenSubjectModal] = useState(false);
  const [modalSubject, setModalSubject] = useState(null); 
  const [sortBy, setSortBy] = useState('default');
  const [showInfoBanner, setShowInfoBanner] = useState(false);
const [showPreviewBanner, setShowPreviewBanner] = useState(false);

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

  useEffect(() => {
    fetchResults();
  }, [selectedViewSemester]);

  const fetchResults = async () => {
    try {
      setLoading(true);
      setError(null);
      setLoadingStep('Loading student profile from Firebase...');
      const user = auth.currentUser;
      if (!user) {
        setError("Please log in to view results.");
        setLoading(false);
        return;
      }

      // Firebase student doc 
      const studentDoc = await getDoc(doc(db, 'Students', user.uid));
      if (!studentDoc.exists()) {
        setError("Student Firebase profile not found.");
        setLoading(false);
        return;
      }
      const firebaseData = studentDoc.data();
      setStudentFirebaseData(firebaseData);

      // Academic data from Mongo (to get _id, program, semester, enrollmentNo, department)
      setLoadingStep('Loading academic details...');
      const acadRes = await axios.get(`${API_BASE_URL}/api/students/${firebaseData.firebaseId}`);
      const academic = acadRes.data;
      setStudentAcademic(academic);

      // Determine semester to view
      const semToView = selectedViewSemester === 'current'
        ? String(academic.semester)
        : String(selectedViewSemester);
      setCurrentSemester(String(academic.semester));

      // Build available previous semesters list
      const curSemNum = parseInt(academic.semester, 10);
      const prevSems = [];
      for (let i = 1; i < curSemNum; i++) prevSems.push(String(i));
      setAvailableSemesters(prevSems);

      // Check publish and preview visibility first
      setLoadingStep('Checking result visibility...');
      const statusParams = {
        collegeId: academic.collegeId || firebaseData.collegeId,
        departmentId: academic.department, 
        programId: academic.program, 
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
        // stop here with message
        setSubjectResults([]);
        setLoading(false);
        setLoadingStep('');
        return;
      }

      // Load subjects for program + semester
      setLoadingStep('Loading subjects for this semester...');
      const subjectsRes = await axios.get(`${API_BASE_URL}/api/programs/${academic.program}/semesters/${semToView}/subjects`);
      const subjectList = subjectsRes.data || [];

      // For each subject, get marks map and extract only current student's scores
      setLoadingStep('Loading subject-wise results...');
      const resultsForSubjects = [];
      for (const subj of subjectList) {
        const marksRes = await axios.get(`${API_BASE_URL}/api/results/student-marks`, {
          params: {
            collegeId: academic.collegeId || firebaseData.collegeId,
            program: academic.program,
            semester: semToView,
            subject: subj._id
          }
        });

        const studentId = String(academic._id);
        const subjectScoresMap = marksRes.data?.studentMarks?.[studentId] || {}; // {component: {obtained, max}}
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
      console.error('Error fetching results:', err);
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
    if (Number.isNaN(pct)) return '#757575';
    if (pct < 45) return '#F44336';
    if (pct < 75) return '#FF9800';
    return '#4CAF50';
  };

  // Subjects sorting 
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

  // Visibility banners
  const isPublished = !!publishStatus?.published;
  const isPreview = !!previewStatus?.previewPublished;
  const notVisible = !isPublished && !isPreview;

    useEffect(() => {
  setShowInfoBanner(notVisible);
  if (notVisible) {
    const t = setTimeout(() => setShowInfoBanner(false), 10000); // 10s
    return () => clearTimeout(t);
  }
}, [notVisible]);

useEffect(() => {
  // preview banner (isPreview && !isPublished)
  const activePreview = !notVisible && isPreview && !isPublished;
  setShowPreviewBanner(activePreview);
  if (activePreview) {
    const t = setTimeout(() => setShowPreviewBanner(false), 10000); // 10s
    return () => clearTimeout(t);
  }
}, [notVisible, isPreview, isPublished]);

  if (loading) {
    return (
      <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress size={60} />
        <Typography sx={{ mt: 2 }} variant="h6">
          {loadingStep || 'Loading results...'}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ backgroundColor: "#f5f5f5", minHeight: "100vh", py: 4 }}>
      <Container maxWidth="xl">
        {/* Header*/}
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, flexWrap: 'wrap', gap: 2 }}>
          <Typography variant="h4" fontWeight="bold" color="primary.main" component="h1">
            Results Dashboard
          </Typography>

          <Stack direction="row" spacing={2} alignItems="center">
            {/* Semester Selection */}
            <FormControl size="small" sx={{ minWidth: 220 }}>
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

            {/* Refresh Button */}
            <Tooltip title="Refresh Data">
              <IconButton
                onClick={handleRefresh}
                color="primary"
                sx={{ bgcolor: 'white', boxShadow: 1 }}
              >
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>

        {/* banners */}
        {notVisible && showInfoBanner && (
  <Alert severity="info" sx={{ mb: 3 }}>
    Results for {getSemesterDisplayText()} are not yet available. Please check back later when the college publishes or previews the results.
  </Alert>
)}

{!notVisible && isPreview && !isPublished && showPreviewBanner && (
  <Alert severity="warning" sx={{ mb: 3 }}>
    Preview results are visible for {getSemesterDisplayText()}. These are not final and may change before publication.
  </Alert>
)}

        {/* Error */}
        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

        {/* Student data Card */}
        {!error && studentFirebaseData && studentAcademic && (
          <Card sx={{ mb: 3, bgcolor: 'primary.main', color: 'white' }}>
            <CardContent>
              <Grid container spacing={3} justifyContent={'space-evenly'} sx={{ width: '100%', margin: 0 }}>
                <Grid item>
                  <Avatar
                    src={studentFirebaseData?.profilePicUrl}
                    sx={{ width: 80, height: 80, bgcolor: 'white', color: 'primary.main' }}
                  >
                    <PersonIcon fontSize="large" />
                  </Avatar>
                </Grid>
                <Grid item xs>
                  <Typography variant="h5" fontWeight="bold">
                    {studentFirebaseData?.firstName} {studentFirebaseData?.lastName}
                  </Typography>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} sx={{ mt: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <EmailIcon fontSize="small" />
                      <Typography variant="body1">{studentFirebaseData?.email}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <BadgeIcon fontSize="small" />
                      <Typography variant="body1">{studentAcademic?.enrollmentNo}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <SchoolIcon fontSize="small" />
                      <Typography variant="body1">{studentAcademic?.department?.departmentName || studentAcademic?.department}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <BookIcon fontSize="small" />
                      <Typography variant="body1">
                        {studentAcademic?.program?.programName || studentAcademic?.program} : {getSemesterDisplayText()}
                      </Typography>
                    </Box>
                  </Stack>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        )}

        {/* Hide analytics/cards if not visible yet */}
        {!notVisible && (
          <>
            {/* Overall Results Summary */}
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" fontWeight="bold" gutterBottom>
                  Overall Semester Summary
                </Typography>
                <Grid container spacing={3}>
                  <Grid item xs={12} md={8}>
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
                  <Box alignItems="flex-end" sx={{ bottom: "100%", display: 'flex', gap: 2, flexWrap: 'wrap', mt: 1, height: '13vh' }}>
                    <Chip label={`Total Obtained: ${overallStats.sumObtained}`} color="success" variant="outlined" />
                    <Chip label={`Total Max: ${overallStats.sumMax}`} color="primary" variant="outlined" />
                    {isPreview && !isPublished && (
                      <Chip label="Preview" color="warning" variant="filled" />
                    )}
                    {isPublished && (
                      <Chip label="Published" color="success" variant="filled" />
                    )}
                  </Box>
                </Grid>
              </CardContent>
            </Card>

            {/*controls */}
            {subjectResults.length > 0 && (
              <Card sx={{ mb: 3 }}>
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

            {/* Subject-wise Results Cards */}
            <>
              <Typography variant="h5" fontWeight="bold" gutterBottom sx={{ mb: 3 }}>
                Subject-wise Results - {getSemesterDisplayText()}
              </Typography>

              {subjectResults.length === 0 ? (
                <Alert severity="info">
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
                          backgroundColor: "#ffffff",
                          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
                          borderRadius: "16px",
                          textAlign: "center",
                          minWidth: { xs: '90vw', md: '60vh' },
                          p: 3,
                          cursor: "pointer",
                          transition: "all 0.3s ease-in-out",
                          border: `2px solid ${getScoreColor(subject.outOf100)}`,
                          "&:hover": {
                            transform: "translateY(-4px)",
                            boxShadow: "0 8px 24px rgba(134, 161, 202, 0.6)"
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
              <Box
                sx={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  width: { xs: "95%", sm: "80%", md: "70%" },
                  bgcolor: "background.paper",
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
                            <TableCell sx={{ fontWeight: "bold" }}>Component</TableCell>
                            <TableCell sx={{ fontWeight: "bold" }}>Obtained</TableCell>
                            <TableCell sx={{ fontWeight: "bold" }}>Max</TableCell>
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
              </Box>
            </Modal>
          </>
        )}
      </Container>
    </Box>
  );
};

export default Results;
