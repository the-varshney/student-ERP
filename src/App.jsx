import React, { useContext } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Box, CssBaseline, Toolbar, AppBar, Typography } from '@mui/material';
import ThemeToggle from './components/ThemeToggle';
import { ThemeContext } from './context/ThemeContext';
import { themes } from './components/theme';
import './App.css'; 

const Home = () => {
  const { mode } = useContext(ThemeContext);
  return (
    <Box
      sx={{
        p: 3,
        minHeight: '100vh',
        backgroundImage: mode === 'vibrant' ? themes.vibrant.palette.gradient.main : 'none',
        backgroundColor: mode !== 'vibrant' ? 'background.default' : 'transparent',
      }}
    >
      <Typography variant="h4">Welcome to Student ERP</Typography>
      <Typography variant="body1">Current theme: {mode}</Typography>
    </Box>
  );
};

export default function App() {
  return (
      <>
      <CssBaseline /><AppBar position="static">
      <Toolbar>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          Student ERP
        </Typography>
        <ThemeToggle />
      </Toolbar>
    </AppBar><Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Typography>Login Page</Typography>} />
        <Route path="/dashboard" element={<Typography>Admin Dashboard</Typography>} />
        <Route path="/attendance" element={<Typography>Attendance Module</Typography>} />
      </Routes>
      </>
  );
}