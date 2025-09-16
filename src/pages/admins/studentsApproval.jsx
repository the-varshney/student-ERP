/* eslint-disable no-unused-vars */
import React, { useEffect, useMemo, useState, useCallback, useContext } from "react";
import { Box, Card, Typography, Stack, TextField, Button, Chip, Divider, Avatar, Dialog, DialogTitle, DialogContent, DialogActions, Alert, Tooltip, CircularProgress, Snackbar, useTheme, FormControl, InputLabel, Select, MenuItem, Paper, AppBar, Container, IconButton,
} from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import CheckIcon from "@mui/icons-material/Check";
import CancelIcon from "@mui/icons-material/Cancel";
import VerifiedIcon from "@mui/icons-material/VerifiedUser";
import dayjs from "dayjs";
import axios from "axios";
import { db } from "../../firebase/Firebase";
import { collection, query, where, getDocs, doc, updateDoc } from "firebase/firestore";
import AuthContext from "../../context/AuthContext";
import { ThemeContext } from "../../context/ThemeContext";
import PropTypes from "prop-types";

import SecondaryHeader from "../../components/secondaryHeader";
import { HeaderBackButton } from "../../components/header";
import StudentsGrid from "../../components/table";

const CACHE_TTL = 1000 * 60 * 60;
const setCache = (key, data) => {
  localStorage.setItem(key, JSON.stringify({ data, expiry: Date.now() + CACHE_TTL }));
};
const getCache = (key) => {
  const cached = localStorage.getItem(key);
  if (!cached) return null;
  const parsed = JSON.parse(cached);
  if (Date.now() > parsed.expiry) {
    localStorage.removeItem(key);
    return null;
  }
  return parsed.data;
};

function formatDOBForView(dobStr) {
  if (!dobStr) return "-";
  if (dayjs(dobStr).isValid()) {
    return dayjs(dobStr).format("DD MMM YYYY");
  }
  const [d, m, y] = (dobStr || "").split("/");
  if (d && m && y && dayjs(`${y}-${m}-${d}`).isValid()) {
    return dayjs(`${y}-${m}-${d}`).format("DD MMM YYYY");
  }
  return dobStr || "-";
}

// Functions for Department and Program Names
function getDepartmentName(collegeId, deptId, departments) {
  const depts = departments[collegeId] || [];
  const dept = depts.find((d) => d.deptId === deptId);
  return dept?.departmentName || dept?.deptId || deptId || "-";
}

function getProgramName(collegeId, deptId, progId, programs) {
  const progs = programs[collegeId]?.[deptId] || [];
  const prog = progs.find((p) => p._id === progId);
  return prog?.programName || progId || "-";
}

function useVerifiedStudents(collegeFilter) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      let q = query(
        collection(db, "Students"),
        where("role", "==", "verified")
      );
      if (collegeFilter) {
        q = query(q, where("collegeId", "==", collegeFilter));
      }
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs
        .map((doc) => {
          const docData = doc.data();
          if (!doc.id || !docData.firebaseId || !docData.collegeId) return null;
          return {
            id: doc.id,
            firebaseId: docData.firebaseId,
            collegeId: docData.collegeId,
            firstName: docData.firstName || "",
            lastName: docData.lastName || "",
            email: docData.email || "",
            phone: docData.phone || "",
            abcId: docData.abcId || "",
            dob: docData.dob || "",
            gender: docData.gender || "",
            collegeName: docData.collegeName || "",
            profilePicUrl: docData.profilePicUrl || "",
          };
        })
        .filter(Boolean);
      setRows(data);
    } catch (e) {
      console.error("Firestore fetch error:", e);
      setErr("Failed to load verified students from Firestore");
    } finally {
      setLoading(false);
    }
  }, [collegeFilter]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  return { rows, loading, err, refetch: fetchRows };
}

export default function StudentApproval() {
  const theme = useTheme();
  const { mode } = useContext(ThemeContext);
  const { userDetails, user, loading: authLoading } = useContext(AuthContext);

  if (authLoading) {
    return (
      <Box sx={{ p: 3, display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <CircularProgress color="primary" />
      </Box>
    );
  }

  const fullName = userDetails
    ? `${userDetails.firstName || 'Admin'} ${userDetails.lastName || ''}`.trim()
    : 'Admin';

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmType, setConfirmType] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState({ open: false, type: "success", msg: "" });
  const [collegeFilter, setCollegeFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [programFilter, setProgramFilter] = useState("");
  const [colleges, setColleges] = useState([]);
  const [departments, setDepartments] = useState({});
  const [programs, setPrograms] = useState({});
  const [studentData, setStudentData] = useState({});
  const [studentDataLoading, setStudentDataLoading] = useState(false);
  const { rows, loading, err, refetch } = useVerifiedStudents(collegeFilter);

  // load colleges, departments, programs for filters
  useEffect(() => {
    const fetchColleges = async () => {
      const cacheKey = "all-colleges";
      let data = getCache(cacheKey);
      if (!data) {
        try {
          const res = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/api/colleges`);
          data = res.data;
          setCache(cacheKey, data);
        } catch (error) {
          console.error("Failed to fetch colleges:", error);
          setToast({ open: true, type: "error", msg: "Failed to fetch colleges" });
          data = [];
        }
      }
      setColleges(data || []);

      const collegeDepts = {};
      const collegeProgs = {};
      await Promise.all(
        data.map(async (college) => {
          const deptCacheKey = `college-${college._id}-departments`;
          let depts = getCache(deptCacheKey);
          if (!depts) {
            try {
              const deptRes = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/api/colleges/${college._id}/departments`);
              depts = deptRes.data.map((dept) => ({
                ...dept,
                _id: dept.deptId, 
                departmentName: dept.departmentName || dept.deptId
              }));
              setCache(deptCacheKey, depts);
            } catch (error) {
              console.error(`Failed to fetch departments for college ${college._id}:`, error);
              depts = [];
            }
          }
          collegeDepts[college._id] = depts;

          const deptProgs = {};
          await Promise.all(
            depts.map(async (dept) => {
              const progCacheKey = `college-${college._id}-dept-${dept._id}-programs`;
              let progs = getCache(progCacheKey);
              if (!progs) {
                try {
                  progs = dept.offeredProgramIds.map((progId) => ({
                    _id: progId,
                    programName: progId 
                  }));
                  // fetching program details
                  try {
                    const progRes = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/api/departments/${college._id}/${dept._id}/programs`);
                    progs = progRes.data;
                  } catch (error) {
                    console.warn(`No program details for dept ${dept._id}, using offeredProgramIds:`, error);
                  }
                  setCache(progCacheKey, progs);
                } catch (error) {
                  console.error(`Failed to fetch programs for dept ${dept._id}:`, error);
                  progs = [];
                }
              }
              deptProgs[dept._id] = progs;
            })
          );
          collegeProgs[college._id] = deptProgs;
        })
      );
      setDepartments(collegeDepts);
      setPrograms(collegeProgs);
    };
    fetchColleges();
  }, []);

  useEffect(() => {
    const fetchStudentData = async () => {
      setStudentDataLoading(true);
      const data = {};
      await Promise.all(
        rows.map(async (row) => {
          if (!row.firebaseId) {
            console.warn(`Missing firebaseId for row ${row.id}`);
            data[row.id] = null;
            return;
          }
          try {
            const res = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/api/students/${row.firebaseId}`);
            data[row.id] = res.data;
          } catch (error) {
            console.warn(`No MongoDB data for firebaseId ${row.firebaseId}:`, error.response?.data || error.message);
            data[row.id] = null;
          }
        })
      );
      setStudentData(data);
      setStudentDataLoading(false);
    };
    if (rows.length > 0) {
      fetchStudentData();
    }
  }, [rows]);

  // Reset department and program filters when college changes
  useEffect(() => {
    if (collegeFilter) {
      setDepartmentFilter("");
      setProgramFilter("");
    }
  }, [collegeFilter]);

  // Reset program filter when department change
  useEffect(() => {
    if (departmentFilter) {
      setProgramFilter("");
    }
  }, [departmentFilter]);

  const filtered = useMemo(() => {
    let data = rows.filter((r) => r && typeof r === 'object' && r.id && r.firebaseId);
    const q = search.trim().toLowerCase();
    if (q) {
      data = data.filter((r) => {
        const fields = [r.firstName, r.lastName, r.email, r.phone, r.abcId, r.collegeName].filter(Boolean);
        return fields.some((f) => String(f).toLowerCase().includes(q));
      });
    }
    if (departmentFilter) {
      data = data.filter((r) => studentData[r.id]?.department === departmentFilter);
    }
    if (programFilter) {
      data = data.filter((r) => studentData[r.id]?.program === programFilter);
    }
    return data;
  }, [rows, search, departmentFilter, programFilter, studentData]);

  const handleConfirm = async () => {
    if (busy || !selected) return;
    setBusy(true);
    try {
      const docRef = doc(db, "Students", selected.id);
      const newRole = confirmType === "approve" ? "Student" : "unverified";
      if (confirmType === "reject") {
        try {
          await axios.delete(`${import.meta.env.VITE_API_BASE_URL}/api/students/${selected.firebaseId}`);
        } catch (mongoError) {
          console.error("Failed to delete MongoDB data, but proceeding with rejection:", mongoError);
        }
      }
      await updateDoc(docRef, {
        role: newRole,
      });
      setToast({ open: true, type: "success", msg: `Student ${confirmType === "approve" ? "approved" : "rejected"} successfully.` });
      setConfirmOpen(false);
      setSelected(null);
      await refetch();
    } catch (e) {
      console.error("Failed to update student:", e);
      setToast({
        open: true,
        type: "error",
        msg: "Failed to update student status.",
      });
    } finally {
      setBusy(false);
    }
  };

  // DataGrid rows
    const gridRows = useMemo(() => {
      return filtered.map((r) => {
        const ac = studentData[r.id] || {};
        return {
          id: r.id,
          firstName: r.firstName,
          lastName: r.lastName,
          email: r.email || "-",
          phone: r.phone || "-",
          abcId: r.abcId || "-",
          dobFormatted: formatDOBForView(r.dob),
          gender: r.gender || "-",
          collegeName: r.collegeName || "-",
          profilePicUrl: r.profilePicUrl || "",
          collegeId: r.collegeId,
          enrollmentNo: ac.enrollmentNo || "-",
          departmentName: getDepartmentName(r.collegeId, ac.department, departments),
          programName: getProgramName(r.collegeId, ac.department, ac.program, programs),
          semester: ac.semester || "-",
          yearOfAdmission: ac.yearOfAdmission || "-",
        };
      });
    }, [filtered, studentData, departments, programs]);
  
    // DataGrid columns
    const columns = useMemo(
      () => [
        {
          field: "photo",
          headerName: "Photo",
          width: 72,
          sortable: false,
          renderCell: (params) => (
            <Avatar
              sx={{
                width: 32,
                height: 32,
                border: `1px solid ${theme.palette.divider}`,
                bgcolor: theme.palette.background.paper,
              }}
              src={params.row.profilePicUrl}
              alt={`${params.row.firstName || ""} ${params.row.lastName || ""}`.trim()}
            />
          ),
        },
        { field: "firstName", headerName: "First Name", flex: 1, minWidth: 160,},
        { field: "lastName", headerName: "Last Name", flex: 1, minWidth: 160,},
        { field: "email", headerName: "Email", flex: 1, minWidth: 180 },
        { field: "phone", headerName: "Phone", width: 140 },
        { field: "abcId", headerName: "ABC ID", width: 140 },
        { field: "dobFormatted", headerName: "DOB", width: 130 },
        { field: "gender", headerName: "Gender", width: 110 },
        {field: "collegeName",headerName: "College", flex: 1, minWidth: 180,
          renderCell: (params) => (
            <Tooltip title={params.value || ""}>
              <Chip label={params.value || "-"} size="small" variant="outlined" color="primary" sx={{ borderRadius: "4px", maxWidth: "100%" }}/>
            </Tooltip>
          ),
        },
        { field: "enrollmentNo", headerName: "Enrollment No", width: 160 },
        { field: "departmentName", headerName: "Department", flex: 1, minWidth: 160 },
        { field: "programName", headerName: "Program", flex: 1, minWidth: 160 },
        { field: "semester", headerName: "Semester", width: 120 },
        { field: "yearOfAdmission", headerName: "Admission Year", width: 140 },
        { field: "actions", headerName: "Actions", width: 220, sortable: false, filterable: false,
          renderCell: (params) => (
            <Stack direction="row" spacing={1}>
              <Button variant="contained" color="success" size="small" startIcon={<CheckIcon />} onClick={() => {
                  const baseRow = filtered.find((x) => x.id === params.row.id);
                  if (!baseRow) return;
                  setSelected(baseRow);
                  setConfirmType("approve");
                  setConfirmOpen(true);
                }}
              >
                Approve
              </Button>
              <Button variant="contained" color="error" size="small" startIcon={<CancelIcon />} onClick={() => {
                  const baseRow = filtered.find((x) => x.id === params.row.id);
                  if (!baseRow) return;
                  setSelected(baseRow);
                  setConfirmType("reject");
                  setConfirmOpen(true);
                }}
              >
                Reject
              </Button>
            </Stack>
          ),
        },
      ],
      [theme.palette.divider, theme.palette.background.paper, filtered]
    );

  return (
    <Box sx={{ minHeight: "100vh", background: theme.palette.background.default }}>
      <Container sx={{ pt: 2 }}>
              <SecondaryHeader
                title="Student Approvals"
                leftArea={
                  <Stack direction="row" spacing={1} alignItems="center">
                    <HeaderBackButton size="small" />
                    <VerifiedIcon color="primary" />
                  </Stack>
                }
                elevation={0}
                border
                paperSx={{ p: { xs: 1.5, md: 2 }, borderRadius: 2, mb: 2, border: "1px solid", borderColor: "divider",}}
              />
            </Container>

      {/* Main Content */}
      <Container sx={{ pb: 4 }}>
              <Card sx={{ width: "100%", p: 3, borderRadius: 2, boxShadow: "0 8px 24px rgba(0,0,0,0.08)" }}>
                <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="center" sx={{ mb: 3 }}>
                  <Typography variant="h5" fontWeight={750} sx={{ flex: 1, color: `${theme.palette.primary.main}` }}>
                    Students Data
                  </Typography>
      
                  <TextField
                    variant="outlined"
                    size="small"
                    placeholder="Search name, email, phone, ABC ID..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    sx={{ width: { xs: "100%", sm: 350 } }}
                  />
      
                  <FormControl size="small" sx={{ width: { xs: "100%", md: 160 }, minWidth: 120 }}>
                    <InputLabel>College</InputLabel>
                    <Select label="College" value={collegeFilter} onChange={(e) => setCollegeFilter(e.target.value)}>
                      <MenuItem value="">All</MenuItem>
                      {colleges.length > 0 ? (
                        colleges.map((college) => (
                          <MenuItem key={college._id} value={college._id}>
                            {college.name || `Unknown College (ID: ${college._id})`}
                          </MenuItem>
                        ))
                      ) : (
                        <MenuItem disabled>No colleges available</MenuItem>
                      )}
                    </Select>
                  </FormControl>
      
                  <FormControl size="small" sx={{ width: { xs: "100%", md: 160 }, minWidth: 120 }} disabled={!collegeFilter}>
                    <InputLabel>Department</InputLabel>
                    <Select label="Department" value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}>
                      <MenuItem value="">All</MenuItem>
                      {(departments[collegeFilter] || []).length > 0 ? (
                        (departments[collegeFilter] || []).map((dept) => (
                          <MenuItem key={dept._id} value={dept._id}>
                            {dept.departmentName || `Unknown Department (ID: ${dept._id})`}
                          </MenuItem>
                        ))
                      ) : (
                        <MenuItem disabled>No departments available</MenuItem>
                      )}
                    </Select>
                  </FormControl>
      
                  <FormControl size="small" sx={{ width: { xs: "100%", md: 160 }, minWidth: 120 }} disabled={!departmentFilter}>
                    <InputLabel>Program</InputLabel>
                    <Select label="Program" value={programFilter} onChange={(e) => setProgramFilter(e.target.value)}>
                      <MenuItem value="">All</MenuItem>
                      {(programs[collegeFilter]?.[departmentFilter] || []).length > 0 ? (
                        (programs[collegeFilter]?.[departmentFilter] || []).map((prog) => (
                          <MenuItem key={prog._id} value={prog._id}>
                            {prog.programName || `Unknown Program (ID: ${prog._id})`}
                          </MenuItem>
                        ))
                      ) : (
                        <MenuItem disabled>No programs available</MenuItem>
                      )}
                    </Select>
                  </FormControl>
      
                  <Button variant="outlined" color="primary" onClick={refetch} disabled={loading} sx={{ minWidth: 120 }}>
                    {loading ? <CircularProgress size={18} /> : "Refresh"}
                  </Button>
                </Stack>
      
                {err && (
                  <Alert sx={{ mb: 3, borderRadius: 2 }} severity="error">
                    {err}
                  </Alert>
                )}
      
                <StudentsGrid
                  rows={gridRows}
                  columns={columns}
                  height="100%"
                  initialPageSize={25}
                  pageSizeOptions={[10, 25, 50, 100]}
                  paperSx={{ borderRadius: 2 }}
                  gridSx={{
                    "& .MuiDataGrid-columnHeaders": {
                      backgroundColor: theme.palette.mode === "light" ? "grey.100" : "grey.900",
                    },
                  }}
                />
              </Card>
            </Container>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, p: 1 } }}
      >
        <DialogTitle sx={{ fontWeight: 900 }}>
          {confirmType === "approve" ? "Approve Student" : "Reject Student"}
          <IconButton
            onClick={() => setConfirmOpen(false)}
            sx={{ position: "absolute", right: 16, top: 16, color: "text.secondary" }}
          >
            <CloseRoundedIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Typography>
            Are you sure you want to {confirmType} this student?
          </Typography>
          {selected && (
            <Stack spacing={1} sx={{ mt: 2 }}>
              <Info label="Name" value={`${selected.firstName || ""} ${selected.lastName || ""}`.trim()} />
              <Info label="Email" value={selected.email || "-"} />
              <Info label="Phone" value={selected.phone || "-"} />
              <Info label="DOB" value={formatDOBForView(selected.dob)} />
              <Info label="Gender" value={selected.gender || "-"} />
              <Info label="College" value={selected.collegeName || "-"} />
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle1" fontWeight={600}>
                Academic Details
              </Typography>
              <Info label="Enrollment No" value={studentData[selected.id]?.enrollmentNo || "-"} />
              <Info
                label="Department"
                value={getDepartmentName(selected.collegeId, studentData[selected.id]?.department, departments)}
              />
              <Info
                label="Program"
                value={getProgramName(selected.collegeId, studentData[selected.id]?.department, studentData[selected.id]?.program, programs)}
              />
              <Info label="Semester" value={studentData[selected.id]?.semester || "-"} />
              <Info label="Year of Admission" value={studentData[selected.id]?.yearOfAdmission || "-"} />
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ pt: 2 }}>
          <Button onClick={() => setConfirmOpen(false)} color="secondary" sx={{ borderRadius: 2 }}>
            Cancel
          </Button>
          <Button
            color={confirmType === "approve" ? "success" : "error"}
            variant="contained"
            onClick={handleConfirm}
            disabled={busy}
            sx={{ borderRadius: 2, minWidth: 140 }}
          >
            {busy ? <CircularProgress size={18} sx={{ color: "white" }} /> : confirmType === "approve" ? "Approve" : "Reject"}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={toast.open}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        autoHideDuration={3000}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          severity={toast.type === "success" ? "success" : "error"}
          variant="filled"
          onClose={() => setToast((t) => ({ ...t, open: false }))}
          sx={{ borderRadius: 2 }}
        >
          {toast.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}

function Info({ label, value }) {
  return (
    <Stack direction="row" spacing={2} alignItems="center">
      <Typography sx={{ minWidth: 120, fontWeight: 500, color: "text.primary" }}>{label}</Typography>
      <Typography sx={{ fontWeight: 400, color: "text.secondary" }}>{value || "-"}</Typography>
    </Stack>
  );
}

Info.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.any,
};