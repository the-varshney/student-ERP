/* eslint-disable no-empty */
/* eslint-disable no-unused-vars */
import React, { useContext, useEffect, useMemo, useState, useCallback } from "react";
import PropTypes from "prop-types";
import { useNavigate } from "react-router-dom";
import { signOut, signInWithEmailAndPassword } from "firebase/auth";
import { Avatar, Box, IconButton, Menu, MenuItem, Button, useMediaQuery, Tooltip } from "@mui/material";
import { Menu as MenuIcon, ArrowBack as ArrowBackIcon, Refresh as RefreshIcon } from "@mui/icons-material";
import { motion, AnimatePresence } from "framer-motion";
import { auth } from "../firebase/Firebase";
import { ThemeContext } from "../context/ThemeContext";
import AuthContext from "../context/AuthContext";
import SideMenu from "./menu";
import { useTheme, alpha } from "@mui/material/styles";

// color helpers for avatar initials
const colorMap = {
  A: "red", B: "blue", C: "green", D: "lightblue", E: "orange",
  F: "purple", G: "brown", H: "pink", I: "cyan", J: "magenta",
  K: "lime", L: "teal", M: "navy", N: "olive", O: "maroon",
  P: "silver", Q: "gray", R: "gold", S: "indigo", T: "violet",
  U: "turquoise", V: "coral", W: "khaki", X: "orchid", Y: "salmon", Z: "yellow",
};
const getInitials = (name) => (name ? name.charAt(0).toUpperCase() : "");
const getAvatarColor = (initial) => colorMap[initial] || "grey.500";

// READ ROLE FROM LOCAL CACHE 
const readCachedRole = () => {
  if (typeof window === "undefined") return null;
  try {
    const NS = "erp"; const VER = "v1";
    const LAST_UID_KEY = `${NS}:lastUid:${VER}`;
    const cacheKey = (uid, name) => `${NS}:${uid}:${name}:${VER}`;

    const uid = window.localStorage.getItem(LAST_UID_KEY);
    if (!uid) return null;

    const raw = window.localStorage.getItem(cacheKey(uid, "role"));
    if (!raw) return null;

    // { v: "Student" | "Teacher" | "Admin" | ... , exp: null }
    const payload = JSON.parse(raw);
    return payload?.v ?? null;
  } catch {
    return null;
  }
};

// logo
export const UTSLogo = ({ onClick, href = "/", clickable = true, src = "/uts.png", alt = "UTS Logo", width = 99 }) => {
  const navigate = useNavigate();
  const handle = () => {
    if (!clickable) return;
    if (typeof onClick === "function") onClick();
    else navigate(href, { replace: true });
  };
  return (
    <Box
      component={motion.div}
      whileHover={{ scale: clickable ? 1.1 : 1 }}
      transition={{ type: "spring", stiffness: 300 }}
      onClick={handle}
      sx={{ cursor: clickable ? "pointer" : "default" }}
    >
      <img src={src} alt={alt} style={{ width, height: "100%" }} />
    </Box>
  );
};
UTSLogo.propTypes = {
  onClick: PropTypes.func,
  href: PropTypes.string,
  clickable: PropTypes.bool,
  src: PropTypes.string,
  alt: PropTypes.string,
  width: PropTypes.number,
};

// back button
export const HeaderBackButton = ({ onBack, tooltip = "Back", size = "medium" }) => {
  const navigate = useNavigate();
  const handle = () => {
    if (typeof onBack === "function") onBack();
    else navigate(-1);
  };
  return (
    <Tooltip title={tooltip}>
      <IconButton onClick={handle} color="inherit" size={size}>
        <ArrowBackIcon />
      </IconButton>
    </Tooltip>
  );
};
HeaderBackButton.propTypes = {
  onBack: PropTypes.func,
  tooltip: PropTypes.string,
  size: PropTypes.oneOf(["small", "medium", "large"]),
};

// reload button
export const HeaderReloadButton = ({ onReload, tooltip = "Reload", size = "medium" }) => {
  const handle = () => {
    if (typeof onReload === "function") onReload();
    else window.location.reload();
  };
  return (
    <Tooltip title={tooltip}>
      <IconButton onClick={handle} color="inherit" size={size}>
        <RefreshIcon />
      </IconButton>
    </Tooltip>
  );
};
HeaderReloadButton.propTypes = {
  onReload: PropTypes.func,
  tooltip: PropTypes.string,
  size: PropTypes.oneOf(["small", "medium", "large"]),
};

// hamburger opener
export const HamburgerMenu = ({ onClick, tooltip = "Menu", size = "medium" }) => {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const hoverBg = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.06)";
  return (
    <Box component={motion.div} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
      <Tooltip title={tooltip}>
        <IconButton
          onClick={onClick}
          sx={{ color: theme.palette.contrastText, "&:hover": { backgroundColor: hoverBg } }}
          size={size}
        >
          <MenuIcon fontSize={isMobile ? "medium" : "large"} />
        </IconButton>
      </Tooltip>
    </Box>
  );
};
HamburgerMenu.propTypes = {
  onClick: PropTypes.func.isRequired,
  tooltip: PropTypes.string,
  size: PropTypes.oneOf(["small", "medium", "large"]),
};

export function useDemoAwareLogout() {
  const navigate = useNavigate();
  const handleLogout = useCallback(async () => {
    const NS = "erp"; const VER = "v1";
    const DEMO_META = `${NS}:__demo__:meta:${VER}`;
    const TESTER_CREDS = `${NS}:__demo__:testerCreds:${VER}`;
    const LAST_UID_KEY = `${NS}:lastUid:${VER}`;
    const cacheKey = (uid, name) => `${NS}:${uid}:${name}:${VER}`;
    const legacyRoleKey = (uid) => `role_${uid}`;
    const legacyDetailsKey = (uid) => `userDetails_${uid}`;
    const readJSON = (k) => { try { const raw = localStorage.getItem(k); return raw ? JSON.parse(raw) : null; } catch { return null; } };
    const envelope = (v) => JSON.stringify({ v, exp: null });

    const restoreTesterCache = (primaryUid, meta) => {
      try {
        ["role", "student", "details", "academic"].forEach((n) => localStorage.removeItem(cacheKey(primaryUid, n)));
        localStorage.removeItem(legacyRoleKey(primaryUid));
        localStorage.removeItem(legacyDetailsKey(primaryUid));

        const b = meta?.backup || {};
        if (b.role) localStorage.setItem(cacheKey(primaryUid, "role"), b.role);
        if (b.student) localStorage.setItem(cacheKey(primaryUid, "student"), b.student);
        if (b.details) localStorage.setItem(cacheKey(primaryUid, "details"), b.details);
        if (b.academic) localStorage.setItem(cacheKey(primaryUid, "academic"), b.academic);

        const bl = meta?.backupLegacy || {};
        if (!b.role && bl.role != null) localStorage.setItem(cacheKey(primaryUid, "role"), envelope(bl.role));
        if (!b.student && !b.details && bl.details != null) {
          try {
            const parsed = JSON.parse(bl.details);
            const roleStr = bl.role || "Student";
            const target = roleStr === "Student" ? "student" : "details";
            localStorage.setItem(cacheKey(primaryUid, target), envelope(parsed));
          } catch {}
        }

        if (bl.role != null) localStorage.setItem(legacyRoleKey(primaryUid), bl.role);
        if (bl.details != null) localStorage.setItem(legacyDetailsKey(primaryUid), bl.details);

        localStorage.setItem(LAST_UID_KEY, primaryUid);
      } catch {}
    };

    const meta = readJSON(DEMO_META);
    if (meta?.mode === "full" && meta?.primaryUid) {
      const creds = readJSON(TESTER_CREDS);
      navigate("/test", { replace: true });
      setTimeout(async () => {
        try { await signOut(auth); } catch {}
        if (creds?.email && creds?.password) {
          try {
            await signInWithEmailAndPassword(auth, creds.email, creds.password);
            const restoredUid = auth.currentUser?.uid || meta.primaryUid;
            restoreTesterCache(restoredUid, meta);
            localStorage.removeItem(DEMO_META);
            window.location.replace("/test");
            return;
          } catch {
            restoreTesterCache(meta.primaryUid, meta);
            localStorage.removeItem(DEMO_META);
            window.location.replace("/login");
            return;
          }
        }
        restoreTesterCache(meta.primaryUid, meta);
        localStorage.removeItem(DEMO_META);
        window.location.replace("/login");
      }, 0);
      return;
    }
    // normal logout
    try { await signOut(auth); } catch {}
    navigate("/login", { replace: true });
  }, [navigate]);

  return handleLogout;
}

// profile
export const UserProfile = ({
  showProfileItem = true,
  showLogoutItem = true,
  onSettingsClick, 
  onLogout,       
}) => {
  const { userDetails, currentUser } = useContext(AuthContext);
  const [anchorEl, setAnchorEl] = useState(null);
  const isMobile = useMediaQuery("(max-width: 768px)");
  const navigate = useNavigate();
  const demoAwareLogout = useDemoAwareLogout();

  const handleMenuOpen = (e) => setAnchorEl(e.currentTarget);
  const handleMenuClose = () => setAnchorEl(null);

  const initials = useMemo(() => getInitials(userDetails?.firstName), [userDetails?.firstName]);

  const goSettings = () => {
    if (typeof onSettingsClick === "function") onSettingsClick();
    else navigate("/settings");
  };

  const doLogout = async () => {
    if (typeof onLogout === "function") return onLogout();
    return demoAwareLogout();
  };

  return (
    <Box sx={{ display: "flex", alignItems: "center" }}>
      <Avatar
        component={motion.div}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        sx={{
          bgcolor: getAvatarColor(initials),
          width: isMobile ? 36 : 40,
          height: isMobile ? 36 : 40,
          cursor: "pointer",
          transition: "all 0.3s ease-in-out",
          "&:hover": { boxShadow: "0 0 10px rgba(128, 0, 128, 0.5)" },
        }}
        src={userDetails?.profilePicUrl || undefined}
        onClick={handleMenuOpen}
      >
        {!userDetails?.profilePicUrl && initials}
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
                mt: 1,
                bgcolor: theme => theme.palette.background.paper,
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
                border: "1px solid rgba(0,0,0,0.06)",
              },
            }}
          >
            {showProfileItem && (
              <MenuItem onClick={() => { handleMenuClose(); goSettings(); }}>
                Settings
              </MenuItem>
            )}
            {showLogoutItem && (
              <MenuItem onClick={() => { handleMenuClose(); doLogout(); }}>
                Logout
              </MenuItem>
            )}
          </Menu>
        )}
      </AnimatePresence>
    </Box>
  );
};
UserProfile.propTypes = {
  showProfileItem: PropTypes.bool,
  showLogoutItem: PropTypes.bool,
  onSettingsClick: PropTypes.func,
  onLogout: PropTypes.func,
};

// main header
const Header = ({
  showBack = false,
  showReload = false,
  showMenuButton = true,
  logoClickable = true,
  logoHref = "/",
  onLogoClick,
  onBack,
  onReload,
  onMenuToggle,
  controlledMenuOpen, 
  rightSlot,          
  leftSlot,           
  centerSlot,         
  sticky = true,
}) => {
  const { mode } = useContext(ThemeContext);
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [menuOpen, setMenuOpen] = useState(false);

  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  // Cache-based role for menu
  const cachedRole = useMemo(() => readCachedRole(), []);
  const Role = cachedRole || null;

  const open = typeof controlledMenuOpen === "boolean" ? controlledMenuOpen : menuOpen;
  const setOpen = (v) => {
    if (typeof onMenuToggle === "function") onMenuToggle(v);
    if (typeof controlledMenuOpen !== "boolean") setMenuOpen(v);
  };

  useEffect(() => {
    const onStorage = (e) => {
      if (!e.key) return;
      if (e.key.includes(":role:")) {
        const next = readCachedRole();
        if (next !== Role) {
          setMenuOpen((s) => s); // keep open state
        }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [Role]);

  // Glass style
  const glass = useMemo(() => {
    const gradientDefault = `linear-gradient(135deg, 
      ${alpha(theme.palette.primary.main, 0.60)} 0%, 
      ${alpha(theme.palette.secondary.main, 0.35)} 100%)`;

    const lightTint = "rgba(255,255,255,0.60)";
    const darkTint = `${alpha(theme.palette.background.paper, 0.60)}`;

    return {
      background: mode === "default" ? gradientDefault : (isDark ? darkTint : lightTint),
      border: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
      shadow: isDark ? "0 10px 24px rgba(0,0,0,0.35)" : "0 8px 20px rgba(0,0,0,0.08)",
      blur: 12,
      saturation: 1.8,
      zIndex: (theme.zIndex?.appBar ?? 1100),
    };
  }, [mode, isDark, theme]);

  return (
    <header
      style={{
        //glass effect
        backdropFilter: `saturate(${glass.saturation}) blur(${glass.blur}px)`,
        WebkitBackdropFilter: `saturate(${glass.saturation}) blur(${glass.blur}px)`,
        background: glass.background,
        borderBottom: `1px solid ${glass.border}`,
        boxShadow: glass.shadow,
        padding: isMobile ? "10px 16px" : "12px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: sticky ? "sticky" : "static",
        top: sticky ? 0 : "auto",
        zIndex: glass.zIndex,
        backfaceVisibility: "hidden",
        transform: "translateZ(0)",
        backgroundClip: "padding-box",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        {showMenuButton && <HamburgerMenu onClick={() => setOpen(!open)} />}
        {showBack && <HeaderBackButton onBack={onBack} />}
        {leftSlot}
      </Box>
      <Box
        sx={{
          flexGrow: isMobile ? 1 : 0,
          display: "flex",
          justifyContent: isMobile ? "center" : "flex-start",
        }}
      >
        {centerSlot ? centerSlot : (
          <UTSLogo onClick={onLogoClick} href={logoHref} clickable={logoClickable} />
        )}
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        {showReload && <HeaderReloadButton onReload={onReload} />}
        <UserProfile />
        {rightSlot}
      </Box>
      <SideMenu role={Role} open={open} onClose={() => setOpen(false)} />
    </header>
  );
};

Header.propTypes = {
  showBack: PropTypes.bool,
  showReload: PropTypes.bool,
  showMenuButton: PropTypes.bool,
  logoClickable: PropTypes.bool,
  logoHref: PropTypes.string,
  onLogoClick: PropTypes.func,
  onBack: PropTypes.func,
  onReload: PropTypes.func,
  onMenuToggle: PropTypes.func,
  controlledMenuOpen: PropTypes.bool,
  rightSlot: PropTypes.node,
  leftSlot: PropTypes.node,
  centerSlot: PropTypes.node,
  sticky: PropTypes.bool,
};

export default Header;
