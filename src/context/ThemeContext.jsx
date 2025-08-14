import React, { createContext, useState, useMemo, useEffect } from 'react';
import PropTypes from 'prop-types';
import { ThemeProvider } from '@mui/material/styles';
import { themes } from '../components/theme';

export const ThemeContext = createContext();

export const ThemeProviderWrapper = ({ children }) => {
  // Initialize theme from sessionStorage or default to 'default'
  const [mode, setMode] = useState(() => {
    const savedMode = sessionStorage.getItem('themeMode');
    return savedMode && themes[savedMode] ? savedMode : 'default';
  });

  // Persist theme to sessionStorage whenever mode changes
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

  // Function to reset theme to default (used on logout)
  const resetTheme = () => {
    setMode('default');
    sessionStorage.removeItem('themeMode');
  };

  // Memoize theme to prevent unnecessary re-renders
  const theme = useMemo(() => themes[mode], [mode]);

  return (
    <ThemeContext.Provider value={{ mode, toggleTheme, resetTheme }}>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </ThemeContext.Provider>
  );
};

ThemeProviderWrapper.propTypes = {
  children: PropTypes.node.isRequired,
};