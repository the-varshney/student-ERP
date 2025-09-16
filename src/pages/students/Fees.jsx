/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useContext } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import {
  Container, Typography, Box, Button, Grid, Card, CardContent,
  CircularProgress, Divider, Alert, Avatar, Stack, Paper, Chip, IconButton, Tooltip
} from '@mui/material';
import {
  Email as EmailIcon,
  Badge as BadgeIcon,
  School as SchoolIcon,
  Book as BookIcon,
  Refresh as RefreshIcon,
  AttachMoney as AttachMoneyIcon,
  CalendarToday as CalendarTodayIcon,
  Receipt as ReceiptIcon,
  History as HistoryIcon
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { motion } from 'framer-motion';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { auth, db } from '../../firebase/Firebase';
import AuthContext from '../../context/AuthContext';
import { format } from 'date-fns';
import StudentHeader from '../../components/StudentHeader';

const ALL_ID = 'ALL';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const NS = 'erp';
const VER = 'v1';
const key = (uid, name) => `${NS}:${uid}:${name}:${VER}`;
const parseCache = (raw) => { try { return raw ? JSON.parse(raw) : null; } catch { return null; } };

// FRAMER MOTION VARIANTS
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
};
const itemVariants = { hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } };

// PDF GENERATION HELPER
const generateReceiptPDF = (studentProfile, firebaseUser, payment) => {
  const doc = new jsPDF();
  const collegeName = firebaseUser.collegeName || studentProfile?.college?.collegeName || 'College';

  doc.setFontSize(24);
  doc.text(collegeName, doc.internal.pageSize.getWidth() / 2, 22, { align: 'center' });
  doc.setFontSize(16);
  doc.text('Official Fee Receipt', doc.internal.pageSize.getWidth() / 2, 32, { align: 'center' });
  doc.setLineWidth(1);
  doc.line(20, 38, 190, 38);

  doc.setFontSize(14);
  doc.text('Student Information', 20, 50);
  autoTable(doc, {
    startY: 54,
    theme: 'striped',
    headStyles: { fillColor: [60, 141, 188] },
    body: [
      ['Name', `${firebaseUser.firstName || ''} ${firebaseUser.lastName || ''}`.trim()],
      ['Enrollment No', studentProfile?.enrollmentNo || 'N/A'],
      ['Program', `${studentProfile?.program?.programName || 'N/A'} - Semester ${studentProfile?.semester || 'N/A'}`],
      ['College', studentProfile?.college?.collegeName || firebaseUser?.collegeName || 'N/A'],
      ['Department', studentProfile?.department?.departmentName || 'N/A'],
    ],
    styles: { cellPadding: 2, fontSize: 10 },
  });

  doc.text('Payment Details', 20, (doc.lastAutoTable.finalY || 0) + 15);
  autoTable(doc, {
    startY: (doc.lastAutoTable.finalY || 0) + 19,
    theme: 'grid',
    headStyles: { fillColor: [41, 128, 185] },
    body: [
      ['Fee Title', payment.title],
      ['Amount Paid', `₹ ${Number(payment.amount || 0).toFixed(2)}`],
      ['Payment Date', payment?.paymentDate?.seconds ? format(new Date(payment.paymentDate.seconds * 1000), 'dd MMMM yyyy, hh:mm a') : 'N/A'],
      ['Payment ID', payment.paymentId || 'N/A'],
      ['Order ID', payment.orderId || 'N/A'],
    ],
    styles: { cellPadding: 2, fontSize: 10 },
  });

  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFontSize(9);
  doc.text(`This is a computer-generated receipt and does not require a signature.`, 20, pageHeight - 15);
  doc.text(`Generated on: ${new Date().toLocaleString()}`, 20, pageHeight - 10);

  doc.save(`Fee_Receipt_${payment.paymentId || 'payment'}.pdf`);
};

export default function StudentFees() {
  const [user] = useAuthState(auth);
  const { userDetails: ctxUserDetails } = useContext(AuthContext);

  const [studentProfile, setStudentProfile] = useState(null);
  const [pendingFees, setPendingFees] = useState([]);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [razorpayLoaded, setRazorpayLoaded] = useState(false);

  // const [selectedViewSemester, setSelectedViewSemester] = useState('current'); # for future use

  // Load Razorpay SDK
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => setRazorpayLoaded(true);
    script.onerror = () => setError('Failed to load payment gateway.');
    document.body.appendChild(script);
    return () => { document.body.removeChild(script); };
  }, []);

  // Read merged student from localStorage
  const readMergedStudentFromLocal = () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return null;
    const mergedRaw = localStorage.getItem(key(uid, 'student'));
    const mergedEntry = parseCache(mergedRaw);
    const merged = mergedEntry?.v || null;
    if (merged) return merged;
    const legacyRaw = localStorage.getItem(`userDetails_${uid}`);
    try { return legacyRaw ? JSON.parse(legacyRaw) : null; } catch { return null; }
  };

  const normalizeStudentForUI = (merged) => {
    if (!merged) return null;
    return {
      enrollmentNo: merged.EnrollmentNo || merged.enrollmentNo || '',
      semester: merged.Semester || merged.semester || '',
      program: {
        _id: merged.Program || merged.program || '',
        programName: merged.Program || merged.program || ''
      },
      department: {
        _id: merged.Department || merged.department || '',
        departmentName: merged.Department || merged.department || ''
      },
      college: {
        _id: merged.collegeId || merged.college?._id || '',
        collegeName: merged.collegeName || merged.college?.collegeName || ''
      },
      base: {
        firstName: merged.firstName || '',
        lastName: merged.lastName || '',
        email: merged.email || '',
        profilePicUrl: merged.profilePicUrl || '',
        collegeName: merged.collegeName || '',
      }
    };
  };

  // Hydrate student profile from local cache
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    const merged = readMergedStudentFromLocal();
    if (!merged) {
      setError('Student data not found locally. Please re-login.');
      setLoading(false);
      return;
    }
    const normalized = normalizeStudentForUI(merged);
    setStudentProfile(normalized);
  }, [user]);

  // Listen to payments and fee collections in Firestore, filter applicable fees locally
  useEffect(() => {
    if (!studentProfile || !user) {
      return;
    }

    const paymentsQuery = query(collection(db, 'Students', user.uid, 'payments'));
    const unsubscribePayments = onSnapshot(paymentsQuery, (paymentsSnapshot) => {
      const paidFeeIds = new Set(paymentsSnapshot.docs.map(d => d.data().feeCollectionId));
      const history = paymentsSnapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b?.paymentDate?.seconds || 0) - (a?.paymentDate?.seconds || 0));

      const feeCollectionsQuery = query(collection(db, 'fee_collections'), where('status', '==', 'active'));
      const unsubscribeFees = onSnapshot(feeCollectionsQuery, (feeSnapshot) => {
        const allActiveFees = feeSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Allow matching by DB ObjectIds OR by merged codes (collegeId, Department, Program)
        const sCollegeId = studentProfile.college?._id;
        const sDeptId = studentProfile.department?._id;
        const sProgId = studentProfile.program?._id;
        const sSemNum = parseInt(studentProfile.semester, 10);

        const arrayHas = (arr, val) => Array.isArray(arr) && arr.includes(val);

        const applicableFees = allActiveFees.filter(fee => {
          const collegeMatch =
            !Array.isArray(fee.targetColleges) || fee.targetColleges.length === 0 ||
            arrayHas(fee.targetColleges, ALL_ID) ||
            arrayHas(fee.targetColleges, sCollegeId);

          const departmentMatch =
            !Array.isArray(fee.targetDepartments) || fee.targetDepartments.length === 0 ||
            arrayHas(fee.targetDepartments, ALL_ID) ||
            arrayHas(fee.targetDepartments, sDeptId);

          const programMatch =
            !Array.isArray(fee.targetPrograms) || fee.targetPrograms.length === 0 ||
            arrayHas(fee.targetPrograms, ALL_ID) ||
            arrayHas(fee.targetPrograms, sProgId);

          const semesterMatch =
            !Array.isArray(fee.targetSemesters) || fee.targetSemesters.length === 0 ||
            arrayHas(fee.targetSemesters, ALL_ID) ||
            arrayHas(fee.targetSemesters, Number.isNaN(sSemNum) ? studentProfile.semester : sSemNum) ||
            arrayHas(fee.targetSemesters, String(sSemNum));

          return collegeMatch && departmentMatch && programMatch && semesterMatch;
        });

        const pending = applicableFees.filter(fee => !paidFeeIds.has(fee.id));
        const displayHistory = history.map(p => {
          const feeDetails = allActiveFees.find(f => f.id === p.feeCollectionId) || { title: 'Paid Fee' };
          return { ...p, title: feeDetails.title };
        });

        setPendingFees(pending);
        setPaymentHistory(displayHistory);
        setLoading(false);
      });

      return () => unsubscribeFees();
    });

    return () => unsubscribePayments();
  }, [studentProfile, user]);

  const handlePayment = async (fee) => {
    if (!razorpayLoaded) {
      toast.error('Payment gateway is loading. Please try again.');
      return;
    }
    try {
      const orderResponse = await fetch(`${API_BASE_URL}/api/payment/create-order`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: fee.amount * 100 }),
      });
      if (!orderResponse.ok) throw new Error('Failed to create payment order.');
      const order = await orderResponse.json();

      const mergedUser = readMergedStudentFromLocal() || {};
      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: order.amount,
        currency: 'INR',
        name: mergedUser.collegeName || ctxUserDetails?.collegeName || 'College',
        description: fee.title,
        order_id: order.id,
        handler: async (response) => {
          try {
            const verificationResponse = await fetch(`${API_BASE_URL}/api/payment/verify`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...response, feeCollectionId: fee.id, studentId: user.uid, amount: fee.amount,
              }),
            });
            if (!verificationResponse.ok) throw new Error('Payment verification failed.');
            toast.success('Payment Successful! 🎉');
          } catch (err) {
            toast.error(err.message);
          }
        },
        prefill: {
          name: `${mergedUser.firstName || ctxUserDetails?.firstName || ''} ${mergedUser.lastName || ctxUserDetails?.lastName || ''}`.trim(),
          email: mergedUser.email || ctxUserDetails?.email || '',
          contact: mergedUser.phone || ctxUserDetails?.contactNumber || '',
        },
        notes: { student_id: user.uid, fee_collection_id: fee.id },
        theme: { color: '#5E35B1' },
      };
      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const totalPendingAmount = pendingFees.reduce((acc, fee) => acc + (Number(fee.amount) || 0), 0);

  if (loading) {
    return (
      <Container maxWidth="xl" sx={{ minHeight: '60vh', py: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}><CircularProgress /></Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ minHeight: '100vh', py: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, gap: 2, flexWrap: 'wrap' }}>
        <Typography variant="h4" fontWeight="bold">My Fees</Typography>
        <Tooltip title="Refresh">
          <IconButton onClick={() => window.location.reload()} color="primary" sx={{ bgcolor: 'white', boxShadow: 1 }}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {error && <Alert severity="error" sx={{ my: 2 }}>{error}</Alert>}

      {!error && studentProfile && (
        <motion.div initial="hidden" animate="visible" variants={containerVariants}>
          <motion.div variants={itemVariants}>
            <StudentHeader/>
          </motion.div>
        </motion.div>
      )}

      {!error && (
        <motion.div initial="hidden" animate="visible" variants={containerVariants}>
          <Grid container spacing={4}>
            <Grid item xs={12} md={6}>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} sx={{ minWidth: { md: '30vw' } }}>
                <Typography variant="h5" fontWeight="bold">Pending Fees</Typography>
                <Chip icon={<AttachMoneyIcon />} label={`Total: ₹${totalPendingAmount}`} color="primary" variant="filled" />
              </Box>
              <Divider sx={{ mb: 3 }} />
              {pendingFees.length > 0 ? (
                pendingFees.map((fee) => (
                  <motion.div key={fee.id} variants={itemVariants}>
                    <Card elevation={3} sx={{ mb: 2, borderRadius: 2 }}>
                      <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                          <Box>
                            <Typography variant="h6" fontWeight="bold" color="primary">{fee.title}</Typography>
                            <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 0.5 }}>
                              <CalendarTodayIcon fontSize="small" color="action" />
                              <Typography variant="body2" color="text.secondary">
                                Due Date: {fee?.dueDate?.seconds ? format(new Date(fee.dueDate.seconds * 1000), 'dd MMMM yyyy') : 'N/A'}
                              </Typography>
                            </Stack>
                          </Box>
                          <Box textAlign="right">
                            <Typography variant="h5" color="error.main" fontWeight="bold">₹{fee.amount}</Typography>
                            <Button
                              variant="contained"
                              color="primary"
                              onClick={() => handlePayment(fee)}
                              sx={{ mt: 1, textTransform: 'none', px: 3 }}
                            >
                              Pay Now
                            </Button>
                          </Box>
                        </Box>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))
              ) : (
                <Alert severity="info" variant="outlined">No pending fees at the moment</Alert>
              )}
            </Grid>

            <Grid item xs={12} md={6}>
              <Divider sx={{ my: 3, display: { md: 'none' } }} />
              <Box sx={{ pl: { md: 5 }, minWidth: { md: '60vw' } }}>
                <Typography variant="h5" fontWeight="bold" gutterBottom>Payment History</Typography>
                <Box sx={{ maxHeight: 400, overflowY: 'auto', pr: 2 }}>
                  {paymentHistory.length > 0 ? (
                    paymentHistory.map((payment) => (
                      <motion.div key={payment.id} variants={itemVariants}>
                        <Card elevation={2} sx={{ mb: 2, borderRadius: 2 }}>
                          <CardContent>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                              <Box>
                                <Typography variant="h6">{payment.title}</Typography>
                                <Typography color="text.secondary" variant="body2">
                                  Paid on: {payment?.paymentDate?.seconds ? format(new Date(payment.paymentDate.seconds * 1000), 'dd MMM yyyy, hh:mm a') : 'N/A'}
                                </Typography>
                              </Box>
                              <Box textAlign="right">
                                <Typography
                                  variant="h6"
                                  color="success.main"
                                  component="span"
                                  sx={{ verticalAlign: 'middle', mr: 2, fontWeight: 'bold' }}
                                >
                                  ₹{payment.amount}
                                </Typography>
                                <Button
                                  variant="outlined"
                                  startIcon={<ReceiptIcon />}
                                  onClick={() => generateReceiptPDF(studentProfile, studentProfile?.base || ctxUserDetails || {}, payment)}
                                  sx={{ textTransform: 'none' }}
                                >
                                  Receipt
                                </Button>
                              </Box>
                            </Box>
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))
                  ) : (
                    <Alert severity="info" variant="outlined">You have no payment history yet.</Alert>
                  )}
                </Box>
              </Box>
            </Grid>
          </Grid>
        </motion.div>
      )}
    </Container>
  );
}
