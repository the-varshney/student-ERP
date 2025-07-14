import { createTheme } from '@mui/material/styles';

const baseTheme = {
  typography: {
    fontFamily: '"Roboto Flex", sans-serif',
    fontSize: 14,
    h1: {
      fontSize: '2rem',
      fontWeight: 700,
      lineHeight: 1.3,
    },
    h2: {
      fontSize: '1.5rem',
      fontWeight: 600,
      lineHeight: 1.4,
    },
    h3: {
      fontSize: '1.25rem',
      fontWeight: 500,
      lineHeight: 1.4,
    },
    body1: {
      fontSize: '1rem',
      fontWeight: 400,
      lineHeight: 1.6,
    },
    body2: {
      fontSize: '0.875rem',
      fontWeight: 400,
      lineHeight: 1.5,
      color: 'hsl(220, 10%, 50%)',
    },
    button: {
      textTransform: 'none',
      fontWeight: 500,
      fontSize: '0.95rem',
    },
  },
  shape: {
    borderRadius: 12,
  },
};

// Light Theme: clean, black borders, blue accents
const lightTheme = createTheme({
  ...baseTheme,
  palette: {
    mode: 'light',
    primary: { main: 'hsl(210, 100%, 40%)' }, // Blue accents
    secondary: { main: 'hsl(0, 0%, 0%)' }, // Black for borders
    background: {
      default: 'hsl(0, 0%, 100%)', 
      paper: 'hsl(0, 0%, 98%)',
    },
    text: {
      primary: 'hsl(220, 20%, 10%)', // Dark gray
      secondary: 'hsl(220, 10%, 50%)',
    },
    divider: 'hsl(220, 10%, 80%)', // soft light for dividers
  },
});

// Dark Theme: black bg, white text, light blue highlights
const darkTheme = createTheme({
  ...baseTheme,
  palette: {
    mode: 'dark',
    primary: { main: 'hsl(210, 100%, 70%)' }, // Light blue highlights
    secondary: { main: 'hsl(0, 0%, 90%)' }, // Near-white text or accent
    background: {
      default: 'hsl(0, 0.00%, 0.00%)', 
      paper: 'hsl(220, 10%, 10%)',
    },
    text: {
      primary: 'hsl(0, 0%, 100%)', // White text
      secondary: 'hsl(0, 0%, 70%)', // Off-white
    },
    divider: 'hsl(210, 15%, 30%)', // subtle blue-gray dividers
  },
});

// default Theme: using vibrant and blue palette
const defaultTheme = createTheme({
  ...baseTheme,
  palette: {
    mode: 'light',
    primary: { main: 'hsl(220, 100%, 55%)' },       
    secondary: { main: 'hsl(265, 100%, 70%)' },      
    info: { main: 'hsl(200, 100%, 65%)' },           
    success: { main: 'hsl(160, 100%, 45%)' },        
    warning: { main: 'hsl(50, 100%, 60%)' },         
    error: { main: 'hsl(0, 100%, 65%)' },            
    background: {
      default: 'hsl(220, 100%, 97%)',                
      paper: 'hsl(220, 100%, 99%)',
    },
    text: {
      primary: 'hsl(220, 30%, 15%)',
      secondary: 'hsl(220, 10%, 50%)',
    },
    divider: 'hsl(220, 80%, 85%)',
  },
  custom: {
    gradient: 'linear-gradient(135deg, hsl(220, 100%, 55%) 0%, hsl(265, 100%, 70%) 100%)',
  },
});

export const themes = {
  light: lightTheme,
  dark: darkTheme,
  default: defaultTheme, 
};
