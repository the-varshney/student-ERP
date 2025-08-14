import React, { useState, useEffect, createContext, useContext } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { auth, db } from "../firebase/Firebase";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import PropTypes from "prop-types";

// role permissions
const rolePermissions = {
  Admin: ["/admin", "/dashboard", "/admin/add-teacher"],
  Teacher: ["/teacher", "/attendance"],
  Student: ["/home", "/attendance"],
  Guest: ["/", "/login", "/register"],
};

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [role, setRole] = useState(null);
  const [userDetails, setUserDetails] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      setLoading(true);

      if (!user) {
        setCurrentUser(null);
        setRole("Guest");
        setUserDetails(null);
        setLoading(false);
        return;
      }

      setCurrentUser(user);
      const uid = user.uid;

      // load cached role & details first
      const cachedRole = localStorage.getItem(`role_${uid}`);
      const cachedDetailsRaw = localStorage.getItem(`userDetails_${uid}`);
      if (cachedRole) setRole(cachedRole);
      if (cachedDetailsRaw) setUserDetails(JSON.parse(cachedDetailsRaw));

      // check each collection to find the user's role & details
      const collections = [
        { name: "Admins", role: "Admin" },
        { name: "Teachers", role: "Teacher" },
        { name: "Students", role: "Student" },
      ];

      for (const { name, role } of collections) {
        const docRef = doc(db, name, uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const details = docSnap.data();
          const userRole = details.role || role;

          setRole(userRole);
          setUserDetails(details);

          // cache role & details
          localStorage.setItem(`role_${uid}`, userRole);
          localStorage.setItem(`userDetails_${uid}`, JSON.stringify(details));

          // real-time listener for updates in users collection
          onSnapshot(docRef, (snap) => {
            if (snap.exists()) {
              const updated = snap.data();
              setUserDetails(updated);
              localStorage.setItem(`userDetails_${uid}`, JSON.stringify(updated));
            }
          });

          break; // stop after finding match
        }
      }

      setLoading(false);
    });

    return () => unsubscribeAuth();
  }, []);

  const hasAccess = (path) => {
    if (!role) return false;
    return rolePermissions[role]?.includes(path) || false;
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        role,
        userDetails,
        setUserDetails,
        loading,
        hasAccess,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

AuthProvider.propTypes = { children: PropTypes.node.isRequired };

// protected route
export const ProtectedRoute = ({ allowedRoles }) => {
  const { currentUser, role, hasAccess, loading } = useContext(AuthContext);
  const location = useLocation();

  if (loading) return <div>loading...</div>;

  if (!currentUser && !rolePermissions.Guest.includes(location.pathname)) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!allowedRoles.includes(role) || !hasAccess(location.pathname)) {
    if (role === "Admin") return <Navigate to="/admin" replace />;
    if (role === "Teacher") return <Navigate to="/teacher" replace />;
    return <Navigate to="/home" replace />;
  }

  return <Outlet />;
};

ProtectedRoute.propTypes = {
  allowedRoles: PropTypes.arrayOf(PropTypes.string).isRequired,
};