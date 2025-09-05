/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useMemo } from 'react';
import {
  Box, Card, CardContent, Typography, FormControl, InputLabel, Select, MenuItem, Button,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip,
  Avatar, Grid, Alert, CircularProgress, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Divider, Snackbar, LinearProgress, Stack
} from '@mui/material';
import { School as SchoolIcon, Sort as SortIcon } from '@mui/icons-material';
import TextRotateVerticalIcon from '@mui/icons-material/TextRotateVertical';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import ReplayIcon from '@mui/icons-material/Replay';
import { auth, db } from '../../firebase/Firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import axios from 'axios';

const assessmentOptions = [
  { value: 'midSem', label: 'Mid Semester' },
  { value: 'endSem', label: 'End Semester' },
  { value: 'attendance', label: 'Attendance' },
  { value: 'practical', label: 'Practical' },
  { value: 'assignment1', label: 'Assignment 1' },
  { value: 'assignment2', label: 'Assignment 2' },
  { value: 'internal', label: 'Internal Assessment' }
];

const ResultUpdate = () => {
  const [teacherData, setTeacherData] = useState(null);
  const [programs, setPrograms] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [selectedProgram, setSelectedProgram] = useState('');
  const [selectedSemester, setSelectedSemester] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [assessmentComponent, setAssessmentComponent] = useState('midSem');
  const [maxMarks, setMaxMarks] = useState(100);
  const [maxMarksError, setMaxMarksError] = useState('');
  const [finalStudents, setFinalStudents] = useState([]);
  const [results, setResults] = useState({});
  const [studentMarks, setStudentMarks] = useState({});
  const [editRow, setEditRow] = useState(null);
  const [studentsLoaded, setStudentsLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filteringStep, setFilteringStep] = useState('');
  const [submitDialog, setSubmitDialog] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const [sortBy, setSortBy] = useState('default');

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

  useEffect(() => {
    fetchTeacherData();
  }, []);

  const fetchTeacherData = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;
      const teacherDoc = await getDoc(doc(db, 'Teachers', user.uid));
      if (teacherDoc.exists()) {
        const data = teacherDoc.data();
        setTeacherData(data);
        setPrograms([data.program]);
        setSubjects(data.subjects || []);
        setSemesters([...new Set(data.subjects?.map(s => s.semester) || [])].sort());
      }
    } catch (error) {
      console.error('Error fetching teacher data:', error);
      setSnackbar({ open: true, message: 'Error fetching teacher data', severity: 'error' });
    }
  };

  const getFilteredSubjects = () => {
    if (!selectedSemester) return [];
    return subjects.filter(subject => subject.semester === parseInt(selectedSemester));
  };

  const validateMaxMarks = (value) => {
    const val = Number(value);
    if (Number.isNaN(val)) {
      setMaxMarksError('Please enter a valid number');
      return false;
    }
    if (val < 1) {
      setMaxMarksError('Max marks must be at least 1');
      return false;
    }
    if (val > 100) {
      setMaxMarksError('Max marks cannot exceed 100');
      return false;
    }
    setMaxMarksError('');
    return true;
  };

  const handleMarksChange = (studentId, value) => {
    if (value === '' || value === null) {
      setResults(prev => ({ ...prev, [studentId]: '' }));
      return;
    }
    const num = Number(value);
    if (Number.isNaN(num) || num < 0) return;
    if (num > Number(maxMarks)) {
      setSnackbar({ open: true, message: `Marks cannot exceed ${maxMarks}`, severity: 'warning' });
      return;
    }
    setResults(prev => ({ ...prev, [studentId]: num }));
  };

  const loadStudents = async () => {
    if (!selectedProgram || !selectedSemester || !teacherData || !selectedSubject) {
      setSnackbar({ open: true, message: 'Please select program, semester, and subject', severity: 'warning' });
      return;
    }
    if (!validateMaxMarks(maxMarks)) return;

    setLoading(true);
    setFilteringStep('Filtering students from Firebase...');

    try {
      const studentsQuery = query(
        collection(db, 'Students'),
        where('collegeId', '==', teacherData.college),
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

      setFilteringStep('Cross-referencing with MongoDB...');
      const resp = await axios.post(`${API_BASE_URL}/api/attendance/get-students`, {
        teacherCollege: teacherData.college,
        teacherProgram: selectedProgram,
        selectedSemester: selectedSemester,
        firebaseStudents: firebaseStudentsList
      });
      setFinalStudents(resp.data.students);
      setStudentsLoaded(true);

      const marksRes = await axios.get(`${API_BASE_URL}/api/results/student-marks`, {
        params: {
          collegeId: teacherData.college,
          program: selectedProgram,
          semester: selectedSemester,
          subject: selectedSubject
        }
      });
      const fetched = marksRes.data?.studentMarks || {};
      setStudentMarks(fetched);

      const prefill = {};
      resp.data.students.forEach(stu => {
        const comp = fetched[stu._id]?.[assessmentComponent];
        if (comp && typeof comp.obtained === 'number') {
          prefill[stu._id] = comp.obtained;
        }
      });
      setResults(prefill);

      setSnackbar({ open: true, message: `Loaded ${resp.data.students.length} students`, severity: 'success' });
    } catch (err) {
      console.error('Error loading students:', err);
      setSnackbar({ open: true, message: 'Failed to load students/marks', severity: 'error' });
    } finally {
      setLoading(false);
      setFilteringStep('');
    }
  };

  const getSortedStudents = useMemo(() => {
    return () => {
      const arr = [...finalStudents];
      switch (sortBy) {
        case 'name':
          arr.sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
          break;
        case 'enrollment':
          arr.sort((a, b) => (a.enrollmentNo || '').localeCompare(b.enrollmentNo || ''));
          break;
        default:
          break;
      }
      return arr;
    };
  }, [finalStudents, sortBy]);

  const hasAnyExistingMarks = finalStudents.some(
    s => studentMarks[s._id]?.[assessmentComponent]?.obtained !== undefined &&
         studentMarks[s._id]?.[assessmentComponent]?.obtained !== null
  );

  const handleUpdateSingleMark = async (studentId) => {
    const val = results[studentId];
    if (val === '' || val === undefined || val === null) {
      setSnackbar({ open: true, message: 'Enter marks before saving', severity: 'warning' });
      return;
    }
    if (!validateMaxMarks(maxMarks)) return;

    setLoading(true);
    try {
      await axios.patch(`${API_BASE_URL}/api/results/update-mark`, {
        collegeId: teacherData.college,
        program: selectedProgram,
        semester: selectedSemester,
        subject: selectedSubject,
        teacherId: teacherData.uid,
        studentId,
        component: assessmentComponent,
        obtained: Number(val),
        maxMarks: Number(maxMarks)
      });

      setStudentMarks(prev => ({
        ...prev,
        [studentId]: {
          ...(prev[studentId] || {}),
          [assessmentComponent]: { obtained: Number(val), max: Number(maxMarks) }
        }
      }));
      setEditRow(null);
      setSnackbar({ open: true, message: 'Marks updated', severity: 'success' });
    } catch (e) {
      console.error('Error updating marks:', e);
      setSnackbar({ open: true, message: 'Failed to update marks', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitResults = async () => {
    if (!selectedSubject) {
      setSnackbar({ open: true, message: 'Select subject before submitting', severity: 'warning' });
      return;
    }
    if (!validateMaxMarks(maxMarks)) return;
    if (hasAnyExistingMarks) {
      setSnackbar({ open: true, message: 'Batch submit disabled because some marks already exist. Use row-wise Update.', severity: 'warning' });
      return;
    }

    setSubmitDialog(true);
  };

  const confirmSubmitResults = async () => {
    setLoading(true);
    try {
      const payload = {
        collegeId: teacherData.college,
        program: selectedProgram,
        semester: selectedSemester,
        subject: selectedSubject,
        teacherId: teacherData.uid,
        component: assessmentComponent,
        maxMarks: Number(maxMarks),
        results: finalStudents.map(stu => ({
          studentId: stu._id,
          enrollmentNo: stu.enrollmentNo,
          studentName: `${stu.firstName} ${stu.lastName}`,
          firebaseId: stu.firebaseId,
          obtained: results[stu._id] === undefined || results[stu._id] === '' ? null : Number(results[stu._id])
        }))
      };

      await axios.post(`${API_BASE_URL}/api/results/create`, payload);
      const updated = {};
      finalStudents.forEach(stu => {
        const obtained = payload.results.find(r => r.studentId === stu._id)?.obtained;
        if (obtained !== null && obtained !== undefined) {
          updated[stu._id] = {
            ...(studentMarks[stu._id] || {}),
            [assessmentComponent]: { obtained, max: Number(maxMarks) }
          };
        }
      });
      setStudentMarks(prev => ({ ...prev, ...updated }));
      setSnackbar({ open: true, message: 'Results submitted successfully', severity: 'success' });
      setSubmitDialog(false);
      setStudentsLoaded(false);
      setFinalStudents([]);
      setResults({});
      setStudentMarks({});
      setSelectedSubject('');
      setAssessmentComponent('midSem');
    } catch (e) {
      console.error('Error submitting results:', e);
      setSnackbar({ open: true, message: 'Failed to submit results', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const getResultsStats = () => {
    const entered = Object.values(results).filter(val => val !== '' && val !== undefined && val !== null).length;
    const pending = finalStudents.length - entered;
    return { entered, pending, total: finalStudents.length };
  };

  if (!teacherData) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Loading teacher data...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1400, minHeight: '100vh', mx: 'auto' }}>
      <Typography variant="h4" gutterBottom sx={{ mb: 3 }}>
        Update Student Results
      </Typography>

      {/* Teacher Info Card */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item>
              <Avatar sx={{ width: 60, height: 60, bgcolor: 'primary.main' }}>
                <SchoolIcon />
              </Avatar>
            </Grid>
            <Grid item xs>
              <Typography variant="h6">
                {teacherData.firstName} {teacherData.lastName}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Teacher ID: {teacherData.teacherId} | Department Name: {teacherData.department}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                College Id: {teacherData.college} | Program Code: {teacherData.program}
              </Typography>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Class and Assessment Selection Card */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Class and Assessment Selection
          </Typography>
          <Stack spacing={2} sx={{ mt: 2 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <FormControl fullWidth>
                <InputLabel>Program</InputLabel>
                <Select
                  value={selectedProgram}
                  label="Program"
                  onChange={e => {
                    setSelectedProgram(e.target.value);
                    setSelectedSemester('');
                    setSelectedSubject('');
                    setFinalStudents([]);
                    setStudentsLoaded(false);
                    setStudentMarks({});
                    setResults({});
                    setEditRow(null);
                  }}
                >
                  {programs.map(p => <MenuItem key={p} value={p}>{p}</MenuItem>)}
                </Select>
              </FormControl>

              <FormControl fullWidth disabled={!selectedProgram}>
                <InputLabel>Semester</InputLabel>
                <Select
                  value={selectedSemester}
                  label="Semester"
                  onChange={e => {
                    setSelectedSemester(e.target.value);
                    setSelectedSubject('');
                    setFinalStudents([]);
                    setStudentsLoaded(false);
                    setStudentMarks({});
                    setResults({});
                    setEditRow(null);
                  }}
                >
                  {semesters.map(s => <MenuItem key={s} value={s}>Semester {s}</MenuItem>)}
                </Select>
              </FormControl>

              <FormControl fullWidth disabled={!selectedSemester}>
                <InputLabel>Subject</InputLabel>
                <Select
                  value={selectedSubject}
                  label="Subject"
                  onChange={e => {
                    setSelectedSubject(e.target.value);
                    setFinalStudents([]);
                    setStudentsLoaded(false);
                    setStudentMarks({});
                    setResults({});
                    setEditRow(null);
                  }}
                >
                  {getFilteredSubjects().map(sub => (
                    <MenuItem key={sub.subjectId} value={sub.subjectId}>{sub.subjectName}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <FormControl fullWidth disabled={!selectedSubject}>
                <InputLabel>Assessment Type</InputLabel>
                <Select
                  value={assessmentComponent}
                  label="Assessment Type"
                  onChange={e => {
                    setAssessmentComponent(e.target.value);
                    const prefill = {};
                    finalStudents.forEach(stu => {
                      const comp = studentMarks[stu._id]?.[e.target.value];
                      if (comp && typeof comp.obtained === 'number') prefill[stu._id] = comp.obtained;
                    });
                    setResults(prefill);
                    setEditRow(null);
                  }}
                >
                  {assessmentOptions.map(opt => (
                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <TextField
                fullWidth
                label="Max Marks (<=100)"
                type="number"
                inputProps={{ min: 1, max: 100 }}
                value={maxMarks}
                onChange={e => {
                  setMaxMarks(e.target.value);
                  validateMaxMarks(e.target.value);
                }}
                disabled={!selectedSubject}
                error={!!maxMarksError}
                helperText={maxMarksError}
              />
            </Stack>

            <Button
              variant="contained"
              onClick={loadStudents}
              disabled={!selectedProgram || !selectedSemester || !selectedSubject || loading || !!maxMarksError}
              fullWidth
              sx={{ height: '56px' }}
              startIcon={loading ? <CircularProgress size={20} /> : <ReplayIcon />}
            >
              {loading ? filteringStep || 'Loading Students...' : 'Load Students'}
            </Button>

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

      {/* result Summary and Sorting buttons */}
      {studentsLoaded && finalStudents.length > 0 && (
        <Card sx={{ mb: 3, width: '100%' }}>
          <CardContent>
            <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', md: 'row' } }}>
              <Paper variant="outlined" sx={{ p: 2, flex: 1, bgcolor: 'action.hover' }}>
                <Typography variant="h6" gutterBottom>
                  Results Summary ({finalStudents.length} Students)
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
                  <Chip
                    label={`Entered: ${getResultsStats().entered}`}
                    color="success"
                    size="small"
                  />
                  <Chip
                    label={`Pending: ${getResultsStats().pending}`}
                    color="warning"
                    size="small"
                  />
                  <Chip
                    label={`${finalStudents.length > 0 ? ((getResultsStats().entered / finalStudents.length) * 100).toFixed(1) : '0.0'}% Entered`}
                    color="primary"
                    size="small"
                  />
                </Box>
              </Paper>

              <Paper variant="outlined" sx={{ p: 2, flex: 1, bgcolor: 'action.hover' }}>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                  Sort Data By <SortIcon sx={{ ml: 1 }} />
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 'auto' }}>
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
      )}

      {/* Students Table */}
      {studentsLoaded && finalStudents.length > 0 && (
        <TableContainer component={Paper} sx={{ mb: 3 }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Student</TableCell>
                <TableCell>Enrollment No</TableCell>
                <TableCell>Marks (out of {Number(maxMarks) || 0})</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {getSortedStudents().map(student => {
                const comp = studentMarks[student._id]?.[assessmentComponent];
                const hasMark = comp && comp.obtained !== null && comp.obtained !== undefined;
                const isEditing = editRow === student._id;

                return (
                  <TableRow key={student._id} hover>
                    <TableCell>
                      <Box display="flex" alignItems="center" gap={2}>
                        <Avatar src={student.profilePicUrl} sx={{ width: 40, height: 40 }}>
                          {student.firstName?.charAt(0)}
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
                        {student.enrollmentNo || 'N/A'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <TextField
                        type="number"
                        size="small"
                        fullWidth
                        inputProps={{ min: 0, max: Number(maxMarks) || 0 }}
                        placeholder={`Marks out of ${Number(maxMarks) || 0}`}
                        disabled={hasMark && !isEditing}
                        value={
                          results[student._id] !== undefined && results[student._id] !== null
                            ? results[student._id]
                            : hasMark ? comp.obtained : ''
                        }
                        onChange={e => handleMarksChange(student._id, e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      {hasMark && !isEditing && (
                        <Button variant="outlined" onClick={() => setEditRow(student._id)}>
                          Update
                        </Button>
                      )}
                      {isEditing && (
                        <Button
                          variant="contained"
                          onClick={() => handleUpdateSingleMark(student._id)}
                          disabled={loading || results[student._id] === '' || results[student._id] === undefined}
                        >
                          Save
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {studentsLoaded && finalStudents.length > 0 && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
          <Button
            variant="outlined"
            onClick={() => {
              setStudentsLoaded(false);
              setFinalStudents([]);
              setResults({});
              setStudentMarks({});
              setEditRow(null);
              setSelectedSubject('');
              setAssessmentComponent('midSem');
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            size="large"
            onClick={handleSubmitResults}
            disabled={loading || hasAnyExistingMarks || !!maxMarksError}
            sx={{ minWidth: 160 }}
          >
            Submit Results
          </Button>
        </Box>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={submitDialog} onClose={() => setSubmitDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Confirm Results Submission</DialogTitle>
        <DialogContent>
          <Typography gutterBottom>
            Please confirm the results submission details:
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
                <Typography variant="body2" color="text.secondary">Assessment Type:</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="body2" fontWeight="medium">
                  {assessmentOptions.find(opt => opt.value === assessmentComponent)?.label}
                </Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="body2" color="text.secondary">Max Marks:</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="body2" fontWeight="medium">
                  {maxMarks}
                </Typography>
              </Grid>
            </Grid>
          </Box>
          <Divider sx={{ my: 2 }} />
          <Box display="flex" gap={2} justifyContent="center">
            <Chip label={`Entered: ${getResultsStats().entered}`} color="success" size="medium" />
            <Chip label={`Pending: ${getResultsStats().pending}`} color="warning" size="medium" />
            <Chip
              label={`${finalStudents.length > 0 ? ((getResultsStats().entered / finalStudents.length) * 100).toFixed(1) : '0.0'}% Entered`}
              color="primary"
              size="medium"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSubmitDialog(false)}>Cancel</Button>
          <Button
            onClick={confirmSubmitResults}
            variant="contained"
            disabled={loading || !!maxMarksError}
            startIcon={loading ? <CircularProgress size={16} /> : null}
          >
            {loading ? 'Submitting...' : 'Confirm Submit'}
          </Button>
        </DialogActions>
      </Dialog>

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
          severity={snackbar.severity || 'info'}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default ResultUpdate;