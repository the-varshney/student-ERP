/* eslint-disable no-unused-vars */
import React, { useState, useEffect } from 'react';
import {
  Container, Typography, Box, Button, Grid, Card, CardContent,
  FormControlLabel, Switch, CircularProgress, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Autocomplete, Chip, Divider,
  Alert, Stack, IconButton, Tabs, Tab
} from '@mui/material';
import PropTypes from 'prop-types';
import {
  Add as AddIcon, CalendarToday as CalendarTodayIcon, School as SchoolIcon,
  Apartment as ApartmentIcon, Class as ClassIcon, MenuBook as MenuBookIcon,
  Edit as EditIcon, Close as CloseIcon, Update as UpdateIcon, CurrencyRupee,
  ReceiptLong as ReceiptLongIcon
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { motion } from 'framer-motion';
import { collection, addDoc, onSnapshot, query, orderBy, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import axios from 'axios';
import { db } from '../../firebase/Firebase';
import { format } from 'date-fns';
import StudentFeeStatusViewer from '../../components/FeesStatus';

import SecondaryHeader from '../../components/secondaryHeader';
import {HeaderBackButton} from '../../components/header';

// Constants
const ALL_ID = 'ALL';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

//FRAMER MOTION
const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.1 } } };
const itemVariants = { hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } };

//Helper Component for Detail Display
const DetailRow = ({ label, value }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 1, borderBottom: `1px solid #f0f0f0` }}>
    <Typography variant="body2" color="text.secondary">{label}:</Typography>
    <Typography variant="body2" fontWeight="medium" sx={{ textAlign: 'right' }}>{value || 'N/A'}</Typography>
  </Box>
);
DetailRow.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.node.isRequired
};

export default function FeeManager() {
  // Component State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feeCollections, setFeeCollections] = useState([]);
  const [activeTab, setActiveTab] = useState(0); // 0: Fee Creation, 1: Student Fee Status

  // Dialogs and Form State
  const [openCreateDialog, setOpenCreateDialog] = useState(false);
  const [openManageDialog, setOpenManageDialog] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [currentFee, setCurrentFee] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [reactivateDialog, setReactivateDialog] = useState({ isOpen: false, fee: null, newDueDate: '' });

  const [formData, setFormData] = useState({ title: '', amount: '', dueDate: '', selectedColleges: [], selectedDepartments: [], selectedPrograms: [], selectedSemesters: [] });
  
  // Data for Selects
  const [collegeOptions, setCollegeOptions] = useState([]);
  const [departmentOptions, setDepartmentOptions] = useState([]);
  const [programOptions, setProgramOptions] = useState([]);
  const [semesterOptions, setSemesterOptions] = useState([]);

  // Fetch initial static data for dropdowns
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [collegeRes, deptRes] = await Promise.all([
          axios.get(`${API_BASE_URL}/api/colleges`),
          axios.get(`${API_BASE_URL}/api/departments`)
        ]);
        setCollegeOptions([{ _id: ALL_ID, name: 'All Colleges' }, ...collegeRes.data]);
        setDepartmentOptions([{ _id: ALL_ID, departmentName: 'All Departments' }, ...deptRes.data]);
        setLoading(false);
      } catch (err) {
        setError('Failed to load colleges or departments.');
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Real-time listener for fee collections
  useEffect(() => {
    const q = query(collection(db, 'fee_collections'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fees = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setFeeCollections(fees);
      setLoading(false);
    }, (err) => {
      setError("Failed to listen for fee collection updates.");
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Effect for handling dependent dropdowns
  useEffect(() => {
    const { selectedDepartments } = formData;
    setProgramOptions([]); 
    if (selectedDepartments.length === 1 && selectedDepartments[0]?._id !== ALL_ID) {
      axios.get(`${API_BASE_URL}/api/departments/${selectedDepartments[0]._id}/programs`)
        .then(res => setProgramOptions([{ _id: ALL_ID, programName: 'All Programs' }, ...res.data]));
    }
  }, [formData.selectedDepartments]);

  useEffect(() => {
    const { selectedPrograms } = formData;
    setSemesterOptions([]);
    if (selectedPrograms.length === 1 && selectedPrograms[0]?._id !== ALL_ID) {
      axios.get(`${API_BASE_URL}/api/programs/${selectedPrograms[0]._id}/semesters`)
        .then(res => setSemesterOptions([ALL_ID, ...res.data.map(s => s.semesterNumber).sort((a, b) => a - b)]));
    }
  }, [formData.selectedPrograms]);

  //DIALOG AND FORM HANDLERS
  const handleOpenCreateDialog = () => {
    setFormData({ title: '', amount: '', dueDate: '', selectedColleges: [], selectedDepartments: [], selectedPrograms: [], selectedSemesters: [] });
    setIsEditMode(false);
    setOpenCreateDialog(true);
  };

  const handleOpenManageDialog = async (fee) => {
    setCurrentFee(fee);
    setIsEditMode(false); 
    setOpenManageDialog(true);

    const initialFormData = {
      title: fee.title, amount: fee.amount, dueDate: format(new Date(fee.dueDate.seconds * 1000), 'yyyy-MM-dd'),
      selectedColleges: collegeOptions.filter(c => fee.targetColleges?.includes(c._id)),
      selectedDepartments: departmentOptions.filter(d => fee.targetDepartments?.includes(d._id)),
      selectedPrograms: [], selectedSemesters: fee.targetSemesters || []
    };

    if (initialFormData.selectedDepartments.length === 1 && initialFormData.selectedDepartments[0]._id !== ALL_ID) {
      const progRes = await axios.get(`${API_BASE_URL}/api/departments/${initialFormData.selectedDepartments[0]._id}/programs`);
      const progs = [{ _id: ALL_ID, programName: 'All Programs' }, ...progRes.data];
      setProgramOptions(progs);
      initialFormData.selectedPrograms = progs.filter(p => fee.targetPrograms?.includes(p._id));

      if (initialFormData.selectedPrograms.length === 1 && initialFormData.selectedPrograms[0]._id !== ALL_ID) {
        const semRes = await axios.get(`${API_BASE_URL}/api/programs/${initialFormData.selectedPrograms[0]._id}/semesters`);
        setSemesterOptions([ALL_ID, ...semRes.data.map(s => s.semesterNumber).sort((a, b) => a - b)]);
      }
    }
    setFormData(initialFormData);
  };
  
  const handleCreateOrUpdate = async () => {
  if (!formData.title || !formData.amount || !formData.dueDate) {
    toast.error("Please fill out all required fields.");
    return;
  }
  setSubmitting(true);
  try {
    const feeData = {
      title: formData.title,
      amount: parseFloat(formData.amount),
      dueDate: new Date(formData.dueDate),
      status: 'active',
      targetColleges: formData.selectedColleges.map(c => c._id),
      targetDepartments: formData.selectedDepartments.map(d => d._id),
      targetPrograms: formData.selectedPrograms.map(p => p._id),
      targetSemesters: formData.selectedSemesters
    };

    if (isEditMode && currentFee) {
      const feeDocRef = doc(db, 'fee_collections', currentFee.id);
      await updateDoc(feeDocRef, feeData);
      toast.success("Fee collection updated successfully!");
    } else {
      await addDoc(collection(db, 'fee_collections'), {
        ...feeData,
        createdAt: serverTimestamp()
      });
      toast.success("New fee collection created successfully!");
    }
    handleCloseCreateDialog();
    handleCloseManageDialog();
  } catch (error) {
    console.error("Error creating or updating fee:", error);
    toast.error("Failed to save fee collection.");
  } finally {
    setSubmitting(false);
  }
};
  const handleCloseManageDialog = () => { setOpenManageDialog(false); setCurrentFee(null); setIsEditMode(false); };
  const handleCloseCreateDialog = () => { setOpenCreateDialog(false); };
  
  const handleStatusToggle = (fee) => {
    const newStatus = fee.status === 'active' ? 'inactive' : 'active';
    const isOverdue = new Date(fee.dueDate.seconds * 1000) < new Date();

    if (newStatus === 'active' && isOverdue) {
      setReactivateDialog({ isOpen: true, fee: fee, newDueDate: '' });
    } else {
      updateStatus(fee.id, newStatus);
    }
  };
  const handleReactivation = async () => {
    const { fee, newDueDate } = reactivateDialog;
    if (!fee || !newDueDate) {
      toast.error("Please select a new due date.");
      return;
    }
    setSubmitting(true);
    try {
      await updateDoc(doc(db, 'fee_collections', fee.id), {
        status: 'active',
        dueDate: new Date(newDueDate)
      });
      toast.success("Fee reactivated with new due date!");
      setReactivateDialog({ isOpen: false, fee: null, newDueDate: '' });
    } catch (error) {
      toast.error("Failed to reactivate fee.");
    } finally {
      setSubmitting(false);
    }
  };
  
  const updateStatus = async (feeId, newStatus) => {
    try {
      await updateDoc(doc(db, 'fee_collections', feeId), { status: newStatus });
      toast.success(`Fee is now ${newStatus}.`);
    } catch (error) { toast.error("Failed to update status."); }
  };

  //TAB
  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const renderFeeCards = () => (
    <Grid container spacing={3}>
      {feeCollections.map(fee => {
        const isOverdue = new Date(fee.dueDate.seconds * 1000) < new Date();
        return (
          <Grid item xs={12} sm={6} lg={4} key={fee.id}>
            <motion.div variants={itemVariants} style={{ height: '100%' }}>
              <Card elevation={4} sx={{ display: 'flex', flexDirection: 'column', height: '100%', borderRadius: 3, transition: 'box-shadow 0.3s', '&:hover': { boxShadow: 8 } }}>
                <CardContent sx={{ flexGrow: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Typography variant="h6" fontWeight="bold" color="primary.main" gutterBottom>{fee.title}</Typography>
                    <Chip label={`₹${fee.amount}`} color="secondary" variant="filled" sx={{ fontWeight: 'bold' }} />
                  </Box>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1, color: isOverdue && fee.status === 'active' ? 'error.main' : 'text.secondary' }}>
                    <CalendarTodayIcon fontSize="small" />
                    <Typography variant="body2">Due: {format(new Date(fee.dueDate.seconds * 1000), 'dd MMMM yyyy')} {isOverdue && ' (Overdue)'}</Typography>
                  </Stack>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="body2" fontWeight="medium" sx={{ mb: 1 }}>Targets:</Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.8 }}>
                    <Chip size="small" icon={<ApartmentIcon />} label={fee.targetColleges?.includes(ALL_ID) ? 'All Colleges' : `${fee.targetColleges?.length || 0} College(s)`} />
                    <Chip size="small" icon={<SchoolIcon />} label={fee.targetDepartments?.includes(ALL_ID) ? 'All Depts' : `${fee.targetDepartments?.length || 0} Dept(s)`} />
                    <Chip size="small" icon={<ClassIcon />} label={fee.targetPrograms?.includes(ALL_ID) ? 'All Programs' : `${fee.targetPrograms?.length || 0} Prog(s)`} />
                    <Chip size="small" icon={<MenuBookIcon />} label={fee.targetSemesters?.includes(ALL_ID) ? 'All Semesters' : `${fee.targetSemesters?.length || 0} Sem(s)`} />
                  </Box>
                </CardContent>
                <Box sx={{ p: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'action.hover' }}>
                  <FormControlLabel control={<Switch checked={fee.status === 'active'} onChange={() => handleStatusToggle(fee)} color="success" />} label={fee.status === 'active' ? 'Active' : 'Inactive'} sx={{ '& .MuiFormControlLabel-label': { fontWeight: 'medium' } }} />
                  <Button variant="outlined" size="small" onClick={() => handleOpenManageDialog(fee)} sx={{ textTransform: 'none' }}>Manage</Button>
                </Box>
              </Card>
            </motion.div>
          </Grid>
        );
      })}
    </Grid>
  );

  const renderFormFields = (
    <Stack spacing={2} sx={{ mt: 1 }}>
      <TextField name="title" required label="Fee Title" fullWidth value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
      <TextField name="amount" required label="Amount (INR)" type="number" fullWidth value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} />
      <TextField name="dueDate" required label="Due Date" type="date" fullWidth InputLabelProps={{ shrink: true }} inputProps={{ min: isEditMode ? undefined : new Date().toISOString().split('T')[0] }} value={formData.dueDate} onChange={e => setFormData({...formData, dueDate: e.target.value})} />
      <Divider>Target Audience (Optional)</Divider>
      <Autocomplete multiple options={collegeOptions} getOptionLabel={(o) => o.name} value={formData.selectedColleges} onChange={(e, v) => setFormData({...formData, selectedColleges: v})} renderInput={(p) => <TextField {...p} label="Target Colleges" />} />
      <Autocomplete multiple options={departmentOptions} getOptionLabel={(o) => o.departmentName} value={formData.selectedDepartments} onChange={(e, v) => setFormData({...formData, selectedDepartments: v, selectedPrograms: [], selectedSemesters: []})} renderInput={(p) => <TextField {...p} label="Target Departments" />} />
      <Autocomplete multiple options={programOptions} getOptionLabel={(o) => o.programName} value={formData.selectedPrograms} onChange={(e, v) => setFormData({...formData, selectedPrograms: v, selectedSemesters: []})} disabled={formData.selectedDepartments.length !== 1 || formData.selectedDepartments[0]?._id === ALL_ID} renderInput={(p) => <TextField {...p} label="Target Programs" />} />
      <Autocomplete multiple options={semesterOptions} getOptionLabel={(o) => o === ALL_ID ? 'All Semesters' : `Semester ${o}`} value={formData.selectedSemesters} onChange={(e, v) => setFormData({...formData, selectedSemesters: v})} disabled={formData.selectedPrograms.length !== 1 || formData.selectedPrograms[0]?._id === ALL_ID} renderInput={(p) => <TextField {...p} label="Target Semesters" />} />
    </Stack>
  );

  const renderViewDetails = () => {
    if (!currentFee) return <Box sx={{display: 'flex', justifyContent: 'center', my: 5}}><CircularProgress /></Box>;
    const getNames = (ids, options, key) => (ids?.includes(ALL_ID) ? `All ${key}s` : ids?.map(id => options.find(opt => opt._id === id)?.name || options.find(opt => opt._id === id)?.departmentName || 'Unknown').join(', ') || 'None');
    const getSemesterNames = (sems) => (sems?.includes(ALL_ID) ? 'All Semesters' : sems?.map(s => `Sem ${s}`).join(', ') || 'None');
    return (
      <Box>
        <DetailRow label="Title" value={currentFee.title} />
        <DetailRow label="Amount" value={`₹${currentFee.amount}`} />
        <DetailRow label="Due Date" value={format(new Date(currentFee.dueDate.seconds * 1000), 'dd MMMM yyyy')} />
        <DetailRow label="Status" value={currentFee.status} />
        <Divider sx={{ my: 2 }}><Typography variant="overline">Targeting</Typography></Divider>
        <DetailRow label="Colleges" value={getNames(currentFee.targetColleges, collegeOptions, 'College')} />
        <DetailRow label="Departments" value={getNames(currentFee.targetDepartments, departmentOptions, 'Department')} />
        <DetailRow label="Programs" value={getNames(currentFee.targetPrograms, programOptions, 'Program')} />
        <DetailRow label="Semesters" value={getSemesterNames(currentFee.targetSemesters)} />
      </Box>
    );
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4, minHeight: "100vh" }}>
      <SecondaryHeader
  title="Fee Management"
  leftArea={
    <Stack direction="row" spacing={1} alignItems="center">
      <HeaderBackButton size="small" />
      <CurrencyRupee color="primary" />
    </Stack>
  }
  rightArea={
    activeTab === 0 ? (
      <Button
        variant="contained"
        startIcon={<AddIcon />}
        onClick={handleOpenCreateDialog}
        sx={{ textTransform: 'none', px: { xs: 2, sm: 3 }, py: { xs: 0.75, sm: 1 } }}
      >
        Create New Fee
      </Button>
    ) : null
  }
  tabs={[
    { label: 'Fee Creation', value: 0, icon: <AddIcon /> },
    { label: 'Student Fee Status', value: 1, icon: <ReceiptLongIcon /> },
  ]}
  tabValue={activeTab}
  onTabChange={(_, v) => handleTabChange(null, v)}
  renderBelow
  rightOn="top"         
  elevation={0}
  border
  paperSx={{
    p: { xs: 1.5, md: 2 },
    borderRadius: 2,
    mb: 3,
    border: '1px solid',
    borderColor: 'divider',
  }}
/>

      {activeTab === 0 ? (
        <>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', my: 5 }}>
              <CircularProgress />
            </Box>
          ) : error ? (
            <Alert severity="error" sx={{ my: 2 }}>{error}</Alert>
          ) : (
            <motion.div initial="hidden" animate="visible" variants={containerVariants}>
              {renderFeeCards()}
            </motion.div>
          )}
          <Dialog open={openCreateDialog} onClose={handleCloseCreateDialog} fullWidth maxWidth="sm">
            <DialogTitle sx={{ fontWeight: 'bold' }}>Create New Fee Collection</DialogTitle>
            <DialogContent>{renderFormFields}</DialogContent>
            <DialogActions sx={{ p: 2 }}>
              <Button onClick={handleCloseCreateDialog}>Cancel</Button>
              <Button onClick={handleCreateOrUpdate} variant="contained" disabled={submitting}>
                {submitting ? <CircularProgress size={24} /> : "Create Fee"}
              </Button>
            </DialogActions>
          </Dialog>
          <Dialog open={openManageDialog} onClose={handleCloseManageDialog} fullWidth maxWidth="md">
            <DialogTitle sx={{ fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              Fee Details
              <Box>
                {!isEditMode && <Button startIcon={<EditIcon />} onClick={() => setIsEditMode(true)}>Edit</Button>}
                <IconButton onClick={handleCloseManageDialog}><CloseIcon /></IconButton>
              </Box>
            </DialogTitle>
            <DialogContent>{isEditMode ? renderFormFields : renderViewDetails()}</DialogContent>
            {isEditMode && (
              <DialogActions sx={{ p: 2 }}>
                <Button onClick={() => setIsEditMode(false)}>Cancel</Button>
                <Button onClick={handleCreateOrUpdate} variant="contained" disabled={submitting}>
                  {submitting ? <CircularProgress size={24} /> : "Save Changes"}
                </Button>
              </DialogActions>
            )}
          </Dialog>
          <Dialog open={reactivateDialog.isOpen} onClose={() => setReactivateDialog({ isOpen: false, fee: null, newDueDate: '' })}>
            <DialogTitle sx={{ fontWeight: 'bold' }}>
              <UpdateIcon color="action" sx={{ verticalAlign: 'middle', mr: 1 }} />
              Reactivate Overdue Fee
            </DialogTitle>
            <DialogContent>
              <Typography gutterBottom>
                To reactivate this overdue fee, you must set a new due date.
              </Typography>
              <TextField
                autoFocus
                required
                margin="dense"
                label="New Due Date"
                type="date"
                fullWidth
                InputLabelProps={{ shrink: true }}
                inputProps={{ min: new Date().toISOString().split('T')[0] }}
                value={reactivateDialog.newDueDate}
                onChange={e => setReactivateDialog(prev => ({ ...prev, newDueDate: e.target.value }))}
              />
            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
              <Button onClick={() => setReactivateDialog({ isOpen: false, fee: null, newDueDate: '' })}>Cancel</Button>
              <Button 
                onClick={handleReactivation} 
                variant="contained" 
                disabled={submitting || !reactivateDialog.newDueDate}
              >
                {submitting ? <CircularProgress size={24} /> : "Update & Reactivate"}
              </Button>
            </DialogActions>
          </Dialog>
        </>
      ) : (
        <StudentFeeStatusViewer associateCollegeId={ALL_ID} isAdmin={true} />
      )}
    </Container>
  );
}