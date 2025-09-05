import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  TextField,
  CircularProgress,
  Snackbar,
  Alert,
  Stack,
  LinearProgress,
  Avatar,
  Tabs,
  Tab,
  Divider,
  IconButton,
  Tooltip,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  Grid,
  TableRow,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Fade,
  Zoom,
  useTheme,
  alpha,
  CardActions,
  FormGroup,
  FormControlLabel,
  Switch,
  OutlinedInput,
  Checkbox,
  useMediaQuery,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Visibility as VisibilityIcon,
  DoneAll as DoneAllIcon,
  Save as SaveIcon,
  UploadFile as UploadFileIcon,
  Assignment as AssignmentIcon,
  Grade as GradeIcon,
  CloudUpload as CloudUploadIcon,
  Download as DownloadIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Search as SearchIcon,
  Assessment as AssessmentIcon,
  Schedule as ScheduleIcon,
  People as PeopleIcon,
  Policy as PolicyIcon,
  FilterAlt as FilterAltIcon,
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { MobileTimePicker } from '@mui/x-date-pickers/MobileTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { auth, db, storage } from '../../firebase/Firebase';
import {
  collection,
  query,
  where,
  addDoc,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  serverTimestamp,
  deleteDoc,
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import axios from 'axios';

dayjs.extend(utc);

const FILE_TYPE_PRESETS = [
  { label: 'PDF (.pdf)', value: '.pdf' },
  { label: 'Word (.doc,.docx)', value: '.doc,.docx' },
  { label: 'Images (image/*)', value: 'image/*' },
  { label: 'Spreadsheet (.xls,.xlsx)', value: '.xls,.xlsx' },
  { label: 'Text (.txt)', value: '.txt' },
  { label: 'Zip (.zip,.rar)', value: '.zip,.rar' },
  { label: 'PowerPoint (.ppt,.pptx)', value: '.ppt,.pptx' },
  { label: 'Code (.js,.ts,.java,.c,.cpp,.py)', value: '.js,.ts,.java,.c,.cpp,.py' },
  { label: 'Other (custom)', value: '__OTHER__' },
];

const TeacherAssignmentManager = () => {
  const theme = useTheme();
  const isLgUp = useMediaQuery(theme.breakpoints.up('lg'));
  const isMdDown = useMediaQuery(theme.breakpoints.down('md'));
  const navigate = useNavigate();
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  // Teacher Data
  const [teacherData, setTeacherData] = useState(null);
  const [programs, setPrograms] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [subjects, setSubjects] = useState([]);

  // Assignment Creation/Edit Form
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    program: '',
    semester: '',
    subject: '',
    maxMarks: '',
    deadline: null,
    time: null,
    resource: null,
    // rules
    allowResubmission: true,
    allowTextAnswer: true,
    requireFileUpload: false,
    acceptedFileTypeOptions: ['.pdf',],
    acceptedFileTypesOther: '',
  });
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Submissions Management
  const [assignments, setAssignments] = useState([]);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [gradeMap, setGradeMap] = useState({});
  const [componentType, setComponentType] = useState('assignment1');
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  // Dialog States
  const [deleteDialog, setDeleteDialog] = useState({ open: false, assignment: null });
  const [editDialog, setEditDialog] = useState({ open: false, assignment: null });
  const [submissionDialog, setSubmissionDialog] = useState({ open: false, submission: null });

  // Initialize teacher data
  useEffect(() => {
    const initializeTeacherData = async () => {
      try {
        setLoading(true);
        const user = auth.currentUser;
        if (!user) {
          navigate('/login');
          return;
        }
        const teacherDoc = await getDoc(doc(db, 'Teachers', user.uid));
        if (teacherDoc.exists() && teacherDoc.data().role === 'Teacher') {
          const data = teacherDoc.data();
          setTeacherData(data);
          setPrograms([data.program]);
          const uniqueSemesters = [...new Set(data.subjects?.map(s => s.semester) || [])];
          setSemesters(uniqueSemesters.sort((a, b) => a - b));
          setSubjects(data.subjects || []);
        } else {
          navigate('/home');
        }
      } catch (error) {
        console.error('Error fetching teacher data:', error);
        showSnackbar('Error fetching teacher data', 'error');
      } finally {
        setLoading(false);
      }
    };
    initializeTeacherData();
  }, [navigate]);

  useEffect(() => {
    if (activeTab === 1 && auth.currentUser) loadAssignments();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 1 && selectedAssignment) loadSubmissions(selectedAssignment.id);
  }, [activeTab, selectedAssignment, componentType]);

  const showSnackbar = useCallback((message, severity = 'success') => {
    setSnackbar({ open: true, message, severity });
  }, []);
  const hideSnackbar = useCallback(() => setSnackbar(prev => ({ ...prev, open: false })), []);

  const resetForm = useCallback(() => {
    setFormData({
      title: '',
      description: '',
      program: '',
      semester: '',
      subject: '',
      maxMarks: '',
      deadline: null,
      time: null,
      resource: null,
      allowResubmission: true,
      allowTextAnswer: true,
      requireFileUpload: false,
      acceptedFileTypeOptions: ['.pdf', 'image/*'],
      acceptedFileTypesOther: '',
    });
    setUploadProgress(0);
  }, []);

  const computeAcceptedFileTypesString = useCallback((options, other) => {
    const norm = (options || []).filter(v => v && v !== '__OTHER__').join(',');
    const extra = (other || '').trim();
    if (norm && extra) return `${norm},${extra}`;
    if (norm) return norm;
    return extra;
  }, []);

  // Form handlers
  const handleFormChange = useCallback((field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
      ...(field === 'program' && { semester: '', subject: '' }),
      ...(field === 'semester' && { subject: '' }),
    }));
  }, []);
  const handleSwitchChange = useCallback((field, checked) => setFormData(prev => ({ ...prev, [field]: checked })), []);
  const handleFileTypeOptionsChange = useCallback((e) => {
    const value = e.target.value;
    setFormData(prev => ({ ...prev, acceptedFileTypeOptions: typeof value === 'string' ? value.split(',') : value }));
  }, []);

  const getFilteredSubjects = useMemo(() => {
    if (!formData.semester) return [];
    return subjects.filter(s => s.semester === parseInt(formData.semester));
  }, [subjects, formData.semester]);

  // Upload function
  const handleFileUpload = useCallback(async (file) => {
    if (!file) return null;
    const storageRef = ref(storage, `assignments/${Date.now()}_${file.name}`);
    const uploadTask = uploadBytesResumable(storageRef, file);
    return new Promise((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snap) => setUploadProgress((snap.bytesTransferred / snap.totalBytes) * 100),
        reject,
        async () => {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          resolve({ url, type: file.type, name: file.name });
        }
      );
    });
  }, []);

  // Create assignment
  const handleCreateAssignment = async () => {
    const {
      title, program, semester, subject, deadline, time, maxMarks, description, resource,
      allowResubmission, allowTextAnswer, requireFileUpload, acceptedFileTypeOptions, acceptedFileTypesOther,
    } = formData;

    if (!title || !program || !semester || !subject || !deadline || !time || !maxMarks) {
      showSnackbar('All required fields must be filled', 'error');
      return;
    }
    const parsedMaxMarks = parseFloat(maxMarks);
    if (isNaN(parsedMaxMarks) || parsedMaxMarks <= 0) {
      showSnackbar('Maximum marks must be a positive number', 'error');
      return;
    }
    try {
      setUploading(true);
      const deadlineDateTime = dayjs(deadline).hour(dayjs(time).hour()).minute(dayjs(time).minute()).second(0).toISOString();
      let fileData = resource ? await handleFileUpload(resource) : null;
      const subjectData = getFilteredSubjects.find(s => s.subjectId === subject);
      const acceptedFileTypes = computeAcceptedFileTypesString(acceptedFileTypeOptions, acceptedFileTypesOther);

      await addDoc(collection(db, 'assignments'), {
        title,
        description,
        program,
        semester: parseInt(semester),
        subjectId: subject,
        subjectName: subjectData?.subjectName || subject,
        maxMarks: parsedMaxMarks,
        deadline: deadlineDateTime,
        resourceUrl: fileData?.url || '',
        resourceType: fileData?.type || '',
        resourceName: fileData?.name || '',
        createdAt: serverTimestamp(),
        teacherId: auth.currentUser.uid,
        teacherName: `${teacherData.firstName} ${teacherData.lastName}`,
        collegeId: teacherData.college,
        status: 'active',
        allowResubmission,
        allowTextAnswer,
        requireFileUpload,
        acceptedFileTypes,
      });

      showSnackbar('Assignment created successfully!', 'success');
      resetForm();
      if (activeTab === 1) loadAssignments();
    } catch (error) {
      console.error('Error creating assignment:', error);
      showSnackbar(`Error creating assignment: ${error.message}`, 'error');
    } finally {
      setUploading(false);
    }
  };

  // Load assignments
  const loadAssignments = async () => {
    try {
      setLoading(true);
      const user = auth.currentUser;
      const qRef = query(collection(db, 'assignments'), where('teacherId', '==', user.uid));
      const snapshot = await getDocs(qRef);
      const list = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const toMillis = (v) => v?.toMillis?.() ?? new Date(v).getTime?.() ?? 0;
          const aT = a.createdAt ? toMillis(a.createdAt) : 0;
          const bT = b.createdAt ? toMillis(b.createdAt) : 0;
          return bT - aT;
        });
      setAssignments(list);
      if (list.length > 0 && !selectedAssignment) setSelectedAssignment(list[0]);
    } catch (error) {
      console.error('Error loading assignments:', error);
      showSnackbar('Failed to load assignments', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Load submissions
  const loadSubmissions = async (assignmentId) => {
    try {
      setLoading(true);
      const qRef = query(collection(db, 'submissions'), where('assignmentId', '==', assignmentId));
      const snapshot = await getDocs(qRef);
      const submissionsList = snapshot.docs
        .map(docSnap => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            ...data,
            studentId: data.studentFirebaseId || data.studentId || docSnap.id,
          };
        })
        .sort((a, b) => {
          const dateA = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
          const dateB = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
          return dateB - dateA;
        });

      const names = submissionsList.reduce((acc, s) => {
        acc[s.studentFirebaseId] = s.studentName || s.enrollmentNo || 'Unknown';
        return acc;
      }, {});
      const mapped = submissionsList.map(s => ({ ...s, studentName: names[s.studentFirebaseId] || 'Unknown' }));
      setSubmissions(mapped);

      const assignment = assignments.find(a => a.id === assignmentId);
      if (assignment) {
        try {
          const resp = await axios.get(`${API_BASE_URL}/api/results/student-marks`, {
            params: {
              collegeId: assignment.collegeId,
              program: assignment.program,
              semester: String(assignment.semester),
              subject: assignment.subjectId,
            },
          });
          const marksData = resp.data?.studentMarks || {};
          const newGradeMap = {};
          submissionsList.forEach(sub => {
            const key = sub.studentMongoId;
            const comp = marksData[String(key)]?.[componentType];
            newGradeMap[sub.studentId] = { obtained: comp?.obtained ?? null };
          });
          setGradeMap(newGradeMap);
        } catch (error) {
          console.error('Error loading marks:', error);
          const newGradeMap = {};
          submissionsList.forEach(sub => { newGradeMap[sub.studentId] = { obtained: null }; });
          setGradeMap(newGradeMap);
        }
      }
    } catch (error) {
      console.error('Error loading submissions:', error);
      showSnackbar('Failed to load submissions', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Grades
  const handleGradeChange = useCallback((studentId, value) => {
    const num = value === '' ? null : Number(value);
    if (num !== null && (isNaN(num) || num < 0)) return;
    setGradeMap(prev => ({ ...prev, [studentId]: { obtained: num } }));
  }, []);

  const saveAllGrades = async () => {
    if (!selectedAssignment || !selectedAssignment.subjectId) {
      showSnackbar('Invalid assignment - missing subject information', 'error');
      return;
    }
    try {
      setSaving(true);
      const payload = {
        collegeId: selectedAssignment.collegeId,
        program: selectedAssignment.program,
        semester: String(selectedAssignment.semester),
        subject: selectedAssignment.subjectId,
        teacherId: selectedAssignment.teacherId,
        component: componentType,
        maxMarks: selectedAssignment.maxMarks,
        results: submissions
          .filter(s => !!s.studentMongoId)
          .map(s => ({
            studentId: s.studentMongoId,
            enrollmentNo: s.enrollmentNo || '',
            studentName: s.studentName || '',
            firebaseId: s.studentId,
            obtained: gradeMap[s.studentId]?.obtained ?? null,
          })),
      };
      await axios.post(`${API_BASE_URL}/api/results/create`, payload);

      const updatePromises = submissions.map(s => {
        const obtained = gradeMap[s.studentId]?.obtained;
        if (obtained !== null && obtained !== undefined) {
          return updateDoc(doc(db, 'submissions', s.id), {
            obtainedMarks: obtained,
            status: 'graded',
            gradedAt: new Date(),
            gradedBy: selectedAssignment.teacherId,
          });
        }
        return Promise.resolve();
      });
      await Promise.all(updatePromises);
      showSnackbar('All grades saved successfully!', 'success');
    } catch (error) {
      console.error('Error saving grades:', error);
      showSnackbar(`Failed to save grades: ${error.response?.data?.error || error.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveIndividualGrade = async (submission) => {
    if (!selectedAssignment || !selectedAssignment.subjectId) {
      showSnackbar('Invalid assignment - missing subject information', 'error');
      return;
    }
    if (!submission.studentMongoId) {
      showSnackbar('Missing student database id on submission', 'error');
      return;
    }
    try {
      setSaving(true);
      const obtained = gradeMap[submission.studentId]?.obtained ?? null;
      await axios.patch(`${API_BASE_URL}/api/results/update-mark`, {
        collegeId: selectedAssignment.collegeId,
        program: selectedAssignment.program,
        semester: String(selectedAssignment.semester),
        subject: selectedAssignment.subjectId,
        teacherId: selectedAssignment.teacherId,
        studentId: submission.studentMongoId,
        component: componentType,
        obtained,
        maxMarks: selectedAssignment.maxMarks,
      });
      if (obtained !== null && obtained !== undefined) {
        await updateDoc(doc(db, 'submissions', submission.id), {
          obtainedMarks: obtained,
          status: 'graded',
          gradedAt: new Date(),
          gradedBy: selectedAssignment.teacherId,
        });
      }
      showSnackbar('Grade updated successfully!', 'success');
    } catch (error) {
      console.error('Error updating grade:', error);
      showSnackbar(`Failed to update grade: ${error.response?.data?.error || error.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Delete
  const handleDeleteAssignment = async (assignment) => {
    try {
      setLoading(true);
      if (assignment.resourceUrl) {
        const fileRef = ref(storage, assignment.resourceUrl);
        await deleteObject(fileRef).catch(() => {});
      }
      await deleteDoc(doc(db, 'assignments', assignment.id));
      await loadAssignments();
      if (selectedAssignment?.id === assignment.id) {
        setSelectedAssignment(null);
        setSubmissions([]);
        setGradeMap({});
      }
      showSnackbar('Assignment deleted successfully!', 'success');
      setDeleteDialog({ open: false, assignment: null });
    } catch (error) {
      console.error('Error deleting assignment:', error);
      showSnackbar('Failed to delete assignment', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Edit
  const handleEditAssignment = async () => {
    const {
      title, description, maxMarks, deadline, time, resource,
      allowResubmission, allowTextAnswer, requireFileUpload,
      acceptedFileTypeOptions, acceptedFileTypesOther,
    } = formData;

    if (!editDialog.assignment || !editDialog.assignment.subjectId) {
      showSnackbar('Invalid assignment - missing subject information', 'error');
      return;
    }
    if (!title || !maxMarks || !deadline || !time) {
      showSnackbar('Required fields missing', 'error');
      return;
    }
    const parsedMaxMarks = parseFloat(maxMarks);
    if (isNaN(parsedMaxMarks) || parsedMaxMarks <= 0) {
      showSnackbar('Maximum marks must be a positive number', 'error');
      return;
    }
    try {
      setUploading(true);
      const deadlineDateTime = `${dayjs(deadline).format('YYYY-MM-DD')}T${dayjs(time).format('HH:mm')}:00Z`;

      let fileData = selectedAssignment?.resourceUrl
        ? { url: selectedAssignment.resourceUrl, type: selectedAssignment.resourceType, name: selectedAssignment.resourceName }
        : null;

      if (resource && resource !== 'delete') {
        if (selectedAssignment?.resourceUrl) {
          const oldRef = ref(storage, selectedAssignment.resourceUrl);
          await deleteObject(oldRef).catch(() => {});
        }
        fileData = await handleFileUpload(resource);
      } else if (resource === 'delete') {
        if (selectedAssignment?.resourceUrl) {
          const oldRef = ref(storage, selectedAssignment.resourceUrl);
          await deleteObject(oldRef).catch(() => {});
        }
        fileData = null;
      }

      const acceptedFileTypes = computeAcceptedFileTypesString(acceptedFileTypeOptions, acceptedFileTypesOther);

      await updateDoc(doc(db, 'assignments', editDialog.assignment.id), {
        title,
        description,
        maxMarks: parsedMaxMarks,
        deadline: deadlineDateTime,
        resourceUrl: fileData?.url || '',
        resourceType: fileData?.type || '',
        resourceName: fileData?.name || '',
        allowResubmission,
        allowTextAnswer,
        requireFileUpload,
        acceptedFileTypes,
      });

      showSnackbar('Assignment updated successfully!', 'success');
      setEditDialog({ open: false, assignment: null });
      resetForm();
      await loadAssignments();
    } catch (error) {
      console.error('Error updating assignment:', error);
      showSnackbar(`Failed to update assignment: ${error.message}`, 'error');
    } finally {
      setUploading(false);
    }
  };

  // filters
  const filteredSubmissions = useMemo(() => {
    return submissions.filter(s => {
      const matchesSearch =
        !searchTerm ||
        s.studentName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.studentId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.enrollmentNo?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus =
        filterStatus === 'all' ||
        (filterStatus === 'graded' && s.status === 'graded') ||
        (filterStatus === 'ungraded' && s.status !== 'graded');
      return matchesSearch && matchesStatus;
    });
  }, [submissions, searchTerm, filterStatus]);

  const statistics = useMemo(() => {
    const total = submissions.length;
    const graded = submissions.filter(s => s.status === 'graded').length;
    const pending = total - graded;
    const avgMarks =
      submissions.length > 0
        ? submissions.filter(s => s.obtainedMarks != null).reduce((sum, s) => sum + (s.obtainedMarks || 0), 0) /
          submissions.filter(s => s.obtainedMarks != null).length
        : 0;
    return { total, graded, pending, avgMarks: Math.round(avgMarks * 100) / 100 };
  }, [submissions]);

  if (!teacherData) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)}, ${alpha(theme.palette.secondary.main, 0.1)})` }}>
        <Card sx={{ p: 4, textAlign: 'center' }}>
          <CircularProgress size={50} sx={{ mb: 2 }} />
          <Typography variant="h6" color="text.secondary">Loading teacher data...</Typography>
        </Card>
      </Box>
    );
  }
  const CreateTab = (
    <Grid container spacing={3}>
      {/* Preview above on md- */}
      {isMdDown && (
        <Grid item xs={12}>
          <Card sx={{minWidth:"85vw"}}>
            <CardContent>
              <Typography variant="h6" gutterBottom color="primary">Assignment Preview</Typography>
              <Divider sx={{ mb: 2 }} />
              <Stack spacing={2}>
                <Box>
                  <Typography variant="caption" color="text.secondary">Title</Typography>
                  <Typography variant="body1" fontWeight="medium">{formData.title || 'Assignment Title'}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Academic Info</Typography>
                  <Typography variant="body2">
                    {formData.program && `${formData.program} • `}
                    {formData.semester && `Semester ${formData.semester} • `}
                    {getFilteredSubjects.find(s => s.subjectId === formData.subject)?.subjectName}
                  </Typography>
                </Box>
                {formData.maxMarks && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">Maximum Marks</Typography>
                    <Chip label={`${formData.maxMarks} Marks`} color="primary" variant="outlined" size="small" />
                  </Box>
                )}
                {(formData.deadline || formData.time) && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">Deadline</Typography>
                    <Stack direction="row" spacing={1}>
                      {formData.deadline && <Chip icon={<ScheduleIcon />} label={dayjs(formData.deadline).format('DD MMM YYYY')} size="small" variant="outlined" />}
                      {formData.time && <Chip label={dayjs(formData.time).format('HH:mm')} size="small" variant="outlined" />}
                    </Stack>
                  </Box>
                )}
                <Box>
                  <Typography variant="caption" color="text.secondary">Submission Policies</Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    <Chip label={formData.allowTextAnswer ? 'Text Field: ON' : 'Text Field: OFF'} color={formData.allowTextAnswer ? 'success' : 'default'} size="small" variant="outlined" />
                    <Chip label={formData.allowResubmission ? 'Resubmit: ON' : 'Resubmit: OFF'} color={formData.allowResubmission ? 'success' : 'default'} size="small" variant="outlined" />
                    <Chip label={formData.requireFileUpload ? 'File Required' : 'File Optional'} color={formData.requireFileUpload ? 'warning' : 'default'} size="small" variant="outlined" />
                  </Stack>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Allowed File Types</Typography>
                  <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                    {computeAcceptedFileTypesString(formData.acceptedFileTypeOptions, formData.acceptedFileTypesOther) || 'Any'}
                  </Typography>
                </Box>
                {formData.description && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">Description</Typography>
                    <Typography variant="body2" sx={{ backgroundColor: alpha(theme.palette.grey[500], 0.1), p: 1, borderRadius: 1 }}>
                      {formData.description}
                    </Typography>
                  </Box>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      )}

      <Grid item xs={12} lg={8}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <AssignmentIcon color="primary" /> Assignment Details
            </Typography>
            <Divider sx={{ mb: 3 }} />
            <Stack spacing={3}>

              {/* Academic */}
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <FormControl fullWidth>
                  <InputLabel>Program</InputLabel>
                  <Select value={formData.program} label="Program" onChange={(e) => handleFormChange('program', e.target.value)}>
                    {programs.map(p => <MenuItem key={p} value={p}>{p}</MenuItem>)}
                  </Select>
                </FormControl>
                <FormControl fullWidth disabled={!formData.program}>
                  <InputLabel>Semester</InputLabel>
                  <Select value={formData.semester} label="Semester" onChange={(e) => handleFormChange('semester', e.target.value)}>
                    {semesters.map(s => <MenuItem key={s} value={s}>Semester {s}</MenuItem>)}
                  </Select>
                </FormControl>
                <FormControl fullWidth disabled={!formData.semester}>
                  <InputLabel>Subject</InputLabel>
                  <Select value={formData.subject} label="Subject" onChange={(e) => handleFormChange('subject', e.target.value)}>
                    {getFilteredSubjects.map(s => <MenuItem key={s.subjectId} value={s.subjectId}>{s.subjectName}</MenuItem>)}
                  </Select>
                </FormControl>
              </Stack>

              <TextField label="Assignment Title" fullWidth value={formData.title} onChange={(e) => handleFormChange('title', e.target.value)} required />
              <TextField label="Description" fullWidth multiline rows={4} value={formData.description} onChange={(e) => handleFormChange('description', e.target.value)} />

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField label="Maximum Marks" type="number" value={formData.maxMarks} onChange={(e) => handleFormChange('maxMarks', e.target.value)} required inputProps={{ min: 0, step: 1 }} sx={{ flex: 1 }} />
                <DatePicker label="Deadline Date" value={formData.deadline} onChange={(v) => handleFormChange('deadline', v)} format="DD/MM/YYYY" minDate={dayjs()} slotProps={{ textField: { fullWidth: true, required: true, sx: { flex: 1 } } }} />
                <MobileTimePicker label="Deadline Time" value={formData.time} onChange={(v) => handleFormChange('time', v)} slotProps={{ textField: { fullWidth: true, required: true, sx: { flex: 1 } } }} />
              </Stack>

              {/* Rules */}
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <PolicyIcon color="primary" /> Submission Policies
                  </Typography>
                  <Divider sx={{ my: 2 }} />
                  <Stack spacing={2}>
                    <FormControl fullWidth>
                      <InputLabel>Accepted File Types</InputLabel>
                      <Select
                        multiple
                        label="Accepted File Types"
                        value={formData.acceptedFileTypeOptions}
                        onChange={handleFileTypeOptionsChange}
                        input={<OutlinedInput label="Accepted File Types" />}
                        renderValue={(selected) => {
                          const labels = selected.map(v => FILE_TYPE_PRESETS.find(p => p.value === v)?.label || v);
                          return labels.join(', ');
                        }}
                      >
                        {FILE_TYPE_PRESETS.map(opt => (
                          <MenuItem key={opt.value} value={opt.value}>
                            <Checkbox checked={formData.acceptedFileTypeOptions.indexOf(opt.value) > -1} />
                            <Typography variant="body2">{opt.label}</Typography>
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    {formData.acceptedFileTypeOptions.includes('__OTHER__') && (
                      <TextField
                        label="Other Custom Types"
                        placeholder=".java,.c,.md"
                        fullWidth
                        value={formData.acceptedFileTypesOther}
                        onChange={(e) => handleFormChange('acceptedFileTypesOther', e.target.value)}
                        helperText="Comma-separated (include leading dot). Example: .java,.c,.cpp"
                      />
                    )}

                    <FormGroup>
                      <FormControlLabel control={<Switch checked={formData.allowTextAnswer} onChange={(e) => handleSwitchChange('allowTextAnswer', e.target.checked)} />} label="Enable Text Answer Field" />
                      <FormControlLabel control={<Switch checked={formData.allowResubmission} onChange={(e) => handleSwitchChange('allowResubmission', e.target.checked)} />} label="Allow Resubmissions (before deadline)" />
                      <FormControlLabel control={<Switch checked={formData.requireFileUpload} onChange={(e) => handleSwitchChange('requireFileUpload', e.target.checked)} />} label="Require File Upload (disallow text-only submissions)" />
                    </FormGroup>
                  </Stack>
                </CardContent>
              </Card>

              {/* File Upload */}
              <Card variant="outlined">
                <CardContent>
                  <Stack direction="row" alignItems="center" spacing={2}>
                    <CloudUploadIcon color="primary" />
                    <Typography variant="h6" sx={{ flex: 1 }}>Assignment Resource</Typography>
                    <Button variant="contained" component="label" startIcon={<UploadFileIcon />}>
                      {formData.resource ? 'Change File' : 'Upload File'}
                      <input type="file" hidden onChange={(e) => handleFormChange('resource', e.target.files[0])} />
                    </Button>
                  </Stack>
                  {formData.resource && (
                    <Box sx={{ mt: 2 }}>
                      <Chip label={formData.resource.name} onDelete={() => handleFormChange('resource', null)} color="primary" variant="outlined" />
                    </Box>
                  )}
                  {uploading && (
                    <Box sx={{ mt: 2 }}>
                      <LinearProgress variant="determinate" value={uploadProgress} sx={{ height: 8, borderRadius: 4 }} />
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Uploading... {Math.round(uploadProgress)}%</Typography>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Stack>
          </CardContent>

          <CardActions sx={{ p: 3, pt: 0 }}>
            <Button
              variant="contained"
              size="large"
              onClick={handleCreateAssignment}
              disabled={uploading}
              startIcon={<SaveIcon />}
              sx={{ minWidth: 200, py: 1.5, background: `linear-gradient(45deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})` }}
            >
              Create Assignment
            </Button>
            <Button variant="outlined" size="large" onClick={resetForm} disabled={uploading} sx={{ minWidth: 120, py: 1.5 }}>
              Reset
            </Button>
          </CardActions>
        </Card>
      </Grid>

      {/* preview on lg+ */}
      {isLgUp && (
        <Grid item xs={12} lg={4}>
          <Card sx={{ ml:5, position: 'sticky', top: 24, alignSelf: 'flex-start', maxHeight: 'calc(100vh - 48px)', minWidth:'35vw', overflow: 'auto' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom color="primary">Assignment Preview</Typography>
              <Divider sx={{ mb: 2 }} />
              <Stack spacing={2}>
                <Box>
                  <Typography variant="caption" color="text.secondary">Title</Typography>
                  <Typography variant="body1" fontWeight="medium">{formData.title || 'Assignment Title'}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Academic Info</Typography>
                  <Typography variant="body2">
                    {formData.program && `${formData.program} • `}
                    {formData.semester && `Semester ${formData.semester} • `}
                    {getFilteredSubjects.find(s => s.subjectId === formData.subject)?.subjectName}
                  </Typography>
                </Box>
                {formData.maxMarks && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">Maximum Marks</Typography>
                    <Chip label={`${formData.maxMarks} Marks`} color="primary" variant="outlined" size="small" />
                  </Box>
                )}
                {(formData.deadline || formData.time) && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">Deadline</Typography>
                    <Stack direction="row" spacing={1}>
                      {formData.deadline && <Chip icon={<ScheduleIcon />} label={dayjs(formData.deadline).format('DD MMM YYYY')} size="small" variant="outlined" />}
                      {formData.time && <Chip label={dayjs(formData.time).format('HH:mm')} size="small" variant="outlined" />}
                    </Stack>
                  </Box>
                )}
                <Box>
                  <Typography variant="caption" color="text.secondary">Submission Policies</Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    <Chip label={formData.allowTextAnswer ? 'Text Field: ON' : 'Text Field: OFF'} color={formData.allowTextAnswer ? 'success' : 'default'} size="small" variant="outlined" />
                    <Chip label={formData.allowResubmission ? 'Resubmit: ON' : 'Resubmit: OFF'} color={formData.allowResubmission ? 'success' : 'default'} size="small" variant="outlined" />
                    <Chip label={formData.requireFileUpload ? 'File Required' : 'File Optional'} color={formData.requireFileUpload ? 'warning' : 'default'} size="small" variant="outlined" />
                  </Stack>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Allowed File Types</Typography>
                  <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                    {computeAcceptedFileTypesString(formData.acceptedFileTypeOptions, formData.acceptedFileTypesOther) || 'Any'}
                  </Typography>
                </Box>
                {formData.description && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">Description</Typography>
                    <Typography variant="body2" sx={{ backgroundColor: alpha(theme.palette.grey[500], 0.1), p: 1, borderRadius: 1 }}>
                      {formData.description}
                    </Typography>
                  </Box>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      )}
    </Grid>
  );

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box sx={{ minHeight: '100vh', background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)}, ${alpha(theme.palette.secondary.main, 0.1)})`, p: 3 }}>
        <Box sx={{ maxWidth: 1400, mx: 'auto' }}>
          {/* Header */}
          <Fade in timeout={800}>
            <Card sx={{ mb: 3, background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`, color: 'white' }}>
              <CardContent>
                <Stack direction="row" alignItems="center" spacing={2}>
                  <Avatar sx={{ width: 64, height: 64, bgcolor: 'white', color: theme.palette.primary.main }}>
                    <AssignmentIcon fontSize="large" />
                  </Avatar>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="h4" fontWeight="bold">Assignment Manager</Typography>
                    <Typography variant="subtitle1" sx={{ opacity: 0.9 }}>
                      {teacherData.firstName} {teacherData.lastName} • {teacherData.department}
                    </Typography>
                    <Typography variant="body2" sx={{ opacity: 0.8 }}>
                      {teacherData.college} • {teacherData.program}
                    </Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Fade>

          {/* Tabs */}
          <Card sx={{ mb: 3 }}>
            <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} variant="fullWidth" sx={{ '& .MuiTab-root': { py: 2, fontSize: '1rem' } }}>
              <Tab icon={<UploadFileIcon />} label="Create Assignment" iconPosition="start" />
              <Tab icon={<GradeIcon />} label="Manage Submissions" iconPosition="start" />
            </Tabs>
          </Card>

          {/* Create */}
          {activeTab === 0 && <Zoom in timeout={600}>{CreateTab}</Zoom>}

          {/* Manage Submissions */}
          {activeTab === 1 && (
            <Fade in timeout={600}>
              <Grid container spacing={3}>
                {/* Left column: Component selector and assignments list */}
                <Grid item xs={12} md={4}>
                  <Card sx={{ mb: 2 }}>
                    <CardContent>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                        <FilterAltIcon color="primary" />
                        <Typography variant="subtitle1" fontWeight="medium">Assessment Component</Typography>
                      </Stack>
                      <FormControl fullWidth size="small">
                        <InputLabel>Component Type</InputLabel>
                        <Select value={componentType} label="Component Type" onChange={(e) => setComponentType(e.target.value)}>
                          <MenuItem value="assignment1">Assignment 1</MenuItem>
                          <MenuItem value="assignment2">Assignment 2</MenuItem>
                          <MenuItem value="internal">Internal Assessment</MenuItem>
                        </Select>
                      </FormControl>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent>
                      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                        <Typography variant="h6">My Assignments</Typography>
                        <Tooltip title="Refresh">
                          <span>
                            <IconButton onClick={loadAssignments} disabled={loading}>
                              <RefreshIcon />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Stack>
                      <Divider sx={{ mb: 2 }} />
                      {loading && <LinearProgress sx={{ mb: 2 }} />}
                      {assignments.length === 0 && !loading ? (
                        <Alert severity="info">No assignments found</Alert>
                      ) : (
                        <Stack spacing={1.25}>
                          {assignments.map(assignment => (
                            <Card
                              key={assignment.id}
                              variant={selectedAssignment?.id === assignment.id ? 'outlined' : 'elevation'}
                              sx={{
                                cursor: 'pointer',
                                borderColor: selectedAssignment?.id === assignment.id ? theme.palette.primary.main : 'transparent',
                                '&:hover': { boxShadow: theme.shadows[4] },
                              }}
                              onClick={() => setSelectedAssignment(assignment)}
                            >
                              <CardContent sx={{ p: 2 }}>
                                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                                  <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography variant="subtitle2" fontWeight="bold" noWrap title={assignment.title}>
                                      {assignment.title}
                                    </Typography>
                                    <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: 'wrap' }}>
                                      <Chip label={assignment.subjectName} size="small" variant="outlined" />
                                      <Chip label={`Sem ${assignment.semester}`} size="small" variant="outlined" />
                                      <Chip label={`Max ${assignment.maxMarks}`} size="small" color="primary" variant="outlined" />
                                    </Stack>
                                    {assignment.deadline && (
                                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                                        Due: {dayjs.utc(assignment.deadline).local().format('DD MMM, HH:mm')}
                                      </Typography>
                                    )}
                                    <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: 'wrap' }}>
                                      <Chip label={(assignment.allowTextAnswer ?? true) ? 'Text ON' : 'Text OFF'} size="small" variant="outlined" color={(assignment.allowTextAnswer ?? true) ? 'success' : 'default'} />
                                      <Chip label={(assignment.allowResubmission ?? true) ? 'Resubmit ON' : 'Resubmit OFF'} size="small" variant="outlined" color={(assignment.allowResubmission ?? true) ? 'success' : 'default'} />
                                      <Chip label={(assignment.requireFileUpload ?? false) ? 'File Required' : 'File Optional'} size="small" variant="outlined" color={(assignment.requireFileUpload ?? false) ? 'warning' : 'default'} />
                                    </Stack>
                                  </Box>
                                  <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                                    <Tooltip title="Edit">
                                      <span>
                                        <IconButton
                                          size="small"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setEditDialog({ open: true, assignment });
                                            const raw = (assignment.acceptedFileTypes || '').split(',').map(s => s.trim()).filter(Boolean);
                                            const selectedKeys = [];
                                            let other = [];
                                            raw.forEach(t => {
                                              const match = FILE_TYPE_PRESETS.find(p => p.value === t || (p.value.includes(',') && p.value.split(',').includes(t)));
                                              if (match) {
                                                if (!selectedKeys.includes(match.value)) selectedKeys.push(match.value);
                                              } else {
                                                other.push(t);
                                              }
                                            });
                                            if (other.length && !selectedKeys.includes('__OTHER__')) selectedKeys.push('__OTHER__');
                                            setFormData({
                                              title: assignment.title,
                                              description: assignment.description || '',
                                              program: assignment.program,
                                              semester: String(assignment.semester),
                                              subject: assignment.subjectId,
                                              maxMarks: String(assignment.maxMarks),
                                              deadline: dayjs(assignment.deadline),
                                              time: dayjs(assignment.deadline),
                                              resource: null,
                                              allowResubmission: assignment.allowResubmission ?? true,
                                              allowTextAnswer: assignment.allowTextAnswer ?? true,
                                              requireFileUpload: assignment.requireFileUpload ?? false,
                                              acceptedFileTypeOptions: selectedKeys.length ? selectedKeys : ['.pdf', 'image/*'],
                                              acceptedFileTypesOther: other.join(','),
                                            });
                                          }}
                                        >
                                          <EditIcon fontSize="small" />
                                        </IconButton>
                                      </span>
                                    </Tooltip>
                                    <Tooltip title="Delete">
                                      <span>
                                        <IconButton
                                          size="small"
                                          color="error"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setDeleteDialog({ open: true, assignment });
                                          }}
                                        >
                                          <DeleteIcon fontSize="small" />
                                        </IconButton>
                                      </span>
                                    </Tooltip>
                                  </Stack>
                                </Stack>
                              </CardContent>
                            </Card>
                          ))}
                        </Stack>
                      )}
                    </CardContent>
                  </Card>
                </Grid>

                {/* Right column: Selected assignment submissions */}
                <Grid item xs={12} md={8}>
                  <Card sx = {{maxWidth : {xs: '90vw' , md:'64vw'}, ml: {md:-1, xs:0 } }}>
                    <CardContent>
                      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} sx={{ mb: 2 }} spacing={2}>
                        <Box>
                          <Typography variant="h6">
                            {selectedAssignment ? `${selectedAssignment.title} — Submissions` : 'Select an Assignment'}
                          </Typography>
                          {selectedAssignment && (
                            <Typography variant="body2" color="text.secondary">
                              {selectedAssignment.subjectName} • Sem {selectedAssignment.semester} • Max {selectedAssignment.maxMarks}
                            </Typography>
                          )}
                        </Box>
                        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'normal', md: 'center' }} spacing={2}>
                          <TextField
                            size="small"
                            placeholder="Search students..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            InputProps={{ startAdornment: <SearchIcon color="action" sx={{ mr: 1 }} /> }}
                            sx={{ minWidth: 220 }}
                          />
                          <FormControl size="small" sx={{ minWidth: 140 }}>
                            <InputLabel>Status</InputLabel>
                            <Select value={filterStatus} label="Status" onChange={(e) => setFilterStatus(e.target.value)}>
                              <MenuItem value="all">All</MenuItem>
                              <MenuItem value="graded">Graded</MenuItem>
                              <MenuItem value="ungraded">Ungraded</MenuItem>
                            </Select>
                          </FormControl>
                          <Button variant="contained" startIcon={<SaveIcon />} onClick={saveAllGrades} disabled={saving || submissions.length === 0}>
                            Save All
                          </Button>
                        </Stack>
                      </Stack>

                      {selectedAssignment && (
                        <>
                          <Grid  sx={{ mb: 2 }}>
                            <Box sx={{ 
                                            display: 'flex', 
                                            gap: 2, 
                                            flexDirection: { xs: 'row', md: 'row' } 
                                          }}
                                  >
                            
                              <Card variant="outlined" sx={{mb: 0, width: '100%' }}>
                                <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column',alignItems: 'center', py: 1}}>
                                  <PeopleIcon color="primary" />
                                  <Typography variant="h6">{statistics.total}</Typography>
                                  <Typography variant="caption">Total</Typography>
                                </CardContent>
                              </Card>
                            
                            
                              <Card variant="outlined" sx={{mb: 0, width: '100%' }}>
                                <CardContent sx={{flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', py: 1 }}>
                                  <DoneAllIcon color="success" />
                                  <Typography variant="h6">{statistics.graded}</Typography>
                                  <Typography variant="caption">Graded</Typography>
                                </CardContent>
                              </Card>
                            
                           
                              <Card variant="outlined" sx={{mb: 0, width: '100%' }}>
                                <CardContent sx={{flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', py: 1 }}>
                                  <AssessmentIcon color="warning" />
                                  <Typography variant="h6">{statistics.pending}</Typography>
                                  <Typography variant="caption">Pending</Typography>
                                </CardContent>
                              </Card>
                            
                              <Card variant="outlined" sx={{mb: 0, width: '100%' }}>
                                <CardContent sx={{flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', py: 1 }}>
                                  <GradeIcon color="info" />
                                  <Typography variant="h6">{statistics.avgMarks || 0}</Typography>
                                  <Typography variant="caption">Avg Marks</Typography>
                                </CardContent>
                              </Card>
                            
                            </Box>
                          </Grid>

                          <Divider sx={{ mb: 2 }} />

                          {loading && <LinearProgress sx={{ mb: 2 }} />}

                          {!loading && filteredSubmissions.length === 0 ? (
                            <Alert severity="info">
                              {submissions.length === 0 ? 'No submissions found for this assignment' : 'No submissions match your search criteria'}
                            </Alert>
                          ) : (
                            <TableContainer component={Paper} variant="outlined">
                              <Table stickyHeader>
                                <TableHead>
                                  <TableRow>
                                    <TableCell>Student</TableCell>
                                    <TableCell width="160">Submitted</TableCell>
                                    <TableCell>File</TableCell>
                                    <TableCell>Text</TableCell>
                                    <TableCell align="center" width="140">Grade</TableCell>
                                    <TableCell align="center" width="130">Actions</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {filteredSubmissions.map((s) => {
                                    const obtained = gradeMap[s.studentId]?.obtained ?? null;
                                    const isGraded = s.status === 'graded';
                                    const submittedDate = s.submittedAt ? new Date(s.submittedAt) : null;
                                    return (
                                      <TableRow key={s.id} hover>
                                        <TableCell>
                                          <Stack spacing={0.25}>
                                            <Typography variant="body2" fontWeight="medium" noWrap title={s.studentName}>{s.studentName}</Typography>
                                            {s.enrollmentNo && (
                                              <Typography variant="caption" color="text.secondary" noWrap>Enroll: {s.enrollmentNo}</Typography>
                                            )}
                                            <Chip label={isGraded ? 'Graded' : 'Submitted'} color={isGraded ? 'success' : 'default'} size="small" variant="outlined" sx={{ width: 'fit-content' }} />
                                          </Stack>
                                        </TableCell>
                                        <TableCell>
                                          <Stack spacing={0.25}>
                                            <Typography variant="body2">{submittedDate ? dayjs(submittedDate).format('DD MMM YYYY') : 'Unknown'}</Typography>
                                            <Typography variant="caption" color="text.secondary">{submittedDate ? dayjs(submittedDate).format('HH:mm') : ''}</Typography>
                                          </Stack>
                                        </TableCell>
                                        <TableCell>
                                          {s.fileUrl && s.fileMeta ? (
                                            <Tooltip title="Download file">
                                              <Chip
                                                size="small"
                                                label={s.fileMeta.fileName || s.fileMeta.name || 'File'}
                                                icon={<DownloadIcon />}
                                                component="a"
                                                href={s.fileUrl}
                                                target="_blank"
                                                clickable
                                                color="primary"
                                                variant="outlined"
                                              />
                                            </Tooltip>
                                          ) : (
                                            <Typography variant="caption" color="text.secondary">No file</Typography>
                                          )}
                                        </TableCell>
                                        <TableCell>
                                          <Typography variant="body2" sx={{ maxWidth: 260 }} noWrap title={s.textAnswer || ''}>
                                            {s.textAnswer || '—'}
                                          </Typography>
                                        </TableCell>
                                        <TableCell align="center">
                                          <TextField
                                            type="number"
                                            size="small"
                                            value={obtained === null ? '' : obtained}
                                            onChange={(e) => handleGradeChange(s.studentId, e.target.value)}
                                            inputProps={{ min: 0, max: selectedAssignment.maxMarks, step: 0.5 }}
                                            placeholder={`0 - ${selectedAssignment.maxMarks}`}
                                            sx={{ width: 110 }}
                                          />
                                        </TableCell>
                                        <TableCell align="center">
                                          <Stack direction="row" spacing={1} justifyContent="center">
                                            <Tooltip title="Save grade">
                                              <span>
                                                <IconButton color="primary" onClick={() => saveIndividualGrade(s)} disabled={saving} size="small">
                                                  <SaveIcon />
                                                </IconButton>
                                              </span>
                                            </Tooltip>
                                            <Tooltip title="View details">
                                              <span>
                                                <IconButton color="info" onClick={() => setSubmissionDialog({ open: true, submission: s })} size="small">
                                                  <VisibilityIcon />
                                                </IconButton>
                                              </span>
                                            </Tooltip>
                                          </Stack>
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            </TableContainer>
                          )}
                        </>
                      )}
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </Fade>
          )}
        </Box>

        {/* Delete Dialog */}
        <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, assignment: null })} maxWidth="sm" fullWidth>
          <DialogTitle>
            <Stack direction="row" alignItems="center" spacing={1}>
              <DeleteIcon color="error" />
              <Typography variant="h6">Delete Assignment</Typography>
            </Stack>
          </DialogTitle>
          <DialogContent>
            <Typography>
              Are you sure you want to delete {deleteDialog.assignment?.title}? This action cannot be undone and will
              remove all associated submissions.
            </Typography>
          </DialogContent>
        <DialogActions>
                       <Button
              variant="contained"
              color="error"
              onClick={() => handleDeleteAssignment(deleteDialog.assignment)}
              disabled={loading}
            >
              Delete
            </Button>
          </DialogActions>
        </Dialog>

        {/* Edit Assignment Dialog */}
        <Dialog
          open={editDialog.open}
          onClose={() => setEditDialog({ open: false, assignment: null })}
          maxWidth="md"
          fullWidth
        >
          <DialogTitle>
            <Stack direction="row" alignItems="center" spacing={1}>
              <EditIcon color="primary" />
              <Typography variant="h6">Edit Assignment</Typography>
            </Stack>
          </DialogTitle>
          <DialogContent>
            <Stack spacing={3} sx={{ pt: 1 }}>
              <TextField
                label="Assignment Title"
                fullWidth
                value={formData.title}
                onChange={(e) => handleFormChange('title', e.target.value)}
                required
              />

              <TextField
                label="Description"
                fullWidth
                multiline
                rows={4}
                value={formData.description}
                onChange={(e) => handleFormChange('description', e.target.value)}
              />

              <TextField
                label="Maximum Marks"
                type="number"
                value={formData.maxMarks}
                onChange={(e) => handleFormChange('maxMarks', e.target.value)}
                required
                inputProps={{ min: 0, step: 1 }}
              />

              <DatePicker
                label="Deadline Date"
                value={formData.deadline}
                onChange={(value) => handleFormChange('deadline', value)}
                format="DD/MM/YYYY"
                minDate={dayjs()}
                slotProps={{
                  textField: { fullWidth: true, required: true },
                }}
              />

              <MobileTimePicker
                label="Deadline Time"
                value={formData.time}
                onChange={(value) => handleFormChange('time', value)}
                slotProps={{
                  textField: { fullWidth: true, required: true, variant: 'outlined' },
                }}
              />

              {/* Submission Rules in Edit */}
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6" gutterBottom>Submission Policies</Typography>
                  <Divider sx={{ my: 1 }} />
                  <Stack spacing={2} sx={{ mt: 2 }}>
                    <FormControl fullWidth>
                      <InputLabel>Accepted File Types</InputLabel>
                      <Select
                        multiple
                        label="Accepted File Types"
                        value={formData.acceptedFileTypeOptions}
                        onChange={handleFileTypeOptionsChange}
                        input={<OutlinedInput label="Accepted File Types" />}
                        renderValue={(selected) => {
                          const labels = selected.map(val => {
                            const preset = FILE_TYPE_PRESETS.find(p => p.value === val);
                            return preset ? preset.label : val;
                          });
                          return labels.join(', ');
                        }}
                      >
                        {FILE_TYPE_PRESETS.map(opt => (
                          <MenuItem key={opt.value} value={opt.value}>
                            <Checkbox checked={formData.acceptedFileTypeOptions.indexOf(opt.value) > -1} />
                            <Typography variant="body2">{opt.label}</Typography>
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    {formData.acceptedFileTypeOptions.includes('__OTHER__') && (
                      <TextField
                        label="Other Custom Types"
                        placeholder=".java,.c,.md"
                        fullWidth
                        value={formData.acceptedFileTypesOther}
                        onChange={(e) => handleFormChange('acceptedFileTypesOther', e.target.value)}
                        helperText="Comma-separated (include leading dot). Example: .java,.c,.cpp"
                      />
                    )}

                    <FormGroup>
                      <FormControlLabel
                        control={<Switch checked={formData.allowTextAnswer} onChange={(e) => handleSwitchChange('allowTextAnswer', e.target.checked)} />}
                        label="Enable Text Answer Field"
                      />
                      <FormControlLabel
                        control={<Switch checked={formData.allowResubmission} onChange={(e) => handleSwitchChange('allowResubmission', e.target.checked)} />}
                        label="Allow Resubmissions"
                      />
                      <FormControlLabel
                        control={<Switch checked={formData.requireFileUpload} onChange={(e) => handleSwitchChange('requireFileUpload', e.target.checked)} />}
                        label="Require File Upload"
                      />
                    </FormGroup>
                  </Stack>
                </CardContent>
              </Card>

              {/* File Upload for Edit */}
              <Card variant="outlined">
                <CardContent>
                  <Stack direction="row" alignItems="center" spacing={2}>
                    <CloudUploadIcon color="primary" />
                    <Typography variant="h6" sx={{ flex: 1 }}>
                      Update Resource
                    </Typography>
                    <Button variant="contained" component="label" startIcon={<UploadFileIcon />}>
                      Upload New File
                      <input
                        type="file"
                        hidden
                        onChange={(e) => handleFormChange('resource', e.target.files[0])}
                      />
                    </Button>
                  </Stack>

                  {editDialog.assignment?.resourceName && !formData.resource && (
                    <Box sx={{ mt: 2 }}>
                      <Chip
                        label={editDialog.assignment.resourceName}
                        onDelete={() => handleFormChange('resource', 'delete')}
                        color="primary"
                        variant="outlined"
                      />
                    </Box>
                  )}

                  {formData.resource && (
                    <Box sx={{ mt: 2 }}>
                      <Chip
                        label={formData.resource.name}
                        onDelete={() => handleFormChange('resource', null)}
                        color="primary"
                        variant="outlined"
                      />
                    </Box>
                  )}

                  {uploading && (
                    <Box sx={{ mt: 2 }}>
                      <LinearProgress
                        variant="determinate"
                        value={uploadProgress}
                        sx={{ height: 8, borderRadius: 4 }}
                      />
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        Uploading... {Math.round(uploadProgress)}%
                      </Typography>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => {
                setEditDialog({ open: false, assignment: null });
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button variant="contained" onClick={handleEditAssignment} disabled={uploading}>
              Save Changes
            </Button>
          </DialogActions>
        </Dialog>

        {/* Submission Details Dialog */}
        <Dialog
          open={submissionDialog.open}
          onClose={() => setSubmissionDialog({ open: false, submission: null })}
          maxWidth="md"
          fullWidth
        >
          <DialogTitle>Submission Details</DialogTitle>
          <DialogContent>
            {submissionDialog.submission && (
              <Stack spacing={2}>
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    Student
                  </Typography>
                  <Typography variant="body1">
                    {submissionDialog.submission.studentName}
                  </Typography>
                  <Typography variant="body2">
                    EnrollmentNo: {submissionDialog.submission.enrollmentNo || 'N/A'}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    Submitted At
                  </Typography>
                  <Typography variant="body1">
                    {submissionDialog.submission.submittedAt
                      ? dayjs(submissionDialog.submission.submittedAt).format('DD MMM YYYY, HH:mm A')
                      : 'Unknown'}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    Status
                  </Typography>
                  <Chip
                    label={submissionDialog.submission.status || 'Submitted'}
                    color={submissionDialog.submission.status === 'graded' ? 'success' : 'default'}
                    variant="outlined"
                  />
                </Box>
                {submissionDialog.submission.fileUrl && submissionDialog.submission.fileMeta && (
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                      File
                    </Typography>
                    <Card variant="outlined">
                      <CardContent sx={{ py: 2 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Typography variant="body2">
                            {submissionDialog.submission.fileMeta.fileName || submissionDialog.submission.fileMeta.name}
                          </Typography>
                          <Button
                            size="small"
                            startIcon={<DownloadIcon />}
                            component="a"
                            href={submissionDialog.submission.fileUrl}
                            target="_blank"
                          >
                            Download
                          </Button>
                        </Stack>
                      </CardContent>
                    </Card>
                  </Box>
                )}
                {submissionDialog.submission.textAnswer && (
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      Text Answer
                    </Typography>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                      {submissionDialog.submission.textAnswer}
                    </Typography>
                  </Box>
                )}
              </Stack>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setSubmissionDialog({ open: false, submission: null })}>Close</Button>
          </DialogActions>
        </Dialog>

        {/* Snackbar */}
        <Snackbar
          open={snackbar.open}
          autoHideDuration={6000}
          onClose={hideSnackbar}
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          <Alert onClose={hideSnackbar} severity={snackbar.severity} variant="filled">
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Box>
    </LocalizationProvider>
  );
};

export default TeacherAssignmentManager;
