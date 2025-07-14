import React, { useContext, useState } from 'react';
import { ThemeContext } from '../context/ThemeContext';
import { LightMode, DarkMode, Palette } from '@mui/icons-material';
import { Box, IconButton } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';

const ThemeToggle = () => {
  const { mode, toggleTheme } = useContext(ThemeContext);
  const [showOptions, setShowOptions] = useState(false);

  const handleIcon = () => {
    if (mode === 'light') return <LightMode />;
    if (mode === 'dark') return <DarkMode />;
    return <Palette />;
  };

  const handleSelect = (theme) => {
    toggleTheme(theme);
    setShowOptions(false);
  };

  return (
    <Box
      sx={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setShowOptions(true)}
      onMouseLeave={() => setShowOptions(false)}
    >
      <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
        <IconButton color="inherit">{handleIcon()}</IconButton>
      </motion.div>

      <AnimatePresence>
        {showOptions && (
          <motion.div
            className="glass-radio-group"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            style={{
              position: 'absolute',
              top: '110%',
              right: 0,
              zIndex: 10,
            }}
          >
            <input type="radio" name="theme" id="glass-light" checked={mode === 'light'} onChange={() => handleSelect('light')} />
            <label htmlFor="glass-light">Light</label>

            <input type="radio" name="theme" id="glass-dark" checked={mode === 'dark'} onChange={() => handleSelect('dark')} />
            <label htmlFor="glass-dark">Dark</label>

            <input type="radio" name="theme" id="glass-default" checked={mode === 'default'} onChange={() => handleSelect('default')} />
            <label htmlFor="glass-default">Default</label>

            <div className="glass-glider" />
          </motion.div>
        )}
      </AnimatePresence>
    </Box>
  );
};

export default ThemeToggle;
