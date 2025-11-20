import React, { useState, useEffect } from 'react';
import { Box, Card, CardContent, Typography, FormControl, InputLabel, Select, MenuItem, Button, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, Paper, Chip, Avatar, Grid, Alert, CircularProgress, Dialog, DialogTitle, DialogContent, 
  DialogActions, TextField, Divider, Snackbar, Checkbox, LinearProgress, Stack, useTheme,alpha
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { MobileTimePicker } from '@mui/x-date-pickers/MobileTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import TextRotateVerticalIcon from '@mui/icons-material/TextRotateVertical';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import ReplayIcon from '@mui/icons-material/Replay';
import { 
  CheckCircle as PresentIcon,
  Cancel as AbsentIcon,
  Refresh as RefreshIcon,
  Analytics as AnalyticsIcon,
  Sort as SortIcon
} from '@mui/icons-material';
import { db } from '../../firebase/Firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import axios from 'axios';
import dayjs from 'dayjs';
import { useAuth } from "../../context/AuthContext";
import { HeaderBackButton } from "../../components/header";
import SecondaryHeader from "../../components/secondaryHeader";
import TeacherHeader from '../../components/TeacherHeader';

const TeacherAttendance = () => {
  const theme = useTheme();
  const { userDetails: teacherData, role, loading: authLoading } = useAuth();
  const [programs, setPrograms] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [selectedProgram, setSelectedProgram] = useState("");
  const [selectedSemester, setSelectedSemester] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedDate, setSelectedDate] = useState(dayjs());
  const [startTime, setStartTime] = useState(dayjs());
  const [endTime, setEndTime] = useState(dayjs().add(1, "hour"));
  // Students and attendance
  const [, setFirebaseStudents] = useState([]);
  const [finalStudents, setFinalStudents] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [attendancePercentages, setAttendancePercentages] = useState({});
  
  const [loading, setLoading] = useState(false);
  const [filteringStep, setFilteringStep] = useState('');
  const [studentsLoaded, setStudentsLoaded] = useState(false);
  const [showPercentage, setShowPercentage] = useState(false);
  const [loadingPercentages, setLoadingPercentages] = useState(false);
  
  const [sortBy, setSortBy] = useState('default');
  const [submitDialog, setSubmitDialog] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

    useEffect(() => {
      if (teacherData && role === "Teacher") {
        const uniquePrograms = [...new Set([teacherData.program])];
        setPrograms(uniquePrograms);
  
        const uniqueSemesters = [...new Set(teacherData.subjects?.map(s => s.semester) || [])];
        setSemesters(uniqueSemesters.sort((a, b) => a - b));
  
        setSubjects(teacherData.subjects || []);
      }
    }, [teacherData, role]);

  useEffect(() => {
    if (startTime) {
      setEndTime(startTime.add(1, 'hour'));
    }
  }, [startTime]);

  const getFilteredSubjects = () => {
    if (!selectedSemester) return [];
    return subjects.filter(subject => subject.semester === parseInt(selectedSemester));
  };

  const handleLoadStudents = async () => {
    if (!selectedProgram || !selectedSemester || !teacherData) {
      showSnackbar('Please select program and semester', 'warning');
      return;
    }

    setLoading(true);
    setFilteringStep('Filtering students from DataBase...');

    try {
      // Filter students from Firebase 
      const studentsQuery = query(
        collection(db, 'Students'),
        where('collegeId', '==', teacherData.college),
        where('role', '==', 'Student')
      );

      const firebaseSnapshot = await getDocs(studentsQuery);
      const firebaseStudentsList = firebaseSnapshot.docs.map(doc => ({
        firebaseId: doc.data().firebaseId,
        firstName: doc.data().firstName,
        lastName: doc.data().lastName,
        email: doc.data().email,
        profilePicUrl: doc.data().profilePicUrl || '',
        collegeName: doc.data().collegeName || '',
        collegeId: doc.data().collegeId
      }));
      setFirebaseStudents(firebaseStudentsList);

      if (firebaseStudentsList.length === 0) {
        showSnackbar('No students found in your college', 'warning');
        setLoading(false);
        return;
      }

      // Filter with MongoDB
      setFilteringStep('Cross-referencing students records...');

      const response = await axios.post(`${API_BASE_URL}/api/attendance/get-students`, {
        teacherCollege: teacherData.college,
        teacherProgram: selectedProgram,
        selectedSemester: selectedSemester,
        firebaseStudents: firebaseStudentsList
      });

      setFinalStudents(response.data.students);
      setStudentsLoaded(true);
      
      // Initialize attendance state
      const initialAttendance = {};
      response.data.students.forEach(student => {
        initialAttendance[student._id] = 'Present';
      });
      setAttendance(initialAttendance);

      // Reset percentage states
      setShowPercentage(false);
      setAttendancePercentages({});

      showSnackbar(`Successfully loaded ${response.data.students.length} students`, 'success');

    } catch (error) {
      console.error('Error loading students:', error);
      showSnackbar('Failed to load students: ' + (error.response?.data?.error || error.message), 'error');
    } finally {
      setLoading(false);
      setFilteringStep('');
    }
  };

  const handleShowPercentage = async () => {
    if (!selectedSubject) {
      showSnackbar('Please select a subject first to view attendance percentages', 'warning');
      return;
    }

    if (!showPercentage) {
      setLoadingPercentages(true);
      try {
        const percentages = {};
        
        for (const student of finalStudents) {
          // Get attendance records for this student in the SELECTED SUBJECT ONLY
          const response = await axios.get(`${API_BASE_URL}/api/attendance/records`, {
            params: {
              collegeId: teacherData.college,
              program: selectedProgram,
              semester: selectedSemester,
              subject: selectedSubject, 
              page: 1,
              limit: 1000
            }
          });

          let totalClasses = 0;
          let attendedClasses = 0;

          // Count attendance for this specific student in the selected subject
          response.data.records.forEach(record => {
            const studentAttendance = record.studentsAttendance.find(
              sa => sa.firebaseId === student.firebaseId
            );
            if (studentAttendance) {
              totalClasses++;
              if (studentAttendance.status === 'Present') {
                attendedClasses++;
              }
            }
          });

          // If no attendance records found for this subject,then showing N/A
          if (totalClasses === 0) {
            percentages[student._id] = {
              percentage: 'N/A',
              attended: 0,
              total: 0
            };
          } else {
            const percentage = (attendedClasses / totalClasses) * 100;
            percentages[student._id] = {
              percentage: percentage.toFixed(1),
              attended: attendedClasses,
              total: totalClasses
            };
          }
        }

        setAttendancePercentages(percentages);
        setShowPercentage(true);
        
        // Get subject name for display
        const subjectName = getFilteredSubjects().find(s => s.subjectId === selectedSubject)?.subjectName;
        showSnackbar(`Attendance percentages calculated for ${subjectName}`, 'success');
      } catch (error) {
        console.error('Error calculating percentages:', error);
        showSnackbar('Failed to calculate attendance percentages', 'error');
      } finally {
        setLoadingPercentages(false);
      }
    } else {
      setShowPercentage(false);
      setAttendancePercentages({});
    }
  };

  const getPercentageColor = (percentage) => {
    if (percentage === 'N/A') return 'text.secondary';
    const percent = parseFloat(percentage);
    if (percent < 45) return 'error.main';
    if (percent < 75) return 'warning.main';
    return 'success.main';
  };

  const getSortedStudents = () => {
    let sortedStudents = [...finalStudents];
    
    switch (sortBy) {
      case 'name':
        sortedStudents.sort((a, b) => 
          `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
        );
        break;
      case 'enrollment':
        sortedStudents.sort((a, b) => a.enrollmentNo.localeCompare(b.enrollmentNo));
        break;
      case 'default':
      default:
        break;
    }
    
    return sortedStudents;
  };

  const handleAttendanceChange = (studentId, status) => {
    setAttendance(prev => ({
      ...prev,
      [studentId]: status
    }));
  };

  const handleBulkAttendance = (status) => {
    const newAttendance = {};
    finalStudents.forEach(student => {
      newAttendance[student._id] = status;
    });
    setAttendance(newAttendance);
  };

  const handleSubmitAttendance = async () => {
    if (!selectedSubject || !startTime || !endTime) {
      showSnackbar('Please select subject and set time duration', 'warning');
      return;
    }

    if (endTime.isBefore(startTime) || endTime.isSame(startTime)) {
      showSnackbar('End time must be after start time', 'warning');
      return;
    }

    const selectedSubjectObj = getFilteredSubjects().find(s => s.subjectId === selectedSubject);
    if (!selectedSubjectObj) {
      showSnackbar('Selected subject not found', 'error');
      return;
    }

    setLoading(true);
    try {
      const studentsAttendance = finalStudents.map(student => ({
        student: student._id,
        enrollmentNo: student.enrollmentNo,
        firebaseId: student.firebaseId,
        studentName: `${student.firstName} ${student.lastName}`,
        status: attendance[student._id] || 'Present'
      }));

      await axios.post(`${API_BASE_URL}/api/attendance/create`, {
        collegeId: teacherData.college,
        department: finalStudents[0]?.department?._id,
        program: selectedProgram,
        semester: selectedSemester,
        subject: selectedSubject,
        teacherId: teacherData.uid,
        teacherName: `${teacherData.firstName} ${teacherData.lastName}`,
        date: selectedDate.format('YYYY-MM-DD'),
        startTime: startTime.format('HH:mm'),
        endTime: endTime.format('HH:mm'),
        studentsAttendance
      });

      showSnackbar('Attendance recorded successfully!', 'success');
      setSubmitDialog(false);
      
      // Reset form
      setStudentsLoaded(false);
      setFinalStudents([]);
      setFirebaseStudents([]);
      setAttendance({});
      setSelectedSubject('');
      setShowPercentage(false);
      setAttendancePercentages({});

    } catch (error) {
      console.error('Error submitting attendance:', error);
      const errorMessage = error.response?.data?.error || error.message;
      showSnackbar('Failed to record attendance: ' + errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  };

  const showSnackbar = (message, severity = 'info') => {
    setSnackbar({ open: true, message, severity });
  };

  const getAttendanceStats = () => {
    const present = Object.values(attendance).filter(status => status === 'Present').length;
    const absent = Object.values(attendance).filter(status => status === 'Absent').length;
    
    return { present, absent, total: finalStudents.length };
  };

  const calculateDuration = () => {
    if (startTime && endTime && endTime.isAfter(startTime)) {
      const duration = endTime.diff(startTime, 'minute');
      const hours = Math.floor(duration / 60);
      const minutes = duration % 60;
      return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    }
    return '';
  };

  if (authLoading || !teacherData) {
    return (
      <Box display="flex" alignItems="center" justifyContent="center" minHeight="100vh">
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Authenticating teacher...</Typography>
      </Box>
    );
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box sx={{ p: 3, maxWidth: 1400, minHeight:'100vh', mx: 'auto',  background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)}, ${alpha(theme.palette.secondary.main, 0.1)})` }}>

<SecondaryHeader
                title="Take Attendance"
                titleSx={{ color: theme.palette.primary.main }}
                leftArea={
                  <HeaderBackButton />
                }
               
              />
        {/* Teacher Info Card */}
        <TeacherHeader sx={{background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 1)}, ${alpha(theme.palette.secondary.main, 0.4)})`,}}
                 extraTexts={[
                   { text: `Teacher ID: ${teacherData?.teacherId || '—'}` },
                   { text: `College: ${teacherData?.college || '—'}` }
                 ]}
       />

        {/* Selection Form */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Class Selection
            </Typography>
            <Stack spacing={2} sx={{ mt: 2 }}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                <FormControl fullWidth>
                  <InputLabel>Program</InputLabel>
                  <Select
                    value={selectedProgram}
                    label="Program"
                    onChange={(e) => {
                      setSelectedProgram(e.target.value);
                      setSelectedSemester('');
                      setSelectedSubject('');
                      setStudentsLoaded(false);
                      setShowPercentage(false);
                      setAttendancePercentages({});
                    }}
                  >
                    {programs.map(program => (
                      <MenuItem key={program} value={program}>{program}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              
                <FormControl fullWidth disabled={!selectedProgram}>
                  <InputLabel>Semester</InputLabel>
                  <Select
                    value={selectedSemester}
                    label="Semester"
                    onChange={(e) => {
                      setSelectedSemester(e.target.value);
                      setSelectedSubject('');
                      setStudentsLoaded(false);
                      setShowPercentage(false);
                      setAttendancePercentages({});
                    }}
                  >
                    {semesters.map(semester => (
                      <MenuItem key={semester} value={semester}>
                        Semester {semester}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Stack>

              <Grid item xs={12}>
                <Button
                  variant="contained"
                  onClick={handleLoadStudents}
                  disabled={!selectedProgram || !selectedSemester || loading}
                  fullWidth
                  sx={{ height: '56px' }}
                  startIcon={loading ? <CircularProgress size={20} /> : <RefreshIcon />}
                >
                  {loading ? filteringStep || 'Loading Students...' : 'Load Students'}
                </Button>
              </Grid>
            
            {loading && (
              <Box sx={{ mt: 2 }}>
                <LinearProgress />
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {filteringStep}
                </Typography>
              </Box>
            )}
        </Stack>
          </CardContent>
        </Card>

        {/* Session Details */}
        {studentsLoaded && finalStudents.length > 0 && (
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Session Details
              </Typography>
              
              <Stack spacing={2} sx={{ mt: 2 }}>
              <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                  <FormControl fullWidth>
                    <InputLabel>Subject</InputLabel>
                    <Select
                      value={selectedSubject}
                      label="Subject"
                      onChange={(e) => {
                        setSelectedSubject(e.target.value);
                        setShowPercentage(false);
                        setAttendancePercentages({});
                      }}
                    >
                      {getFilteredSubjects().map(subject => (
                        <MenuItem key={subject.subjectId} value={subject.subjectId}>
                          {subject.subjectName}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <DatePicker
                    label="Date"
                    value={selectedDate}
                    onChange={setSelectedDate}
                    format="DD/MM/YYYY"
                    disableFuture
                    slotProps={{
                      textField: {
                        fullWidth: true,
                        variant: "outlined",
                      },
                    }}
                  />
                  </Stack>
                  <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                  <MobileTimePicker
                    label="Start Time"
                    value={startTime}
                    onChange={setStartTime}
                    slotProps={{
                      textField: {
                        fullWidth: true,
                        variant: "outlined",
                      },
                    }}
                  />
                  <MobileTimePicker
                    label="End Time"
                    value={endTime}
                    onChange={setEndTime}
                    slotProps={{
                      textField: {
                        fullWidth: true,
                        variant: "outlined",
                      },
                    }}
                  />
                  <TextField
                    label="Duration"
                    value={calculateDuration()}
                    fullWidth
                    variant="outlined"
                    InputProps={{
                      readOnly: true,
                    }}
                  />
                  </Stack>
            </Stack>
            </CardContent>
          </Card>
        )}

        {/* Students List */}
        {studentsLoaded && (
          <>
            {finalStudents.length > 0 ? (
              <>
                {/* Stats and Bulk Controls */}
                <Card sx={{ mb: 3, width: '100%' }}>
                  <CardContent>
                    <Box 
                      sx={{ 
                        display: 'flex', 
                        gap: 2, 
                        flexDirection: { xs: 'column', md: 'row' } 
                      }}
                    >
                      {/* Column 1: Attendance Summary */}
                      <Paper 
                        variant="outlined"
                        sx={{ 
                          p: 2, 
                          flex: 1,
                          height: '100%', 
                          width: '100%', 
                          display: 'flex', 
                          flexDirection: 'column',
                          bgcolor: 'action.hover'
                        }}
                      >
                        <Typography variant="h6" gutterBottom>
                          Attendance Summary ({finalStudents.length} Students)
                        </Typography>
                        <Box 
                          sx={{ 
                            display: 'flex', 
                            gap: 1, 
                            flexWrap: 'wrap', 
                            mt: 1,
                          }}
                        >
                          <Chip 
                            label={`Present: ${getAttendanceStats().present}`} 
                            color="success" 
                            icon={<PresentIcon />}
                            size="small"
                          />
                          <Chip 
                            label={`Absent: ${getAttendanceStats().absent}`} 
                            color="error" 
                            icon={<AbsentIcon />}
                            size="small"
                          />
                          <Chip 
                            label={`${finalStudents.length > 0 ? ((getAttendanceStats().present / finalStudents.length) * 100).toFixed(1) : '0.0'}%`} 
                            color="primary" 
                            size="small"
                          />
                        </Box>
                      </Paper>
                    
                      {/* Column 2: Bulk Actions */}
                      <Paper 
                        variant="outlined" 
                        sx={{ 
                          p: 2, 
                          width: '100%', 
                          height: '100%',
                          flex: 1.03,
                          display: 'flex', 
                          flexDirection: 'column',
                          bgcolor: 'action.hover'
                        }}
                      >
                        <Typography variant="h6" gutterBottom>
                          Bulk Actions
                        </Typography>
                        <Stack 
                          direction="row" 
                          spacing={1} 
                          flexWrap="wrap" 
                          sx={{ mt: 'auto' }}
                        >
                          <Button 
                            size="small" 
                            onClick={() => handleBulkAttendance('Present')}
                            startIcon={<PresentIcon />}
                            color="success"
                            variant="outlined"
                          >
                            Mark All Present
                          </Button>
                          <Button 
                            size="small" 
                            onClick={() => handleBulkAttendance('Absent')}
                            startIcon={<AbsentIcon />}
                            color="error"
                            variant="outlined"
                          >
                            Mark All Absent
                          </Button>
                          <Button 
                            size="small" 
                            onClick={handleShowPercentage}
                            startIcon={loadingPercentages ? <CircularProgress size={16} /> : <AnalyticsIcon />}
                            color="info"
                            variant="outlined"
                            disabled={loadingPercentages || !selectedSubject} // Disable if no subject selected
                          >
                            {loadingPercentages ? 'Loading' : showPercentage ? 'Hide %' : 'Show %'}
                          </Button>
                        </Stack>                       
                      </Paper>
                    
                      {/* Column 3: Sort Data By */}
                      <Paper 
                        variant="outlined" 
                        sx={{ 
                          p: 2, 
                          height: '100%', 
                          width: '100%', 
                          flex: 1,
                          display: 'flex', 
                          flexDirection: 'column',
                          bgcolor: 'action.hover'
                        }}
                      >
                        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}> 
                          Sort Data By <SortIcon sx={{ ml: 1 }} />
                        </Typography>
                        <Stack 
                          direction="row" 
                          spacing={1} 
                          flexWrap="wrap" 
                          sx={{ mt: 'auto' }}
                        >
                          <Button
                            size="small"
                            onClick={() => setSortBy('default')}
                            variant={sortBy === 'default' ? 'contained' : 'outlined'}
                            startIcon={<ReplayIcon />}
                            color="secondary"
                          >
                            Default
                          </Button>
                          <Button
                            size="small"
                            onClick={() => setSortBy('name')}
                            variant={sortBy === 'name' ? 'contained' : 'outlined'}
                            startIcon={<TextRotateVerticalIcon />}
                            color="primary"
                          >
                            Name
                          </Button>
                          <Button
                            size="small"
                            onClick={() => setSortBy('enrollment')}
                            variant={sortBy === 'enrollment' ? 'contained' : 'outlined'}
                            startIcon={<FormatListNumberedIcon />}
                            color="info"
                          >
                            Enrollment No
                          </Button>
                        </Stack>
                      </Paper>
                    </Box>
                  </CardContent>
                </Card>

                {/* Students Table */}
                <TableContainer component={Paper} sx={{ mb: 3 }}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Student</TableCell>
                        <TableCell>Enrollment No</TableCell>
                        <TableCell>Department</TableCell>
                        {showPercentage && (
                          <TableCell align="center">
                            Attendance % 
                            {selectedSubject && (
                              <Typography variant="caption" display="block" color="text.secondary">
                                ({getFilteredSubjects().find(s => s.subjectId === selectedSubject)?.subjectName})
                              </Typography>
                            )}
                          </TableCell>
                        )}
                        <TableCell align="center">Present</TableCell>
                        <TableCell align="center">Absent</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {getSortedStudents().map((student) => (
                        <TableRow key={student._id} hover>
                          <TableCell>
                            <Box display="flex" alignItems="center" gap={2}>
                              <Avatar src={student.profilePicUrl} sx={{ width: 40, height: 40 }}>
                                {student.firstName?.[0]}
                              </Avatar>
                              <Box>
                                <Typography variant="body1" fontWeight="medium">
                                  {student.firstName} {student.lastName}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                  {student.email}
                                </Typography>
                              </Box>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" fontWeight="medium">
                              {student.enrollmentNo}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">
                              {student.department?.departmentName || 'N/A'}
                            </Typography>
                          </TableCell>
                          {showPercentage && (
                            <TableCell align="center">
                              <Typography 
                                variant="body2" 
                                fontWeight="bold"
                                sx={{ 
                                  color: getPercentageColor(attendancePercentages[student._id]?.percentage || 'N/A')
                                }}
                              >
                                {attendancePercentages[student._id]?.percentage || 'N/A'}
                                {attendancePercentages[student._id]?.percentage !== 'N/A' && '%'}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" display="block">
                                ({attendancePercentages[student._id]?.attended || 0}/{attendancePercentages[student._id]?.total || 0})
                              </Typography>
                            </TableCell>
                          )}
                          <TableCell align="center">
                            <Checkbox
                              checked={attendance[student._id] === 'Present'}
                              onChange={() => handleAttendanceChange(student._id, 'Present')}
                              color="success"
                            />
                          </TableCell>
                          <TableCell align="center">
                            <Checkbox
                              checked={attendance[student._id] === 'Absent'}
                              onChange={() => handleAttendanceChange(student._id, 'Absent')}
                              color="error"
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>

                {/* Submit Button */}
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
                  <Button
                    variant="outlined"
                    onClick={() => {
                      setStudentsLoaded(false);
                      setFinalStudents([]);
                      setAttendance({});
                      setShowPercentage(false);
                      setAttendancePercentages({});
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="contained"
                    color="primary"
                    size="large"
                    onClick={() => setSubmitDialog(true)}
                    disabled={!selectedSubject || !startTime || !endTime}
                    sx={{ minWidth: 160 }}
                  >
                    Submit Attendance
                  </Button>
                </Box>
              </>
            ) : (
              <Alert severity="warning" sx={{ mb: 3 }}>
                No students found for {selectedProgram} - Semester {selectedSemester} in your college.
                <br />
                This could mean:
                <ul>
                  <li>No students are enrolled in this program and semester</li>
                  <li>Students have not completed their academic data in MongoDB</li>
                  <li>College ID mismatch between Firebase and MongoDB</li>
                </ul>
              </Alert>
            )}
          </>
        )}

        {/* Submit Confirmation Dialog */}
        <Dialog 
          open={submitDialog} 
          onClose={() => setSubmitDialog(false)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>Confirm Attendance Submission</DialogTitle>
          <DialogContent>
            <Typography gutterBottom>
              Please confirm the attendance details:
            </Typography>
            <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
              <Grid container spacing={1}>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Subject:</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" fontWeight="medium">
                    {getFilteredSubjects().find(s => s.subjectId === selectedSubject)?.subjectName}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Date:</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" fontWeight="medium">
                    {selectedDate?.format('DD/MM/YYYY')}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Time:</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" fontWeight="medium">
                    {startTime?.format('HH:mm')} - {endTime?.format('HH:mm')}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Duration:</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" fontWeight="medium">
                    {calculateDuration()}
                  </Typography>
                </Grid>
              </Grid>
            </Box>
            
            <Divider sx={{ my: 2 }} />
            
            <Box display="flex" gap={2} justifyContent="center">
              <Chip 
                label={`Present: ${getAttendanceStats().present}`} 
                color="success" 
                size="medium"
              />
              <Chip 
                label={`Absent: ${getAttendanceStats().absent}`} 
                color="error" 
                size="medium"
              />
              <Chip 
                label={`${((getAttendanceStats().present / finalStudents.length) * 100).toFixed(1)}% Present`} 
                color="primary" 
                size="medium"
              />
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setSubmitDialog(false)}>Cancel</Button>
            <Button 
              onClick={handleSubmitAttendance} 
              variant="contained"
              disabled={loading}
              startIcon={loading ? <CircularProgress size={16} /> : null}
            >
              {loading ? 'Submitting...' : 'Confirm Submit'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Snackbar for notifications */}
        <Snackbar
          open={snackbar.open}
          autoHideDuration={4000}
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          <Alert 
            elevation={6} 
            variant="filled" 
            onClose={() => setSnackbar({ ...snackbar, open: false })} 
            severity={snackbar.severity}
          >
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Box>
    </LocalizationProvider>
  );
};

export default TeacherAttendance;