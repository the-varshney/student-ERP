import React from 'react';
import PropTypes from 'prop-types';
import {
  Paper,
  Stack,
  Box,
  Typography,
  Tabs,
  Tab,
} from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';

function SecondaryHeader({
  title,
  subtitle,
  tabs = [],              // [{ label, value, icon, disabled }]
  tabValue,
  onTabChange,
  rightArea = null,       
  leftArea = null,       
  elevation = 0,
  border = true,
  dense = false,
  sticky = false,
  background,             
  paperSx = {},
  stackSx = {},
  titleSx = {},
  subtitleSx = {},
  tabsProps = {},
  tabProps = {},
  renderBelow = false,
  rightOn = 'top',
}) {
  const theme = useTheme();

  const defaultBg = `linear-gradient(180deg, 
    ${alpha(theme.palette.background.paper, 0.98)}, 
    ${alpha(theme.palette.background.default, 0.98)}
  )`;

  const showTabs = Array.isArray(tabs) && tabs.length > 0;
  const showRight = Boolean(rightArea);
  return (
    <Paper
      elevation={elevation}
      sx={{
        p: { xs: dense ? 1.25 : 1.5, md: dense ? 1.5 : 2 },
        borderRadius: 2,
        mb: 2,
        background: background || defaultBg,
        border: border ? '1px solid' : 'none',
        borderColor: 'divider',
        ...(sticky
          ? {
              position: 'sticky',
              top: 0,
              zIndex: theme.zIndex.appBar ?? 1100,
              backdropFilter: 'saturate(140%) blur(4px)',
              WebkitBackdropFilter: 'saturate(140%) blur(4px)',
            }
          : null),
        ...paperSx,
      }}
    >
      {/* First row */}
      <Stack
        direction={{ xs: 'row', sm: 'row' }}
        spacing={1.25}
        alignItems={{ sm: 'center' }}
        justifyContent="space-between"
        sx={stackSx}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {leftArea}
          <Box>
            {typeof title === 'string' ? (
              <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: 0.3, ...titleSx }}>
                {title}
              </Typography>
            ) : (
              title
            )}
            {subtitle ? (
              <Typography variant="body2" sx={{ mt: 0.25, color: 'text.secondary', ...subtitleSx }}>
                {subtitle}
              </Typography>
            ) : null}
          </Box>
        </Box>

        {/* Tabs OR Right area in the first row */}
        {showTabs && !renderBelow ? (
          <Tabs
            value={tabValue}
            onChange={onTabChange}
            variant="scrollable"
            allowScrollButtonsMobile
            {...tabsProps}
          >
            {tabs.map((t, idx) => (
              <Tab
                key={t.value ?? t.label ?? idx}
                label={t.label}
                icon={t.icon}
                iconPosition={t.icon ? 'start' : undefined}
                value={t.value ?? idx}
                disabled={t.disabled}
                {...tabProps}
              />
            ))}
          </Tabs>
        ) : showRight && rightOn === 'top' ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>{rightArea}</Box>
        ) : null}
      </Stack>

      {/* Second row when both tabs */}
      {showTabs && renderBelow && (
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ mt: 1.25 }}
          spacing={1}
        >
          <Tabs
            value={tabValue}
            onChange={onTabChange}
            variant="scrollable"
            allowScrollButtonsMobile
            {...tabsProps}
          >
            {tabs.map((t, idx) => (
              <Tab
                key={t.value ?? t.label ?? idx}
                label={t.label}
                icon={t.icon}
                iconPosition={t.icon ? 'start' : undefined}
                value={t.value ?? idx}
                disabled={t.disabled}
                {...tabProps}
              />
            ))}
          </Tabs>
        {showRight && rightOn === 'bottom' ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>{rightArea}</Box>
          ) : null}
        </Stack>
      )}
    </Paper>
  );
}

SecondaryHeader.propTypes = {
  title: PropTypes.oneOfType([PropTypes.string, PropTypes.node]).isRequired,
  subtitle: PropTypes.oneOfType([PropTypes.string, PropTypes.node]),
  tabs: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.node.isRequired,
      value: PropTypes.any,
      icon: PropTypes.node,
      disabled: PropTypes.bool,
    })
  ),
  tabValue: PropTypes.any,
  onTabChange: PropTypes.func,
  rightArea: PropTypes.node,
  leftArea: PropTypes.node,
  elevation: PropTypes.number,
  border: PropTypes.bool,
  dense: PropTypes.bool,
  sticky: PropTypes.bool,
  background: PropTypes.string,
  paperSx: PropTypes.object,
  stackSx: PropTypes.object,
  titleSx: PropTypes.object,
  subtitleSx: PropTypes.object,
  tabsProps: PropTypes.object,
  tabProps: PropTypes.object,
  renderBelow: PropTypes.bool,
  rightOn: PropTypes.oneOf(['top', 'bottom']),
};

export default SecondaryHeader;