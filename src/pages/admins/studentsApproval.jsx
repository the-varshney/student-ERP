/* eslint-disable no-unused-vars */
import React, { useEffect, useMemo, useState, useCallback, useContext } from "react";
import { Box, Card, Typography, Stack, TextField, Button, Chip, Divider, Avatar,Dialog, DialogTitle, DialogContent, DialogActions, Alert, Tooltip, CircularProgress, Snackbar, useTheme, FormControl, InputLabel, Select, MenuItem, IconButton, Container
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
import PropTypes from "prop-types";

import SecondaryHeader from "../../components/secondaryHeader";
import { HeaderBackButton } from "../../components/header";
import StudentsGrid from "../../components/table";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const CACHE_TTL = 1000 * 60 * 60;
const ALL = "*";

const cacheSet = (key, data) => localStorage.setItem(key, JSON.stringify({ data, exp: Date.now() + CACHE_TTL }));
const cacheGet = (key) => {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  if (Date.now() > parsed.exp) { localStorage.removeItem(key); return null; }
  return parsed.data;
};

function formatDOBForView(dobStr) {
  if (!dobStr) return "-";
  const d = dayjs(dobStr);
  if (d.isValid()) return d.format("DD MMM YYYY");
  const [d_, m, y] = (dobStr || "").split("/");
  if (d_ && m && y && dayjs(`${y}-${m}-${d_}`).isValid()) return dayjs(`${y}-${m}-${d_}`).format("DD MMM YYYY");
  return dobStr || "-";
}

function getDepartmentName(collegeId, deptId, departments) {
  const depts = departments[collegeId] || [];
  const dept = depts.find(d => d._id === deptId || d.deptId === deptId);
  return dept?.departmentName || dept?.deptId || deptId || "-";
}

function getProgramName(collegeId, deptId, progId, programs) {
  const progs = programs[collegeId]?.[deptId] || [];
  const prog = progs.find(p => p._id === progId);
  return prog?.programName || progId || "-";
}

function useVerifiedStudents() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const q = query(collection(db, "Students"), where("role", "==", "verified"));
      const snap = await getDocs(q);
      const data = snap.docs
        .map(d => {
          const doc = d.data();
          if (!d.id || !doc.firebaseId || !doc.collegeId) return null;
          return {
            id: d.id,
            firebaseId: doc.firebaseId,
            collegeId: doc.collegeId,
            firstName: doc.firstName || "",
            lastName: doc.lastName || "",
            email: doc.email || "",
            phone: doc.phone || "",
            abcId: doc.abcId || "",
            dob: doc.dob || "",
            gender: doc.gender || "",
            collegeName: doc.collegeName || "",
            profilePicUrl: doc.profilePicUrl || "",
          };
        })
        .filter(Boolean);
      setRows(data);
    } catch (e) {
      console.error(e);
      setErr("Failed to load verified students");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);
  return { rows, loading, err, refetch: fetchRows };
}

export default function StudentApproval() {
  const theme = useTheme();
  const { userDetails, user, loading: authLoading } = useContext(AuthContext);

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmType, setConfirmType] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState({ open: false, type: "success", msg: "" });

  const [colleges, setColleges] = useState([]);
  const [collegeFilters, setCollegeFilters] = useState([]); // array of college _id

  const [departments, setDepartments] = useState({}); // { collegeId: [dept...] }
  const [deptFilters, setDeptFilters] = useState([]); // array of dept _id

  const [programs, setPrograms] = useState({}); // { collegeId: { deptId: [prog...] } }
  const [progFilters, setProgFilters] = useState([]);

  const [studentData, setStudentData] = useState({});

  const { rows, loading, err, refetch } = useVerifiedStudents();

  // Loading colleges
  useEffect(() => {
    const load = async () => {
      const key = "all-colleges";
      let data = cacheGet(key);
      if (!data) {
        const res = await axios.get(`${API_BASE_URL}/api/colleges`);
        data = res.data || [];
        cacheSet(key, data);
      }
      setColleges(data);

      const deptMap = {};
      const progMap = {};
      for (const col of data) {
        const dkey = `col-${col._id}-depts`;
        let depts = cacheGet(dkey) || [];
        if (!depts.length) {
          const res = await axios.get(`${API_BASE_URL}/api/colleges/${col._id}/departments`);
          depts = (res.data || []).map(d => ({ ...d, _id: d.deptId || d._id }));
          cacheSet(dkey, depts);
        }
        deptMap[col._id] = depts;

        const pMap = {};
        for (const dept of depts) {
          const pkey = `col-${col._id}-dept-${dept._id}-progs`;
          let progs = cacheGet(pkey) || [];
          if (!progs.length) {
            try {
              const res = await axios.get(`${API_BASE_URL}/api/departments/${col._id}/${dept._id}/programs`);
              progs = res.data || [];
            } catch { progs = []; }
            cacheSet(pkey, progs);
          }
          pMap[dept._id] = progs;
        }
        progMap[col._id] = pMap;
      }
      setDepartments(deptMap);
      setPrograms(progMap);
    };
    load();
  }, []);

  // Load MongoDB student data
  useEffect(() => {
    if (!rows.length) return;
    const load = async () => {
      const map = {};
      await Promise.all(rows.map(async r => {
        if (!r.firebaseId) return;
        try {
          const res = await axios.get(`${API_BASE_URL}/api/students/${r.firebaseId}`);
          map[r.id] = res.data;
        } catch { map[r.id] = null; }
      }));
      setStudentData(map);
    };
    load();
  }, [rows]);

  // filtered departments from selected colleges
  const availableDepts = useMemo(() => {
    const map = new Map();
  
    const addDept = (dept) => {
      const key = dept.departmentName 
        ? dept.departmentName.toLowerCase().trim() 
        : dept._id;
      if (!map.has(key)) {
        map.set(key, dept);
      }
    };
    if (!collegeFilters.length || collegeFilters.includes(ALL)) {
      // if all colleges selected then scan all
      Object.values(departments).flat().forEach(addDept);
    } else {
      collegeFilters.forEach(cid => {
        (departments[cid] || []).forEach(addDept);
      });
    }
  
    return Array.from(map.values()).sort((a, b) => 
      (a.departmentName || "").localeCompare(b.departmentName || "")
    );
  }, [collegeFilters, departments]);

  // Available programs from selected departments
  const availableProgs = useMemo(() => {
    const map = new Map();

    const addProg = (prog) => {
      const key = prog.programName 
        ? prog.programName.toLowerCase().trim() 
        : prog._id;
      if (!map.has(key)) {
        map.set(key, prog);
      }
    };
    if (!collegeFilters.length || collegeFilters.includes(ALL)) {
      Object.values(programs).forEach(collegeMap => {
        Object.values(collegeMap).flat().forEach(addProg);
      });
    } else {
      collegeFilters.forEach(colId => {
        deptFilters.forEach(deptId => {
          if (deptId === ALL || deptFilters.includes(ALL)) {
            Object.values(programs[colId] || {}).flat().forEach(addProg);
          } else {
            (programs[colId]?.[deptId] || []).forEach(addProg);
          }
        });
      });
    }
  
    return Array.from(map.values()).sort((a, b) => 
      (a.programName || "").localeCompare(b.programName || "")
    );
  }, [collegeFilters, deptFilters, programs]);

  // Toggle helpers
  const toggle = (arr, val) => arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];
  const toggleAll = (current, fullList) => current.includes(ALL) ? [] : [ALL];

  const handleCollegeToggle = (val) => {
    if (val === ALL) setCollegeFilters(prev => toggleAll(prev, colleges.map(c => c._id)));
    else setCollegeFilters(prev => toggle(prev.filter(v => v !== ALL), val));
  };
  const handleDeptToggle = (val) => {
    if (val === ALL) setDeptFilters(prev => toggleAll(prev, availableDepts.map(d => d._id)));
    else setDeptFilters(prev => toggle(prev.filter(v => v !== ALL), val));
  };
  const handleProgToggle = (val) => {
    if (val === ALL) setProgFilters(prev => toggleAll(prev, availableProgs.map(p => p._id)));
    else setProgFilters(prev => toggle(prev.filter(v => v !== ALL), val));
  };

  // Render value helpers
  const renderCollege = () => {
    if (collegeFilters.includes(ALL) || !collegeFilters.length) return "All Colleges";
    return collegeFilters.length === 1
      ? colleges.find(c => c._id === collegeFilters[0])?.name || collegeFilters[0]
      : `${collegeFilters.length} colleges`;
  };
  const renderDept = () => {
    if (deptFilters.includes(ALL) || !deptFilters.length) return "All Departments";
    return deptFilters.length === 1
      ? availableDepts.find(d => d._id === deptFilters[0])?.departmentName || deptFilters[0]
      : `${deptFilters.length} departments`;
  };
  const renderProg = () => {
    if (progFilters.includes(ALL) || !progFilters.length) return "All Programs";
    return progFilters.length === 1
      ? availableProgs.find(p => p._id === progFilters[0])?.programName || progFilters[0]
      : `${progFilters.length} programs`;
  };

  // Filtering logic
  const filtered = useMemo(() => {
    let list = rows;

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(r =>
        [r.firstName, r.lastName, r.email, r.phone, r.abcId, r.collegeName]
          .some(f => f?.toLowerCase().includes(q))
      );
    }

    if (collegeFilters.length && !collegeFilters.includes(ALL)) {
      list = list.filter(r => collegeFilters.includes(r.collegeId));
    }
    if (deptFilters.length && !deptFilters.includes(ALL)) {
      list = list.filter(r => {
        const d = studentData[r.id]?.department;
        return d && deptFilters.includes(d);
      });
    }
    if (progFilters.length && !progFilters.includes(ALL)) {
      list = list.filter(r => {
        const p = studentData[r.id]?.program;
        return p && progFilters.includes(p);
      });
    }

    return list;
  }, [rows, search, collegeFilters, deptFilters, progFilters, studentData]);

  const gridRows = useMemo(() => filtered.map(r => {
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
  }), [filtered, studentData, departments, programs]);

  const columns = useMemo(() => [
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
    { field: "firstName", headerName: "First Name", flex: 1, minWidth: 160 },
    { field: "lastName", headerName: "Last Name", flex: 1, minWidth: 160 },
    { field: "email", headerName: "Email", flex: 1, minWidth: 180 },
    { field: "phone", headerName: "Phone", width: 140 },
    { field: "abcId", headerName: "ABC ID", width: 140 },
    { field: "dobFormatted", headerName: "DOB", width: 130 },
    { field: "gender", headerName: "Gender", width: 110 },
    { field: "collegeName", headerName: "College", flex: 1, minWidth: 180,
      renderCell: p => <Chip label={p.value || "-"} size="small" variant="outlined" color="primary" />
    },
    { field: "enrollmentNo", headerName: "Enrollment No", width: 160 },
    { field: "departmentName", headerName: "Department", flex: 1, minWidth: 160 },
    { field: "programName", headerName: "Program", flex: 1, minWidth: 160 },
    { field: "semester", headerName: "Semester", width: 120 },
    { field: "yearOfAdmission", headerName: "Admission Year", width: 140 },
    { field: "actions", headerName: "Actions", width: 220, sortable: false,
      renderCell: p => (
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="contained" color="success" startIcon={<CheckIcon />}
            onClick={() => { setSelected(filtered.find(x => x.id === p.row.id)); setConfirmType("approve"); setConfirmOpen(true); }}>
            Approve
          </Button>
          <Button size="small" variant="contained" color="error" startIcon={<CancelIcon />}
            onClick={() => { setSelected(filtered.find(x => x.id === p.row.id)); setConfirmType("reject"); setConfirmOpen(true); }}>
            Reject
          </Button>
        </Stack>
      )
    },
  ], [theme, filtered]);

  const handleConfirm = async () => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const ref = doc(db, "Students", selected.id);
      const newRole = confirmType === "approve" ? "Student" : "unverified";
      if (confirmType === "reject") {
        try { await axios.delete(`${API_BASE_URL}/api/students/${selected.firebaseId}`); }
        catch { console.warn("Mongo delete failed"); }
      }
      await updateDoc(ref, { role: newRole });
      setToast({ open: true, type: "success", msg: `Student ${confirmType}d successfully` });
      setConfirmOpen(false); setSelected(null); refetch();
    } catch (e) {
      setToast({ open: true, type: "error", msg: "Operation failed" });
    } finally { setBusy(false); }
  };

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: theme.palette.background.default }}>
      <Container sx={{ pt: 2 }}>
        <SecondaryHeader
          title="Student Approvals"
          leftArea={<Stack direction="row" spacing={1} alignItems="center">
            <HeaderBackButton size="small" />
            <VerifiedIcon color="primary" />
          </Stack>}
          elevation={0} border
          paperSx={{ p: { xs: 1.5, md: 2 }, borderRadius: 2, mb: 2, border: "1px solid", borderColor: "divider" }}
        />
      </Container>

      <Container sx={{ pb: 4 }}>
        <Card sx={{ p: 3, borderRadius: 2, boxShadow: "0 8px 24px rgba(0,0,0,0.08)" }}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="center" sx={{ mb: 3 }}>
            <Typography variant="h5" fontWeight={750} sx={{ flex: 1, color: theme.palette.primary.main }}>
              Students Data
            </Typography>

            <TextField size="small" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
              sx={{ width: { xs: "100%", sm: 350 } }} />

            {/* College Filter */}
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel>Colleges</InputLabel>
              <Select multiple value={collegeFilters} label="Colleges"
                renderValue={renderCollege}
                onChange={() => {}} MenuProps={{ PaperProps: { sx: { maxHeight: 360 } } }}>
                <MenuItem value={ALL} onClick={(e) => { e.stopPropagation(); handleCollegeToggle(ALL); }}
                  sx={{ fontWeight: collegeFilters.includes(ALL) ? 700 : 400, bgcolor: collegeFilters.includes(ALL) ? "primary.lighter" : "transparent" }}>
                  All Colleges
                </MenuItem>
                {colleges.map(c => (
                  <MenuItem key={c._id} value={c._id}
                    onClick={(e) => { e.stopPropagation(); handleCollegeToggle(c._id); }}
                    sx={{ fontWeight: collegeFilters.includes(c._id) ? 700 : 400,
                      bgcolor: collegeFilters.includes(c._id) ? "primary.lighter" : "transparent" }}>
                    {c.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Department Filter */}
            <FormControl size="small" sx={{ minWidth: 240 }}>
              <InputLabel>Departments</InputLabel>
              <Select multiple value={deptFilters} label="Departments"
                renderValue={renderDept}
                onChange={() => {}} MenuProps={{ PaperProps: { sx: { maxHeight: 360 } } }}>
                <MenuItem value={ALL} onClick={(e) => { e.stopPropagation(); handleDeptToggle(ALL); }}
                  sx={{ fontWeight: deptFilters.includes(ALL) ? 700 : 400, bgcolor: deptFilters.includes(ALL) ? "primary.lighter" : "transparent" }}>
                  All Departments
                </MenuItem>
                {availableDepts.map(d => (
                  <MenuItem key={d._id} value={d._id}
                    onClick={(e) => { e.stopPropagation(); handleDeptToggle(d._id); }}
                    sx={{ fontWeight: deptFilters.includes(d._id) ? 700 : 400,
                      bgcolor: deptFilters.includes(d._id) ? "primary.lighter" : "transparent" }}>
                    {d.departmentName || d._id}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Program Filter */}
            <FormControl size="small" sx={{ minWidth: 260 }}>
              <InputLabel>Programs</InputLabel>
              <Select multiple value={progFilters} label="Programs"
                renderValue={renderProg}
                onChange={() => {}} MenuProps={{ PaperProps: { sx: { maxHeight: 360 } } }}>
                <MenuItem value={ALL} onClick={(e) => { e.stopPropagation(); handleProgToggle(ALL); }}
                  sx={{ fontWeight: progFilters.includes(ALL) ? 700 : 400, bgcolor: progFilters.includes(ALL) ? "primary.lighter" : "transparent" }}>
                  All Programs
                </MenuItem>
                {availableProgs.map(p => (
                  <MenuItem key={p._id} value={p._id}
                    onClick={(e) => { e.stopPropagation(); handleProgToggle(p._id); }}
                    sx={{ fontWeight: progFilters.includes(p._id) ? 700 : 400,
                      bgcolor: progFilters.includes(p._id) ? "primary.lighter" : "transparent" }}>
                    {p.programName || p._id}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Button variant="outlined" onClick={refetch} disabled={loading}>
              {loading ? <CircularProgress size={18} /> : "Refresh"}
            </Button>
          </Stack>

          {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}

          <StudentsGrid rows={gridRows} columns={columns} 
          height="100%"
          initialPageSize={25}
            pageSizeOptions={[10, 25, 50, 100]} paperSx={{ borderRadius: 2 }} />
        </Card>
      </Container>

      {/* Confirm Dialog & Snackbar*/}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{confirmType === "approve" ? "Approve" : "Reject"} Student
          <IconButton onClick={() => setConfirmOpen(false)} sx={{ position: "absolute", right: 16, top: 16 }}>
            <CloseRoundedIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Typography>Are you sure?</Typography>
          {selected && (
            <Stack spacing={1} sx={{ mt: 2 }}>
              <Info label="Name" value={`${selected.firstName} ${selected.lastName}`.trim()} />
              <Info label="Email" value={selected.email} />
              <Info label="College" value={selected.collegeName} />
              <Info label="Enrollment" value={studentData[selected.id]?.enrollmentNo || "-"} />
              <Info label="Department" value={getDepartmentName(selected.collegeId, studentData[selected.id]?.department, departments)} />
              <Info label="Program" value={getProgramName(selected.collegeId, studentData[selected.id]?.department, studentData[selected.id]?.program, programs)} />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button variant="contained" color={confirmType === "approve" ? "success" : "error"}
            onClick={handleConfirm} disabled={busy}>
            {busy ? <CircularProgress size={18} /> : confirmType === "approve" ? "Approve" : "Reject"}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={toast.open} autoHideDuration={3000} onClose={() => setToast(t => ({ ...t, open: false }))}>
        <Alert severity={toast.type} onClose={() => setToast(t => ({ ...t, open: false }))}>
          {toast.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}

function Info({ label, value }) {
  return (
    <Stack direction="row" spacing={2}>
      <Typography sx={{ minWidth: 130, fontWeight: 500 }}>{label}</Typography>
      <Typography sx={{ color: "text.secondary" }}>{value || "-"}</Typography>
    </Stack>
  );
}
Info.propTypes = { label: PropTypes.string.isRequired, value: PropTypes.any };