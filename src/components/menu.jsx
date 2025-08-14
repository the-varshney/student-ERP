import React, { useContext } from "react";
import PropTypes from "prop-types";
import { Link } from "react-router-dom";
import {
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Typography,
  Box,
  useMediaQuery,
} from "@mui/material";
import { motion, AnimatePresence } from "framer-motion";
import { ThemeContext } from "../context/ThemeContext";

// Icons
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

const Menu = ({ role, open, onClose }) => {
  const { mode } = useContext(ThemeContext);
  const isMobile = useMediaQuery("(max-width: 768px)");

  // Menu items according to role
  const studentMenuItems = [
    { label: "Home", link: "/home", icon: <HomeIcon /> },
    { label: "Attendance", link: "/attendance", icon: <CalendarTodayIcon /> },
    { label: "Results", link: "/result", icon: <SchoolIcon /> },
    { label: "Assignments", link: "/assignments", icon: <AssignmentIcon /> },
    { label: "Timetable & Syllabus", link: "/timetable-syllabus", icon: <ScheduleIcon /> },
    { label: "Notes", link: "/notes", icon: <NoteAddIcon /> },
  ];

  const teacherMenuItems = [
    { label: "Home", link: "/teacher/home", icon: <HomeIcon /> },
    { label: "Take Attendance", link: "/teacher/attendance", icon: <CalendarTodayIcon /> },
    { label: "View Schedule", link: "/teacher/schedule", icon: <ScheduleIcon /> },
    { label: "Assignment Management", link: "/teacher/assignments", icon: <AssignmentIcon /> },
    { label: "Upload Notes", link: "/teacher/upload-notes", icon: <NoteAddIcon /> },
    { label: "Faculty Chat", link: "/teacher/chat", icon: <ChatIcon /> },
  ];

  const adminMenuItems = [
    { label: "Home", link: "/admin/home", icon: <HomeIcon /> },
    { label: "Add Teachers", link: "/admin/add-teacher", icon: <PersonAddIcon /> },
    { label: "Login as User", link: "/admin/user-details", icon: <LoginIcon /> },
    { label: "Reset Password", link: "/admin/reset-password", icon: <LockResetIcon /> },
    { label: "DB Queries", link: "/admin/executeDB", icon: <TerminalIcon /> },
  ];

  // Animation variants
  const drawerVariants = {
    hidden: { x: "-100%", opacity: 0 },
    visible: { x: 0, opacity: 1, transition: { duration: 0.3, ease: "easeOut" } },
    exit: { x: "-100%", opacity: 0, transition: { duration: 0.2, ease: "easeIn" } },
  };

  const itemVariants = {
    hidden: { scale: 0.9, opacity: 0 },
    visible: { scale: 1, opacity: 1, transition: { duration: 0.2 } },
  };

  return (
    <AnimatePresence>
      {open && (
        <Drawer
          anchor="left"
          open={open}
          onClose={onClose}
          PaperProps={{
            sx: {
              width: isMobile ? 200 : 250, 
              background: mode === "default"
                ? "linear-gradient(135deg, hsl(220, 100%, 71%) 0%, hsla(265, 100%, 70%, 0.28) 100%)"
                : "hsl(219, 100%, 93.90%)",
              borderRadius: "0 8px 8px 0",
              boxShadow: "0 8px 16px rgba(0, 0, 0, 0.2)",
              backdropFilter: "blur(10px)",
              zIndex: 1200,
            },
          }}
        >
          <Box
            component={motion.div}
            variants={drawerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            sx={{ height: "100%" }}
          >
            <Box sx={{ p: 2, textAlign: "center" }}>
              <Typography
                variant="h6"
                sx={{
                  fontWeight: "bold",
                  color: mode === "default" ? "#fff" : "#333",
                  background: role === "Student"
                    ? "linear-gradient(45deg, #87CEEB, #ADD8E6)"
                    : role === "Teacher"
                    ? "linear-gradient(45deg, #90EE90, #98FB98)"
                    : "linear-gradient(45deg, #d32f2f, #f44336)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                {role} Menu
              </Typography>
            </Box>
            <Divider
              sx={{
                bgcolor: role === "Student"
                  ? "linear-gradient(90deg, #87CEEB, #ADD8E6)"
                  : role === "Teacher"
                  ? "linear-gradient(90deg, #90EE90, #98FB98)"
                  : "linear-gradient(90deg, #d32f2f, #b71c1c)",
                height: 2,
                mx: 2,
              }}
            />

            <List sx={{ p: 1 }}>
              {role === "Student" &&
                studentMenuItems.map((item, index) => (
                  <ListItem
                    button
                    component={motion.div}
                    key={item.label}
                    sx={{
                      borderRadius: 1,
                      mb: 0.5,
                      "&:hover": {
                        backgroundColor: role === "Student"
                          ? "rgba(173, 216, 230, 0.1)"
                          : role === "Teacher"
                          ? "rgba(144, 238, 144, 0.1)"
                          : "rgba(255, 235, 238, 0.1)",
                        transform: "scale(1.02)",
                        boxShadow: `0 0 10px ${role === "Student"
                          ? "rgba(173, 216, 230, 0.3)"
                          : role === "Teacher"
                          ? "rgba(144, 238, 144, 0.3)"
                          : "rgba(211, 47, 47, 0.3)"}`,
                      },
                    }}
                    variants={itemVariants}
                    initial="hidden"
                    animate="visible"
                    custom={index}
                  >
                    <Link to={item.link} style={{ textDecoration: "none", width: "100%" }} onClick={onClose}>
                      <Box sx={{ display: "flex", alignItems: "center", width: "100%" }}>
                        <ListItemIcon
                          sx={{
                            color: role === "Student"
                              ? "#87CEEB"
                              : role === "Teacher"
                              ? "#90EE90"
                              : "#d32f2f",
                            transition: "transform 0.3s ease-in-out",
                            "&:hover": { transform: "rotate(10deg)" },
                          }}
                        >
                          {item.icon}
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            <Typography
                              sx={{
                                color: mode === "default" ? "#fff" : "#333",
                                fontWeight: 500,
                              }}
                            >
                              {item.label}
                            </Typography>
                          }
                        />
                      </Box>
                    </Link>
                  </ListItem>
                ))}

              {role === "Teacher" &&
                teacherMenuItems.map((item, index) => (
                  <ListItem
                    button
                    component={motion.div}
                    key={item.label}
                    sx={{
                      borderRadius: 1,
                      mb: 0.5,
                      "&:hover": {
                        backgroundColor: role === "Student"
                          ? "rgba(173, 216, 230, 0.1)"
                          : role === "Teacher"
                          ? "rgba(144, 238, 144, 0.1)"
                          : "rgba(255, 235, 238, 0.1)",
                        transform: "scale(1.02)",
                        boxShadow: `0 0 10px ${role === "Student"
                          ? "rgba(173, 216, 230, 0.3)"
                          : role === "Teacher"
                          ? "rgba(144, 238, 144, 0.3)"
                          : "rgba(211, 47, 47, 0.3)"}`,
                      },
                    }}
                    variants={itemVariants}
                    initial="hidden"
                    animate="visible"
                    custom={index}
                  >
                    <Link to={item.link} style={{ textDecoration: "none", width: "100%" }} onClick={onClose}>
                      <Box sx={{ display: "flex", alignItems: "center", width: "100%" }}>
                        <ListItemIcon
                          sx={{
                            color: role === "Student"
                              ? "#87CEEB"
                              : role === "Teacher"
                              ? "#90EE90"
                              : "#d32f2f",
                            transition: "transform 0.3s ease-in-out",
                            "&:hover": { transform: "rotate(10deg)" },
                          }}
                        >
                          {item.icon}
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            <Typography
                              sx={{
                                color: mode === "default" ? "#fff" : "#333",
                                fontWeight: 500,
                              }}
                            >
                              {item.label}
                            </Typography>
                          }
                        />
                      </Box>
                    </Link>
                  </ListItem>
                ))}

              {role === "Admin" &&
                adminMenuItems.map((item, index) => (
                  <ListItem
                    button
                    component={motion.div}
                    key={item.label}
                    sx={{
                      borderRadius: 1,
                      mb: 0.5,
                      "&:hover": {
                        backgroundColor: role === "Student"
                          ? "rgba(173, 216, 230, 0.1)"
                          : role === "Teacher"
                          ? "rgba(144, 238, 144, 0.1)"
                          : "rgba(255, 235, 238, 0.1)",
                        transform: "scale(1.02)",
                        boxShadow: `0 0 10px ${role === "Student"
                          ? "rgba(173, 216, 230, 0.3)"
                          : role === "Teacher"
                          ? "rgba(144, 238, 144, 0.3)"
                          : "rgba(211, 47, 47, 0.3)"}`,
                      },
                    }}
                    variants={itemVariants}
                    initial="hidden"
                    animate="visible"
                    custom={index}
                  >
                    <Link to={item.link} style={{ textDecoration: "none", width: "100%" }} onClick={onClose}>
                      <Box sx={{ display: "flex", alignItems: "center", width: "100%" }}>
                        <ListItemIcon
                          sx={{
                            color: role === "Student"
                              ? "#87CEEB"
                              : role === "Teacher"
                              ? "#90EE90"
                              : "#d32f2f",
                            transition: "transform 0.3s ease-in-out",
                            "&:hover": { transform: "rotate(10deg)" },
                          }}
                        >
                          {item.icon}
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            <Typography
                              sx={{
                                color: mode === "default" ? "#fff" : "#333",
                                fontWeight: 500,
                              }}
                            >
                              {item.label}
                            </Typography>
                          }
                        />
                      </Box>
                    </Link>
                  </ListItem>
                ))}

              <Divider
                sx={{
                  bgcolor: role === "Student"
                    ? "linear-gradient(90deg, #87CEEB, #ADD8E6)"
                    : role === "Teacher"
                    ? "linear-gradient(90deg, #90EE90, #98FB98)"
                    : "linear-gradient(90deg, #d32f2f, #b71c1c)",
                  height: 2,
                  mx: 2,
                }}
              />

              <ListItem
                button
                component={motion.div}
                sx={{
                  borderRadius: 1,
                  mb: 0.5,
                  "&:hover": {
                    backgroundColor: role === "Student"
                      ? "rgba(173, 216, 230, 0.1)"
                      : role === "Teacher"
                      ? "rgba(144, 238, 144, 0.1)"
                      : "rgba(255, 235, 238, 0.1)",
                    transform: "scale(1.02)",
                    boxShadow: `0 0 10px ${role === "Student"
                      ? "rgba(173, 216, 230, 0.3)"
                      : role === "Teacher"
                      ? "rgba(144, 238, 144, 0.3)"
                      : "rgba(211, 47, 47, 0.3)"}`,
                  },
                }}
                variants={itemVariants}
                initial="hidden"
                animate="visible"
              >
                <Link to="/settings" style={{ textDecoration: "none", width: "100%" }} onClick={onClose}>
                  <Box sx={{ display: "flex", alignItems: "center", width: "100%" }}>
                    <ListItemIcon
                      sx={{
                        color: role === "Student"
                          ? "#87CEEB"
                          : role === "Teacher"
                          ? "#90EE90"
                          : "#d32f2f",
                        transition: "transform 0.3s ease-in-out",
                        "&:hover": { transform: "rotate(10deg)" },
                      }}
                    >
                      <SettingsIcon />
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Typography
                          sx={{
                            color: mode === "default" ? "#fff" : "#333",
                            fontWeight: 500,
                          }}
                        >
                          Settings
                        </Typography>
                      }
                    />
                  </Box>
                </Link>
              </ListItem>
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