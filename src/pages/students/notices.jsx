import React, { useContext, useMemo } from 'react';
import { Box, CircularProgress, Alert } from '@mui/material';
import AuthContext from '../../context/AuthContext';
import NoticesTable from '../../components/NoticesTable';

export default function StudentEvents() {
  const { userDetails, authLoading } = useContext(AuthContext);

  const collegeId = useMemo(
    () => userDetails?.collegeId || userDetails?.college || '',
    [userDetails]
  );

  if (authLoading) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!userDetails) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="warning">Please sign in to view events.</Alert>
      </Box>
    );
  }

  if (!collegeId) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="warning">Your profile is missing a college. Please contact admin.</Alert>
      </Box>
    );
  }

  return (
    <NoticesTable
      collegeId={collegeId}
      source="notices"
      roleFilter="students"
      headerTitle="Notices"
      chipSelfLabel="My College"
      placeholder="Search by title, description, location, date..."
      showType={false}
      showAudience={false}
    />
  );
}
