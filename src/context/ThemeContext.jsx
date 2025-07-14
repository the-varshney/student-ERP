import React from 'react';
import PropTypes from 'prop-types';
import { createContext, useState, useMemo } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { themes } from '../components/theme';

export const ThemeContext = createContext();

export const ThemeProviderWrapper = ({ children }) => {
  const [mode, setMode] = useState('default');

  const toggleTheme = (newMode) => {
    setMode(newMode);
  };

  const theme = useMemo(() => themes[mode], [mode]);

  return (
    <ThemeContext.Provider value={{ mode, toggleTheme }}>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </ThemeContext.Provider>
  );
};

ThemeProviderWrapper.propTypes = {
  children: PropTypes.node.isRequired,
};