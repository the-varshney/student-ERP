import React, { useContext, useEffect, useState } from 'react';
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
  PersonAdd,
  Login,
  LockReset,
  CurrencyRupee,
} from '@mui/icons-material';
import TerminalIcon from '@mui/icons-material/Terminal';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { HamburgerMenu, UTSLogo, UserProfile } from '../../components/header';

const AdminHome = () => {
  const { mode } = useContext(ThemeContext);
  const theme = useTheme();
  const [userInfo, setUserInfo] = useState({ collegeName: '', fullName: '' });

  useEffect(() => {
    const fetchUserData = () => {
      const userDetails = { College: 'BCA Institute of Technology', firstName: 'Admin', lastName: '' };
      if (userDetails) {
        setUserInfo({
          collegeName: userDetails.College || '',
          fullName: `${userDetails.firstName || ''} ${userDetails.lastName || ''}`.trim(),
        });
      }
    };
    fetchUserData();
  }, []);

  const adminButtons = [
    { label: 'Add Teachers', link: '/admin/add-teacher', icon: <PersonAdd /> },
    { label: 'Login as User', link: '/admin/user-details', icon: <Login /> },
    { label: 'Reset User Password', link: '/admin/reset-password', icon: <LockReset /> },
    { label: 'DB Queries', link: '/admin/executeDB', icon: <TerminalIcon /> },
    { label: 'Billing', link: '/admin/billing', icon: <CurrencyRupee /> },
  ];

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: mode === 'default'
          ? `linear-gradient(135deg, ${theme.palette.red.main} 0%, ${theme.palette.red.focus} 100%)`
          : mode === 'light'
          ? theme.palette.red.main
          : `linear-gradient(135deg, ${theme.palette.red.main} -25%, ${theme.palette.background.paper} 100%)`,
        color: theme.palette.contrastText,
        transition: 'background 0.5s ease-in-out',
      }}
    >
      <AppBar position="static" sx={{ background: theme.palette.red.main }}>
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

      <Container sx={{ py: 4 }}>
        <Box textAlign="center" mb={4}>
          <Typography variant="h3" sx={{ fontWeight: 'bold', letterSpacing: '2px', color: theme.palette.contrastText }}>
            Admin Dashboard
          </Typography>
          <Typography variant="subtitle1" sx={{ color: theme.palette.contrastText }}>
            Manage Users and System Settings
          </Typography>
        </Box>

        <Grid container spacing={4} justifyContent="center">
          {adminButtons.map((button, index) => (
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
                            color: theme.palette.warning.main,
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
};

export default AdminHome;