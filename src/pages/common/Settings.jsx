/* eslint-disable no-empty */
/* eslint-disable react/prop-types */
import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  Avatar, Box, Button, Card, CardContent, CircularProgress, Container, Divider,
  Grid, IconButton, InputAdornment, Paper, Stack, TextField, Tooltip, Typography,
  Alert, Chip, Dialog, DialogTitle, DialogContent, DialogActions
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import SecurityIcon from "@mui/icons-material/Security";
import PersonIcon from "@mui/icons-material/Person";
import SchoolIcon from "@mui/icons-material/School";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import ImageSearchIcon from "@mui/icons-material/ImageSearch";
import SettingsBackupRestoreIcon from "@mui/icons-material/SettingsBackupRestore";
import { motion } from "framer-motion";
import axios from "axios";
import {
  getAuth,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  updateProfile,
} from "firebase/auth";
import { db, storage } from "../../firebase/Firebase";
import {
  collection, doc, getDoc, getDocs, limit, query as fsQuery, where as fsWhere, updateDoc,
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import ImageViewer from "../../components/ImageViewer";
import { ThemeContext } from "../../context/ThemeContext";
import { themes } from "../../components/theme";
import {HeaderBackButton} from "../../components/header"

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL; 

const neat = (v) => (v == null ? "" : v); 
const fullName = (first, last) => `${neat(first)} ${neat(last)}`.trim(); 
const fmtErr = (e, fb = "Something went wrong.") => e?.message?.split(":").slice(1).join(":").trim() || fb; 

// cache
const NS = "erp"; const VER = "v1"; 
const STORE = typeof window !== "undefined" ? window.localStorage : null; 
const key = (uid, name) => `${NS}:${uid}:${name}:${VER}`; 
const legacyRoleKey = (uid) => `role_${uid}`; 
const legacyDetailsKey = (uid) => `userDetails_${uid}`; 
const readJSON = (raw) => { try { return JSON.parse(raw); } catch { return null; } }; 
const readCache = (uid, name) => { try { const raw = STORE.getItem(key(uid, name)); if (!raw) return null; const payload = JSON.parse(raw); if (payload?.exp && Date.now() > payload.exp) return null; return payload?.v ?? null; } catch { return null; } }; 
const writeCacheEnvelope = (uid, name, v, exp = null) => { try { STORE.setItem(key(uid, name), JSON.stringify({ v, exp })); } catch {} }; 

export default function Settings() {
  const auth = getAuth();
  const user = auth.currentUser;
  const theme = useTheme(); 
  const { mode, toggleTheme, resetTheme } = useContext(ThemeContext) || {}; 
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(""); 
  // role + profile
  const [role, setRole] = useState(null); 
  const [profile, setProfile] = useState(null);
  const [mongoAcademic, setMongoAcademic] = useState(null);
  const [profileDoc, setProfileDoc] = useState({ col: null, id: null }); 
  // image viewer + upload
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerSrc, setViewerSrc] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoMsg, setPhotoMsg] = useState({ type: "info", text: "" }); 
  // password dialog
  const [pwdOpen, setPwdOpen] = useState(false);
  const [emailInput, setEmailInput] = useState(user?.email || "");
  const [currPassword, setCurrPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busyPwd, setBusyPwd] = useState(false);
  const [showCurr, setShowCurr] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwdMessage, setPwdMessage] = useState({ type: "info", text: "" }); 

  // read-first from cache, only fetch if missing
  const hydrateFromCache = useCallback(() => {
    if (!user?.uid) return false;
    const uid = user.uid; 
    let cachedRole = readCache(uid, "role");
    if (!cachedRole) {
      const legacyRole = STORE.getItem(legacyRoleKey(uid));
      cachedRole = legacyRole || null;
    }
    if (!cachedRole) return false;

    // student path
    if (cachedRole === "Student") {
      const merged = readCache(uid, "student") || readJSON(STORE.getItem(legacyDetailsKey(uid))); 
      const academic = readCache(uid, "academic") || null; 
      if (!merged) return false;

      setRole("student");
      setMongoAcademic(academic || null);
      setProfile({
        kind: "student",
        uid,
        email: merged.email || user.email || "",
        firstName: merged.firstName || "",
        lastName: merged.lastName || "",
        name: fullName(merged.firstName, merged.lastName),
        collegeId: merged.collegeId || "",
        collegeName: merged.collegeName || "",
        program: merged.program || "",
        abcId: merged.abcId || "",
        dob: merged.dob || "",
        phone: merged.phone || "",
        gender: merged.gender || "",
        roleLabel: "Student",
        photoURL: merged.profilePicUrl || user.photoURL || "",
      });
      setProfileDoc({ col: "Students", id: uid });
      return true;
    }

    // teacher/associate/admin path from details
    const details = readCache(uid, "details") || readJSON(STORE.getItem(legacyDetailsKey(uid))); 
    if (!details) return false;
    if (cachedRole === "Teacher" || cachedRole === "CollegeAssociate") {
      const isAssociate = cachedRole === "CollegeAssociate";
      setRole(isAssociate ? "associate" : "teacher");
      setProfile({
        kind: isAssociate ? "associate" : "teacher",
        uid,
        email: details.email || user.email || "",
        firstName: details.firstName || "",
        lastName: details.lastName || "",
        name: fullName(details.firstName, details.lastName),
        collegeId: details.college || "",
        department: details.department || details.departmentName || "",
        program: details.program || details.programName || "",
        contactNumber: details.contactNumber != null ? String(details.contactNumber) : "",
        subjects: Array.isArray(details.subjects) ? details.subjects : [],
        roleLabel: isAssociate ? "College Associate" : "Teacher",
        photoURL: details.profilePicUrl || user.photoURL || "",
      });
      setProfileDoc({ col: "Teachers", id: uid });
      return true;
    }
    if (cachedRole === "Admin") {
      setRole("admin");
      setProfile({
        kind: "admin",
        uid,
        email: details.email || user.email || "",
        firstName: details.firstName || "",
        lastName: details.lastName || "",
        name: fullName(details.firstName, details.lastName),
        collegeId: details.college || "",
        roleLabel: "Admin",
        photoURL: user.photoURL || details.profilePicUrl || "",
      });
      setProfileDoc({ col: "Admins", id: uid });
      return true;
    }
    return false;
  }, [user?.uid]); 

  // fallback firestore fetch if cache missing
  const fetchFromCollectionByUid = useCallback(
    async (colName, uidField = "uid") => {
      const uid = user?.uid;
      if (!uid) return null;

      const byId = await getDoc(doc(db, colName, uid));
      if (byId.exists()) return { id: byId.id, ...byId.data() };

      const q = fsQuery(collection(db, colName), fsWhere(uidField, "==", uid), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) return { id: snap.docs.id, ...snap.docs.data() };
      return null;
    },
    [user?.uid]
  ); 

  const fetchStudentDoc = useCallback(async () => {
    const uid = user?.uid;
    if (!uid) return null;
    const byId = await getDoc(doc(db, "Students", uid));
    if (byId.exists()) return { id: byId.id, ...byId.data() };
    const q = fsQuery(collection(db, "Students"), fsWhere("firebaseId", "==", uid), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) return { id: snap.docs.id, ...snap.docs.data() };
    return null;
  }, [user?.uid]); 

  // load profile
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        setErr("");

        if (!user) {
          setErr("Please sign in to view account settings.");
          return;
        }
        const hadCache = hydrateFromCache();
        if (hadCache) return;

        // no cache → fetch docs to render the page
        const adminDoc = await getDoc(doc(db, "Admins", user.uid));
        if (adminDoc.exists()) {
          const ad = { id: adminDoc.id, ...adminDoc.data() };
          if (active) {
            setRole("admin");
            setProfile({
              kind: "admin",
              uid: user.uid,
              email: ad.email || user.email || "",
              firstName: ad.firstName || "",
              lastName: ad.lastName || "",
              name: fullName(ad.firstName, ad.lastName),
              collegeId: ad.college || "",
              roleLabel: "Admin",
              photoURL: user.photoURL || "",
            });
            setProfileDoc({ col: "Admins", id: ad.id || user.uid });
          }
          return;
        }
        const teacher = await fetchFromCollectionByUid("Teachers", "uid");
        if (teacher) {
          const isAssociate = Boolean(teacher.isCollegeAssociate);
          if (active) {
            setRole(isAssociate ? "associate" : "teacher");
            setProfile({
              kind: isAssociate ? "associate" : "teacher",
              uid: user.uid,
              email: teacher.email || user.email || "",
              firstName: teacher.firstName || "",
              lastName: teacher.lastName || "",
              name: fullName(teacher.firstName, teacher.lastName),
              collegeId: teacher.college || "",
              department: teacher.department || teacher.departmentName || "",
              program: teacher.program || teacher.programName || "",
              contactNumber: teacher.contactNumber != null ? String(teacher.contactNumber) : "",
              subjects: Array.isArray(teacher.subjects) ? teacher.subjects : [],
              roleLabel: isAssociate ? "College Associate" : "Teacher",
              photoURL: teacher.profilePicUrl || user.photoURL || "",
            });
            setProfileDoc({ col: "Teachers", id: teacher.id || user.uid });
          }
          return;
        }

        const student = await fetchStudentDoc();
        if (student) {
          let mongo = null;
          try {
            const fid = student.firebaseId || user.uid;
            mongo = await axios.get(`${API_BASE_URL}/api/students/${encodeURIComponent(fid)}`).then((r) => r.data);
          } catch {}
          if (active) {
            setRole("student");
            setMongoAcademic(mongo || null);
            setProfile({
              kind: "student",
              uid: user.uid,
              email: student.email || user.email || "",
              firstName: student.firstName || "",
              lastName: student.lastName || "",
              name: fullName(student.firstName, student.lastName),
              collegeId: student.collegeId || "",
              collegeName: student.collegeName || "",
              program: student.program || "",
              abcId: student.abcId || "",
              dob: student.dob || "",
              phone: student.phone || "",
              gender: student.gender || "",
              roleLabel: "Student",
              photoURL: student.profilePicUrl || user.photoURL || "",
            });
            setProfileDoc({ col: "Students", id: student.id || user.uid });
          }
          return;
        }
        // unknown
        setRole(null);
        setProfile({
          kind: "unknown",
          uid: user.uid,
          email: user.email || "",
          name: user.displayName || "",
          roleLabel: "User",
          photoURL: user.photoURL || "",
        });
        setProfileDoc({ col: null, id: null });
      } catch (e) {
        setErr(fmtErr(e));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [user, hydrateFromCache, fetchFromCollectionByUid, fetchStudentDoc]); 

  const RoleIcon = useMemo(() => {
    if (role === "admin") return <AdminPanelSettingsIcon color="primary" />;
    if (role === "teacher" || role === "associate") return <PersonIcon color="primary" />;
    if (role === "student") return <SchoolIcon color="primary" />;
    return <SecurityIcon color="primary" />;
  }, [role]); 

  const openViewer = () => {
    if (!profile?.photoURL) return;
    setViewerSrc(profile.photoURL);
    setViewerOpen(true);
  }; 

  // change photo → update Firestore, auth profile, and caches
  const onPickPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhotoMsg({ type: "info", text: "" });
    if (!/^image\//.test(file.type)) {
      setPhotoMsg({ type: "error", text: "Only image files are allowed." });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setPhotoMsg({ type: "warning", text: "Max 5MB image size allowed." });
      return;
    }

    try {
      if (!user) throw new Error("Not authenticated.");
      if (!profileDoc?.col || !profileDoc?.id) throw new Error("Unable to locate your profile document.");

      setUploadingPhoto(true);
      const safeName = encodeURIComponent(file.name);
      const path = `profile_pictures/${user.uid}/${Date.now()}_${safeName}`;
      const fileRef = ref(storage, path);
      const task = uploadBytesResumable(fileRef, file, { contentType: file.type });

      await new Promise((resolve, reject) => { task.on("state_changed", () => {}, reject, resolve); });

      const url = await getDownloadURL(fileRef);
      await updateDoc(doc(db, profileDoc.col, profileDoc.id), { profilePicUrl: url });
      await updateProfile(user, { photoURL: url });

      // update local state
      setProfile((p) => ({ ...p, photoURL: url }));

      // update caches
      const uid = user.uid;
      const roleCache = STORE.getItem(legacyRoleKey(uid)) || readCache(uid, "role");
      if (roleCache === "Student") {
        const merged = readCache(uid, "student");
        if (merged) {
          const next = { ...merged, profilePicUrl: url };
          writeCacheEnvelope(uid, "student", next);
          try { STORE.setItem(legacyDetailsKey(uid), JSON.stringify(next)); } catch {}
        }
      } else {
        const details = readCache(uid, "details") || readJSON(STORE.getItem(legacyDetailsKey(uid)));
        if (details) {
          const next = { ...details, profilePicUrl: url };
          writeCacheEnvelope(uid, "details", next);
          try { STORE.setItem(legacyDetailsKey(uid), JSON.stringify(next)); } catch {}
        }
      }

      setPhotoMsg({ type: "success", text: "Profile photo updated." });
    } catch (e2) {
      setPhotoMsg({ type: "error", text: fmtErr(e2, "Failed to update photo.") });
    } finally {
      setUploadingPhoto(false);
      e.target.value = "";
    }
  }; 

  // password change box
  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPwdMessage({ type: "info", text: "" });
    try {
      if (!user) { setPwdMessage({ type: "error", text: "Not authenticated." }); return; }
      if (!emailInput || !currPassword) { setPwdMessage({ type: "warning", text: "Enter email and current password." }); return; }
      if (!newPassword || newPassword.length < 6) { setPwdMessage({ type: "warning", text: "New password must be at least 6 characters." }); return; }
      if (newPassword !== confirm) { setPwdMessage({ type: "warning", text: "New password and confirm password do not match." }); return; }
      if (emailInput.trim().toLowerCase() !== String(user.email || "").trim().toLowerCase()) {
        setPwdMessage({ type: "error", text: "Email does not match the signed-in account." });
        return;
      }

      setBusyPwd(true);
      const cred = EmailAuthProvider.credential(emailInput, currPassword);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPassword);
      setPwdMessage({ type: "success", text: "Password updated successfully." });
      setCurrPassword(""); setNewPassword(""); setConfirm(""); setPwdOpen(false);
    } catch (e2) {
      const code = e2?.code || "";
      let msg = fmtErr(e2, "Failed to update password.");
      if (code.includes("auth/wrong-password")) msg = "Incorrect current password.";
      if (code.includes("auth/too-many-requests")) msg = "Too many attempts. Try again later.";
      if (code.includes("auth/requires-recent-login")) msg = "Sensitive operation. Please sign out and sign in again.";
      setPwdMessage({ type: "error", text: msg });
    } finally {
      setBusyPwd(false);
    }
  }; 

  const applyMode = (m) => {
    if (!toggleTheme && !resetTheme) return;
    if (m === "default") { if (typeof resetTheme === "function") resetTheme(); else if (typeof toggleTheme === "function") toggleTheme("default"); return; }
    if (typeof toggleTheme === "function") toggleTheme(m);
  }; 

  const handleLogout = async () => {
    try {
      await auth.signOut();
      if (typeof resetTheme === "function") resetTheme();
      window.location.assign("/login");
    } catch (e2) { console.error("Logout failed", e2)}
  }; 

  if (loading) {
    return (
      <Box sx={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <CircularProgress />
      </Box>
    );
  } 

  if (!user) {
    return (
      <Container maxWidth="sm" sx={{ py: 6 }}>
        <Alert severity="warning">Please sign in to view settings.</Alert>
      </Container>
    );
  } 

  const pageBg = mode === "default" && themes?.default?.custom?.gradient
    ? themes.default.custom.gradient
    : theme.palette.background.default; 

  return (
    <Box sx={{ background: pageBg, transition: "background 300ms ease" }}>
      <Container maxWidth="lg" sx={{ py: 6 }}>
        <Stack spacing={3}>
          {/* header */}
          <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: "1px solid", borderColor: "divider", bgcolor: theme.palette.background.paper }}>
            <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ sm: "center" }} justifyContent="space-between" spacing={1.5}>
              <Stack direction="row" spacing={1} alignItems="center">
                <HeaderBackButton/>
                {RoleIcon}
                <Typography variant="h5" fontWeight={800}>Account Settings</Typography>
                {role && (
                  <Chip
                    size="small"
                    color={role === "student" ? "primary" : role === "admin" ? "warning" : "secondary"}
                    label={(profile?.roleLabel || "User").toUpperCase()}
                    sx={{ ml: 1 }}
                  />
                )}
              </Stack>

              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="caption" color="text.secondary">Theme:</Typography>
                <Chip size="small" variant="outlined" label={String(mode || "default")} />
                <Button variant="outlined" color="error" size="small" onClick={handleLogout} sx={{ textTransform: "none", ml: 1, borderRadius: 2 }}>
                  Logout
                </Button>
              </Stack>

              {!!err && <Alert severity="error" sx={{ m: 0 }}>{err}</Alert>}
            </Stack>
          </Paper>

          {/* profile card */}
          <Card variant="outlined" component={motion.div} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} sx={{ borderRadius: 2, bgcolor: theme.palette.background.paper }}>
            <CardContent sx={{ p: { xs: 2, md: 3 } }}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2.5} alignItems={{ xs: "flex-start", sm: "center" }}>
                <Box sx={{ position: "relative" }}>
                  <Avatar
                    src={profile?.photoURL || ""}
                    sx={{ width: 96, height: 96, bgcolor: "primary.main", border: "3px solid rgba(255,255,255,0.5)", boxShadow: theme.shadows, cursor: profile?.photoURL ? "zoom-in" : "default" }}
                    onClick={openViewer}
                  >
                    {<PersonIcon fontSize="large" />}
                  </Avatar>

                  <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                    <Tooltip title="View photo">
                      <span>
                        <Button size="small" variant="outlined" startIcon={<ImageSearchIcon />} onClick={openViewer} disabled={!profile?.photoURL} sx={{ borderRadius: 2 }}>
                          View
                        </Button>
                      </span>
                    </Tooltip>

                    <Tooltip title="Change photo">
                      <Button
                        size="small"
                        component="label"
                        variant="contained"
                        startIcon={uploadingPhoto ? <CircularProgress size={16} sx={{ color: "white" }} /> : <PhotoCameraIcon />}
                        sx={{ borderRadius: 2 }}
                        disabled={uploadingPhoto}
                      >
                        {uploadingPhoto ? "Uploading" : "Change"}
                        <input hidden accept="image/*" type="file" onChange={onPickPhoto} />
                      </Button>
                    </Tooltip>
                  </Stack>

                  {!!photoMsg.text && (
                    <Typography variant="caption" sx={{ display: "block", mt: 1 }} color={photoMsg.type === "error" ? "error.main" : photoMsg.type === "success" ? "success.main" : "text.secondary"}>
                      {photoMsg.text}
                    </Typography>
                  )}
                </Box>

                <Box sx={{ flex: 1 }}>
                  <Typography variant="h6" fontWeight={800}>{profile?.name || "(No Name)"}</Typography>
                  <Typography variant="body2" color="text.secondary">{profile?.email || ""}</Typography>
                  <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: "wrap" }}>
                    {profile?.roleLabel && <Chip size="small" variant="outlined" label={profile.roleLabel} />}
                    {profile?.collegeId && <Chip size="small" variant="outlined" label={`College: ${profile.collegeId}`} />}
                  </Stack>
                </Box>

                {/* Reset password popup */}
                <Box>
                  <Button
                    onClick={() => { setPwdMessage({ type: "info", text: "" }); setEmailInput(user?.email || ""); setCurrPassword(""); setNewPassword(""); setConfirm(""); setPwdOpen(true); }}
                    variant="contained" color="primary" startIcon={<SettingsBackupRestoreIcon />} sx={{ borderRadius: 2 }}
                  >
                    Reset Password
                  </Button>
                </Box>
              </Stack>

              <Divider sx={{ my: 2.5 }} />

              {role === "student" && (
                <Grid container spacing={2.5} alignItems="stretch">
                  <Grid item xs={12} md={4}>
                    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, height: "100%", width: "100%", display: "flex", flexDirection: "column" }}>
                      <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>Personal</Typography>
                      <Stack spacing={1} sx={{ flex: 1 }}>
                        <Row label="Phone" value={profile?.phone} />
                        <Row label="Gender" value={profile?.gender} />
                        <Row label="DOB" value={profile?.dob} />
                        <Row label="ABC ID" value={profile?.abcId} />
                      </Stack>
                    </Paper>
                  </Grid>

                  <Grid item xs={12} md={4}>
                    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, height: "100%", width: "100%", display: "flex", flexDirection: "column" }}>
                      <Typography variant="h6" color="black" sx={{ mb: 1 }}>College</Typography>
                      <Stack spacing={1} sx={{ flex: 1 }}>
                        <Row label="College" value={profile.collegeName} />
                        <Row label="College ID" value={profile.collegeId} />
                        <Row label="Department" value={mongoAcademic?.department} />
                        <Row label="Program" value={profile.program} />
                      </Stack>
                    </Paper>
                  </Grid>

                  <Grid item xs={12} md={4}>
                    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, height: "100%", width: "100%", display: "flex", flexDirection: "column" }}>
                      <Typography variant="h6" color="black" sx={{ mb: 1 }}>Academic Data</Typography>
                      {mongoAcademic ? (
                        <Stack spacing={1} sx={{ flex: 1 }}>
                          <Row label="Enrollment" value={mongoAcademic.enrollmentNo} />
                          <Row label="Semester" value={mongoAcademic.semester} />
                          <Row label="Program" value={mongoAcademic.program} />
                          <Row label="Admission Year" value={mongoAcademic.yearOfAdmission} />
                        </Stack>
                      ) : (
                        <Typography variant="body2" color="text.secondary">No academic record found in database.</Typography>
                      )}
                    </Paper>
                  </Grid>
                </Grid>
              )}

              {(role === "teacher" || role === "associate") && (
                <Grid container spacing={2.5}>
                  <Grid item xs={12} md={6}>
                    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, height: "100%" }}>
                      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>Contact & Affiliation</Typography>
                      <Stack spacing={1}>
                        <Row label="Department" value={profile?.department} />
                        <Row label="Program" value={profile?.program} />
                        <Row label="College ID" value={profile?.collegeId} />
                        <Row label="Contact" value={profile?.contactNumber} />
                      </Stack>
                    </Paper>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, height: "100%" }}>
                      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>Subjects (summary)</Typography>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Chip color="primary" variant="outlined" label={`Total Subjects: ${Array.isArray(profile?.subjects) ? profile.subjects.length : 0}`} />
                      </Stack>
                    </Paper>
                  </Grid>
                </Grid>
              )}

              {role === "admin" && (
                <Grid container spacing={2.5}>
                  <Grid item xs={12} md={6}>
                    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, height: "100%" }}>
                      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>Admin Details</Typography>
                      <Stack spacing={1}>
                        <Row label="First Name" value={profile?.firstName} />
                        <Row label="Last Name" value={profile?.lastName} />
                        <Row label="College ID" value={profile?.collegeId} />
                      </Stack>
                    </Paper>
                  </Grid>
                </Grid>
              )}
            </CardContent>
          </Card>

          <Card variant="outlined" sx={{ borderRadius: 2, bgcolor: theme.palette.background.paper }}>
            <CardContent>
              <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>Appearance</Typography>
              <Typography variant="body2" color="text.secondary">Choose a theme for the application.</Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: "wrap" }}>
                <Button variant={mode === "default" ? "contained" : "outlined"} onClick={() => applyMode("default")} sx={{ textTransform: "none", borderRadius: 2 }}>
                  Default
                </Button>
                <Button variant={mode === "light" ? "contained" : "outlined"} onClick={() => applyMode("light")} sx={{ textTransform: "none", borderRadius: 2 }}>
                  Light
                </Button>
                <Button variant={mode === "dark" ? "contained" : "outlined"} onClick={() => applyMode("dark")} sx={{ textTransform: "none", borderRadius: 2 }}>
                  Dark
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Stack>

        <ImageViewer
          open={viewerOpen}
          src={viewerSrc}
          alt={profile?.name || "Profile"}
          onClose={() => setViewerOpen(false)}
          centered
          maxWidth="100%"
          maxHeight="100vh"
          minWidth={{ xs: "100%", md: "50%" }}
          iMaxHeight="100%"
          top="50%"
          left="50%"
          right=""
          bottom=""
          transform="translate(-50%, -50%)"
          boxShadow={24}
          borderRadius={2}
          padding={4}
          showBackdrop
          showClose
          showDownload={false}
        />
        {/* reset password dialog */}
        <Dialog open={pwdOpen} onClose={() => setPwdOpen(false)} fullWidth maxWidth="sm">
          <DialogTitle>Reset Password</DialogTitle>
          <Box component="form" onSubmit={handlePasswordChange}>
            <DialogContent dividers>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <TextField label="Email" fullWidth value={emailInput} onChange={(e) => setEmailInput(e.target.value)} />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="Current Password"
                    fullWidth
                    type={showCurr ? "text" : "password"}
                    value={currPassword}
                    onChange={(e) => setCurrPassword(e.target.value)}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton onClick={() => setShowCurr((s) => !s)} edge="end">
                            {showCurr ? <VisibilityOffIcon /> : <VisibilityIcon />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="New Password"
                    fullWidth
                    type={showNew ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    helperText="Minimum 6 characters"
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton onClick={() => setShowNew((s) => !s)} edge="end">
                            {showNew ? <VisibilityOffIcon /> : <VisibilityIcon />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="Confirm New Password"
                    fullWidth
                    type={showConfirm ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton onClick={() => setShowConfirm((s) => !s)} edge="end">
                            {showConfirm ? <VisibilityOffIcon /> : <VisibilityIcon />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />
                </Grid>
              </Grid>
              {!!pwdMessage.text && <Alert severity={pwdMessage.type} sx={{ mt: 2 }}>{pwdMessage.text}</Alert>}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setPwdOpen(false)} color="inherit">Close</Button>
              <Button type="submit" variant="contained" disabled={busyPwd}>
                {busyPwd ? <CircularProgress size={18} sx={{ color: "white" }} /> : "Update Password"}
              </Button>
            </DialogActions>
          </Box>
        </Dialog>
      </Container>
    </Box>
  );
}

function Row({ label, value }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 140 }}>{label}:</Typography>
      <Typography variant="body2" sx={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>
        {neat(value) || "-"}
      </Typography>
    </Stack>
  );
}
