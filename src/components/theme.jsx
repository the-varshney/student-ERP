import { createTheme } from '@mui/material/styles';

const baseTheme = {
   typography: {
    fontFamily: '"Roboto Flex", sans-serif',
    fontSize: 14,
    fontWeightBold: 700, 
    h1: {
      fontSize: '2.5rem',
      fontWeight: 700,
      lineHeight: 1.3,
      letterSpacing: '-0.01562em',
    },
    h2: {
      fontSize: '2rem',
      fontWeight: 600,
      lineHeight: 1.4,
      letterSpacing: '-0.00833em',
    },
    h3: {
      fontSize: '1.5rem',
      fontWeight: 600,
      lineHeight: 1.4,
    },
    h4: {
      fontSize: '1.25rem',
      fontWeight: 500,
      lineHeight: 1.5,
    },
    h5: {
      fontSize: '1.125rem',
      fontWeight: 500,
      lineHeight: 1.5,
    },
    h6: {
      fontSize: '1rem',
      fontWeight: 500,
      lineHeight: 1.5,
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
    subtitle1: {
      fontSize: '1rem',
      fontWeight: 600,
      lineHeight: 1.75,
    },
    subtitle2: {
      fontSize: '0.875rem',
      fontWeight: 500,
      lineHeight: 1.57,
    },
    caption: {
      fontSize: '0.75rem',
      fontWeight: 400,
      lineHeight: 1.66,
    },
    overline: {
      fontSize: '0.75rem',
      fontWeight: 500,
      lineHeight: 2.66,
      textTransform: 'uppercase',
    },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: 8,
          transition: 'all 0.3s ease-in-out',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          transition: 'box-shadow 0.3s ease-in-out',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          transition: 'box-shadow 0.3s ease-in-out',
          '&:hover': {
            boxShadow: '0 8px 16px rgba(0,0,0,0.1)',
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 600,
          letterSpacing: 0.5,
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          height: 4,
          borderRadius: '4px 4px 0 0',
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          fontSize: '0.8rem',
          fontWeight: 500,
          padding: '8px 12px',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          borderRight: 'none',
        },
      },
    },
  },
};

//Light Theme
// A clean, white and blue color palette
const lightTheme = createTheme({
  ...baseTheme,
  palette: {
    mode: 'light',
    primary: { main: 'hsl(210, 100%, 40%)', light: 'hsl(210, 100%, 85%)' },
    secondary: { main: 'hsl(0, 0%, 0%)' }, // Black for borders
    contrastText: 'hsl(0, 0%, 0%)',
    background: {
      default: 'hsl(0, 0%, 100%)',
      paper: 'hsl(0, 0%, 98%)',
    },
    text: {
      primary: 'hsl(220, 20%, 10%)',
      secondary: 'hsl(220, 10%, 50%)',
    },
    divider: 'hsl(220, 10%, 80%)',
    red: {
      main: 'hsl(0, 100%, 64%)',
      hover: 'hsl(0, 100%, 50%)',
      focus: 'hsl(0, 100%, 45%)',
    },
    green: {
      main: 'hsl(120, 100%, 85%)',
      hover: 'hsl(120, 100%, 70%)',
      focus: 'hsl(120, 100%, 35%)',
    },
  },
});

//Dark Theme
// Darker shades with glowing accents.
const darkTheme = createTheme({
  ...baseTheme,
  palette: {
    mode: 'dark',
    primary: { main: 'hsl(210, 100%, 70%)' }, // Light blue highlights
    secondary: { main: 'hsl(0, 0%, 90%)' },
    contrastText: 'hsl(0, 0%, 100%)',
    background: {
      default: 'hsl(0, 0.00%, 0.00%)',
      paper: 'hsl(220, 10%, 10%)',
    },
    text: {
      primary: 'hsl(0, 0%, 100%)', 
      secondary: 'hsl(0, 0%, 70%)',
    },
    divider: 'hsl(211, 20%, 30%)',
    red: {
      main: 'hsl(0, 100%, 40%)',
      hover: 'hsl(0, 100%, 50%)',
      focus: 'hsl(0, 100%, 35%)',
    },
    green: {
      main: 'hsl(120, 100%, 50%)',
      hover: 'hsl(120, 100%, 60%)',
      focus: 'hsl(120, 100%, 45%)',
    },
  },
});

//Default Theme
// A vibrant, professional color palette with gradient accents.
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
    contrastText: 'hsl(0, 0%, 100%)',
    background: {
      default: 'hsl(220, 100%, 97%)',
      paper: 'hsl(220, 100%, 99%)',
    },
    text: {
      primary: 'hsl(220, 30%, 15%)',
      secondary: 'hsl(220, 10%, 50%)',
    },
    divider: 'hsl(220, 80%, 85%)',
    red: {
      main: 'hsl(0, 100%, 60%)',
      hover: 'hsl(0, 100%, 45%)',
      focus: 'hsl(9, 100%, 50%)',
    },
    green: {
      main: 'hsl(120, 100%, 45%)',
      hover: 'hsl(120, 100%, 55%)',
      focus: 'hsl(140, 63%, 40%)',
    },
  },
  custom: {
    gradient: 'linear-gradient(135deg, hsl(220, 100%, 55%) 0%, hsl(265, 100%, 70%) 100%)',
  },
});

// role-specific palettes that can be applied within any of the main themes
const rolePalettes = {
  student: {
    primary: { main: 'hsl(220, 100%, 55%)' }, // Vibrant Blue
    secondary: { main: 'hsl(265, 100%, 70%)' },
    info: { main: 'hsl(200, 100%, 65%)' },
    success: { main: 'hsl(160, 100%, 45%)' },
    warning: { main: 'hsl(50, 100%, 60%)' },
    error: { main: 'hsl(0, 100%, 65%)' },
    button: { main: 'hsl(210, 100%, 45%)', hover: 'hsl(220, 100%, 73%)', focus: 'hsl(220, 100%, 45%)' },
  },
  teacher: {
    primary: { main: 'hsl(160, 100%, 45%)' }, // Green
    secondary: { main: 'hsl(160, 100%, 60%)' },
    info: { main: 'hsl(190, 80%, 55%)' },
    success: { main: 'hsl(120, 80%, 40%)' },
    warning: { main: 'hsl(40, 90%, 60%)' },
    error: { main: 'hsl(350, 90%, 55%)' },
    button: { main: 'hsl(140, 63%, 40%)', hover: 'hsl(120, 100%, 55%)', focus: 'hsl(140, 63%, 35%)' },
  },
  admin: {
    primary: { main: 'hsl(0, 100%, 65%)' }, // Red
    secondary: { main: 'hsl(330, 80%, 70%)' },
    info: { main: 'hsl(200, 100%, 65%)' },
    success: { main: 'hsl(160, 100%, 45%)' },
    warning: { main: 'hsl(50, 100%, 60%)' },
    error: { main: 'hsl(0, 100%, 65%)' },
    button: { main: 'hsl(0, 100%, 60%)', hover: 'hsl(0, 100%, 45%)', focus: 'hsl(9, 100%, 50%)' },
  },
};


// Themed and Role-Specific Exports
export const themes = {
  light: {
    student: createTheme({ ...lightTheme, palette: { ...lightTheme.palette, ...rolePalettes.student } }),
    teacher: createTheme({ ...lightTheme, palette: { ...lightTheme.palette, ...rolePalettes.teacher } }),
    admin: createTheme({ ...lightTheme, palette: { ...lightTheme.palette, ...rolePalettes.admin } }),
  },
  dark: {
    student: createTheme({ ...darkTheme, palette: { ...darkTheme.palette, ...rolePalettes.student, button: { ...darkTheme.palette.button, secondaryText: rolePalettes.student.primary.main } } }),
    teacher: createTheme({ ...darkTheme, palette: { ...darkTheme.palette, ...rolePalettes.teacher, button: { ...darkTheme.palette.button, secondaryText: rolePalettes.teacher.primary.main } } }),
    admin: createTheme({ ...darkTheme, palette: { ...darkTheme.palette, ...rolePalettes.admin, button: { ...darkTheme.palette.button, secondaryText: rolePalettes.admin.primary.main } } }),
  },
  default: {
    student: createTheme({ ...defaultTheme, palette: { ...defaultTheme.palette, ...rolePalettes.student } }),
    teacher: createTheme({ ...defaultTheme, palette: { ...defaultTheme.palette, ...rolePalettes.teacher } }),
    admin: createTheme({ ...defaultTheme, palette: { ...defaultTheme.palette, ...rolePalettes.admin } }),
  },
};