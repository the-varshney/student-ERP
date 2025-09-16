import React, { useContext, useMemo } from 'react';
import { Box, CircularProgress, Alert } from '@mui/material';
import AuthContext from '../../context/AuthContext';
import NoticesTable from '../../components/NoticesTable';

export default function TeacherAnnouncements() {
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
        <Alert severity="warning">Please sign in to view announcements.</Alert>
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
      source="both"
      roleFilter="teachers"
      headerTitle="Teacher Announcements"
      chipSelfLabel="My College"
      placeholder="Search by title, description, type, audience..."
      showType
      showAudience
    />
  );
}