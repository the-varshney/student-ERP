/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useCallback, useContext } from "react";
import axios from "axios";
import {
  Container, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Box, CircularProgress, Alert, Card, CardContent, Grid, Modal, LinearProgress,
  Button, Chip, Stack, FormControl, InputLabel, Select, MenuItem, ToggleButton,
  ToggleButtonGroup, Divider, IconButton, Tooltip, useTheme
} from "@mui/material";
import {
  CalendarToday as CalendarIcon, Subject as SubjectIcon, Refresh as RefreshIcon,
  FilterList as FilterIcon, History as HistoryIcon, ArrowBack as ArrowBackIcon
} from "@mui/icons-material";
import { auth } from "../../firebase/Firebase";
import dayjs from "dayjs";
import StudentHeader from "../../components/StudentHeader";
import SecondaryHeader from "../../components/secondaryHeader";
import { HeaderBackButton } from "../../components/header";

const NS = "erp";
const VER = "v1";
const key = (uid, name) => `${NS}:${uid}:${name}:${VER}`;
const parseCache = (raw) => {
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
};

const Attendance = () => {
  const theme = useTheme();
  const [attendanceData, setAttendanceData] = useState([]);
  const [subjectStats, setSubjectStats] = useState([]);
  const [overallStats, setOverallStats] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const [openModal, setOpenModal] = useState(false);
  const [selectedSubjectData, setSelectedSubjectData] = useState([]);
  const [selectedSubjectName, setSelectedSubjectName] = useState("");
  const [openAllModal, setOpenAllModal] = useState(false);

  const [attendanceFilter, setAttendanceFilter] = useState("all");

  const [selectedViewSemester, setSelectedViewSemester] = useState("current");
  const [currentSemester, setCurrentSemester] = useState(null);
  const [availableSemesters, setAvailableSemesters] = useState([]);

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

  const readMergedStudentFromLocal = useCallback(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return { merged: null };
    const mergedRaw = localStorage.getItem(key(uid, "student"));
    const mergedEntry = parseCache(mergedRaw);
    const merged = mergedEntry?.v || null;
    return { merged: merged };
  }, []);

  const fetchAttendance = useCallback(async () => {
    try {
      setLoading(true);
      const user = auth.currentUser;
      if (!user) {
        setError("Please log in to view attendance.");
        setLoading(false);
        return;
      }
      const { merged } = readMergedStudentFromLocal();
      if (!merged) {
        setError("Student data not found locally. Please re-login.");
        setLoading(false);
        return;
      }

      const firebaseId = merged.firebaseId || user.uid;
      const url =
        selectedViewSemester === "current"
          ? `${API_BASE_URL}/api/attendance/student/${firebaseId}`
          : `${API_BASE_URL}/api/attendance/student/${firebaseId}/semester/${selectedViewSemester}`;

      const response = await axios.get(url);

      if (selectedViewSemester === "current") {
        setAttendanceData(response.data.attendanceRecords || []);
        setSubjectStats(response.data.subjectStats || []);
        setOverallStats(response.data.overallStats || null);
        const semStr = String(response?.data?.student?.semester || merged?.Semester || "");
        setCurrentSemester(semStr || null);
        const semNum = parseInt(semStr, 10);
        const prevSemesters = [];
        if (!Number.isNaN(semNum)) {
          for (let i = 1; i < semNum; i++) prevSemesters.push(i.toString());
        }
        setAvailableSemesters(prevSemesters);
      } else {
        setAttendanceData(response.data.attendanceRecords || []);
        setSubjectStats(response.data.subjectStats || []);
        setOverallStats(
          response.data.overallStats || { totalClasses: 0, totalPresent: 0, totalAbsent: 0, percentage: "N/A" }
        );
      }
      setError(null);
    } catch {
      setError("Failed to fetch attendance data.");
    } finally {
      setLoading(false);
    }
  }, [selectedViewSemester, readMergedStudentFromLocal, API_BASE_URL]);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  const handleRefresh = () => {
    fetchAttendance();
  };

  const handleCardClick = (subject) => {
    setSelectedSubjectData(subject.records);
    setSelectedSubjectName(subject.subjectName);
    setOpenModal(true);
  };

  const handleCloseModal = () => {
    setOpenModal(false);
    setSelectedSubjectData([]);
    setSelectedSubjectName("");
  };

  const handleOpenAllModal = () => {
    setOpenAllModal(true);
  };

  const handleCloseAllModal = () => {
    setOpenAllModal(false);
  };

  const handleSemesterChange = (event) => {
    const value = event.target.value;
    setSelectedViewSemester(value);
    setAttendanceFilter("all");
  };

  const handleFilterChange = (event, newFilter) => {
    if (newFilter !== null) setAttendanceFilter(newFilter);
  };

  const getFilteredAttendanceData = useCallback(() => {
    if (attendanceFilter === "all") return attendanceData;
    return attendanceData.filter((record) => record.status === (attendanceFilter === "present" ? "Present" : "Absent"));
  }, [attendanceData, attendanceFilter]);

  const getPercentageColor = (percentage) => {
    if (percentage === "N/A") return theme.palette.text.secondary;
    const percent = parseFloat(percentage);
    if (percent < 45) return theme.palette.error.main;
    if (percent < 75) return theme.palette.warning.main;
    return theme.palette.success.main;
  };

  const formatDate = (dateString) => dayjs(dateString).format("DD/MM/YYYY");
  const formatTimeSlot = (timeSlot) => timeSlot.replace("-", " - ");
  const getSemesterDisplayText = useCallback(() => {
    if (selectedViewSemester === "current") return `Current Semester (${currentSemester})`;
    return `Semester ${selectedViewSemester}`;
  }, [selectedViewSemester, currentSemester]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress size={60} />
        <Typography sx={{ ml: 2 }} variant="h6" color="text.secondary">
          Loading attendance data...
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ backgroundColor: theme.palette.background.default, minHeight: "100vh", py: 4 }}>
      <Container maxWidth="xl">
        <SecondaryHeader
          title="Attendance Dashboard"
          leftArea={
            <HeaderBackButton />
          }
          rightArea={
            <Stack direction="row" spacing={2} alignItems="center">
              <FormControl size="small" sx={{ minWidth: {md:200, xs:100}, maxWidth  :{md:200, xs:100}   }}>
                <InputLabel>View Semester</InputLabel>
                <Select value={selectedViewSemester} label="View Semester" onChange={handleSemesterChange} startAdornment={<HistoryIcon sx={{ mr: 1, color: theme.palette.action.active }} />}>
                  <MenuItem value="current">Current Semester</MenuItem>
                  {availableSemesters.map((sem) => (
                    <MenuItem key={sem} value={sem}>
                      Semester {sem} (Previous)
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Tooltip title="Refresh Data">
                <IconButton onClick={handleRefresh} disabled={loading} color="primary" sx={{ bgcolor: theme.palette.background.paper, boxShadow: 1 }}>
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
            </Stack>
          }
        />

        {selectedViewSemester !== "current" && (
          <Alert severity="info" sx={{ mb: 3, borderRadius: 2 }}>
            <Typography variant="body2">
              <HistoryIcon sx={{ mr: 1, verticalAlign: "middle" }} />
              Viewing historical data for Semester {selectedViewSemester}. Recent records are not available for previous semesters.
            </Typography>
          </Alert>
        )}

        {error && <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>{error}</Alert>}

        {!error && (
          <>
            <StudentHeader />
            {overallStats && (
              <Card sx={{ mb: 4, borderRadius: 2, boxShadow: 3, p: 2 }}>
                <CardContent>
                  <Typography variant="h6" fontWeight="bold" gutterBottom>
                    Overall Attendance Summary
                  </Typography>
                  <Grid container spacing={3} alignItems="center">
                    <Grid item xs={12} md={6}>
                      <Typography variant="h4" fontWeight="bold" color="primary">
                        {overallStats.percentage}%
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={parseFloat(overallStats.percentage) || 0}
                        sx={{
                          height: 12,
                          borderRadius: 6,
                          mt: 1,
                          "& .MuiLinearProgress-bar": {
                            backgroundColor: getPercentageColor(overallStats.percentage),
                          },
                        }}
                      />
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        Based on {overallStats.totalClasses} total classes across all subjects
                      </Typography>
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <Stack direction="row" spacing={2} flexWrap="wrap" justifyContent={{ xs: "flex-start", md: "flex-end" }}>
                        <Chip label={`Present: ${overallStats.totalPresent}`} color="success" variant="outlined" />
                        <Chip label={`Absent: ${overallStats.totalAbsent}`} color="error" variant="outlined" />
                        <Chip label={`Total: ${overallStats.totalClasses}`} color="primary" variant="outlined" />
                      </Stack>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            )}

            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
              <Typography variant="h5" fontWeight="bold" color="text.primary">
                Subject-wise Attendance
              </Typography>
              <Button
                variant="outlined"
                color="primary"
                onClick={handleOpenAllModal}
                sx={{ textTransform: "none", fontWeight: "bold" }}
                startIcon={<CalendarIcon />}
                disabled={!attendanceData.length}
              >
                View All Records
              </Button>
            </Box>

            {subjectStats.length === 0 ? (
              <Alert severity="info" sx={{ borderRadius: 2 }}>
                {selectedViewSemester === "current"
                  ? "No attendance records found. Your teachers have not marked any attendance yet."
                  : `No attendance records found for Semester ${selectedViewSemester}.`}
              </Alert>
            ) : (
              <Grid container spacing={3} sx={{ mb: 4 }}>
                {subjectStats.map((subject, index) => (
                  <Grid item xs={12} sm={6} md={4} lg={3} key={index}>
                    <Card
                      sx={{
                        backgroundColor: theme.palette.background.paper,
                        boxShadow: 3,
                        borderRadius: 2,
                        minWidth:{md: "30vw",xs:"90vw"},
                        textAlign: "center",
                        p: 3,
                        cursor: "pointer",
                        transition: "all 0.3s ease-in-out",
                        border: `2px solid ${getPercentageColor(subject.percentage)}`,
                        "&:hover": {
                          transform: "translateY(-4px)",
                          boxShadow: 8,
                        },
                      }}
                      onClick={() => handleCardClick(subject)}
                    >
                      <Box sx={{ position: "relative", display: "inline-flex", mb: 2 }}>
                        <CircularProgress
                          variant="determinate"
                          value={subject.percentage === "N/A" ? 0 : parseFloat(subject.percentage)}
                          size={100}
                          thickness={4}
                          sx={{ color: getPercentageColor(subject.percentage) }}
                        />
                        <Box
                          sx={{
                            position: "absolute",
                            top: 0, bottom: 0, left: 0, right: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexDirection: "column",
                          }}
                        >
                          <Typography variant="h6" fontWeight="bold" sx={{ color: getPercentageColor(subject.percentage) }}>
                            {subject.percentage}
                            {subject.percentage !== "N/A" && "%"}
                          </Typography>
                        </Box>
                      </Box>
                      <Typography variant="h6" sx={{ fontWeight: "bold", color: "text.primary", mb: 1 }}>
                        {subject.subjectName}
                      </Typography>
                      <Stack direction="row" justifyContent="center" spacing={1}>
                        <Chip label={`${subject.present}/${subject.total}`} size="small" color="primary" />
                      </Stack>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            )}
            
            {attendanceData.length > 0 && selectedViewSemester === "current" && (
              <Card sx={{ mb: 4, borderRadius: 2, boxShadow: 3 }}>
                <CardContent>
                  <Typography variant="h6" fontWeight="bold" gutterBottom>
                    Recent Attendance Records
                  </Typography>
                  <TableContainer component={Paper} sx={{ maxHeight: 400, borderRadius: 2, border: `1px solid ${theme.palette.divider}` }}>
                    <Table stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: "bold", bgcolor: theme.palette.background.default }}>Date</TableCell>
                          <TableCell sx={{ fontWeight: "bold", bgcolor: theme.palette.background.default }}>Time</TableCell>
                          <TableCell sx={{ fontWeight: "bold", bgcolor: theme.palette.background.default }}>Subject</TableCell>
                          <TableCell sx={{ fontWeight: "bold", bgcolor: theme.palette.background.default }}>Teacher</TableCell>
                          <TableCell sx={{ fontWeight: "bold", bgcolor: theme.palette.background.default }}>Status</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {attendanceData.slice(0, 10).map((record, idx) => (
                          <TableRow key={idx} hover>
                            <TableCell>{formatDate(record.date)}</TableCell>
                            <TableCell>{formatTimeSlot(record.timeSlot)}</TableCell>
                            <TableCell>{record.subjectName}</TableCell>
                            <TableCell>{record.teacherName}</TableCell>
                            <TableCell>
                              <Chip label={record.status} color={record.status === "Present" ? "success" : "error"} size="small" />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </CardContent>
              </Card>
            )}

            <Modal open={openModal} onClose={handleCloseModal}>
              <Paper
                sx={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  width: { xs: "95%", sm: "80%", md: "70%" },
                  borderRadius: "16px",
                  boxShadow: 24,
                  p: 4,
                  maxHeight: "80vh",
                  overflowY: "auto",
                  bgcolor: theme.palette.background.paper,
                }}
              >
                <Typography variant="h5" fontWeight="bold" gutterBottom color="primary.main" sx={{ mb: 3 }}>
                  <SubjectIcon sx={{ mr: 1, verticalAlign: "middle" }} />
                  {selectedSubjectName} - Detailed Records ({getSemesterDisplayText()})
                </Typography>
                <TableContainer component={Paper}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: "bold", bgcolor: theme.palette.background.default }}>Date</TableCell>
                        <TableCell sx={{ fontWeight: "bold", bgcolor: theme.palette.background.default }}>Time</TableCell>
                        <TableCell sx={{ fontWeight: "bold", bgcolor: theme.palette.background.default }}>Teacher</TableCell>
                        <TableCell sx={{ fontWeight: "bold", bgcolor: theme.palette.background.default }}>Status</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {selectedSubjectData.map((record, idx) => (
                        <TableRow key={idx} hover>
                          <TableCell>{formatDate(record.date)}</TableCell>
                          <TableCell>{formatTimeSlot(record.timeSlot)}</TableCell>
                          <TableCell>{record.teacherName}</TableCell>
                          <TableCell>
                            <Chip label={record.status} color={record.status === "Present" ? "success" : "error"} size="small" />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            </Modal>

            <Modal open={openAllModal} onClose={handleCloseAllModal}>
              <Paper
                sx={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  width: { xs: "95%", sm: "85%", md: "80%" },
                  borderRadius: "16px",
                  boxShadow: 24,
                  p: 4,
                  maxHeight: "80vh",
                  overflowY: "auto",
                  bgcolor: theme.palette.background.paper,
                }}
              >
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3, flexWrap: "wrap", gap: 2 }}>
                  <Typography variant="h5" fontWeight="bold" color="primary.main">
                    <CalendarIcon sx={{ mr: 1, verticalAlign: "middle" }} />
                    All Attendance Records - {getSemesterDisplayText()}
                  </Typography>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <FilterIcon color="action" />
                    <ToggleButtonGroup value={attendanceFilter} exclusive onChange={handleFilterChange} size="small">
                      <ToggleButton value="all" color="primary">
                        All ({attendanceData.length})
                      </ToggleButton>
                      <ToggleButton value="present" color="success">
                        Present ({attendanceData.filter((r) => r.status === "Present").length})
                      </ToggleButton>
                      <ToggleButton value="absent" color="error">
                        Absent ({attendanceData.filter((r) => r.status === "Absent").length})
                      </ToggleButton>
                    </ToggleButtonGroup>
                  </Box>
                </Box>
                <Divider sx={{ mb: 2 }} />
                <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
                  <Table stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: "bold" }}>Date</TableCell>
                        <TableCell sx={{ fontWeight: "bold" }}>Time</TableCell>
                        <TableCell sx={{ fontWeight: "bold" }}>Subject</TableCell>
                        <TableCell sx={{ fontWeight: "bold" }}>Teacher</TableCell>
                        <TableCell sx={{ fontWeight: "bold" }}>Status</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {getFilteredAttendanceData().map((record, idx) => (
                        <TableRow key={idx} hover>
                          <TableCell>{formatDate(record.date)}</TableCell>
                          <TableCell>{formatTimeSlot(record.timeSlot)}</TableCell>
                          <TableCell>{record.subjectName}</TableCell>
                          <TableCell>{record.teacherName}</TableCell>
                          <TableCell>
                            <Chip label={record.status} color={record.status === "Present" ? "success" : "error"} size="small" />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                {getFilteredAttendanceData().length === 0 && (
                  <Box sx={{ textAlign: "center", py: 4 }}>
                    <Typography variant="body1" color="text.secondary">
                      No records found for the selected filter.
                    </Typography>
                  </Box>
                )}
              </Paper>
            </Modal>
          </>
        )}
      </Container>
    </Box>
  );
};

export default Attendance;