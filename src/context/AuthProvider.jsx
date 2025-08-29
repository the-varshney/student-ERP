import React, { useState, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../firebase/Firebase";
import AuthContext from "./AuthContext";

const rolePermissions = {
    Admin: ["/admin", "/dashboard", "/admin/add-teacher", "/admin/student-approval"],
    Teacher: ["/teacher", "/attendance", "/teacher/schedule", "/teacher/upload-notes", "/teacher/assignments", "/teacher/feedback", "/teacher/results", "/teacher/progress", "/teacher/upload-books", "/teacher/chat", "/teacher/library", "/teacher/uploadtts", "/teacher/dues"],
    CollegeAssociate: ["/teacher", "/associate", "/college/verify-students", "/associate/student-chats", "/teacher/uploadtts", "/teacher/dues"],
    Student: ["/home", "/attendance"],
    Guest: ["/", "/login", "/register"],
    unverified: ["/message"],
    verified: ["/message"],
};

const fetchUserRoleAndDetails = async (uid) => {
    const collections = ["Admins", "Teachers", "Students"];
    for (const collectionName of collections) {
        const docRef = doc(db, collectionName, uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const details = docSnap.data();
            let role = details.role || "Guest"; 

            // Only override for the specific case of CollegeAssociate
            if (collectionName === "Teachers" && details.isCollegeAssociate) {
                role = "CollegeAssociate";
            }
            
            console.log(`AuthProvider determined role: ${role} from ${collectionName}`);
            return { role, details, docRef };
        }
    }
    // If user is in Firebase Auth but has no document in our collections
    return { role: "unverified", details: null, docRef: null };
};


export default function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [role, setRole] = useState(null);
    const [userDetails, setUserDetails] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
            setLoading(true);

            if (!user) {
                setCurrentUser(null);
                setRole("Guest");
                setUserDetails(null);
                setLoading(false);
                return;
            }

            setCurrentUser(user);
            const { uid } = user;
            
            // Fetch new data from Firestore
            const { role: freshRole, details: freshDetails, docRef } = await fetchUserRoleAndDetails(uid);
            
            setRole(freshRole);
            setUserDetails(freshDetails);
            
            // Update cache
            localStorage.setItem(`role_${uid}`, freshRole);
            if (freshDetails) {
                localStorage.setItem(`userDetails_${uid}`, JSON.stringify(freshDetails));
            }

            // Set up real-time listener for data changes
            let unsubscribeSnapshot = null;
            if (docRef) {
                unsubscribeSnapshot = onSnapshot(docRef, (snap) => {
                    if (snap.exists()) {
                        const updatedDetails = snap.data();
                        let updatedRole = updatedDetails.role || "unverified";

                        if (updatedDetails.isCollegeAssociate) {
                            updatedRole = "CollegeAssociate";
                        }

                        setRole(updatedRole);
                        setUserDetails(updatedDetails);
                        localStorage.setItem(`role_${uid}`, updatedRole);
                        localStorage.setItem(`userDetails_${uid}`, JSON.stringify(updatedDetails));
                    }
                });
            }
            
            setLoading(false);

            return () => {
                if (unsubscribeSnapshot) {
                    unsubscribeSnapshot();
                }
            };
        });

        return () => unsubscribeAuth();
    }, []);

    const hasAccess = useCallback((path) => {
        if (loading || !role) return false;
        if ((role === "unverified" || role === "verified") && path === "/message") {
            return true;
        }
        return rolePermissions[role]?.includes(path) || false;
    }, [role, loading]);
    
    const contextValue = { currentUser, role, userDetails, loading, hasAccess };

    return (
        <AuthContext.Provider value={contextValue}>
            {children}
        </AuthContext.Provider>
    );
}

AuthProvider.propTypes = {
    children: PropTypes.node.isRequired,
};
