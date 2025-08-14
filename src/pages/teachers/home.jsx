import React, { useState, useEffect, useContext } from 'react';
import { ThemeContext } from '../../context/ThemeContext';
import {
  AppBar,
  Typography,
  Grid,
  Card,
  CardActionArea,
  Container,
  Box,
  IconButton,
  Divider,
  useTheme,
} from '@mui/material';
import {
  CalendarToday,
  UploadFile,
  School,
  Group,
  Assignment,
  Feedback,
  MenuBook,
  Chat,
  CurrencyRupee,
  EventNote,
  Schedule,
  NoteAdd,
} from '@mui/icons-material';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase/Firebase';
import { HamburgerMenu, UTSLogo, UserProfile } from '../../components/header';

// Dynamic greeting based on time
const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
};

const TeacherHome = () => {
  const { mode } = useContext(ThemeContext);
  const theme = useTheme();
  const [userInfo, setUserInfo] = useState({ collegeName: 'Institute', fullName: 'Loading...' });

  // Fetch user data from Firebase
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const user = auth.currentUser;
        if (user) {
          const userDocRef = doc(db, 'Teachers', user.uid);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            const data = userDoc.data();
            const fullName = `${data.firstName || 'Teacher'} ${data.lastName || ''}`.trim();
            setUserInfo({
              collegeName: data.collegeName || 'BCA Institute of Technology',
              fullName,
            });
          } else {
            console.error('No such document!');
          }
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
        setUserInfo({
          collegeName: 'BCA Institute of Technology',
          fullName: 'Teacher',
        });
      }
    };

    fetchUserData();
  }, []);

  const teacherButtons = [
    { label: 'View Schedule', link: '/teacher/schedule', icon: <Schedule /> },
    { label: 'Take Attendance', link: '/teacher/attendance', icon: <CalendarToday /> },
    { label: 'Upload Notes', link: '/teacher/upload-notes', icon: <NoteAdd /> },
    { label: 'Manage Assignments', link: '/teacher/assignments', icon: <Assignment /> },
    { label: 'Collect Feedback', link: '/teacher/feedback', icon: <Feedback /> },
    { label: 'Manage Results', link: '/teacher/results', icon: <School /> },
    { label: 'Track Progress', link: '/teacher/progress', icon: <Group /> },
    { label: 'Fee Overview', link: '/teacher/dues', icon: <CurrencyRupee /> },
    { label: 'Upload Books', link: '/teacher/upload-books', icon: <MenuBook /> },
    { label: 'Faculty Chat', link: '/teacher/chat', icon: <Chat /> },
    { label: 'Library', link: '/teacher/library', icon: <EventNote /> },
    { label: 'Upload Timetable', link: '/teacher/uploadtts', icon: <UploadFile /> },
  ];

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: mode === 'default'
          ? `linear-gradient(135deg, ${theme.palette.green.main} -25%, ${theme.palette.green.focus} 100%)`
          : mode === 'light'
          ? theme.palette.green.main
          : `linear-gradient(135deg, ${theme.palette.green.main} -25%, ${theme.palette.background.paper} 100%)`,
        color: theme.palette.contrastText,
        transition: 'background 0.5s ease-in-out',
      }}
    >
      <AppBar position="static" sx={{ background: theme.palette.green.main }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', p: 1 }}>
          <Box sx={{ position: 'absolute', left: 60, top: 25, gap: 2, display: 'flex', alignItems: 'center' }}>
            <HamburgerMenu />
            <Typography variant="h6" sx={{ color: theme.palette.contrastText }}>
              {userInfo.collegeName}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'center', margin: '0 10px', position: 'relative', left: '39%' }}>
            <UTSLogo />
          </Box>

          <Box sx={{ display: 'flex', alignContent: 'center', position: 'relative', right: '15px' }}>
            <UserProfile />
            <Typography sx={{ alignContent: 'center', color: theme.palette.contrastText }}>
              {userInfo.fullName}
            </Typography>
          </Box>
        </Box>
      </AppBar>

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
                color: theme.palette.green.main,
              }}
            >
              {getGreeting()}, {userInfo.fullName}!
            </Typography>
            <Typography
              variant="h4"
              sx={{
                color: theme.palette.text.secondary,
                mb: 3,
                fontStyle: 'italic',
              }}
            >
              Welcome to {userInfo.collegeName} ERP Portal
            </Typography>
          </motion.div>
        </Box>

        <Grid container spacing={4} justifyContent="center">
          {teacherButtons.map((button, index) => (
            <Grid
              key={index}
              sx={{
                width: {
                  xs: '80%',
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
                      <IconButton
                        sx={{
                          color: theme.palette.contrastText,
                          mr: 2,
                          fontSize: '1.8rem',
                          transition: 'transform 0.3s ease',
                          '&:hover': {
                            transform: 'scale(1.2)',
                            color: theme.palette.primary.main,
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
                          color: theme.palette.contrastText,
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

        <Divider sx={{ my: 2, backgroundColor: theme.palette.green.main }} />
      </Container>
    </Box>
  );
};

export default TeacherHome;