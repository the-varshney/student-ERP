import React, { useState, useEffect, useContext } from 'react';
import { ThemeContext } from '../../context/ThemeContext';
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
  LibraryBooks,
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
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from "../../firebase/Firebase";

// Dynamic greeting based on time
const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
};

const Home = () => {
  const { mode } = useContext(ThemeContext);
  const theme = useTheme();
  const [userInfo, setUserInfo] = useState({ collegeName: 'Institute', fullName: 'Loading...' });

  // Fetch student data from Firebase
  // will be replaced by cache
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const user = auth.currentUser;
        if (user) {
          const userDocRef = doc(db, 'Students', user.uid);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            const data = userDoc.data();
            const fullName = `${data.firstName || 'Student'} ${data.lastName || ''}`.trim();
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
          fullName: 'Student',
        });
      }
    };

    fetchUserData();
  }, []);

  // Feature buttons for ERP
  const featureButtons = [
    { label: 'Attendance', link: '/attendance', icon: <CalendarToday /> },
    { label: 'Results', link: '/result', icon: <School /> },
    { label: 'Fee Status', link: '/dues', icon: <CurrencyRupee /> },
    { label: 'Timetable', link: '/timetable', icon: <Timelapse /> },
    { label: 'Feedback', link: '/feedback', icon: <Feedback /> },
    { label: 'Faculty Chat', link: '/chat', icon: <Chat /> },
    { label: 'Holidays', link: '/holidays', icon: <HolidayVillage /> },
    { label: 'E-Resources', link: '/ecourses', icon: <Book /> },
    { label: 'Library', link: '/library', icon: <LibraryBooks /> },
    { label: 'Exams', link: '/exams', icon: <EventNote /> },
    { label: 'Events', link: '/events', icon: <Event /> },
    { label: 'Notices', link: '/notices', icon: <Notifications /> },
    { label: 'Notes', link: '/notes', icon: <NoteAlt /> },
    { label: 'Assignments', link: '/assignments', icon: <Assignment /> },
    { label: 'Achievements', link: '/achievements', icon: <EmojiEvents /> },
  ].map((button) => ({
    ...button,
  }));

  return (
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
          {featureButtons.map((button, index) => (
            <Grid
              key={index}
              sx={{
                width: {
                  xs: '80%',    // width on extra-small screens
                  sm: '45%',  // width on small screens and up
                  md: '31.30%'
                },
              }}
            >
              <motion.div
                whileHover={{
                  scale: 1.05,
                }}
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
                    borderRadius: "12px",
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
                        textAlign: "center",
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
  );
};

export default Home;