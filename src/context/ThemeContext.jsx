import React, { createContext, useState, useMemo, useEffect, useContext } from 'react';
import PropTypes from 'prop-types';
import { ThemeProvider } from '@mui/material/styles';
import { themes } from '../components/theme';
import AuthContext from './AuthContext';

export const ThemeContext = createContext();

export const ThemeProviderWrapper = ({ children }) => {
  const { role } = useContext(AuthContext); 
  // Initialize theme from sessionStorage or default to 'default'
  const [mode, setMode] = useState(() => {
    const savedMode = sessionStorage.getItem('themeMode');
    return savedMode && themes[savedMode] ? savedMode : 'default';
  });

  useEffect(() => {
    sessionStorage.setItem('themeMode', mode);
  }, [mode]);

  // Function to toggle theme
  const toggleTheme = (newMode) => {
    if (themes[newMode]) {
      setMode(newMode);
    } else {
      console.warn(`Invalid theme mode: ${newMode}. Falling back to default.`);
      setMode('default');
    }
  };

  // Function to reset theme to default
  const resetTheme = () => {
    setMode('default');
    sessionStorage.removeItem('themeMode');
  };

  const selectedTheme = useMemo(() => {
    let userRole = role;

    // Handle role mapping to theme keys
    if (userRole === 'unverified' || userRole === 'verified') {
      userRole = 'student'; 
    } else if (userRole === 'CollegeAssociate') {
      userRole = 'teacher';
    }

    const themeKey = role ? userRole.toLowerCase() : 'student'; // Default to student if no role
    return themes[mode][themeKey] || themes[mode]['student']; //
  }, [mode, role]);

  return (
    <ThemeContext.Provider value={{ mode, toggleTheme, resetTheme }}>
      <ThemeProvider theme={selectedTheme}>{children}</ThemeProvider>
    </ThemeContext.Provider>
  );
};

ThemeProviderWrapper.propTypes = {
  children: PropTypes.node.isRequired,
};