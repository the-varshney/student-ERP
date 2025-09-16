/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Card, CardContent, Typography, FormControl, InputLabel, Select, MenuItem, Button,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, IconButton,
  Snackbar, Alert, CircularProgress, Stack, TextField, Divider, InputAdornment, Tabs, Tab
} from '@mui/material';
import { auth, db } from '../../firebase/Firebase';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
  Publish as PublishIcon,
  Edit as EditIcon,
  ArrowBack as ArrowBackIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';
import { LocalizationProvider, DatePicker, MobileTimePicker } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import axios from 'axios';
import dayjs from 'dayjs';
import { v4 as uuidv4 } from 'uuid';
import SecondaryHeader from "../../components/secondaryHeader";
import { HeaderBackButton } from "../../components/header";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const formatTime12h = (t) =>
  t && dayjs.isDayjs(t) && t.isValid() ? t.format('hh:mm A') : '';
const parseTime12h = (str) =>
  typeof str === 'string' && str.trim()
    ? dayjs(str.trim(), 'hh:mm A')
    : null; 
const calcDurationHours = (start, end) => {
  if (!start || !end) return '';
  if (!dayjs.isDayjs(start) || !dayjs.isDayjs(end)) return '';
  if (!start.isValid() || !end.isValid()) return '';
  let minutes = end.diff(start, 'minute'); 
  if (minutes <= 0) {
    minutes = end.add(1, 'day').diff(start, 'minute'); 
  }
  if (minutes <= 0) return '';
  return Number((minutes / 60).toFixed(2));
};

const ExamScheduleCreator = () => {
  const [step, setStep] = useState(1);
  const [associate, setAssociate] = useState(null);
  const { role, userDetails, loading: authLoading } = useAuth();

  const [departments, setDepartments] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [semesters, setSemesters] = useState([]);

  const [selectedDept, setSelectedDept] = useState('');
  const [selectedProgram, setSelectedProgram] = useState('');
  const [selectedSemester, setSelectedSemester] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [examMonthYear, setExamMonthYear] = useState(dayjs());

  const [exams, setExams] = useState([]);

  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');

  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const [errors, setErrors] = useState({});

  const [tab, setTab] = useState('draft'); // or 'published'
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [draftList, setDraftList] = useState([]);
  const [publishedList, setPublishedList] = useState([]);

  // API headers
  const getAuthHeaders = async () => {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    const user = auth.currentUser;
    if (user) headers['Authorization'] = `Bearer ${await user.getIdToken()}`;
    return headers;
  };

useEffect(() => {
  const bootstrapAssociate = async () => {
    if (authLoading) return;
    
    try {
      setLoading(true);
      setLoadingStep('Loading profile...');
      
      const isCollegeAssociate = userDetails?.isCollegeAssociate || role === "CollegeAssociate";
      if (!isCollegeAssociate || !userDetails?.college) {
        setSnackbar({ open: true, message: 'Access denied. College Associate role with assigned college required.', severity: 'error' });
        return;
      }

      setAssociate(userDetails);

      setLoadingStep('Loading departments...');
      const deptRes = await axios.get(
        `${API_BASE_URL}/api/colleges/${userDetails.college}/departments`,
        { headers: await getAuthHeaders() }
      );
      setDepartments(deptRes.data || []);
    } catch {
      setSnackbar({ open: true, message: 'Failed to init associate data', severity: 'error' });
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };
  bootstrapAssociate();
}, [authLoading, userDetails, role]);

  // Academic year
  useEffect(() => {
    if (examMonthYear?.isValid()) {
      const examYear = examMonthYear.year();
      setAcademicYear(`${examYear - 1}-${examYear}`);
      setErrors((p) => ({ ...p, examMonthYear: '' }));
    } else {
      setAcademicYear('');
      setErrors((p) => ({ ...p, examMonthYear: 'Invalid exam month/year' }));
    }
  }, [examMonthYear]);

  // Load programs for dept
  const loadPrograms = useCallback(async (deptId) => {
    if (!associate?.college || !deptId) return;
    try {
      setLoading(true);
      setLoadingStep('Loading programs...');
      const progRes = await axios.get(
        `${API_BASE_URL}/api/departments/${associate.college}/${deptId}/programs`,
        { headers: await getAuthHeaders() }
      );
      setPrograms(progRes.data || []);
    } catch {
      setSnackbar({ open: true, message: 'Failed to load programs', severity: 'error' });
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  }, [associate]);

  // Load semesters for program
  const loadSemesters = useCallback(async (programId) => {
    if (!programId) return;
    try {
      setLoading(true);
      setLoadingStep('Loading semesters...');
      const semRes = await axios.get(
        `${API_BASE_URL}/api/programs/${programId}/semesters`,
        { headers: await getAuthHeaders() }
      );
      setSemesters(semRes.data || []);
    } catch {
      setSnackbar({ open: true, message: 'Failed to load semesters', severity: 'error' });
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  }, []);

  // Validate selections
  const validateSelections = () => {
    const newErrors = {};
    if (!selectedDept) newErrors.department = 'Department is required';
    if (!selectedProgram) newErrors.program = 'Program is required';
    if (!selectedSemester) newErrors.semester = 'Semester is required';
    if (!examMonthYear?.isValid()) newErrors.examMonthYear = 'Invalid exam month/year';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Load subjects for new editor if no draft found
  const loadSubjectsForEditor = useCallback(async () => {
    if (!selectedProgram || !selectedSemester) return;
    setLoading(true);
    setLoadingStep('Loading subjects...');
    try {
      const subjRes = await axios.get(
        `${API_BASE_URL}/api/programs/${selectedProgram}/semesters/${selectedSemester}/subjects`,
        { headers: await getAuthHeaders() }
      );
      const list = subjRes.data || [];
      const rows = list.map((sub) => ({
        id: uuidv4(),
        subjectId: sub._id,
        subjectName: sub.subjectName,
        course: sub.subjectName,
        date: dayjs(),
        startTime: null,
        endTime: null,
        durationHours: ''
      }));
      setExams(rows);
    } catch {
      setSnackbar({ open: true, message: 'Failed to load subjects', severity: 'error' });
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  }, [selectedProgram, selectedSemester]);

  // Load an existing draft into editor if available
  const loadDraftIntoEditor = useCallback(async () => {
    setLoading(true);
    setLoadingStep('Loading draft...');
    try {
      const res = await axios.get(`${API_BASE_URL}/api/exam-schedules/draft`, {
        params: {
          collegeId: associate.college,
          departmentId: selectedDept,
          programId: selectedProgram,
          semester: selectedSemester,
          academicYear,
          examMonthYear: examMonthYear.format('MM/YYYY')
        },
        headers: await getAuthHeaders()
      });
      const doc = res.data;
      const rows = (doc.exams || []).map((ex) => ({
        id: uuidv4(),
        subjectId: ex.subjectId || '',
        subjectName: ex.course || '',
        course: ex.course || '',
        date: ex.date ? dayjs(ex.date) : dayjs(),
        startTime: parseTime12h(ex.startTime || ex.time || ''),
        endTime: parseTime12h(ex.endTime || ''),
        durationHours: typeof ex.durationHours === 'number' ? ex.durationHours : ''
      }));
      setExams(rows);
      return true;
    } catch {
      return false;
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  }, [associate, selectedDept, selectedProgram, selectedSemester, academicYear, examMonthYear]);

  const handleProceed = async () => {
    if (!validateSelections()) {
      setSnackbar({ open: true, message: 'Please complete all required fields.', severity: 'warning' });
      return;
    }
    const hasDraft = await loadDraftIntoEditor();
    if (!hasDraft) {
      await loadSubjectsForEditor();
    }
    setStep(2);
  };

  const handleExamTimeChange = (id, changes) => {
    setExams((prev) =>
      prev.map((exam) => {
        if (exam.id !== id) return exam;
        const next = { ...exam, ...changes };
        if (('startTime' in changes) || ('endTime' in changes)) {
          const d = calcDurationHours(next.startTime, next.endTime);
          if (d !== '') next.durationHours = d;
        }
        return next;
      })
    );
  };

  const handleExamFieldChange = (id, field, value) => {
    setExams((prev) => prev.map((exam) => (exam.id === id ? { ...exam, [field]: value } : exam)));
  };

  const handleAddExam = () => {
    setExams((prev) => [
      ...prev,
      {
        id: uuidv4(),
        subjectId: '',
        subjectName: '',
        course: '',
        date: dayjs(),
        startTime: null,
        endTime: null,
        durationHours: ''
      }
    ]);
  };

  const handleRemoveExam = (id) => {
    setExams((prev) => prev.filter((exam) => exam.id !== id));
  };

  // Publish validation
  const hasExamErrors = useMemo(() => {
    if (!Array.isArray(exams) || exams.length === 0) return true;
    return exams.some((exam) => {
      const hasSubject = !!exam.course?.trim();
      const hasValidDate = !!exam.date && dayjs.isDayjs(exam.date) && exam.date.isValid();
      const startOk = exam.startTime && dayjs.isDayjs(exam.startTime) && exam.startTime.isValid();
      const endOk = exam.endTime && dayjs.isDayjs(exam.endTime) && exam.endTime.isValid();
      const durOk = exam.durationHours !== '' && exam.durationHours != null && Number(exam.durationHours) > 0;
      const timeValid = startOk && (endOk || durOk);
      return !(hasSubject && hasValidDate && timeValid);
    });
  }, [exams]);

  const warnExamInvalid = () => {
    setSnackbar({
      open: true,
      message: 'Please fill subject, date, start time, and either end time or duration before publishing.',
      severity: 'warning'
    });
  };

  // Map to backend fields
  const toServerExam = (exam) => ({
    subjectId: exam.subjectId || '',
    course: exam.course || '',
    date: exam.date?.isValid?.() ? exam.date.format('YYYY-MM-DD') : '',
    startTime: formatTime12h(exam.startTime), // send "hh:mm A" 
    endTime: formatTime12h(exam.endTime),    
    durationHours:
      exam.durationHours === '' || exam.durationHours == null
        ? null
        : Number(exam.durationHours)
  });

  const handleSaveDraft = async () => {
    setLoading(true);
    try {
      await axios.post(
        `${API_BASE_URL}/api/exam-schedules/draft`,
        {
          collegeId: associate.college,
          departmentId: selectedDept,
          programId: selectedProgram,
          semester: selectedSemester,
          academicYear,
          examMonthYear: examMonthYear.format('MM/YYYY'),
          exams: exams.map(toServerExam)
        },
        { headers: await getAuthHeaders() }
      );
      setSnackbar({ open: true, message: 'Draft saved successfully!', severity: 'success' });
      await refreshScheduleLists();
    } catch {
      setSnackbar({ open: true, message: 'Failed to save draft.', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handlePublish = async () => {
    if (hasExamErrors) {
      warnExamInvalid();
      return;
    }
    setLoading(true);
    try {
      await axios.post(
        `${API_BASE_URL}/api/exam-schedules/publish`,
        {
          collegeId: associate.college,
          departmentId: selectedDept,
          programId: selectedProgram,
          semester: selectedSemester,
          academicYear,
          examMonthYear: examMonthYear.format('MM/YYYY'),
          exams: exams.map(toServerExam)
        },
        { headers: await getAuthHeaders() }
      );
      setSnackbar({ open: true, message: 'Schedule published successfully!', severity: 'success' });
      await refreshScheduleLists();
    } catch {
      setSnackbar({ open: true, message: 'Failed to publish schedule.', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const refreshScheduleLists = useCallback(async () => {
    if (!associate?.college) return;
    setListError('');
    setListLoading(true);
    try {
      const baseParams = { collegeId: associate.college };

      const haveFilters =
        selectedDept || selectedProgram || selectedSemester || academicYear || (examMonthYear?.isValid?.());
      try {
        const resDraft = await axios.get(`${API_BASE_URL}/api/exam-schedules/list`, {
          params: {
            ...baseParams,
            status: 'DRAFT',
            departmentId: haveFilters ? selectedDept : undefined,
            programId: haveFilters ? selectedProgram : undefined,
            semester: haveFilters ? selectedSemester : undefined,
            academicYear: haveFilters ? academicYear : undefined,
            examMonthYear:
              haveFilters && examMonthYear?.isValid?.() ? examMonthYear.format('MM/YYYY') : undefined
          },
          headers: await getAuthHeaders()
        });
        setDraftList(Array.isArray(resDraft.data) ? resDraft.data : []);
      } catch {
        if (selectedDept && selectedProgram && selectedSemester && academicYear && examMonthYear?.isValid?.()) {
          try {
            const one = await axios.get(`${API_BASE_URL}/api/exam-schedules/draft`, {
              params: {
                collegeId: associate.college,
                departmentId: selectedDept,
                programId: selectedProgram,
                semester: selectedSemester,
                academicYear,
                examMonthYear: examMonthYear.format('MM/YYYY')
              },
              headers: await getAuthHeaders()
            });
            setDraftList(one.data ? [one.data] : []);
          } catch {
            setDraftList([]);
          }
        } else {
          setDraftList([]);
        }
      }

      // PUBLISHED list
      try {
        const resPub = await axios.get(`${API_BASE_URL}/api/exam-schedules/list`, {
          params: {
            ...baseParams,
            status: 'PUBLISHED',
            departmentId: haveFilters ? selectedDept : undefined,
            programId: haveFilters ? selectedProgram : undefined,
            semester: haveFilters ? selectedSemester : undefined,
            academicYear: haveFilters ? academicYear : undefined,
            examMonthYear:
              haveFilters && examMonthYear?.isValid?.() ? examMonthYear.format('MM/YYYY') : undefined
          },
          headers: await getAuthHeaders()
        });
        setPublishedList(Array.isArray(resPub.data) ? resPub.data : []);
      } catch {
        try {
          const params = {
            collegeId: associate.college,
            programId: selectedProgram,
            semester: selectedSemester
          };
          if (academicYear) params.academicYear = academicYear;
          if (examMonthYear?.isValid?.()) params.examMonthYear = examMonthYear.format('MM/YYYY');
          const onePub = await axios.get(`${API_BASE_URL}/api/exam-schedules/public`, {
            params,
            headers: await getAuthHeaders()
          });
          setPublishedList(onePub.data ? [onePub.data] : []);
        } catch {
          setPublishedList([]);
        }
      }
    } catch {
      setListError('Failed to load schedules');
    } finally {
      setListLoading(false);
    }
  }, [
    associate,
    selectedDept,
    selectedProgram,
    selectedSemester,
    academicYear,
    examMonthYear
  ]);

  useEffect(() => {
    if (step === 1) refreshScheduleLists();
  }, [step, refreshScheduleLists]);

  // Edit draft
  const handleEditDraft = async (doc) => {
    setSelectedDept(doc.departmentId || '');
    setSelectedProgram(doc.programId || '');
    setSelectedSemester(doc.semester || '');
    setExamMonthYear(dayjs(doc.examMonthYear, 'MM/YYYY'));
    setAcademicYear(doc.academicYear || academicYear);

    const rows = (doc.exams || []).map((ex) => ({
      id: uuidv4(),
      subjectId: ex.subjectId || '',
      subjectName: ex.course || '',
      course: ex.course || '',
      date: ex.date ? dayjs(ex.date) : dayjs(),
      startTime: parseTime12h(ex.startTime || ex.time || ''),
      endTime: parseTime12h(ex.endTime || ''),
      durationHours: typeof ex.durationHours === 'number' ? ex.durationHours : ''
    }));
    setExams(rows);
    setStep(2);
  };

  // Delete draft
  const handleDeleteDraft = async (doc) => {
    if (!doc?._id) return;
    if (!confirm('Delete this draft schedule?')) return;
    try {
      await axios.delete(`${API_BASE_URL}/api/exam-schedules/${doc._id}`, {
        headers: await getAuthHeaders()
      });
      setSnackbar({ open: true, message: 'Draft deleted', severity: 'success' });
      await refreshScheduleLists();
    } catch {
      setSnackbar({ open: true, message: 'Failed to delete draft. Ensure DELETE route exists.', severity: 'error' });
    }
  };

  if (authLoading || !associate){
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Loading associate data...</Typography>
      </Box>
    );
  }

  // Drafts table
  const renderDraftsSummary = () => {
    if (listLoading) {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
          <CircularProgress size={18} />
          <Typography variant="body2">Loading…</Typography>
        </Box>
      );
    }
    if (listError) {
      return <Typography color="error" variant="body2">{listError}</Typography>;
    }
    if (!draftList || draftList.length === 0) {
      return <Typography variant="body2">No drafts to display.</Typography>;
    }
    return (
      <TableContainer component={Paper} sx={{ mt: 1 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Program</TableCell>
              <TableCell>Semester</TableCell>
              <TableCell>Last Saved</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {draftList.map((doc) => (
              <TableRow key={doc._id}>
                <TableCell>{doc.programId}</TableCell>
                <TableCell>{doc.semester}</TableCell>
                <TableCell>{doc.updatedAt ? dayjs(doc.updatedAt).format('YYYY-MM-DD HH:mm') : '—'}</TableCell>
                <TableCell align="right">
                  <Button
                    size="small"
                    startIcon={<EditIcon />}
                    onClick={() => handleEditDraft(doc)}
                    sx={{ mr: 1 }}
                  >
                    Edit
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    startIcon={<DeleteIcon />}
                    onClick={() => handleDeleteDraft(doc)}
                  >
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  };

  // Published table
  const renderPublishedSummary = () => {
    if (listLoading) {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
          <CircularProgress size={18} />
          <Typography variant="body2">Loading…</Typography>
        </Box>
      );
    }
    if (listError) {
      return <Typography color="error" variant="body2">{listError}</Typography>;
    }
    if (!publishedList || publishedList.length === 0) {
      return <Typography variant="body2">No published schedules to display.</Typography>;
    }
    return (
      <TableContainer component={Paper} sx={{ mt: 1 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Program</TableCell>
              <TableCell>Semester</TableCell>
              <TableCell>Academic Year</TableCell>
              <TableCell>Exam Month/Year</TableCell>
              <TableCell>Updated</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {publishedList.map((doc) => (
              <TableRow key={doc._id || `${doc.programId}-${doc.semester}-${doc.academicYear}-${doc.examMonthYear}`}>
                <TableCell>{doc.programId}</TableCell>
                <TableCell>{doc.semester}</TableCell>
                <TableCell>{doc.academicYear}</TableCell>
                <TableCell>{doc.examMonthYear}</TableCell>
                <TableCell>{doc.updatedAt ? dayjs(doc.updatedAt).format('YYYY-MM-DD HH:mm') : '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box sx={{ p: 3, maxWidth: 1400, minHeight: '100vh', mx: 'auto' }}>
        <SecondaryHeader title="Create Exam Schedule" leftArea={<HeaderBackButton/>}/>

        {step === 1 ? (
          <>
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Select Class and Exam Details
                </Typography>

                <Stack spacing={2} sx={{ mt: 2 }}>
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                    <FormControl fullWidth error={!!errors.department}>
                      <InputLabel>Department</InputLabel>
                      <Select
                        value={selectedDept}
                        label="Department"
                        onChange={(e) => {
                          setSelectedDept(e.target.value);
                          setSelectedProgram('');
                          setSelectedSemester('');
                          setExams([]);
                          setErrors((prev) => ({ ...prev, department: '' }));
                          if (e.target.value) loadPrograms(e.target.value);
                        }}
                      >
                        <MenuItem value="">
                          <em>Select Department</em>
                        </MenuItem>
                        {departments.map((dept) => (
                          <MenuItem key={dept._id || dept.id} value={dept._id || dept.id}>
                            {dept.departmentName || dept.name}
                          </MenuItem>
                        ))}
                      </Select>
                      {errors.department && (
                        <Typography color="error" variant="caption">
                          {errors.department}
                        </Typography>
                      )}
                    </FormControl>

                    <FormControl fullWidth disabled={!selectedDept} error={!!errors.program}>
                      <InputLabel>Program</InputLabel>
                      <Select
                        value={selectedProgram}
                        label="Program"
                        onChange={(e) => {
                          setSelectedProgram(e.target.value);
                          setSelectedSemester('');
                          setExams([]);
                          setErrors((prev) => ({ ...prev, program: '' }));
                          if (e.target.value) loadSemesters(e.target.value);
                        }}
                      >
                        <MenuItem value="">
                          <em>Select Program</em>
                        </MenuItem>
                        {programs.map((prog) => (
                          <MenuItem key={prog._id} value={prog._id}>
                            {prog.programName}
                          </MenuItem>
                        ))}
                      </Select>
                      {errors.program && (
                        <Typography color="error" variant="caption">
                          {errors.program}
                        </Typography>
                      )}
                    </FormControl>

                    <FormControl fullWidth disabled={!selectedProgram} error={!!errors.semester}>
                      <InputLabel>Semester</InputLabel>
                      <Select
                        value={selectedSemester}
                        label="Semester"
                        onChange={(e) => {
                          setSelectedSemester(e.target.value);
                          setExams([]);
                          setErrors((prev) => ({ ...prev, semester: '' }));
                        }}
                      >
                        <MenuItem value="">
                          <em>Select Semester</em>
                        </MenuItem>
                        {semesters.map((s) => (
                          <MenuItem key={s.semesterNumber || s} value={s.semesterNumber || s}>
                            Semester {s.semesterNumber || s}
                          </MenuItem>
                        ))}
                      </Select>
                      {errors.semester && (
                        <Typography color="error" variant="caption">
                          {errors.semester}
                        </Typography>
                      )}
                    </FormControl>
                  </Stack>

                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                    <FormControl fullWidth error={!!errors.examMonthYear}>
                      <DatePicker
                        views={['month', 'year']}
                        label="Exam Month and Year"
                        value={examMonthYear}
                        onChange={(newValue) => setExamMonthYear(newValue)}
                        slotProps={{
                          textField: {
                            fullWidth: true,
                            error: !!errors.examMonthYear,
                            helperText: errors.examMonthYear
                          }
                        }}
                      />
                    </FormControl>

                    <TextField
                      fullWidth
                      label="Academic Year"
                      value={academicYear}
                      InputProps={{ readOnly: true }}
                      error={!!errors.academicYear}
                      helperText={errors.academicYear}
                    />
                  </Stack>

                  <Button
                    variant="contained"
                    onClick={handleProceed}
                    disabled={
                      loading ||
                      !selectedDept ||
                      !selectedProgram ||
                      !selectedSemester ||
                      !examMonthYear?.isValid()
                    }
                    fullWidth
                    sx={{ height: '56px' }}
                    startIcon={loading ? <CircularProgress size={18} /> : null}
                  >
                    {loading ? loadingStep || 'Loading...' : 'Proceed to Schedule Editor'}
                  </Button>
                </Stack>
              </CardContent>
            </Card>

            {/* Schedules list box */}
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="h6">Schedules</Typography>
                  <Button startIcon={<RefreshIcon />} onClick={refreshScheduleLists} size="small">
                    Refresh
                  </Button>
                </Box>
                <Tabs
                  value={tab}
                  onChange={(_, v) => setTab(v)}
                  aria-label="Schedules tabs"
                  sx={{ mb: 2 }}
                >
                  <Tab value="draft" label="Draft" />
                  <Tab value="published" label="Published" />
                </Tabs>

                {tab === 'draft' ? renderDraftsSummary() : renderPublishedSummary()}
              </CardContent>
            </Card>
          </>
        ) : (
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="h6">
                  Exam Schedule Editor for Semester {selectedSemester} ({academicYear})
                </Typography>
                <Button
                  startIcon={<ArrowBackIcon />}
                  onClick={() => setStep(1)}
                  variant="text"
                >
                  Back to Select
                </Button>
              </Box>

              <TableContainer component={Paper} sx={{ mb: 3, mt: 2 }}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Subject</TableCell>
                      <TableCell>Date</TableCell>
                      <TableCell>Start Time</TableCell>
                      <TableCell>End Time</TableCell>
                      <TableCell>Duration (hours)</TableCell>
                      <TableCell>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {exams.map((exam) => {
                      const dateError = !exam.date || !exam.date.isValid();
                      const startOk = exam.startTime && dayjs.isDayjs(exam.startTime) && exam.startTime.isValid();
                      const endOk = exam.endTime && dayjs.isDayjs(exam.endTime) && exam.endTime.isValid();
                      const durOk = exam.durationHours !== '' && exam.durationHours != null && Number(exam.durationHours) > 0;

                      return (
                        <TableRow key={exam.id} sx={{ verticalAlign: 'top' }}>
                          <TableCell sx={{ maxWidth: 360 }}>
                            <Typography sx={{ fontWeight: 700 }}>
                              {exam.subjectId || '—'}:
                            </Typography>
                            <Typography
                              variant="body2"
                              sx={{
                                fontSize: '0.9rem',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                                wordBreak: 'break-word',
                              }}
                              title={exam.subjectName || exam.course}
                            >
                              {exam.subjectName || exam.course || '—'}
                            </Typography>
                          </TableCell>

                          <TableCell>
                            <DatePicker
                              value={exam.date}
                              onChange={(newValue) => handleExamFieldChange(exam.id, 'date', newValue)}
                              slotProps={{
                                textField: {
                                  fullWidth: true,
                                  error: dateError,
                                  helperText: dateError ? 'Invalid date' : ''
                                                                  }
                              }}
                            />
                          </TableCell>

                          <TableCell>
                            <MobileTimePicker
                              label="Start Time"
                              value={exam.startTime}
                              onChange={(val) => handleExamTimeChange(exam.id, { startTime: val })}
                              minutesStep={5}
                              slotProps={{ textField: { fullWidth: true, variant: 'outlined' } }}
                            />
                          </TableCell>

                          <TableCell>
                            <MobileTimePicker
                              label="End Time"
                              value={exam.endTime}
                              onChange={(val) => handleExamTimeChange(exam.id, { endTime: val })}
                              minutesStep={5}
                              slotProps={{ textField: { fullWidth: true, variant: 'outlined' } }}
                            />
                          </TableCell>

                          <TableCell>
                            <TextField
                              type="number"
                              label="Duration"
                              value={exam.durationHours}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const val = raw === '' ? '' : Number(raw);
                                handleExamFieldChange(exam.id, 'durationHours', val);
                              }}
                              fullWidth
                              variant="outlined"
                              inputProps={{ step: 0.5, min: 0 }}
                              InputProps={{ endAdornment: <InputAdornment position="end">hours</InputAdornment> }}
                              helperText={startOk && !(endOk || durOk) ? 'Enter end time or duration' : ''}
                              error={startOk ? !(endOk || durOk) : false}
                            />
                          </TableCell>

                          <TableCell>
                            <IconButton color="error" onClick={() => handleRemoveExam(exam.id)}>
                              <DeleteIcon />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>

              <Button variant="outlined" startIcon={<AddIcon />} onClick={handleAddExam}>
                Add Exam
              </Button>

              <Divider sx={{ my: 2 }} />

              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
                <Button
                  variant="contained"
                  color="secondary"
                  startIcon={<SaveIcon />}
                  onClick={handleSaveDraft}
                  disabled={loading}
                >
                  Save as Draft
                </Button>

                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<PublishIcon />}
                  onClick={handlePublish}
                  disabled={loading || hasExamErrors}
                >
                  Publish
                </Button>
              </Box>
            </CardContent>
          </Card>
        )}

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
    </LocalizationProvider>
  );
};

export default ExamScheduleCreator;
