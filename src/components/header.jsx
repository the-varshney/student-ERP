import React, { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { Avatar, Box, IconButton, Menu, MenuItem, useMediaQuery } from "@mui/material";
import { Menu as MenuIcon } from "@mui/icons-material";
import { motion, AnimatePresence } from "framer-motion";
import { auth } from "../firebase/Firebase";
import { ThemeContext } from "../context/ThemeContext";
import AuthContext from "../context/AuthContext";
import SideMenu from "./menu";
import PropTypes from "prop-types";

// color map for initials
const colorMap = {
  A: "red", B: "blue", C: "green", D: "lightblue", E: "orange",
  F: "purple", G: "brown", H: "pink", I: "cyan", J: "magenta",
  K: "lime", L: "teal", M: "navy", N: "olive", O: "maroon",
  P: "silver", Q: "gray", R: "gold", S: "indigo", T: "violet",
  U: "turquoise", V: "coral", W: "khaki", X: "orchid",
  Y: "salmon", Z: "yellow",
};
const getInitials = (name) => (name ? name.charAt(0).toUpperCase() : "");
const getAvatarColor = (initial) => colorMap[initial] || "grey.500";

// logo
export const UTSLogo = () => (
  <Box
    component={motion.div}
    whileHover={{ scale: 1.1 }}
    transition={{ type: "spring", stiffness: 300 }}
  >
    <img src="/uts.png" alt="UTS Logo" style={{ width: 99, height: "100%" }} />
  </Box>
);

// hamburger menu
export const HamburgerMenu = ({ onClick }) => {
  const isMobile = useMediaQuery("(max-width: 768px)");
  return (
    <Box component={motion.div} whileHover={{ scale: 1.2 }} whileTap={{ scale: 0.9 }}>
      <IconButton
        onClick={onClick}
        sx={{ color: "white", "&:hover": { backgroundColor: "rgba(255, 255, 255, 0.1)" } }}
      >
        <MenuIcon fontSize={isMobile ? "medium" : "large"} />
      </IconButton>
    </Box>
  );
};
HamburgerMenu.propTypes = { onClick: PropTypes.func.isRequired };

// user profile
export const UserProfile = () => {
  const { userDetails, currentUser } = useContext(AuthContext);
  const [anchorEl, setAnchorEl] = useState(null);
  const isMobile = useMediaQuery("(max-width: 768px)");
  const navigate = useNavigate();

  const handleMenuOpen = (e) => setAnchorEl(e.currentTarget);
  const handleMenuClose = () => setAnchorEl(null);

  const handleLogout = async () => {
    const uid = currentUser?.uid;
    if (uid) {
      localStorage.removeItem(`role_${uid}`);
      localStorage.removeItem(`userDetails_${uid}`);
    }
    await signOut(auth);
    navigate("/login");
  };

  return (
    <Box sx={{ display: "flex", alignItems: "center" }}>
      <Avatar
        component={motion.div}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        sx={{
          bgcolor: getAvatarColor(getInitials(userDetails?.firstName)),
          width: isMobile ? 36 : 40,
          height: isMobile ? 36 : 40,
          cursor: "pointer",
          transition: "all 0.3s ease-in-out",
          "&:hover": { boxShadow: "0 0 10px rgba(128, 0, 128, 0.5)" },
        }}
        src={userDetails?.profilePicUrl || undefined}
        onClick={handleMenuOpen}
      >
        {!userDetails?.profilePicUrl && getInitials(userDetails?.firstName)}
      </Avatar>

      <AnimatePresence>
        {anchorEl && (
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleMenuClose}
            PaperProps={{
              component: motion.div,
              initial: { opacity: 0, y: -10 },
              animate: { opacity: 1, y: 0 },
              exit: { opacity: 0, y: -10 },
              transition: { duration: 0.3 },
              sx: {
                mt: 1, bgcolor: "rgba(255,255,255,0.95)",
                backdropFilter: "blur(10px)",
                boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
              },
            }}
          >
            <MenuItem
              onClick={() => { handleMenuClose(); navigate("/profile"); }}
              whileHover={{ backgroundColor: "rgba(128, 0, 128, 0.1)" }}
            >
              Profile
            </MenuItem>
            <MenuItem
              onClick={() => { handleMenuClose(); handleLogout(); }}
              whileHover={{ backgroundColor: "rgba(128, 0, 128, 0.1)" }}
            >
              Logout
            </MenuItem>
          </Menu>
        )}
      </AnimatePresence>
    </Box>
  );
};

// header component
const Header = () => {
  const { mode } = useContext(ThemeContext);
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [menuOpen, setMenuOpen] = useState(false);
  const [role, setRole] = useState(null);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const cachedRole = localStorage.getItem(`role_${uid}`);
    if (cachedRole) {
      setRole(cachedRole);
    }
  }, []);

  return (
    <header
      style={{
        background: mode === "default"
          ? "linear-gradient(135deg, hsl(220, 100%, 71%) 0%, hsla(265, 100%, 70%, 0.28) 100%)"
          : "hsl(219, 100%, 93.90%)",
        padding: isMobile ? "10px 16px" : "12px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
        position: "sticky", top: 0, zIndex: 1000,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center" }}>
        <HamburgerMenu onClick={() => setMenuOpen((prev) => !prev)} />
      </Box>
      <Box sx={{
        flexGrow: isMobile ? 1 : 0,
        display: "flex",
        justifyContent: isMobile ? "center" : "flex-start",
      }}>
        <UTSLogo />
      </Box>
      <Box sx={{ display: "flex", alignItems: "center" }}>
        <UserProfile />
      </Box>
      {role && <SideMenu role={role} open={menuOpen} onClose={() => setMenuOpen(false)} />}
    </header>
  );
};

export default Header;
