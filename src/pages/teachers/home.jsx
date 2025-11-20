import React, { useContext, useEffect, useState } from 'react';
import { ThemeContext } from '../../context/ThemeContext';
import AuthContext from '../../context/AuthContext';
import {Typography, Grid, CardActionArea, Container, Box, Divider, useTheme, Card,
} from '@mui/material';
import {CalendarMonth, FactCheck, UploadFile, AssignmentTurnedIn, Feedback, Grading, TrendingUp, 
  Forum, LocalLibrary, Campaign, Description, AutoStories,          
  // Associate-only icons
  VerifiedUser, PeopleAlt, Payments, Publish, SupportAgent, ConfirmationNumber, EventNote, CloudUpload, EmojiEvents, ScheduleSend,         
} from '@mui/icons-material';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import Header from '../../components/header';

const MotionCard = motion(Card);

// Greeting function
const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
};

const NS = 'erp';
const VER = 'v1';
const LAST_UID_KEY = `${NS}:lastUid:${VER}`;
const cacheKey = (uid, name) => `${NS}:${uid}:${name}:${VER}`;

const readEnvelope = (key) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    return payload?.v ?? null;
  } catch {
    return null;
  }
};

const readCachedTeacher = () => {
  try {
    const uid = localStorage.getItem(LAST_UID_KEY);
    if (!uid) return { role: null, details: null };
    const role = readEnvelope(cacheKey(uid, 'role'));
    const details = readEnvelope(cacheKey(uid, 'details'));
    return { role, details };
  } catch {
    return { role: null, details: null };
  }
};

export default function TeacherHome() {
  const { mode } = useContext(ThemeContext);
  const { userDetails, role } = useContext(AuthContext);
  const theme = useTheme();

  const [cached, setCached] = useState(() => readCachedTeacher());
  useEffect(() => {
    const onStorage = (e) => {
      if (!e?.key) return;
      if (e.key.includes(':role:') || e.key.includes(':details:') || e.key === LAST_UID_KEY) {
        setCached(readCachedTeacher());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const effectiveRole = role || cached.role;
  const isStaff = effectiveRole === 'Teacher' || effectiveRole === 'CollegeAssociate';
  const effectiveDetails = isStaff ? (userDetails || cached.details) : userDetails;

  const fullName = effectiveDetails
    ? `${effectiveDetails.firstName || 'Teacher'} ${effectiveDetails.lastName || ''}`.trim()
    : 'Loading...';

  // Teacher-only buttons
  const teacherOnlyButtons = [
    { label: 'View Schedule', link: '/teacher/schedule', icon: <CalendarMonth /> },
    { label: 'Take Attendance', link: '/teacher/attendance', icon: <FactCheck /> },
    { label: 'Upload Notes', link: '/teacher/upload-notes', icon: <UploadFile /> },
    { label: 'Manage Assignments', link: '/teacher/assignments', icon: <AssignmentTurnedIn /> },
    { label: 'Collect Feedback', link: '/teacher/feedback', icon: <Feedback /> },
    { label: 'Manage Results', link: '/teacher/results', icon: <Grading /> },
    { label: 'Track Student Progress', link: '/teacher/progress', icon: <TrendingUp /> },
    { label: 'Faculty Space', link: '/teacher/chat', icon: <Forum /> },
    { label: 'E-Library', link: '/teacher/library', icon: <LocalLibrary /> },
    { label: 'Announcements', link: '/teacher/announcement', icon: <Campaign /> },
    { label: 'Syllabus', link: '/teacher/syllabus', icon: <Description /> },
    { label: 'E-Resources', link: '/teacher/Eresources', icon: <AutoStories /> },
  ];

  // Teacher-associate shared tools
  const sharedTeacherToolsForAssociate = [
    { label: 'View Schedule', link: '/teacher/schedule', icon: <CalendarMonth /> },
    { label: 'Take Attendance', link: '/teacher/attendance', icon: <FactCheck /> },
    { label: 'Upload Notes', link: '/teacher/upload-notes', icon: <UploadFile /> },
    { label: 'Manage Assignments', link: '/teacher/assignments', icon: <AssignmentTurnedIn /> },
    { label: 'Collect Feedback', link: '/teacher/feedback', icon: <Feedback /> },
    { label: 'Manage Results', link: '/teacher/results', icon: <Grading /> },
    { label: 'Track Progress', link: '/teacher/progress', icon: <TrendingUp /> },
    { label: 'Faculty Space', link: '/teacher/chat', icon: <Forum /> },
    { label: 'Library', link: '/teacher/library', icon: <LocalLibrary /> },
    { label: 'Syllabus', link: '/teacher/syllabus', icon: <Description /> },
  ];

  // Associate-only section
  const associateOnlyButtons = [
    { label: 'Verify Students Data', link: '/college/verify-students', icon: <VerifiedUser /> },
    { label: 'Students List', link: '/college/students', icon: <PeopleAlt /> },
    { label: 'Fee Overview', link: '/college/fees-status', icon: <Payments /> },
    { label: 'Publish Results', link: '/college/publish-results', icon: <Publish /> },
    { label: 'Announcements', link: '/college/announcement', icon: <Campaign /> },
    { label: 'Upload Timetable', link: '/college/timetable', icon: <UploadFile /> },
    { label: 'Upload Teacher Schedules', link: '/college/teacher_schedules', icon: <ScheduleSend /> },
    { label: 'Student Tickets', link: '/college/student-tickets', icon: <SupportAgent /> },
    { label: 'Admin Assistance', link: '/associate/tickets', icon: <ConfirmationNumber /> },
    { label: 'Exam Scheduler', link: '/college/exam-schedule-create', icon: <EventNote /> },
    { label: 'Upload Eresources', link: '/college/eresources', icon: <CloudUpload /> },
    { label: 'Update Achievements', link: '/college/achievements', icon: <EmojiEvents /> },
  ];

  const renderButtonGrid = (buttons, startIndex = 0) => (
    <Grid container spacing={4} justifyContent="center">
      {buttons.map((button, index) => (
        <Grid
          key={`${button.label}-${index}`}
          sx={{
            width: {
              xs: '95%',
              sm: '45%',
              md: '31.30%',
            },
          }}
        >
          <MotionCard
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.98 }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, delay: (startIndex + index) * 0.06 }}
            sx={{
              background: 'rgba(255, 255, 255, 0.2)',
              backdropFilter: 'blur(5px)',
              color: theme.palette.contrastText,
              borderRadius: '12px',
              border: `2px solid ${theme.palette.divider}`,
              boxShadow: `0 4px 8px rgba(0,0,0,0.1)`,
              overflow: 'hidden',
              transition: 'all 0.3s ease',
              '&:hover': {
                background: theme.palette.green.hover,
                color: theme.palette.contrastText,
                boxShadow: `0 8px 16px rgba(0,0,0,0.4)`,
                transform: 'translateY(-4px)',
                '& .MuiTypography-root': {
                  color: theme.palette.contrastText,
                },
              },
            }}
          >
            <CardActionArea component={Link} to={button.link}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  p: 3,
                  minHeight: 125,
                }}
              >
                <Box
                  sx={{
                    mr: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: theme.palette.contrastText,
                    transition: 'transform 0.3s ease, color 0.3s ease',
                    '&:hover': {
                      transform: 'scale(1.2)',
                      color: theme.palette.primary.main,
                    },
                    '& svg': { fontSize: 28 },
                  }}
                >
                  {button.icon}
                </Box>
                <Typography
                  variant="h5"
                  sx={{
                    fontWeight: 'bold',
                    fontSize: '1.1rem',
                    letterSpacing: 1,
                    color: theme.palette.contrastText,
                  }}
                  className="MuiTypography-root"
                >
                  {button.label}
                </Typography>
              </Box>
            </CardActionArea>
          </MotionCard>
        </Grid>
      ))}
    </Grid>
  );

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background:
          mode === 'default'
            ? `linear-gradient(135deg, ${theme.palette.green.main} -25%, ${theme.palette.green.focus} 100%)`
            : mode === 'light'
            ? theme.palette.green.main
            : `linear-gradient(135deg, ${theme.palette.green.main} -25%, ${theme.palette.background.paper} 100%)`,
        color: theme.palette.contrastText,
        transition: 'background 0.5s ease-in-out',
      }}
    >
      <Header
        rightSlot={
          <Typography
            sx={{
              ml: 1,
              display: { xs: 'none', sm: 'inline' },
              color: theme.palette.contrastText,
              fontWeight: 400,
            }}
          >
            {fullName}
          </Typography>
        }
      />

      <Container sx={{ py: 6 }}>
        <Box textAlign="center" mb={6}>
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Typography
              variant="h1"
              sx={{
                fontWeight: 'bold',
                mb: 2,
                color: theme.palette.contrastText,
              }}
            >
              {getGreeting()}, {fullName}!
            </Typography>
            <Typography
              variant="h4"
              sx={{
                color: theme.palette.green.light,
                mb: 3,
                fontStyle: 'italic',
              }}
            >
              Welcome to ERP Portal
            </Typography>
          </motion.div>
        </Box>

        {/* Top section: Teacher tools */}
        {effectiveRole === 'CollegeAssociate'
          ? renderButtonGrid(sharedTeacherToolsForAssociate)
          : renderButtonGrid(teacherOnlyButtons)}

        {/* Associate-only section */}
        {effectiveRole === 'CollegeAssociate' && (
          <>
            <Divider sx={{ my: 4, backgroundColor: theme.palette.green.main, opacity: 0.6 }} />
            {renderButtonGrid(associateOnlyButtons, sharedTeacherToolsForAssociate.length)}
          </>
        )}
      </Container>
    </Box>
  );
}
