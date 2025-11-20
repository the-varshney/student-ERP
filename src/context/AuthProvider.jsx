import React, { useState, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import axios from "axios";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../firebase/Firebase";
import AuthContext from "./AuthContext";

const rolePermissions = {
  Admin: ["/admin", "/dashboard", "/admin/add-teacher", "/admin/student-approval", "/admin/announcements", "/admin/syllabus", "/admin/tickets", "/admin/billing", "/admin/space", "/admin/lists", "/admin/executeDB", "/admin/user-details", "/admin/college_courses", "/admin/library"],
  Teacher: ["/teacher", "/attendance", "/teacher/schedule", "/teacher/upload-notes", "/teacher/assignments", "/teacher/feedback", "/teacher/results", "/teacher/progress", "/teacher/library", "/teacher/chat", "/teacher/announcement", "/teacher/Eresources"],
  CollegeAssociate: ["/teacher", "/associate", "/college/verify-students", "college/exam-schedule-create", "/college/publish-results", "/college/announcement", "/college/eresources", "/college/timetable", "/college/teacher_schedules", "/college/achievements", "/college/student-tickets", "/college/fees-status", "/associate/tickets", "/college/students"],
  Student: ["/home", "/attendance", "/result", "/schedule", "/notes", "/assignments", "/feedback", "/achievements", "/library", "/assistance", "/dues", "/exams", "/holidays", "/Eresources", "/timetable_syllabus", "/notices", "/events"],
  Guest: ["/", "/login", "/register"],
  unverified: ["/message"],
  verified: ["/message"],
};

const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL;

//cache helpers
const NS = "erp";
const VER = "v1";
const STORE = typeof window !== "undefined" ? window.localStorage : null;
const LAST_UID_KEY = `${NS}:lastUid:${VER}`;
const key = (uid, name) => `${NS}:${uid}:${name}:${VER}`;

const cache = {
  set(uid, name, value, ttlMs) {
    if (!STORE || !uid || !name) return;
    const payload = { v: value, exp: ttlMs ? Date.now() + ttlMs : null };
    try {
      STORE.setItem(key(uid, name), JSON.stringify(payload));
    } catch {

      console.warn(`[cache:set:fail] ${key(uid, name)}`);
    }
  },
  get(uid, name) {
    if (!STORE || !uid || !name) return null;
    const k = key(uid, name);
    try {
      const raw = STORE.getItem(k);
      if (!raw) {
        return null;
      }
      const payload = JSON.parse(raw);
      if (payload?.exp && Date.now() > payload.exp) {
        STORE.removeItem(k);
        return null;
      }
      return payload.v ?? null;
    } catch {

      console.warn(`[cache:get:fail] ${k}`);
      return null;
    }
  },
  remove(uid, name) {
    if (!STORE || !uid || !name) return;
    STORE.removeItem(key(uid, name));
  },
  clearUser(uid) {
    if (!STORE || !uid) return;
    const prefix = `${NS}:${uid}:`;
    for (let i = STORE.length - 1; i >= 0; i--) {
      const k = STORE.key(i);
      if (k && k.startsWith(prefix)) {
        STORE.removeItem(k);
      }
    }
  },
  setLastUid(uid) {
    if (!STORE) return;
    STORE.setItem(LAST_UID_KEY, uid);
  },
  getLastUid() {
    if (!STORE) return null;
    return STORE.getItem(LAST_UID_KEY);
  },
  clearLastUid() {
    if (!STORE) return;
    STORE.removeItem(LAST_UID_KEY);
  },
};

const mergeStudent = (fs, mongo) => {
  const merged = {
    abcId: fs?.abcId || "",
    collegeId: fs?.collegeId || "",
    collegeName: fs?.collegeName || "",
    dob: fs?.dob || "",
    email: fs?.email || "",
    firebaseId: fs?.firebaseId || "",
    firstName: fs?.firstName || "",
    lastName: fs?.lastName || "",
    gender: fs?.gender || "",
    phone: fs?.phone || "",
    profilePicUrl: fs?.profilePicUrl || "",
    program: fs?.program || "",
    role: fs?.role || "Student",
    Department: mongo?.department || "",
    Program: mongo?.program || "",
    Semester: mongo?.semester || "",
    YearOfAdmission: mongo?.yearOfAdmission || "",
    EnrollmentNo: mongo?.enrollmentNo || "",
    _fs: fs || null,
    _academic: mongo || null,
  };
  return merged;
};

const fetchUserRoleAndDetails = async (uid) => {
  const adminsRef = doc(db, "Admins", uid);
  const adminSnap = await getDoc(adminsRef);
  if (adminSnap.exists()) {
    const details = adminSnap.data();
    return { role: "Admin", details, docRef: adminsRef };
  }

  const teachersRef = doc(db, "Teachers", uid);
  const teacherSnap = await getDoc(teachersRef);
  if (teacherSnap.exists()) {
    const details = teacherSnap.data();
    const role = details.isCollegeAssociate ? "CollegeAssociate" : "Teacher";
    return { role, details, docRef: teachersRef };
  }

  const studentsRef = doc(db, "Students", uid);
  const studentSnap = await getDoc(studentsRef);
  if (studentSnap.exists()) {
    const details = studentSnap.data();
    return { role: "Student", details, docRef: studentsRef };
  }

  return { role: "unverified", details: null, docRef: null };
};

export default function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [role, setRole] = useState(null);
  const [userDetails, setUserDetails] = useState(null); // For Student-> merged model or for others -> Firestore
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setLoading(true);

      if (!user) {
        const lastUid = cache.getLastUid();
        if (lastUid) {
          cache.clearUser(lastUid);
          localStorage.removeItem(`role_${lastUid}`);
          localStorage.removeItem(`userDetails_${lastUid}`);
          cache.clearLastUid();
        }
        setCurrentUser(null);
        setRole("Guest");
        setUserDetails(null);
        setLoading(false);
        return;
      }

      setCurrentUser(user);
      const uid = user.uid;
      cache.setLastUid(uid);

      //new updated from merged cache first
      const cachedMergedStudent = cache.get(uid, "student");
      const cachedRole = cache.get(uid, "role");
      const cachedDetailsFallback = cache.get(uid, "details");

      if (cachedRole) {
        setRole(cachedRole);
      }
      if (cachedMergedStudent && (cachedRole === "Student" || !cachedRole)) {
        setUserDetails(cachedMergedStudent);
      } else if (cachedDetailsFallback && cachedRole && cachedRole !== "Student") {
        setUserDetails(cachedDetailsFallback);
      }

      //Fresh Firestore fetch
      const { role: freshRole, details: freshDetails, docRef } = await fetchUserRoleAndDetails(uid);
      setRole(freshRole);

      if (freshRole === "Student") {
        // Get academic from node API
        let academic = cache.get(uid, "academic");
        if (!academic && API_BASE_URL) {
          const fid = freshDetails?.firebaseId || uid;
          try {
            const res = await axios.get(`${API_BASE_URL}/api/students/${encodeURIComponent(fid)}`);
            academic = res?.data || null;
            cache.set(uid, "academic", academic, 15 * 60 * 1000); // short TTL
          } catch {
      
            console.log("[academic not available from mongo API");
          }
        }

        // Merge Firestore + mongo data into a single student object
        const merged = mergeStudent(freshDetails || {}, academic || {});
        setUserDetails(merged);
        cache.set(uid, "role", freshRole);
        cache.set(uid, "student", merged); 
        localStorage.setItem(`role_${uid}`, freshRole);
        localStorage.setItem(`userDetails_${uid}`, JSON.stringify(merged));
      } else {
        // Non-student users keep their Firestore doc
        setUserDetails(freshDetails || null);

        cache.set(uid, "role", freshRole);
        if (freshDetails) cache.set(uid, "details", freshDetails);

        localStorage.setItem(`role_${uid}`, freshRole);
        if (freshDetails) localStorage.setItem(`userDetails_${uid}`, JSON.stringify(freshDetails));
      }

      //Live snapshot to keep in sync
      let unsubscribeSnapshot = null;
      if (docRef) {
        unsubscribeSnapshot = onSnapshot(docRef, (snap) => {
          if (snap.exists()) {
            const updatedDetails = snap.data();
            let updatedRole = updatedDetails.role || freshRole || "unverified";
            if (updatedDetails.isCollegeAssociate) updatedRole = "CollegeAssociate";

            setRole(updatedRole);
            cache.set(uid, "role", updatedRole);
            localStorage.setItem(`role_${uid}`, updatedRole);

            if (updatedRole === "Student") {
              const currentAcademic = cache.get(uid, "academic") || {};
              const merged = mergeStudent(updatedDetails, currentAcademic);
              setUserDetails(merged);
              cache.set(uid, "student", merged);
              localStorage.setItem(`userDetails_${uid}`, JSON.stringify(merged));
            } else {
              setUserDetails(updatedDetails);
              cache.set(uid, "details", updatedDetails);
              localStorage.setItem(`userDetails_${uid}`, JSON.stringify(updatedDetails));
            }
          }
        });
      }

      setLoading(false);

      return () => {
        if (unsubscribeSnapshot) unsubscribeSnapshot();
      };
    });

    return () => unsubscribeAuth();
  }, []);

  const hasAccess = useCallback(
    (path) => {
      if (loading || !role) return false;
      if ((role === "unverified" || role === "verified") && path === "/message") return true;
      return rolePermissions[role]?.includes(path) || false;
    },
    [role, loading]
  );

  const contextValue = { currentUser, role, userDetails, loading, hasAccess };

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
