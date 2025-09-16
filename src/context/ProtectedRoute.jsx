import React, { useContext, useMemo } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import PropTypes from "prop-types";
import AuthContext from "./AuthContext";
import { CircularProgress, Box } from "@mui/material";

const GUEST_ALLOWED_PATHS = ["/", "/login", "/register"];
const ROLE_HOME_PAGES = {
  Admin: "/admin",
  CollegeAssociate: "/associate",
  Teacher: "/teacher",
  Student: "/home",
  verified: "/message",
  unverified: "/message",
};
const DEFAULT_HOME_PATH = "/login";

// testing helpers
const DEMO_META = "erp:__demo__:meta:v1";
const DEMO_LOCK = "erp:__demo__:lock:v1";
const readDemoRole = () => {
  try {
    const lock = JSON.parse(localStorage.getItem(DEMO_LOCK) || "null");
    const meta = JSON.parse(localStorage.getItem(DEMO_META) || "null");
    if (lock?.active && meta?.demo?.role) return meta.demo.role;
  // eslint-disable-next-line no-empty
  } catch {}
  return null;
};

export default function ProtectedRoute({ allowedRoles }) {
  const { currentUser, role, loading } = useContext(AuthContext);
  const location = useLocation();

  // Use test role if demo is active
  const demoRole = useMemo(readDemoRole, [location.key]);
  const effectiveRole = demoRole || role;

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  const isGuestPath = GUEST_ALLOWED_PATHS.includes(location.pathname);

  // Not authenticated
  if (!currentUser) {
    return isGuestPath ? <Outlet /> : <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Authenticated visiting a guest path -> send to home for role
  if (isGuestPath) {
    const redirectTo = ROLE_HOME_PAGES[effectiveRole] || DEFAULT_HOME_PATH;
    return <Navigate to={redirectTo} replace />;
  }

  // Authenticated and allowed
  if (allowedRoles.includes(effectiveRole)) {
    return <Outlet />;
  }

  // Authenticated but no access
  const redirectTo = ROLE_HOME_PAGES[effectiveRole] || DEFAULT_HOME_PATH;
  return <Navigate to={redirectTo} replace />;
}

ProtectedRoute.propTypes = {
  allowedRoles: PropTypes.arrayOf(PropTypes.string).isRequired,
};
