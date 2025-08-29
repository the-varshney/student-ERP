import React, { useContext } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import PropTypes from "prop-types";
import AuthContext from "./AuthContext";
import { CircularProgress, Box } from "@mui/material";

const GUEST_ALLOWED_PATHS = ["/", "/login", "/register"];
const ROLE_HOME_PAGES = {
    Admin: "/admin",
    CollegeAssociate: "/teacher",
    Teacher: "/teacher",
    Student: "/home",
    verified: "/message",
    unverified: "/message",
};
const DEFAULT_HOME_PATH = "/login";

export default function ProtectedRoute({ allowedRoles }) {
    const { currentUser, role, loading } = useContext(AuthContext);
    const location = useLocation();

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <CircularProgress />
            </Box>
        );
    }

    const isGuestPath = GUEST_ALLOWED_PATHS.includes(location.pathname);

    // if user is not authenticated.
    if (!currentUser) {
        return isGuestPath ? <Outlet /> : <Navigate to="/login" state={{ from: location }} replace />;
    }

    // if user is authenticated.
    if (isGuestPath) {
        const redirectTo = ROLE_HOME_PAGES[role] || DEFAULT_HOME_PATH;
        return <Navigate to={redirectTo} replace />;
    }
    
    // if user is authenticated and on a protected page. Check for access.
    if (allowedRoles.includes(role)) {
        return <Outlet />; // Access granted!
    }

    // if user is authenticated but doesn't have the required role.
    const redirectTo = ROLE_HOME_PAGES[role] || DEFAULT_HOME_PATH;
    return <Navigate to={redirectTo} replace />;
}

ProtectedRoute.propTypes = {
    allowedRoles: PropTypes.arrayOf(PropTypes.string).isRequired,
};
