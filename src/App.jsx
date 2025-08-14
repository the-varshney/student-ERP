import React, { useContext } from 'react';
import { Routes, Route, useLocation, Navigate, Link, useNavigate } from 'react-router-dom';
import { Box, CssBaseline, Typography, Button } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import ThemeToggle from './components/ThemeToggle';
import { ThemeContext } from './context/ThemeContext';
import { themes } from './components/theme';
import { AuthContext, ProtectedRoute } from './context/RoleBasedAccess';
import { UserProfile } from './components/header';
import Header from './components/header';
import './App.css';
import { auth } from './firebase/Firebase';

// Pages
import Register from './pages/common/registration';
import Login from './pages/common/login';
import Home from './pages/students/home';
import AdminHome from './pages/admins/AdminHome';
import AddTeacher from './pages/admins/AddTeacher';

import TeacherHome from './pages/teachers/home';

// Test Component (for testing) later will be about us
const Test = () => {
  const { mode } = useContext(ThemeContext);
  const theme = useTheme();
  return (
    <Box
      sx={{
        p: 3,
        minHeight: '100vh',
        background: mode === 'default' && themes.default.custom?.gradient ? themes.default.custom.gradient : theme.palette.background.default,
        color: theme.palette.text.primary,
      }}
    >
      <Typography variant="h4">Welcome to Student ERP</Typography>
      <Typography variant="body1">Current theme: {mode}</Typography>
      <Button
        component={Link}
        to="/home"
        variant="contained"
        sx={{
          mt: 2,
          px: 4,
          py: 1.5,
          fontSize: '1rem',
          fontWeight: 500,
          borderRadius: theme.shape.borderRadius,
          backgroundColor: theme.palette.primary.main,
          color: 'white',
          textTransform: 'none',
          boxShadow: `0 4px 8px ${
            theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
          }`,
          '&:hover': {
            backgroundColor: theme.palette.primary.dark,
            boxShadow: `0 6px 12px ${
              theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'
            }`,
          },
        }}
      >
        Go to Home
      </Button>
      <Button
        component={Link}
        to="/registration"
        variant="contained"
        sx={{
          mt: 2,
          px: 4,
          py: 1.5,
          fontSize: '1rem',
          fontWeight: 500,
          borderRadius: theme.shape.borderRadius,
          backgroundColor: theme.palette.primary.main,
          color: 'white',
          textTransform: 'none',
          boxShadow: `0 4px 8px ${
            theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
          }`,
          '&:hover': {
            backgroundColor: theme.palette.primary.dark,
            boxShadow: `0 6px 12px ${
              theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'
            }`,
          },
        }}
      >
        Go to Registration
      </Button>
      <Button
        variant="contained"
        sx={{
          mt: 2,
          px: 4,
          py: 1.5,
          fontSize: '1rem',
          fontWeight: 500,
          borderRadius: theme.shape.borderRadius,
          backgroundColor: theme.palette.button.main,
          color: theme.palette.button.contrastText,
          textTransform: 'none',
          boxShadow: `0 4px 8px ${
            theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
          }`,
          '&:hover': {
            backgroundColor: theme.palette.button.hover,
            boxShadow: `0 6px 12px ${
              theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'
            }`,
          },
          '&:focus': {
            backgroundColor: theme.palette.button.focus,
          },
        }}
      >
        Test Button 1 (Theme Color)
      </Button>
      <Button
        component={Link}
        to="/login"
        variant="contained"
        sx={{
          mt: 2,
          px: 4,
          py: 1.5,
          fontSize: '1rem',
          fontWeight: 500,
          borderRadius: theme.shape.borderRadius,
          backgroundColor: theme.palette.button.main,
          color: theme.palette.button.secondaryText,
          textTransform: 'none',
          boxShadow: `0 4px 8px ${
            theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
          }`,
          '&:hover': {
            backgroundColor: theme.palette.button.hover,
            boxShadow: `0 6px 12px ${
              theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'
            }`,
          },
          '&:focus': {
            backgroundColor: theme.palette.button.focus,
          },
        }}
      >
        Test Button 2 (Go to Login)
      </Button>
      <Button
        onClick={() => alert(`Theme: ${mode}`)}
        variant="contained"
        sx={{
          mt: 2,
          px: 4,
          py: 1.5,
          fontSize: '1rem',
          fontWeight: 500,
          borderRadius: theme.shape.borderRadius,
          backgroundColor: theme.palette.button.main,
          color: theme.palette.button.contrastText,
          textTransform: 'none',
          boxShadow: `0 4px 8px ${
            theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
          }`,
          '&:hover': {
            backgroundColor: theme.palette.button.hover,
            boxShadow: `0 6px 12px ${
              theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'
            }`,
          },
          '&:focus': {
            backgroundColor: theme.palette.button.focus,
          },
        }}
      >
        Test Button 3 (Show Theme)
      </Button>
      <ThemeToggle />
    </Box>
  );
};

export default function App() {
  const { role } = useContext(AuthContext);
  const { resetTheme } = useContext(ThemeContext);
  const navigate = useNavigate();
  const location = useLocation();
  const isHomePage = ['/home', '/teacher', '/admin'].includes(location.pathname);
  const isLoginOrRegister = ['/login', '/register'].includes(location.pathname);

  // Customize UserProfile for logout
  const CustomUserProfile = () => {
    const handleLogout = async () => {
      const uid = auth.currentUser?.uid;
      if (uid) {
        localStorage.removeItem(`role_${uid}`);
        localStorage.removeItem(`userDetails_${uid}`);
      }
      await auth.signOut();
      resetTheme();
      navigate('/login');
    };

    return (
      <UserProfile
        onLogout={handleLogout}
      />
    );
  };

  return (
    <>
      <CssBaseline />
      {isHomePage && !isLoginOrRegister && (
        <Header>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <CustomUserProfile />
          </Box>
        </Header>
      )}
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<Test />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Student Routes */}
        <Route element={<ProtectedRoute allowedRoles={['Student', 'Teacher', 'Admin']} />}>
          <Route path="/home" element={<Home />} />
          <Route path="/attendance" element={<Typography>Attendance Module</Typography>} />
        </Route>

        {/* Teacher Routes */}
        <Route element={<ProtectedRoute allowedRoles={['Teacher', 'Admin']} />}>
          <Route path="/teacher" element={<TeacherHome />} />
          <Route path="/attendance" element={<Typography>Attendance Module</Typography>} />
        </Route>

        {/* Admin Routes */}
        <Route element={<ProtectedRoute allowedRoles={['Admin']} />}>
          <Route path="/admin" element={<AdminHome />} />
          <Route path="/dashboard" element={<Typography>Admin Dashboard</Typography>} />
          <Route path="/admin/add-teacher" element={<AddTeacher />} />
        </Route>

        {/* Default Redirect */}
        <Route
          path="*"
          element={
            <Navigate
              to={
                role === 'Admin' ? '/admin' :
                role === 'Teacher' ? '/teacher' :
                role === 'Student' ? '/home' :
                '/login'
              }
              replace
            />
          }
        />
      </Routes>
    </>
  );
}