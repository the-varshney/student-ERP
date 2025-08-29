import React, { useState, useEffect } from "react";
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
  ToggleButton,
  ToggleButtonGroup,
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
  FilterList as FilterIcon,
  History as HistoryIcon
} from "@mui/icons-material";
import { auth, db } from '../../firebase/Firebase';
import { doc, getDoc } from 'firebase/firestore';
import dayjs from 'dayjs';

const Attendance = () => {
  const [studentFirebaseData, setStudentFirebaseData] = useState(null);
  const [attendanceData, setAttendanceData] = useState([]);
  const [subjectStats, setSubjectStats] = useState([]);
  const [overallStats, setOverallStats] = useState(null);
  const [studentInfo, setStudentInfo] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Modal states
  const [openModal, setOpenModal] = useState(false);
  const [selectedSubjectData, setSelectedSubjectData] = useState([]);
  const [selectedSubjectName, setSelectedSubjectName] = useState("");
  const [openAllModal, setOpenAllModal] = useState(false);
  
  // Filter states
  const [attendanceFilter, setAttendanceFilter] = useState('all');
  
  // Semester selection states
  const [selectedViewSemester, setSelectedViewSemester] = useState('current');
  const [currentSemester, setCurrentSemester] = useState(null);
  const [availableSemesters, setAvailableSemesters] = useState([]);

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

  useEffect(() => {
    fetchAttendance();
  }, [selectedViewSemester]);

  const fetchAttendance = async () => {
    try {
      setLoading(true);
      const user = auth.currentUser;
      if (!user) {
        setError("Please log in to view attendance.");
        setLoading(false);
        return;
      }

      // Get student data from Firebase
      const studentDoc = await getDoc(doc(db, 'Students', user.uid));
      if (studentDoc.exists()) {
        const firebaseData = studentDoc.data();
        setStudentFirebaseData(firebaseData);

        // Get attendance data from MongoDB via API
        const response = await axios.get(`${API_BASE_URL}/api/attendance/student/${firebaseData.firebaseId}`);
        
        if (selectedViewSemester === 'current') {
          // Current semester data
          setAttendanceData(response.data.attendanceRecords);
          setSubjectStats(response.data.subjectStats);
          setOverallStats(response.data.overallStats);
          setStudentInfo(response.data.student);
          setCurrentSemester(response.data.student.semester);
          
          // Generate available previous semesters
          const currentSem = parseInt(response.data.student.semester);
          const prevSemesters = [];
          for (let i = 1; i < currentSem; i++) {
            prevSemesters.push(i.toString());
          }
          setAvailableSemesters(prevSemesters);
        } else {
          // Previous semester data
          const prevResponse = await axios.get(
            `${API_BASE_URL}/api/attendance/student/${firebaseData.firebaseId}/semester/${selectedViewSemester}`
          );
          
          setAttendanceData(prevResponse.data.attendanceRecords || []);
          setSubjectStats(prevResponse.data.subjectStats || []);
          setOverallStats(prevResponse.data.overallStats || { totalClasses: 0, totalPresent: 0, totalAbsent: 0, percentage: 'N/A' });
          setStudentInfo(response.data.student); // Keep current student info
        }
        
        setError(null);
      } else {
        setError("Student data not found. Please contact administrator.");
      }
    } catch (err) {
      console.error("Error fetching attendance:", err);
      setError("Failed to fetch attendance data. " + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

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
    setAttendanceFilter('all'); // Reset filter when changing semester
  };

  const handleFilterChange = (event, newFilter) => {
    if (newFilter !== null) {
      setAttendanceFilter(newFilter);
    }
  };

  const getFilteredAttendanceData = () => {
    if (attendanceFilter === 'all') {
      return attendanceData;
    }
    return attendanceData.filter(record => 
      record.status === (attendanceFilter === 'present' ? 'Present' : 'Absent')
    );
  };

  const getPercentageColor = (percentage) => {
    if (percentage === 'N/A') return '#757575';
    const percent = parseFloat(percentage);
    if (percent < 45) return '#F44336'; 
    if (percent < 75) return '#FF9800'; 
    return '#4CAF50'; 
  };

  const formatDate = (dateString) => {
    return dayjs(dateString).format('DD/MM/YYYY');
  };

  const formatTimeSlot = (timeSlot) => {
    return timeSlot.replace('-', ' - ');
  };

  const getSemesterDisplayText = () => {
    if (selectedViewSemester === 'current') {
      return `Current Semester (${currentSemester})`;
    }
    return `Semester ${selectedViewSemester}`;
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
        <CircularProgress size={60} />
        <Typography sx={{ ml: 2 }} variant="h6">Loading attendance data...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ backgroundColor: "#f5f5f5", minHeight: "100vh", py: 4 }}>
      <Container maxWidth="xl">
        {/* Header with Refresh and Semester Selection */}
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 4, flexWrap: 'wrap', gap: 2 }}>
          <Typography variant="h4" fontWeight="bold" color="primary.main" component="h1">
            Attendance Dashboard
          </Typography>
          
          <Stack direction="row" spacing={2} alignItems="center" >
            {/* Semester Selection */}
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>View Semester</InputLabel>
              <Select
                value={selectedViewSemester}
                label="View Semester"
                onChange={handleSemesterChange}
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
                disabled={loading}
                color="primary"
                sx={{ bgcolor: 'white', boxShadow: 1 }}
              >
                <RefreshIcon />
              </IconButton>
            </Tooltip>

            {/* View All Records */}
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
          </Stack>
        </Box>

        {/* Semester Info Alert */}
        {selectedViewSemester !== 'current' && (
          <Alert severity="info" sx={{ mb: 3 }}>
            <Typography variant="body2">
              <HistoryIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              Viewing historical data for Semester {selectedViewSemester}. Recent records are not available for previous semesters.
            </Typography>
          </Alert>
        )}

        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

        {!error && (
          <>
            {/* Student data Card */}
            <Card sx={{ mb: 4, bgcolor: 'primary.main', color: 'white' }}>
              <CardContent>
                <Grid container  spacing={3} justifyContent={'space-evenly'} sx={{width: '100%', margin: 0}}>
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
                        <Typography variant="body1">{studentInfo?.enrollmentNo}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <SchoolIcon fontSize="small" />
                        <Typography variant="body1">{studentInfo?.department?.departmentName}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <BookIcon fontSize="small" />
                        <Typography variant="body1">
                          {studentInfo?.program?.programName} :  {getSemesterDisplayText()}
                        </Typography>
                      </Box>
                    </Stack>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>

            {/* Overall Attendance Stats */}
            {overallStats && (
              <Card sx={{ mb: 4 }}>
                <CardContent>
                  <Typography variant="h6" fontWeight="bold" gutterBottom>
                    Overall Attendance Summary
                  </Typography>
                  <Grid container spacing={3}>
                    <Grid item xs={12} md={8}>
                      <Typography variant="h4" fontWeight="bold" color="primary.main">
                        {overallStats.percentage}%
                      </Typography>
                      <LinearProgress 
                        variant="determinate" 
                        value={parseFloat(overallStats.percentage) || 0} 
                        sx={{ 
                          height: 12, 
                          borderRadius: 6, 
                          mt: 1,
                          '& .MuiLinearProgress-bar': {
                            backgroundColor: getPercentageColor(overallStats.percentage)
                          }
                        }} 
                      />
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        Based on {overallStats.totalClasses} total classes across all subjects
                      </Typography>
                    </Grid>
                    <Box alignItems="flex-end" sx={{ bottom: "100%", display: 'flex', gap: 2, flexWrap: 'wrap', mt: 1, height: '13vh'}} >
                        <Chip 
                          label={`Present: ${overallStats.totalPresent}`} 
                          color="success" 
                          variant="outlined"
                        />
                        <Chip 
                          label={`Absent: ${overallStats.totalAbsent}`} 
                          color="error" 
                          variant="outlined"
                        />
                        <Chip 
                          label={`Total: ${overallStats.totalClasses}`} 
                          color="primary" 
                          variant="outlined"
                        />
                      </Box>
                  </Grid>
                </CardContent>
              </Card>
            )}

            {/* Subject-wise Attendance Cards */}
            <Typography variant="h5" fontWeight="bold" gutterBottom sx={{ mb: 3 }}>
              Subject-wise Attendance - {getSemesterDisplayText()}
            </Typography>

            {subjectStats.length === 0 ? (
              <Alert severity="info">
                {selectedViewSemester === 'current' 
                  ? "No attendance records found. Your teachers have not marked any attendance yet."
                  : `No attendance records found for Semester ${selectedViewSemester}.`
                }
              </Alert>
            ) : (
              <Grid container spacing={3} sx={{ mb: 4 }}>
                {subjectStats.map((subject, index) => (
                  <Grid item xs={12} sm={6} md={4} lg={3} key={index}>
                    <Card
                      sx={{
                        backgroundColor: "#ffffff",
                        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
                        borderRadius: "16px",
                        textAlign: "center",
                        minWidth: {xs: '90vw' ,md: '60vh'},
                        p: 3,
                        cursor: "pointer",
                        transition: "all 0.3s ease-in-out",
                        border: `2px solid ${getPercentageColor(subject.percentage)}`,
                        "&:hover": { 
                          transform: "translateY(-4px)",
                          boxShadow: "0 8px 24px rgba(134, 161, 202, 0.6)"
                        },
                      }}
                      onClick={() => handleCardClick(subject)}
                    >
                      <Box sx={{ position: 'relative', display: 'inline-flex', mb: 2 }}>
                        <CircularProgress
                          variant="determinate"
                          value={subject.percentage === 'N/A' ? 0 : parseFloat(subject.percentage)}
                          size={100}
                          thickness={4}
                          sx={{ color: getPercentageColor(subject.percentage) }}
                        />
                        <Box
                          sx={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            bottom: 0,
                            right: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexDirection: 'column'
                          }}
                        >
                          <Typography 
                            variant="h6" 
                            fontWeight="bold"
                            sx={{ color: getPercentageColor(subject.percentage) }}
                          >
                            {subject.percentage}
                            {subject.percentage !== 'N/A' && '%'}
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

            {/* Recent Attendance records*/}
            {attendanceData.length > 0 && selectedViewSemester === 'current' && (
              <Card sx={{ mb: 4 }}>
                <CardContent>
                  <Typography variant="h6" fontWeight="bold" gutterBottom>
                    Recent Attendance Records
                  </Typography>
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
                        {attendanceData.slice(0, 10).map((record, idx) => (
                          <TableRow key={idx} hover>
                            <TableCell>{formatDate(record.date)}</TableCell>
                            <TableCell>{formatTimeSlot(record.timeSlot)}</TableCell>
                            <TableCell>{record.subjectName}</TableCell>
                            <TableCell>{record.teacherName}</TableCell>
                            <TableCell>
                              <Chip
                                label={record.status}
                                color={record.status === 'Present' ? 'success' : 'error'}
                                size="small"
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </CardContent>
              </Card>
            )}

            {/* Modal for Subject Details */}
            <Modal open={openModal} onClose={handleCloseModal}>
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
                <Typography variant="h5" fontWeight="bold" gutterBottom color="primary.main" sx={{ mb: 3 }}>
                  <SubjectIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                  {selectedSubjectName} - Detailed Records ({getSemesterDisplayText()})
                </Typography>

                <TableContainer component={Paper}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: "bold" }}>Date</TableCell>
                        <TableCell sx={{ fontWeight: "bold" }}>Time</TableCell>
                        <TableCell sx={{ fontWeight: "bold" }}>Teacher</TableCell>
                        <TableCell sx={{ fontWeight: "bold" }}>Status</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {selectedSubjectData.map((record, idx) => (
                        <TableRow key={idx} hover>
                          <TableCell>{formatDate(record.date)}</TableCell>
                          <TableCell>{formatTimeSlot(record.timeSlot)}</TableCell>
                          <TableCell>{record.teacherName}</TableCell>
                          <TableCell>
                            <Chip
                              label={record.status}
                              color={record.status === 'Present' ? 'success' : 'error'}
                              size="small"
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            </Modal>

            {/* Modal for All Attendance with Filters */}
            <Modal open={openAllModal} onClose={handleCloseAllModal}>
              <Box
                sx={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  width: { xs: "95%", sm: "85%", md: "80%" },
                  bgcolor: "background.paper",
                  borderRadius: "16px",
                  boxShadow: 24,
                  p: 4,
                  maxHeight: "80vh",
                  overflowY: "auto",
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
                  <Typography variant="h5" fontWeight="bold" color="primary.main">
                    <CalendarIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                    All Attendance Records - {getSemesterDisplayText()}
                  </Typography>
                  
                  {/* Filter Toggle Buttons */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <FilterIcon color="action" />
                    <ToggleButtonGroup
                      value={attendanceFilter}
                      exclusive
                      onChange={handleFilterChange}
                      size="small"
                    >
                      <ToggleButton value="all" color="primary">
                        All ({attendanceData.length})
                      </ToggleButton>
                      <ToggleButton value="present" color="success">
                        Present ({attendanceData.filter(r => r.status === 'Present').length})
                      </ToggleButton>
                      <ToggleButton value="absent" color="error">
                        Absent ({attendanceData.filter(r => r.status === 'Absent').length})
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
                            <Chip
                              label={record.status}
                              color={record.status === 'Present' ? 'success' : 'error'}
                              size="small"
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>

                {getFilteredAttendanceData().length === 0 && (
                  <Box sx={{ textAlign: 'center', py: 4 }}>
                    <Typography variant="body1" color="text.secondary">
                      No records found for the selected filter.
                    </Typography>
                  </Box>
                )}
              </Box>
            </Modal>
          </>
        )}
      </Container>
    </Box>
  );
};

export default Attendance;
