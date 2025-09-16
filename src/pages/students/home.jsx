import React, { useContext, useMemo } from 'react';
import { ThemeContext } from '../../context/ThemeContext';
import AuthContext from '../../context/AuthContext';
import {
  Typography,
  Container,
  Grid,
  Card,
  CardActionArea,
  Box,
  IconButton,
  useTheme,
} from '@mui/material';
import {
  CalendarToday,
  School,
  Feedback,
  EventNote,
  CurrencyRupee,
  Chat,
  MenuBook,
  HolidayVillage,
  Event,
  Notifications,
  Timelapse,
  Book,
  NoteAlt,
  Assignment,
  EmojiEvents,
} from '@mui/icons-material';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { themes } from '../../components/theme';
import Header from '../../components/header'; 

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
const readCachedUserBundle = () => {
  if (typeof window === 'undefined') return { role: null, student: null, details: null };
  const uid = window.localStorage.getItem(LAST_UID_KEY);
  if (!uid) return { role: null, student: null, details: null };
  const readPayload = (name) => {
    try {
      const raw = window.localStorage.getItem(cacheKey(uid, name));
      if (!raw) return null;
      const payload = JSON.parse(raw);
      return payload?.v ?? null;
    } catch {
      return null;
    }
  };
  return {
    role: readPayload('role'),
    student: readPayload('student'),
    details: readPayload('details'),   
  };
};

export default function Home() {
  const { mode } = useContext(ThemeContext);
  const { userDetails } = useContext(AuthContext); // Uses cached context data
  const theme = useTheme();

  const cached = useMemo(() => readCachedUserBundle(), []);
  const cachedDoc = useMemo(() => {
    if (cached.role === 'Student') return cached.student || null;
    return cached.details || null;
  }, [cached]);

  const effective = userDetails || cachedDoc || {};
  const firstName = effective.firstName || 'Student';
  const lastName = effective.lastName || '';
  const fullName = `${firstName} ${lastName}`.trim();
  const collegeName = effective.collegeName || 'Institute';

  const featureButtons = [
    { label: 'Attendance', link: '/attendance', icon: <CalendarToday /> },
    { label: 'Results', link: '/result', icon: <School /> },
    { label: 'Due Fees', link: '/dues', icon: <CurrencyRupee /> },
    { label: 'Timetable & Syllabus', link: '/timetable_syllabus', icon: <Timelapse /> },
    { label: 'Feedback', link: '/feedback', icon: <Feedback /> },
    { label: 'Faculty Assistance', link: '/assistance', icon: <Chat /> },
    { label: 'Holidays', link: '/holidays', icon: <HolidayVillage /> },
    { label: 'E-Resources', link: '/Eresources', icon: <Book /> },
    { label: 'Library', link: '/library', icon: <MenuBook /> },
    { label: 'Exams', link: '/exams', icon: <EventNote /> },
    { label: 'Events', link: '/events', icon: <Event /> },
    { label: 'Notices', link: '/notices', icon: <Notifications /> },
    { label: 'Notes', link: '/notes', icon: <NoteAlt /> },
    { label: 'Assignments', link: '/assignments', icon: <Assignment /> },
    { label: 'Achievements', link: '/achievements', icon: <EmojiEvents /> },
  ];

  return (
    <>
      <Header 
      rightSlot={
        <Typography
          sx={{
            ml: 1,
            display: { xs: 'none', sm: 'inline'},
            color: theme.palette.contrastText,
            fontWeight: 400,
          }}
        >
          {fullName}
        </Typography>
      }
      />
      <Box
        sx={{
          minHeight: '100vh',
          background:
            mode === 'default' && themes.default.custom?.gradient
              ? themes.default.gradient
              : `linear-gradient(135deg, ${theme.palette.background.default} 0%, ${theme.palette.background.paper} 100%)`,
          color: theme.palette.text.primary,
          transition: 'background 0.5s ease-in-out',
        }}
      >
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
                  color: '#1565C0',
                }}
              >
                {getGreeting()}, {fullName}!
              </Typography>
              <Typography
                variant="h4"
                sx={{
                  color: theme.palette.text.secondary,
                  mb: 3,
                  fontStyle: 'italic',
                }}
              >
                Welcome to {collegeName} ERP Portal
              </Typography>
            </motion.div>
          </Box>

          <Grid container spacing={4} justifyContent="center">
            {featureButtons.map((button, index) => (
              <Grid
                key={index}
                sx={{
                  width: {
                    xs: '95%',
                    sm: '45%',
                    md: '31.30%',
                  },
                }}
              >
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.98 }}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: index * 0.1 }}
                >
                  <Card
                    sx={{
                      background: theme.palette.background.paper,
                      backdropFilter: 'blur(5px)',
                      color: theme.palette.text.primary,
                      borderRadius: '12px',
                      border: `2px solid ${theme.palette.divider}`,
                      boxShadow: `0 4px 8px rgba(0,0,0,0.1)`,
                      overflow: 'hidden',
                      transition: 'all 0.3s ease',
                      '&:hover': {
                        background: theme.palette.button.hover,
                        color: theme.palette.contrastText,
                        boxShadow: `0 8px 16px rgba(21, 101, 192, 0.4)`,
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
                        <IconButton
                          sx={{
                            color: theme.palette.primary.main,
                            mr: 2,
                            fontSize: '1.8rem',
                            transition: 'transform 0.3s ease',
                            '&:hover': {
                              transform: 'scale(1.2)',
                              color: theme.palette.success.main,
                            },
                          }}
                        >
                          {button.icon}
                        </IconButton>
                        <Typography
                          variant="h5"
                          sx={{
                            fontWeight: 'bold',
                            fontSize: '1.1rem',
                            letterSpacing: 1,
                            color: theme.palette.button.secondaryText,
                          }}
                          className="MuiTypography-root"
                        >
                          {button.label}
                        </Typography>
                      </Box>
                    </CardActionArea>
                  </Card>
                </motion.div>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>
    </>
  );
}
