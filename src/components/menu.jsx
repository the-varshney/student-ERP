import React, { useContext, useMemo } from "react";
import PropTypes from "prop-types";
import { Link } from "react-router-dom";
import {
  Drawer,
  List,
  ListItemIcon,
  ListItemText,
  Divider,
  Typography,
  Box,
  useMediaQuery,
  ListItemButton,
} from "@mui/material";
import { useTheme, alpha } from "@mui/material/styles";
import { motion, AnimatePresence } from "framer-motion";
import { ThemeContext } from "../context/ThemeContext";

import HomeIcon from "@mui/icons-material/Home";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import SchoolIcon from "@mui/icons-material/School";
import AssignmentIcon from "@mui/icons-material/Assignment";
import ScheduleIcon from "@mui/icons-material/Schedule";
import NoteAddIcon from "@mui/icons-material/NoteAdd";
import ChatIcon from "@mui/icons-material/Chat";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import LoginIcon from "@mui/icons-material/Login";
import LockResetIcon from "@mui/icons-material/LockReset";
import TerminalIcon from "@mui/icons-material/Terminal";
import SettingsIcon from "@mui/icons-material/Settings";

const roleItems = {
  Student: [
    { label: "Home", link: "/home", icon: <HomeIcon /> },
    { label: "Attendance", link: "/attendance", icon: <CalendarTodayIcon /> },
    { label: "Results", link: "/result", icon: <SchoolIcon /> },
    { label: "Assignments", link: "/assignments", icon: <AssignmentIcon /> },
    { label: "Timetable & Syllabus", link: "/timetable_syllabus", icon: <ScheduleIcon /> },
    { label: "Notes", link: "/notes", icon: <NoteAddIcon /> },
  ],
  Teacher: [
    { label: "Home", link: "/teacher", icon: <HomeIcon /> },
    { label: "Take Attendance", link: "/teacher/attendance", icon: <CalendarTodayIcon /> },
    { label: "View Schedule", link: "/teacher/schedule", icon: <ScheduleIcon /> },
    { label: "Assignment Management", link: "/teacher/assignments", icon: <AssignmentIcon /> },
    { label: "Upload Notes", link: "/teacher/upload-notes", icon: <NoteAddIcon /> },
    { label: "Faculty Chat", link: "/teacher/chat", icon: <ChatIcon /> },
  ],
  Admin: [
    { label: "Home", link: "/admin", icon: <HomeIcon /> },
    { label: "Add Teachers", link: "/admin/add-teacher", icon: <PersonAddIcon /> },
    { label: "Users Details", link: "/admin/user-details", icon: <LoginIcon /> },
    { label: "Uni Library", link: "/admin/library", icon: <LockResetIcon /> },
    { label: "DB Workbench", link: "/admin/executeDB", icon: <TerminalIcon /> },
  ],
};

const drawerVariants = {
  hidden: { x: "-100%", opacity: 0 },
  visible: { x: 0, opacity: 1, transition: { duration: 0.3, ease: "easeOut" } },
  exit: { x: "-100%", opacity: 0, transition: { duration: 0.2, ease: "easeIn" } },
};

const itemVariants = {
  hidden: { scale: 0.95, opacity: 0 },
  visible: (i) => ({ scale: 1, opacity: 1, transition: { delay: 0.02 * i, duration: 0.18 } }),
};

const Menu = ({ role, open, onClose }) => {
  const { mode } = useContext(ThemeContext);
  const theme = useTheme();
  const isMobile = useMediaQuery("(max-width: 768px)");
  const isDark = theme.palette.mode === "dark";

  const items = useMemo(() => roleItems[role] || roleItems.Student, [role]);

  const drawerBg =
    mode === "default"
      ? `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.60)} 0%, ${alpha(
          theme.palette.secondary.main,
          0.35
        )} 100%)`
      : isDark
      ? "rgba(17, 25, 40, 0.55)"
      : "rgba(255, 255, 255, 0.60)";

  const borderColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const hoverBg = alpha(theme.palette.primary.main, 0.08);
  const hoverGlow = `0 0 10px ${alpha(theme.palette.primary.main, 0.35)}`;
  const iconColor = theme.palette.primary.main;
  const textColor = theme.palette.text.primary;

  return (
    <AnimatePresence>
      {open && (
        <Drawer
          anchor="left"
          open={open}
          onClose={onClose}
          PaperProps={{
            sx: {
              width: isMobile ? 220 : 272,
              background: drawerBg,
              backdropFilter: "saturate(180%) blur(12px)",
              WebkitBackdropFilter: "saturate(180%) blur(12px)",
              borderRight: `1px solid ${borderColor}`,
              borderRadius: "0 12px 12px 0",
              boxShadow: isDark ? "0 10px 24px rgba(0,0,0,0.35)" : "0 8px 20px rgba(0,0,0,0.08)",
              overflow: "hidden",
            },
          }}
        >
          <Box
            component={motion.div}
            variants={drawerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            sx={{ height: "100%", display: "flex", flexDirection: "column" }}
          >
            {/* Title */}
            <Box sx={{ p: 2, textAlign: "center" }}>
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 1000,
                  lineHeight: 2.3,
                  fontSize: '1.4rem',
                  backgroundImage: `linear-gradient(45deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
                  backgroundClip: "text",
                  color: `${theme.palette.contrastText}`,
                }}
              >
                {`${role} Menu`}
              </Typography>
            </Box>

            <Divider sx={{ mx: 2, height: 2, bgcolor: alpha(theme.palette.primary.main, 0.25) }} />

            {/* Menu options */}
            <List sx={{ p: 1, flex: 1 }}>
              {items.map((item, index) => (
                <Box
                  key={item.label}
                  component={motion.div}
                  variants={itemVariants}
                  initial="hidden"
                  animate="visible"
                  custom={index}
                  sx={{ borderRadius: 1, mb: 0.5 }}
                >
                  <Link
                    to={item.link}
                    onClick={onClose}
                    style={{ textDecoration: "none", width: "100%", display: "block" }}
                  >
                    <ListItemButton
                      sx={{
                        borderRadius: 1,
                        "&:hover": {
                          backgroundColor: hoverBg,
                          transform: "scale(1.02)",
                          boxShadow: hoverGlow,
                        },
                        transition: "all 0.2s ease-in-out",
                      }}
                    >
                      <ListItemIcon
                        sx={{
                          minWidth: 40,
                          color: iconColor,
                          transition: "transform 0.3s ease-in-out",
                          "&:hover": { transform: "rotate(8deg)" },
                        }}
                      >
                        {item.icon}
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Typography sx={{ color: textColor, fontWeight: 500 }}>{item.label}</Typography>
                        }
                      />
                    </ListItemButton>
                  </Link>
                </Box>
              ))}

              <Divider sx={{ mx: 2, my: 1, height: 2, bgcolor: alpha(theme.palette.primary.main, 0.25) }} />

              {/* Settings */}
              <Box component={motion.div} variants={itemVariants} initial="hidden" animate="visible">
                <Link
                  to="/settings"
                  onClick={onClose}
                  style={{ textDecoration: "none", width: "100%", display: "block" }}
                >
                  <ListItemButton
                    sx={{
                      borderRadius: 1,
                      "&:hover": {
                        backgroundColor: hoverBg,
                        transform: "scale(1.02)",
                        boxShadow: hoverGlow,
                      },
                      transition: "all 0.2s ease-in-out",
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        minWidth: 40,
                        color: iconColor,
                        transition: "transform 0.3s ease-in-out",
                        "&:hover": { transform: "rotate(8deg)" },
                      }}
                    >
                      <SettingsIcon />
                    </ListItemIcon>
                    <ListItemText
                      primary={<Typography sx={{ color: textColor, fontWeight: 500 }}>Settings</Typography>}
                    />
                  </ListItemButton>
                </Link>
              </Box>
            </List>
          </Box>
        </Drawer>
      )}
    </AnimatePresence>
  );
};

Menu.propTypes = {
  role: PropTypes.string.isRequired,
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default Menu;
