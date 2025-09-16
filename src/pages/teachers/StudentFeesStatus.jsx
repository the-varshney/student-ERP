import React, { useContext } from 'react';
import StudentFeeStatusViewer from '../../components/FeesStatus';
import AuthContext from '../../context/AuthContext';
import { Box, CircularProgress, Alert } from '@mui/material';

export default function StudentFeeStatus() {
  const { userDetails, authLoading, role } = useContext(AuthContext);

  if (authLoading) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (role !== 'CollegeAssociate') {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">Access denied. Only College Associates can view this page.</Alert>
      </Box>
    );
  }
  
  if (!userDetails?.college) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="warning">Your profile is not linked to a college. Please contact the administrator.</Alert>
      </Box>
    );
  }

  return <StudentFeeStatusViewer isAdmin={false} associateCollegeId={userDetails.college} />;
}