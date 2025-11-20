import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Container, Typography, Box, Grid, CircularProgress, Alert, Stack,
  FormControl, InputLabel, Select, MenuItem, Button, Divider, Accordion,
  AccordionSummary, AccordionDetails, Chip, Paper, Tooltip, Avatar,
  Drawer, IconButton, List, ListItem, ListItemText, ListItemAvatar
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  Person as PersonIcon,
  CreditCard as CreditCardIcon,
  Replay as ReplayIcon,
  ReceiptLong as ReceiptLongIcon,
  Close as CloseIcon,
  School as SchoolIcon,
  Apartment as ApartmentIcon,
  CalendarMonth as CalendarMonthIcon,
  CurrencyRupee as CurrencyRupeeIcon,
} from '@mui/icons-material';
import { motion } from 'framer-motion';
import PropTypes from 'prop-types';
import axios from 'axios';
import { toast } from 'react-toastify';
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase/Firebase';
import { format } from 'date-fns';

const ALL_ID = 'ALL';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// for Motion
const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.05, delayChildren: 0.1 } } };
const itemVariants = { hidden: { y: 18, opacity: 0 }, visible: { y: 0, opacity: 1 } };

// Fee applicability
const isFeeApplicable = (fee, student) => {
  const collegeMatch = fee.targetColleges?.length === 0 || fee.targetColleges?.includes(ALL_ID) || fee.targetColleges?.includes(student.college?._id);
  const departmentMatch = fee.targetDepartments?.length === 0 || fee.targetDepartments?.includes(ALL_ID) || fee.targetDepartments?.includes(student.department?._id);
  const programMatch = fee.targetPrograms?.length === 0 || fee.targetPrograms?.includes(ALL_ID) || fee.targetPrograms?.includes(student.program?._id);
  const semesterMatch = fee.targetSemesters?.length === 0 || fee.targetSemesters?.includes(ALL_ID) || fee.targetSemesters?.includes(parseInt(student.semester, 10));
  return collegeMatch && departmentMatch && programMatch && semesterMatch;
};

async function runBatches(items, worker, concurrency = 4) {
  const out = [];
  let i = 0;
  async function next() {
    if (i >= items.length) return;
    const idx = i++;
    const res = await worker(items[idx], idx);
    out.push(res);
    return next();
  }
  const starters = Array.from({ length: Math.min(concurrency, items.length) }, () => next());
  await Promise.all(starters);
  return out;
}

export default function StudentFeeStatusViewer({ associateCollegeId, isAdmin = false }) {
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError] = useState('');

  const [collegeOptions, setCollegeOptions] = useState([]);
  const [departmentOptions, setDepartmentOptions] = useState([]);
  const [programOptions, setProgramOptions] = useState([]);
  const [semesterOptions, setSemesterOptions] = useState([]);

  const [selectedCollege, setSelectedCollege] = useState(isAdmin ? ALL_ID : associateCollegeId);
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedProgram, setSelectedProgram] = useState('');
  const [selectedSemester, setSelectedSemester] = useState('');

  const [students, setStudents] = useState([]);

  const feesUnsubRef = useRef(null);
  const paymentsUnsubsRef = useRef(new Map());

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerStudent, setDrawerStudent] = useState(null);

  // Load colleges
  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        setLoading(true);
        setLoadingStep('Fetching colleges...');
        if (isAdmin) {
          const res = await axios.get(`${API_BASE_URL}/api/colleges`);
          if (!active) return;
          setCollegeOptions([{ _id: ALL_ID, name: 'All Colleges' }, ...(res.data || [])]);
          setSelectedCollege(ALL_ID);
        } else {
          if (!associateCollegeId || associateCollegeId === ALL_ID) {
            throw new Error('Invalid college ID');
          }
          const res = await axios.get(`${API_BASE_URL}/api/colleges/${associateCollegeId}`);
          if (!active) return;
          setCollegeOptions([res.data]);
          setSelectedCollege(associateCollegeId);
        }
      } catch (e) {
        setError(`Failed to load colleges: ${e.message}`);
      } finally {
        if (active) setLoading(false);
      }
    };
    if (associateCollegeId || isAdmin) run();
    return () => { active = false; };
  }, [associateCollegeId, isAdmin]);

  // Load departments based on college
  useEffect(() => {
    let active = true;
    const run = async () => {
      setDepartmentOptions([]);
      setProgramOptions([]);
      setSemesterOptions([]);
      setSelectedDepartment('');
      setSelectedProgram('');
      setSelectedSemester('');
      setStudents([]);
      cleanupListeners();

      if (!selectedCollege) return;

      try {
        setLoading(true);
        setLoadingStep('Fetching departments...');
        if (selectedCollege === ALL_ID) {
          const res = await axios.get(`${API_BASE_URL}/api/departments`);
          if (!active) return;
          const withAll = [{ _id: ALL_ID, departmentName: 'All Departments' }, ...(res.data || [])];
          setDepartmentOptions(withAll);
          setSelectedDepartment(ALL_ID);
        } else {
          const res = await axios.get(`${API_BASE_URL}/api/colleges/${selectedCollege}/departments`);
          if (!active) return;
          const withAll = [{ _id: ALL_ID, departmentName: 'All Departments' }, ...(res.data || [])];
          setDepartmentOptions(withAll);
          setSelectedDepartment(ALL_ID);
        }
      } catch (e) {
        setError(`Failed to load departments: ${e.message}`);
      } finally {
        if (active) setLoading(false);
      }
    };
    if (selectedCollege) run();
    return () => { active = false; };
  }, [selectedCollege]);

  // Load programs based on department
  useEffect(() => {
    let active = true;
    const run = async () => {
      setProgramOptions([]);
      setSelectedProgram('');
      setSemesterOptions([]);
      setSelectedSemester('');
      setStudents([]);
      cleanupListeners();

      if (!selectedDepartment) return;

      try {
        setLoading(true);
        setLoadingStep('Fetching programs...');
        if (selectedDepartment === ALL_ID) {
          // for college c000 is chosen, aggregate programs across its departments
          if (selectedCollege && selectedCollege !== ALL_ID) {
            const deptsRes = await axios.get(`${API_BASE_URL}/api/colleges/${selectedCollege}/departments`);
            if (!active) return;
            const deptList = deptsRes.data || [];
            const aggregated = new Map();
            for (const d of deptList) {
              if (!d?._id) continue;
              try {
                const progRes = await axios.get(`${API_BASE_URL}/api/departments/${selectedCollege}/${d._id}/programs`);
                const list = progRes.data || [];
                for (const p of list) {
                  if (!aggregated.has(p._id)) aggregated.set(p._id, p);
                }
              } catch {//
              }
            }
            const uniquePrograms = Array.from(aggregated.values());
            setProgramOptions([{ _id: ALL_ID, programName: 'All Programs' }, ...uniquePrograms]);
            setSelectedProgram(ALL_ID);
            setSemesterOptions([ALL_ID, 1, 2, 3, 4, 5, 6, 7, 8]);
            setSelectedSemester(ALL_ID);
          } else {
            //allow "All Programs"
            setProgramOptions([{ _id: ALL_ID, programName: 'All Programs' }]);
            setSelectedProgram(ALL_ID);
            setSemesterOptions([ALL_ID, 1, 2, 3, 4, 5, 6, 7, 8]);
            setSelectedSemester(ALL_ID);
          }
        } else {
          // Specific department
          const res = await axios.get(`${API_BASE_URL}/api/departments/${selectedDepartment}/programs`);
          if (!active) return;
          setProgramOptions([{ _id: ALL_ID, programName: 'All Programs' }, ...(res.data || [])]);
          setSelectedProgram(ALL_ID);
        }
      } catch (e) {
        setError(`Failed to load programs: ${e.message}`);
      } finally {
        if (active) setLoading(false);
      }
    };
    if (selectedDepartment) run();
    return () => { active = false; };
  }, [selectedDepartment, selectedCollege]);

  // Load semesters based on program
  useEffect(() => {
    let active = true;
    const run = async () => {
      setSemesterOptions([]);
      setSelectedSemester('');
      setStudents([]);
      cleanupListeners();

      if (!selectedProgram) return;

      try {
        setLoading(true);
        setLoadingStep('Fetching semesters...');
        if (selectedProgram === ALL_ID) {
          setSemesterOptions([ALL_ID, 1, 2, 3, 4, 5, 6, 7, 8]);
          setSelectedSemester(ALL_ID);
        } else {
          const res = await axios.get(`${API_BASE_URL}/api/programs/${selectedProgram}/semesters`);
          if (!active) return;
          const list = (res.data || []);
          const nums = list.map(s => s.semesterNumber).sort((a, b) => a - b);
          setSemesterOptions([ALL_ID, ...nums]);
          setSelectedSemester(ALL_ID);
        }
      } catch (e) {
        setError(`Failed to load semesters: ${e.message}`);
      } finally {
        if (active) setLoading(false);
      }
    };
    if (selectedProgram) run();
    return () => { active = false; };
  }, [selectedProgram]);

  //Firestore listeners
  const cleanupListeners = () => {
    if (feesUnsubRef.current) {
      try { feesUnsubRef.current(); } catch { /* noop */ }
      feesUnsubRef.current = null;
    }
    paymentsUnsubsRef.current.forEach(un => { try { un(); } catch { /* noop */ } });
    paymentsUnsubsRef.current.clear();
  };

  // Helper:for lobal search
  async function buildGlobalPlan() {
    let colleges = [];
    if (selectedCollege === ALL_ID) {
      const res = await axios.get(`${API_BASE_URL}/api/colleges`);
      colleges = res.data || [];
    } else {
      colleges = [{ _id: selectedCollege }];
    }

    // For each college, departments
    const plan = [];
    for (const col of colleges) {
      const collegeId = col._id;
      let departments = [];
      if (selectedDepartment === ALL_ID || selectedDepartment === '' || !selectedDepartment) {
        // All departments for this college
        const dRes = await axios.get(`${API_BASE_URL}/api/colleges/${collegeId}/departments`);
        departments = dRes.data || [];
      } else {
        departments = [{ _id: selectedDepartment }];
      }

      for (const dep of departments) {
        const deptId = dep._id;
        let programs = [];
        if (selectedProgram === ALL_ID || selectedProgram === '' || !selectedProgram) {
          try {
            const pRes = await axios.get(`${API_BASE_URL}/api/departments/${collegeId}/${deptId}/programs`);
            programs = pRes.data || [];
          } catch {
            programs = [];
          }
        } else {
          programs = [{ _id: selectedProgram }];
        }

        for (const prog of programs) {
          const programId = prog._id;
          let semesters = [];
          if (selectedSemester === ALL_ID || selectedSemester === '' || !selectedSemester) {
            semesters = [ALL_ID];
          } else {
            semesters = [String(selectedSemester)];
          }

          for (const sem of semesters) {
            plan.push({
              collegeId: collegeId,
              departmentId: selectedDepartment === ALL_ID ? null : deptId,
              programId: selectedProgram === ALL_ID ? null : programId,
              semester: sem === ALL_ID ? null : String(sem),
            });
          }
        }
      }
    }

    const unique = [];
    const seen = new Set();
    for (const p of plan) {
      const k = JSON.stringify(p);
      if (!seen.has(k)) {
        seen.add(k);
        unique.push(p);
      }
    }
    return unique;
  }

  const fetchStudentData = async () => {
    setError('');
    cleanupListeners();
    setStudents([]);

    try {
      setLoading(true);
      setLoadingStep('Searching...');

      // If college is specific, we can call the single API with selected filters directly
      const isGlobal = selectedCollege === ALL_ID;

      let paramSets = [];
      if (!isGlobal) {
        const params = { collegeId: selectedCollege };
        if (selectedDepartment && selectedDepartment !== ALL_ID) params.departmentId = selectedDepartment;
        if (selectedProgram && selectedProgram !== ALL_ID) params.programId = selectedProgram;
        if (selectedSemester && selectedSemester !== ALL_ID) params.semester = String(selectedSemester);
        paramSets = [params];
      } else {
        paramSets = await buildGlobalPlan();
        if (paramSets.length === 0) {
          setLoading(false);
          toast.info('No search scope could be constructed.');
          return;
        }
      }

      setLoadingStep(`Fetching academic data...`);

      // Run in concurrency to avoid API overload
      const results = await runBatches(paramSets, async (params) => {
        try {
          const res = await axios.get(`${API_BASE_URL}/api/students/filtered`, { params });
          return res.data || [];
        } catch {
          return [];
        }
      }, 4);

      // Combine firebaseId
      const combinedMongo = [];
      const seen = new Set();
      for (const arr of results) {
        for (const s of arr) {
          if (!seen.has(s.firebaseId)) {
            seen.add(s.firebaseId);
            combinedMongo.push(s);
          }
        }
      }

      if (combinedMongo.length === 0) {
        setStudents([]);
        setLoading(false);
        setLoadingStep('');
        toast.info('No students found for the selected scope.');
        return;
      }

      // Fetch Firebase profiles
      setLoadingStep('Fetching Students profiles...');
      const firebaseIds = combinedMongo.map(s => s.firebaseId).filter(Boolean);
      const chunks = [];
      for (let i = 0; i < firebaseIds.length; i += 10) chunks.push(firebaseIds.slice(i, i + 10));

      const userMap = new Map();
      for (let idx = 0; idx < chunks.length; idx += 1) {
        const ch = chunks[idx];
        const snap = await getDocs(query(collection(db, 'Students'), where('firebaseId', 'in', ch)));
        snap.forEach(d => {
          const data = d.data();
          userMap.set(data.firebaseId, { id: d.id, ...data });
        });
      }

      const merged = combinedMongo.map(m => {
        const fb = userMap.get(m.firebaseId) || {};
        return {
          ...m,
          firstName: fb.firstName || m.firstName || 'N/A',
          lastName: fb.lastName || m.lastName || '',
          email: fb.email || m.email || '',
          firebaseDocId: fb.id || m.firebaseId,
          college: m.college || fb.college || m.college,
          department: m.department || fb.department || m.department,
          program: m.program || fb.program || m.program,
          profilePicUrl: fb.profilePicUrl || m.profilePicUrl || '',
        };
      });

      //realtime fees and payments
      setLoadingStep('Subscribing to real-time fees and payments...');
      const feesQ = query(collection(db, 'fee_collections'), where('status', '==', 'active'));
      feesUnsubRef.current = onSnapshot(feesQ, (feesSnap) => {
        const activeFees = feesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        merged.forEach(stu => {
          if (paymentsUnsubsRef.current.has(stu.firebaseDocId)) return;
          const paymentsQ = query(collection(db, 'Students', stu.firebaseDocId, 'payments'));
          const un = onSnapshot(paymentsQ, (paySnap) => {
            const pays = paySnap.docs.map(d => ({ id: d.id, ...d.data() }));
            const totalPaid = pays.reduce((acc, p) => acc + Number(p.amount || 0), 0);
            const paidIds = new Set(pays.map(p => p.feeCollectionId));
            const pending = activeFees.filter(fee => isFeeApplicable(fee, stu) && !paidIds.has(fee.id));
            const totalPending = pending.reduce((acc, f) => acc + Number(f.amount || 0), 0);

            setStudents(prev => {
              const idx = prev.findIndex(s => s.firebaseId === stu.firebaseId);
              if (idx > -1) {
                const next = [...prev];
                next[idx] = { ...next[idx], payments: pays, totalPaid, pendingFees: pending, totalPending };
                return next;
              }
              return [...prev, { ...stu, payments: pays, totalPaid, pendingFees: pending, totalPending }];
            });
          }, (err) => {
            toast.error(`Failed to subscribe to student payments: ${err.message}`);
          });
          paymentsUnsubsRef.current.set(stu.firebaseDocId, un);
        });
      }, (err) => {
        setError(`Failed to subscribe to active fees: ${err.message}`);
      });

      setLoading(false);
      setLoadingStep('');
    } catch (e) {
      setError(`An error occurred while fetching student data: ${e.message}`);
      setLoading(false);
      setLoadingStep('');
    }
  };

  useEffect(() => () => cleanupListeners(), []);

  // Grouping
  const groupedStudents = useMemo(() => {
    const groups = {};
    students.forEach(s => {
      const depLabel = s.department?.departmentName || s.department?._id || 'Department';
      const progLabel = s.program?.programName || s.program?._id || 'Program';
      const semLabel = s.semester || 'N/A';
      const key = selectedDepartment === ALL_ID
        ? `${depLabel} • ${progLabel} • Sem ${semLabel}`
        : `${progLabel} • Sem ${semLabel}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    });
    return groups;
  }, [students, selectedDepartment]);

  const canSearch = useMemo(() => {
    // Admin can search any scope
    if (isAdmin) return true;
    // Associate must have specific college
    return Boolean(associateCollegeId);
  }, [isAdmin, associateCollegeId]);

  const openPayments = (student) => { setDrawerStudent(student); setDrawerOpen(true); };
  const closePayments = () => { setDrawerOpen(false); setDrawerStudent(null); };

  const renderPaymentsDrawer = () => (
    <Drawer anchor="right" open={drawerOpen} onClose={closePayments} PaperProps={{ sx: { width: { xs: '100%', sm: 480 } } }}>
      <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2}>
          <Box display="flex" alignItems="center">
            <ReceiptLongIcon color="primary" sx={{ mr: 1 }} />
            <Typography variant="h6" fontWeight="bold">Payment History</Typography>
          </Box>
          <IconButton onClick={closePayments} size="small"><CloseIcon /></IconButton>
        </Stack>
        <Divider sx={{ mb: 2 }} />
        {drawerStudent ? (
          <Box flexGrow={1} overflow="auto">
            <Paper elevation={3} sx={{ p: 2, mb: 3, borderRadius: 2 }}>
              <Stack direction="row" spacing={2} alignItems="center" mb={1}>
                <Avatar src={drawerStudent.profilePicUrl} sx={{ width: 56, height: 56 }}>
                  <PersonIcon fontSize="large" />
                </Avatar>
                <Box>
                  <Typography variant="h6" fontWeight="bold">{drawerStudent.firstName} {drawerStudent.lastName}</Typography>
                  <Typography variant="body2" color="text.secondary" fontWeight="medium">
                    Enrollment No: {drawerStudent.enrollmentNo}
                  </Typography>
                </Box>
              </Stack>
              <Stack direction="row" spacing={1} mt={2} flexWrap="wrap">
                <Chip icon={<SchoolIcon fontSize="small" />} label={drawerStudent.program?.programName || 'N/A'} variant="outlined" size="small" />
                <Chip icon={<CalendarMonthIcon fontSize="small" />} label={`Semester ${drawerStudent.semester}`} variant="outlined" size="small" />
              </Stack>
            </Paper>
            <Box mb={2}>
              <Typography variant="h5" fontWeight="bold" gutterBottom>Transactions</Typography>
              <Box display="flex" justifyContent="space-between" flexWrap="wrap" gap={1}>
                <Chip
                  icon={<CreditCardIcon />}
                  label={`Total Paid: ₹${Number(drawerStudent.totalPaid || 0)}`}
                  color="success"
                  variant="outlined"
                  sx={{ py: 1, height: 'auto', '& .MuiChip-label': { whiteSpace: 'normal' } }}
                />
                <Chip
                  icon={<CurrencyRupeeIcon />}
                  label={`Pending: ₹${Number(drawerStudent.totalPending || 0)}`}
                  color="error"
                  variant="outlined"
                  sx={{ py: 1, height: 'auto', '& .MuiChip-label': { whiteSpace: 'normal' } }}
                />
              </Box>
            </Box>
            {drawerStudent.payments && drawerStudent.payments.length > 0 ? (
              <List sx={{ bgcolor: 'background.paper', borderRadius: 2, p: 0 }}>
                {drawerStudent.payments
                  .slice()
                  .sort((a, b) => (b.paymentDate?.seconds || 0) - (a.paymentDate?.seconds || 0))
                  .map((p, index) => (
                    <React.Fragment key={p.id}>
                      <ListItem alignItems="flex-start" sx={{ py: 2 }}>
                        <ListItemAvatar>
                          <Avatar sx={{ bgcolor: 'success.main' }}><CreditCardIcon /></Avatar>
                        </ListItemAvatar>
                        <ListItemText
                          primary={<Typography variant="subtitle1" fontWeight="bold">{p.title || 'Fee Payment'}</Typography>}
                          secondary={
                            <React.Fragment>
                              <Typography component="span" variant="body2" color="text.primary" display="block">
                                Amount: <Typography component="span" variant="body2" fontWeight="bold" color="success.main">₹{Number(p.amount || 0)}</Typography>
                              </Typography>
                              <Typography component="span" variant="caption" color="text.secondary" display="block">
                                Paid on: {p.paymentDate?.seconds ? format(new Date(p.paymentDate.seconds * 1000), 'dd MMM yyyy, hh:mm a') : 'Date unavailable'}
                              </Typography>
                              <Typography component="span" variant="caption" color="text.secondary" display="block">
                                Ref: {p.paymentId || 'N/A'}
                              </Typography>
                            </React.Fragment>
                          }
                        />
                      </ListItem>
                      {index < drawerStudent.payments.length - 1 && <Divider component="li" />}
                    </React.Fragment>
                  ))}
              </List>
            ) : (
              <Alert severity="info" variant="outlined">No payments found for this student.</Alert>
            )}
          </Box>
        ) : (
          <Alert severity="info" variant="outlined">Select a student to view their payment history.</Alert>
        )}
      </Box>
    </Drawer>
  );

  const renderStudentCards = (studentsInGroup) => (
    <Grid container spacing={3}>
      {studentsInGroup
        .slice()
        .sort((a, b) => (a.enrollmentNo || '').localeCompare(b.enrollmentNo || ''))
        .map(student => (
          <Grid item xs={12} sm={6} md={4} key={student.firebaseId}>
            <motion.div variants={itemVariants}>
              <Paper elevation={4} sx={{ p: 2.5, borderRadius: 3, display: 'flex', flexDirection: 'column', height: '100%' }}>
                <Box display="flex" alignItems="center" flexGrow={1} mb={2}>
                  <Avatar
                    src={student.profilePicUrl}
                    alt={`${student.firstName} ${student.lastName}`}
                    sx={{ width: 56, height: 56, mr: 2, bgcolor: 'primary.main' }}
                  >
                    <PersonIcon />
                  </Avatar>
                  <Box flexGrow={1}>
                    <Typography variant="subtitle1" fontWeight="bold" noWrap>{student.firstName} {student.lastName}</Typography>
                    <Typography variant="body2" color="text.secondary" noWrap>Enrollment: {student.enrollmentNo}</Typography>
                    <Stack direction="column" spacing={1} mt={0.8} flexWrap="wrap" sx={{maxWidth: "50vw"}}>
                      <Chip label={student.department?.departmentName || student.department || 'N/A'} size="small" color="secondary" />
                      <Chip label={student.program?.programName || student.program || 'N/A'} size="small" color="primary" />
                    </Stack>
                  </Box>
                </Box>

                <Divider sx={{ mb: 2 }} />

                <Grid container spacing={1} alignItems="center">
                  <Grid item xs={6}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <CurrencyRupeeIcon fontSize="small" color="error" />
                      <Typography variant="body2" color="text.secondary">Pending:</Typography>
                    </Stack>
                  </Grid>
                  <Grid item xs={6} textAlign="right">
                    <Chip
                      label={`₹${Number(student.totalPending || 0)}`}
                      color={student.totalPending > 0 ? 'error' : 'success'}
                      size="small"
                      sx={{ fontWeight: 'bold' }}
                    />
                  </Grid>

                  <Grid item xs={6}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <CreditCardIcon fontSize="small" color="success" />
                      <Typography variant="body2" color="text.secondary">Paid:</Typography>
                    </Stack>
                  </Grid>
                  <Grid item xs={6} textAlign="right">
                    <Chip
                      label={`₹${Number(student.totalPaid || 0)}`}
                      color="success"
                      size="small"
                      sx={{ fontWeight: 'bold' }}
                    />
                  </Grid>
                </Grid>

                <Box mt={2}>
                  <Button
                    variant="outlined"
                    size="small"
                    fullWidth
                    startIcon={<ReceiptLongIcon />}
                    onClick={() => openPayments(student)}
                    sx={{ textTransform: 'none', borderRadius: '12px' }}
                  >
                    View Payments
                  </Button>
                </Box>
              </Paper>
            </motion.div>
          </Grid>
        ))}
    </Grid>
  );

  return (
    <Container maxWidth="xl" sx={{ minHeight: '100vh', py: 4 }}>
      <Box sx={{
        display: 'flex',
        flexDirection: { xs: 'column', md: 'row' },
        justifyContent: 'space-between',
        alignItems: { xs: 'flex-start', md: 'center' },
        mb: 3
      }}>
        <Typography variant="h4" fontWeight="bold" gutterBottom sx={{ mb: { xs: 2, md: 0 } }}>Student Fee Status</Typography>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
          <Chip
            icon={<ApartmentIcon />}
            label={isAdmin ? 'Admin View' : 'Associate View'}
            color="primary"
            variant="outlined"
            sx={{ fontWeight: 'bold' }}
          />
          <Chip
            icon={<ReplayIcon />}
            label="Real-time"
            color="success"
            variant="outlined"
            sx={{ fontWeight: 'bold' }}
          />
        </Stack>
      </Box>
      <Divider sx={{ mb: 3 }} />

      <motion.div initial="hidden" animate="visible" variants={containerVariants}>
        <Paper elevation={4} sx={{ p: 3, mb: 3, borderRadius: 2 }}>
          <Grid container spacing={2} alignItems="flex-end">
            {isAdmin && (
              <Grid item xs={12} sm={6} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>College</InputLabel>
                  <Select
                    label="College"
                    value={selectedCollege || ''}
                    onChange={(e) => {
                      setSelectedCollege(e.target.value);
                      setSelectedDepartment('');
                      setSelectedProgram('');
                      setSelectedSemester('');
                      setDepartmentOptions([]);
                      setProgramOptions([]);
                      setSemesterOptions([]);
                      setStudents([]);
                      cleanupListeners();
                    }}
                  >
                    {collegeOptions.map(c => (
                      <MenuItem key={c._id} value={c._id}>{c.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            )}
            <Grid item xs={12} sm={6} md={isAdmin ? 3 : 4}>
              <FormControl fullWidth size="small" disabled={isAdmin && !selectedCollege}>
                <InputLabel>Department</InputLabel>
                <Select
                  label="Department"
                  value={selectedDepartment || ''}
                  onChange={(e) => {
                    setSelectedDepartment(e.target.value);
                    setSelectedProgram('');
                    setSelectedSemester('');
                    setProgramOptions([]);
                    setSemesterOptions([]);
                    setStudents([]);
                    cleanupListeners();
                  }}
                >
                  {departmentOptions.map(d => (
                    <MenuItem key={d._id} value={d._id}>{d.departmentName}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6} md={isAdmin ? 3 : 4}>
              <FormControl fullWidth size="small" disabled={!selectedDepartment}>
                <InputLabel>Program</InputLabel>
                <Select
                  label="Program"
                  value={selectedProgram || ''}
                  onChange={(e) => {
                    setSelectedProgram(e.target.value);
                    setSelectedSemester('');
                    setSemesterOptions([]);
                    setStudents([]);
                    cleanupListeners();
                  }}
                >
                  {programOptions.map(p => (
                    <MenuItem key={p._id} value={p._id}>{p.programName}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6} md={isAdmin ? 2 : 3}>
              <FormControl fullWidth size="small" disabled={!selectedProgram}>
                <InputLabel>Semester</InputLabel>
                <Select
                  label="Semester"
                  value={selectedSemester || ''}
                  onChange={(e) => {
                    setSelectedSemester(e.target.value);
                    setStudents([]);
                    cleanupListeners();
                  }}
                >
                  {semesterOptions.map(s => (
                    <MenuItem key={s} value={s}>{s === ALL_ID ? 'All' : `Sem ${s}`}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6} md={1}>
              <Tooltip title={canSearch ? 'Fetch student data' : 'Select filters to search'}>
                <span>
                  <Button
                    variant="contained"
                    onClick={fetchStudentData}
                    fullWidth
                    disabled={loading || !canSearch}
                    startIcon={<ReplayIcon />}
                  >
                    Search
                  </Button>
                </span>
              </Tooltip>
            </Grid>
          </Grid>
        </Paper>
      </motion.div>

      {loading && (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', my: 4 }}>
          <CircularProgress />
          <Typography variant="body2" color="text.secondary" mt={2}>{loadingStep}</Typography>
        </Box>
      )}

      {error && <Alert severity="error" sx={{ my: 2 }}>{error}</Alert>}

      {!loading && !error && Object.keys(groupedStudents).length > 0 && (
        <motion.div initial="hidden" animate="visible" variants={containerVariants}>
          {Object.entries(groupedStudents).map(([groupTitle, studentsInGroup]) => (
            <motion.div key={groupTitle} variants={itemVariants}>
              <Accordion sx={{ mb: 2 }} defaultExpanded>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography variant="h6" fontWeight="bold">{groupTitle}</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  {renderStudentCards(studentsInGroup)}
                </AccordionDetails>
              </Accordion>
            </motion.div>
          ))}
        </motion.div>
      )}

      {!loading && !error && students.length === 0 && (
        <Alert severity="info" variant="outlined">No students found matching the selected filters.</Alert>
      )}

      {renderPaymentsDrawer()}
    </Container>
  );
}

StudentFeeStatusViewer.propTypes = {
  associateCollegeId: PropTypes.string,
  isAdmin: PropTypes.bool
};
