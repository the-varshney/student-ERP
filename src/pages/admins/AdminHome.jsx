import React, { useContext } from 'react';
import { ThemeContext } from '../../context/ThemeContext';
import AuthContext from '../../context/AuthContext';
import { Typography, Grid, Card, CardActionArea, Container, Box, Divider, useTheme,
} from '@mui/material';
import {PersonAdd, ManageAccounts, School, RequestQuote, HowToReg, Campaign, UploadFile, SupportAgent, Forum, PeopleAlt,LocalLibrary,        
} from '@mui/icons-material';
import TerminalIcon from '@mui/icons-material/Terminal';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import Header from '../../components/header';

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
};

export default function AdminHome() {
  const { mode } = useContext(ThemeContext);
  const { userDetails } = useContext(AuthContext);
  const theme = useTheme();

  const fullName = userDetails
    ? `${userDetails.firstName || 'Admin'} ${userDetails.lastName || ''}`.trim()
    : 'Admin';

  const adminButtons = [
    { label: 'Add Teachers', link: '/admin/add-teacher', icon: <PersonAdd /> },
    { label: 'User Details', link: '/admin/user-details', icon: <ManageAccounts /> },
    { label: 'Manage Colleges & Courses', link: '/admin/college_courses', icon: <School /> },
    { label: 'DB Queries', link: '/admin/executeDB', icon: <TerminalIcon /> },
    { label: 'Billing', link: '/admin/billing', icon: <RequestQuote /> },
    { label: 'Approve Students', link: '/admin/student-approval', icon: <HowToReg /> },
    { label: 'College Announcements', link: '/admin/announcements', icon: <Campaign /> },
    { label: 'Upload Syllabus', link: '/admin/syllabus', icon: <UploadFile /> },
    { label: 'Associate Tickets', link: '/admin/tickets', icon: <SupportAgent /> },
    { label: 'Faculty Space', link: '/admin/space', icon: <Forum /> },
    { label: 'User Lists', link: '/admin/lists', icon: <PeopleAlt /> },
    { label: 'Uni-Library', link: '/admin/library', icon: <LocalLibrary /> },
  ];
  return (
    <Box
      sx={{
        minHeight: '100vh',
        background:
          mode === 'default'
            ? `linear-gradient(135deg, ${theme.palette.red.main} 0%, ${theme.palette.red.focus} 100%)`
            : mode === 'light'
            ? theme.palette.red.main
            : `linear-gradient(135deg, ${theme.palette.red.main} -25%, ${theme.palette.background.paper} 100%)`,
        color: theme.palette.contrastText,
        transition: 'background 0.5s ease-in-out',
      }}
    >
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

      {/* Greeting */}
      <Container sx={{ py: 4 }}>
        <Box textAlign="center" mb={4}>
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Typography
              variant="h3"
              sx={{ fontWeight: 'bold', letterSpacing: '2px', color: theme.palette.contrastText }}
            >
              {getGreeting()}, {fullName}!
            </Typography>
            <Typography variant="subtitle1" sx={{ color: theme.palette.contrastText, fontStyle: 'italic' }}>
              Manage Users and System Settings
            </Typography>
          </motion.div>
        </Box>
        {/* Admin Buttons */}
        <Grid container spacing={4} justifyContent="center">
          {adminButtons.map((button, index) => (
            <Grid
              key={button.label}
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
                    background: 'rgba(255, 255, 255, 0.2)',
                    backdropFilter: 'blur(5px)',
                    color: theme.palette.contrastText,
                    borderRadius: '12px',
                    border: `2px solid ${theme.palette.divider}`,
                    boxShadow: `0 4px 8px rgba(0,0,0,0.1)`,
                    overflow: 'hidden',
                    transition: 'all 0.3s ease',
                    '&:hover': {
                      background: theme.palette.red.hover,
                      color: theme.palette.contrastText,
                      boxShadow: `0 8px 16px rgba(0,0,0,0.4)`,
                      transform: 'translateY(-4px)',
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
                        gap: 2,
                      }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 0,
                          color: theme.palette.contrastText,
                          transition: 'transform 0.3s ease, color 0.3s ease',
                          '&:hover': {
                            transform: 'scale(1.15)',
                            color: theme.palette.warning.main,
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

        <Divider sx={{ my: 2, backgroundColor: theme.palette.red.main }} />
      </Container>
    </Box>
  );
}
