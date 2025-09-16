import React, { useEffect, useMemo, useState, useCallback, useContext, useRef } from "react";
import { Box, Card, Typography, Stack, TextField, Button, Chip, Divider, Avatar, Dialog, DialogTitle, DialogContent, DialogActions, Alert, Tooltip, CircularProgress, Snackbar, useTheme, FormControl, InputLabel, Select, MenuItem, Paper, InputAdornment, IconButton } from "@mui/material";
import { DataGrid, GridOverlay } from "@mui/x-data-grid";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import AddIcon from "@mui/icons-material/Add";
import dayjs from "dayjs";
import axios from "axios";
import { db } from "../../firebase/Firebase";
import { collection, query, where, getDocs, doc, updateDoc } from "firebase/firestore";
import { useAuth } from "../../context/AuthContext";
import { ThemeContext } from "../../context/ThemeContext";
import PropTypes from "prop-types";
 import { HeaderBackButton } from "../../components/header";

const NS = "erp";
const VER = "v1";
const CACHE_TTL = 1000 * 60 * 60;

const cache = {
  set(key, data, ttlMs = CACHE_TTL) {
    const payload = { v: data, exp: Date.now() + ttlMs };
    try {
      localStorage.setItem(`${NS}:${key}:${VER}`, JSON.stringify(payload));
    } catch {
      console.warn(`[cache:set:fail] ${key}`);
    }
  },
  get(key) {
    const k = `${NS}:${key}:${VER}`;
    try {
      const raw = localStorage.getItem(k);
      if (!raw) {
        return null;
      }
      const payload = JSON.parse(raw);
      if (payload?.exp && Date.now() > payload.exp) {
        localStorage.removeItem(k);
        return null;
      }
      return payload.v ?? null;
    } catch {
      console.warn(`[cache:get:fail] ${key}`);
      return null;
    }
  }
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

function useUnverifiedStudents(collegeId) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  
  const fetchRows = useCallback(async () => {
    if (!collegeId) { 
      setRows([]); 
      setLoading(false); 
      return; 
    }
    setLoading(true); 
    setErr("");
    
    try {
      const q = query(
        collection(db, "Students"), 
        where("collegeId", "==", collegeId), 
        where("role", "==", "unverified")
      );
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) { 
        setRows([]); 
      } else {
        const data = querySnapshot.docs.map((doc) => ({ 
          id: doc.id, 
          ...doc.data() 
        }));
        setRows(data);
      }
    } catch (e) { 
      console.error("Firestore Error:", e); 
      setErr(`Failed to load unverified students for college ${collegeId}. Please try again.`); 
    } finally { 
      setLoading(false); 
    }
  }, [collegeId]);
  
  useEffect(() => { fetchRows(); }, [fetchRows]);
  return { rows, loading, err, refetch: fetchRows };
}

function CustomNoRowsOverlay() { 
  return ( 
    <GridOverlay>
      <Box sx={{ mt: 1 }}>No unverified students found.</Box>
    </GridOverlay> 
  ); 
}

export default function StudentsVerify() {
  const theme = useTheme();
  const { mode } = useContext(ThemeContext);
  const { role, userDetails, loading: authLoading } = useAuth();
  
  const isCollegeAssociate = userDetails?.isCollegeAssociate || role === "CollegeAssociate";
  const associateCollegeId = userDetails?.college || null;
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState({ open: false, type: "success", msg: "" });
  const [genderFilter, setGenderFilter] = useState("");
  const [addDataOpen, setAddDataOpen] = useState(false);
  const [addData, setAddData] = useState({ 
    semester: "", 
    yearOfAdmission: new Date().getFullYear().toString(), 
    program: "", 
    department: "", 
    enrollmentNo: "", 
    firebaseId: "" 
  });
  const [departments, setDepartments] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [semesters, setSemesters] = useState([]);

  if (authLoading) { 
    return ( 
      <Box sx={{ p: 3, display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <CircularProgress color="primary" />
      </Box> 
    ); 
  }

  if (!isCollegeAssociate || !associateCollegeId) { 
    return ( 
      <Box sx={{ p: 3 }}>
        <Alert severity="error">Access denied. Only College Associates with an assigned college can view this page.</Alert>
      </Box> 
    ); 
  }

  const { rows, loading, err, refetch } = useUnverifiedStudents(associateCollegeId);

  useEffect(() => {
    const fetchDepartments = async () => {
      if (!associateCollegeId) return;
      
      const cacheKey = `college-${associateCollegeId}-departments`;
      let data = cache.get(cacheKey);
      
      if (!data) {
        try {
          const res = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/api/colleges/${associateCollegeId}/departments`);
          data = res.data;
          cache.set(cacheKey, data);
        } catch (error) { 
          console.error("Failed to fetch departments:", error); 
          data = []; 
        }
      }
      setDepartments(data || []);
    };
    fetchDepartments();
  }, [associateCollegeId]);

  useEffect(() => {
    const fetchPrograms = async () => {
      if (!addData.department || !associateCollegeId) { 
        setPrograms([]); 
        return; 
      }
      
      const cacheKey = `college-${associateCollegeId}-dept-${addData.department}-programs`;
      let data = cache.get(cacheKey);
      
      if (!data) {
        try {
          const res = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/api/departments/${associateCollegeId}/${addData.department}/programs`);
          data = res.data;
          cache.set(cacheKey, data);
        } catch (error) { 
          console.error("Failed to fetch programs:", error); 
          data = []; 
        }
      }
      setPrograms(data || []);
    };
    fetchPrograms();
  }, [addData.department, associateCollegeId]);

  useEffect(() => {
    const fetchSemesters = async () => {
      if (!addData.program) { 
        setSemesters([]); 
        return; 
      }
      
      const cacheKey = `program-${addData.program}-semesters`;
      let data = cache.get(cacheKey);
      
      if (!data) {
        try {
          const res = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/api/programs/${addData.program}/semesters`);
          data = res.data;
          cache.set(cacheKey, data);
        } catch (error) { 
          console.error("Failed to fetch semesters:", error); 
          data = []; 
        }
      }
      setSemesters(data || []);
    };
    fetchSemesters();
  }, [addData.program]);

  const filtered = useMemo(() => {
    let data = rows;
    const q = search.trim().toLowerCase();
    if (q) {
      data = data.filter((r) => {
        const fields = [r.firstName, r.lastName, r.email, r.phone, r.abcId, r.collegeName, r.gender, r.enrollmentNo].filter(Boolean);
        return fields.some((f) => String(f).toLowerCase().includes(q));
      });
    }
    if (genderFilter) { 
      data = data.filter((r) => (r.gender || "").toLowerCase() === genderFilter.toLowerCase()); 
    }
    return data;
  }, [rows, search, genderFilter]);

  const enrollmentPrefix = useMemo(() => {
    const yearPart = (addData.yearOfAdmission || "").slice(-2);
    const collegePart = (associateCollegeId || "").slice(-3);
    if (!yearPart || !collegePart) return "";
    return `${yearPart}${collegePart}`;
  }, [addData.yearOfAdmission, associateCollegeId]);

  const columns = useMemo(() => [
    { field: "profilePicUrl", headerName: "Photo", width: 60, sortable: false, 
      renderCell: (params) => ( 
        <Avatar sx={{ width: 32, height: 32, border: "1px solid rgba(0,0,0,0.1)" }} 
                src={params?.value || ""} 
                alt={`${params?.row?.firstName || ""} ${params?.row?.lastName || ""}`} 
        /> ) },
    { field: "firstName", headerName: "First Name", flex: 1, minWidth: 110 },
    { field: "lastName", headerName: "Last Name", flex: 1, minWidth: 110 },
    { field: "email", headerName: "Email", flex: 2, minWidth: 180 },
    { field: "phone", headerName: "Phone", flex: 1, minWidth: 140 },
    { field: "abcId", headerName: "ABC ID", flex: 1, minWidth: 130 },
    { field: "dob", headerName: "DOB", flex: 1, minWidth: 110 },
    { field: "gender", headerName: "Gender", flex: 0.8, minWidth: 90 },
    { field: "collegeName", headerName: "College", flex: 1.5, minWidth: 150, 
      renderCell: (params) => ( 
        <Tooltip title={params.value || ""}>
          <Chip label={params.value || "-"} 
                size="small" 
                variant="outlined" 
                color="primary" 
                sx={{ borderRadius: "4px", fontSize: "0.8rem", maxWidth: "100%" }} />
        </Tooltip> ) },
    { field: "actions", headerName: "Actions", width: 150, sortable: false, 
      renderCell: (params) => ( 
        <Button variant="contained" size="small" startIcon={<AddIcon />} 
                onClick={() => { 
                  if (!params?.row?.firebaseId) {
                    setToast({ open: true, type: "error", msg: "Student has no Firebase ID. Cannot proceed." });
                    return;
                  }
                  const computedPrefix = `${new Date().getFullYear().toString().slice(-2)}${(associateCollegeId || "").slice(-3)}` || ""; 
                  const baseSuffix = (params?.row?.enrollmentNo?.slice(-3) || "").replace(/\D/g, "").slice(-3); 
                  setSelected(params?.row || null); 
                  setAddData({ 
                    semester: "", 
                    yearOfAdmission: new Date().getFullYear().toString(), 
                    program: "", 
                    department: "", 
                    enrollmentNo: computedPrefix + (baseSuffix || ""), 
                    firebaseId: params?.row?.firebaseId || "" 
                  }); 
                  setAddDataOpen(true); 
                }}>
          Add Data
        </Button> 
      ) }
  ], [associateCollegeId]);

  const validateAddData = () => {
    if (!addData.department) return "Department is required.";
    if (!addData.program) return "Program is required.";
    if (!addData.semester) return "Semester is required.";
    if (!addData.yearOfAdmission || !/^\d{4}$/.test(addData.yearOfAdmission)) return "Year of Admission must be YYYY.";
    if (!enrollmentPrefix) return "Enrollment prefix unavailable. Check College ID and Year.";
    if (!addData.enrollmentNo.startsWith(enrollmentPrefix)) return "Enrollment number must start with the prefix.";
    const suffix = addData.enrollmentNo.substring(enrollmentPrefix.length);
    if (!/^\d{3}$/.test(suffix)) return "Enrollment suffix must be exactly 3 digits.";
    return "";
  };

  const handleAddAndVerify = async () => {
    if (busy) return;
    const errorMsg = validateAddData();
    if (errorMsg) { 
      setToast({ open: true, type: "error", msg: errorMsg }); 
      return; 
    }
    setBusy(true);
    
    try {
      let exists = false;
      try {
        const checkResponse = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/api/students/${addData.firebaseId}`);
        exists = !!checkResponse.data;
      } catch (error) { 
        if (error.response && error.response.status === 404) { 
          exists = false; 
        } else { 
          throw error; 
        } 
      }
      
      if (exists) {
        const updateResponse = await axios.put(`${import.meta.env.VITE_API_BASE_URL}/api/students/${addData.firebaseId}`, 
          { department: addData.department, 
            program: addData.program, 
            semester: addData.semester, 
            yearOfAdmission: addData.yearOfAdmission, 
            enrollmentNo: addData.enrollmentNo 
          });
        if (updateResponse.status !== 200) { 
          throw new Error("Failed to update student data."); 
        }
      } else {
        const createResponse = await axios.post(`${import.meta.env.VITE_API_BASE_URL}/api/students`, 
          { firebaseId: addData.firebaseId, 
            department: addData.department, 
            program: addData.program, 
            semester: addData.semester, 
            yearOfAdmission: addData.yearOfAdmission, 
            enrollmentNo: addData.enrollmentNo 
          });
        if (createResponse.status !== 201) { 
          throw new Error("Failed to create student data."); 
        }
      }
      
      const docRef = doc(db, "Students", selected.id);
      await updateDoc(docRef, { 
        role: "verified",
        program: addData.program,
      });
      
      setToast({ open: true, type: "success", msg: "Student data added and verified successfully." });
      setAddDataOpen(false);
      setAddData({ 
        semester: "", 
        yearOfAdmission: new Date().getFullYear().toString(), 
        program: "", 
        department: "", 
        enrollmentNo: "", 
        firebaseId: "" 
      });
      setSelected(null);
      await refetch();
    } catch (e) { 
      console.error("Error in handleAddAndVerify:", e);
      setToast({ open: true, type: "error", msg: e?.response?.data?.message || e.message || "Failed to add and verify student data." }); 
    } finally { 
      setBusy(false); 
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === "enrollmentNo") { 
      if (!enrollmentPrefix) return; 
      let next = value.startsWith(enrollmentPrefix) ? value : enrollmentPrefix; 
      const suffix = next.substring(enrollmentPrefix.length).replace(/\D/g, "").slice(0, 3); 
      next = enrollmentPrefix + suffix; 
      setAddData((prev) => ({ ...prev, enrollmentNo: next })); 
      return; 
    }
    if (name === "department") { 
      setAddData((prev) => ({ ...prev, department: value, program: "", semester: "" })); 
      return; 
    }
    if (name === "program") { 
      setAddData((prev) => ({ ...prev, program: value, semester: "" })); 
      return; 
    }
    setAddData((prev) => ({ ...prev, [name]: value }));
  };

  const handleKeyDown = (e, nextRef) => {
    if (e.key === "Enter") { 
      e.preventDefault(); 
      if (nextRef && nextRef.current) { 
        const nextFocusable = nextRef.current.querySelector('input, [role="button"]'); 
        if (nextFocusable) { 
          nextFocusable.focus(); 
        } else { 
          nextRef.current.focus(); 
        } 
      } else { 
        handleAddAndVerify(); 
      } 
    }
  };

  const departmentRef = useRef(null);
  const programRef = useRef(null);
  const semesterRef = useRef(null);
  const yearOfAdmissionRef = useRef(null);
  const enrollmentNoRef = useRef(null);

  return (
    <Paper elevation={0} sx={{
      background: mode === "default" ? `linear-gradient(135deg, ${theme.palette.green.main} -50%, ${theme.palette.green.focus} 90%)` 
               : mode === "light" ? theme.palette.green.main 
               : `linear-gradient(135deg, ${theme.palette.green.main} -50%, ${theme.palette.background.paper} 90%)`, 
      minHeight: "100vh", p: 5, display: "flex", flexDirection: "column", alignItems: "center" 
    }}>
      <Card sx={{ 
        p: { xs: 2, md: 3 }, 
        width: "100%", 
        maxWidth: 1250, 
        borderRadius: 3, 
        boxShadow: "0 8px 24px rgba(0,0,0,0.08)" 
      }}>
        <Stack direction={{ xs: "column", md: "row" }} 
               spacing={2} alignItems="center" 
               sx={{ mb: 3 }}>
                <HeaderBackButton/>
          <Typography variant="h5" fontWeight={750} sx={{ flex: 1, color: `${theme.palette.primary.main}` }}>
            Verify Students Data
          </Typography>
          <TextField variant="outlined" size="small" 
                     placeholder="Search name, email, phone, ABC ID, enrollment..." 
                     value={search} 
                     onChange={(e) => setSearch(e.target.value)} 
                     sx={{ width: { xs: "100%", sm: 350 } }} />
          <FormControl size="small" sx={{ width: { xs: "100%", md: 160 }, minWidth: 120 }}>
            <InputLabel>Gender</InputLabel>
            <Select label="Gender" value={genderFilter} onChange={(e) => setGenderFilter(e.target.value)}>
              <MenuItem value="">All</MenuItem>
              <MenuItem value="Male">Male</MenuItem>
              <MenuItem value="Female">Female</MenuItem>
              <MenuItem value="Other">Other</MenuItem>
            </Select>
          </FormControl>

          <Button variant="outlined" 
                  color="primary" 
                  onClick={refetch} 
                  disabled={loading || authLoading || !associateCollegeId} 
                  sx={{ minWidth: 120 }}>
            {loading ? <CircularProgress size={18} /> : "Refresh"}
          </Button>
        </Stack>
        
        {err && ( 
          <Alert sx={{ mb: 3, borderRadius: 2 }} severity="error">{err}</Alert> 
        )}
        
        <Paper elevation={1} sx={{ width: "100%", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ width: "100%" }}>
            <DataGrid 
              rows={filtered} 
              columns={columns} 
              autoHeight 
              pageSizeOptions={[5, 10, 25]} 
              initialState={{ pagination: { paginationModel: { pageSize: 10 } } }} 
              disableRowSelectionOnClick 
              loading={loading} 
              slots={{ noRowsOverlay: CustomNoRowsOverlay }} 
              sx={{ 
                border: "none", 
                "& .MuiDataGrid-columnHeaders": { 
                  backgroundColor: theme.palette.mode === "light" ? "grey.200" : "grey.800", 
                  color: "text.primary", 
                  borderRadius: 0 
                }, 
                "& .MuiDataGrid-cell": { color: "text.primary" }, 
                "& .MuiDataGrid-row": { "&:hover": { backgroundColor: "action.hover" } } 
              }} 
            />
          </div>
        </Paper>
      </Card>

      <Dialog open={addDataOpen} 
              onClose={() => setAddDataOpen(false)} 
              maxWidth="sm" 
              fullWidth 
              PaperProps={{ sx: { borderRadius: 3, p: 1 } }}>
        <DialogTitle sx={{ fontWeight: 900 }}>
          Add Data
          <IconButton 
            onClick={() => setAddDataOpen(false)} 
            sx={{ position: "absolute", right: 16, top: 16, color: "text.secondary" }}>
            <CloseRoundedIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers sx={{ pb: 3 }}>
          {selected && (
            <Stack spacing={2}>
              <Typography variant="subtitle1" fontWeight={600}>Student Details</Typography>

              <Info label="Name" value={`${selected.firstName || ""} ${selected.lastName || ""}`.trim()} />
              <Info label="Email" value={selected.email} />
              <Info label="Phone" value={selected.phone} />
              <Info label="ABC ID" value={selected.abcId} />
              <Info label="Gender" value={selected.gender} />
              <Info label="DOB" value={formatDOBForView(selected.dob)} />
              <Info label="College" value={`${selected.collegeName || "-"}${selected.collegeId ? ` (${selected.collegeId})` : ""}`} />
              <Info label="Unique ID" value={selected.firebaseId} />
              <Info label="Role" value={selected.role} />
              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle1" fontWeight={600}>Add Student Academic Data</Typography>
              <Stack spacing={2} sx={{ mt: 2 }}>
                <TextField label="Unique ID" 
                           fullWidth 
                           value={addData.firebaseId} 
                           variant="outlined" 
                           disabled />

                <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                  <FormControl fullWidth>
                    <InputLabel>Department</InputLabel>
                    <Select name="department" 
                            value={addData.department} 
                            label="Department" 
                            onChange={handleInputChange} 
                            ref={departmentRef} 
                            onKeyDown={(e) => handleKeyDown(e, programRef)}>
                      <MenuItem value="" disabled>Select Department</MenuItem>
                      {departments.map((dept) => ( 
                        <MenuItem key={dept._id} value={dept._id}>
                          {dept.departmentName}
                        </MenuItem> 
                      ))}
                    </Select>
                  </FormControl>

                  <FormControl fullWidth>
                    <InputLabel>Program</InputLabel>
                    <Select name="program" 
                            value={addData.program} 
                            label="Program" 
                            onChange={handleInputChange} 
                            ref={programRef} 
                            onKeyDown={(e) => handleKeyDown(e, semesterRef)}>
                      <MenuItem value="" disabled>Select Program</MenuItem>
                      {programs.map((prog) => ( 
                        <MenuItem key={prog._id} value={prog._id}>
                          {prog.programName}
                        </MenuItem> 
                      ))}
                    </Select>
                  </FormControl>

                  <FormControl fullWidth>
                    <InputLabel>Semester</InputLabel>
                    <Select name="semester" 
                            value={addData.semester} 
                            label="Semester" 
                            onChange={handleInputChange} 
                            ref={semesterRef} 
                            onKeyDown={(e) => handleKeyDown(e, yearOfAdmissionRef)}>
                      <MenuItem value="" disabled>Select Semester</MenuItem>
                      {semesters.map((sem) => ( 
                        <MenuItem key={sem._id || sem.semesterNumber} value={sem.semesterNumber}>
                          Semester {sem.semesterNumber}
                        </MenuItem> 
                      ))}
                    </Select>
                  </FormControl>
                </Stack>

                <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                  <TextField label="Year of Admission" 
                             name="yearOfAdmission" 
                             value={addData.yearOfAdmission} 
                             onChange={handleInputChange} 
                             inputRef={yearOfAdmissionRef} 
                             onKeyDown={(e) => handleKeyDown(e, enrollmentNoRef)} 
                             fullWidth 
                             inputProps={{ inputMode: "numeric", pattern: "[0-9]*", maxLength: 4 }} 
                             helperText="Format: YYYY" />
                  <TextField label="Enrollment No Suffix" 
                             name="enrollmentNo" 
                             value={addData.enrollmentNo.substring(enrollmentPrefix.length)} 
                             onChange={(e) => { 
                               const suffix = e.target.value.replace(/\D/g, "").slice(0, 3); 
                               setAddData((prev) => ({ 
                                 ...prev, 
                                 enrollmentNo: enrollmentPrefix + suffix 
                               })); 
                             }} 
                             inputRef={enrollmentNoRef} 
                             onKeyDown={(e) => handleKeyDown(e, null)} 
                             fullWidth 
                             helperText="Enter last 3 digits" 
                             InputProps={{ 
                               startAdornment: enrollmentPrefix ? ( 
                                 <InputAdornment position="start">
                                   <Typography fontWeight={500} color="text.secondary">
                                     {enrollmentPrefix}
                                   </Typography>
                                 </InputAdornment> 
                               ) : null 
                             }} />
                </Stack>
              </Stack>
            </Stack>
          )}
        </DialogContent>
        
        <DialogActions sx={{ pt: 2 }}>
          <Button onClick={() => setAddDataOpen(false)} 
                  color="secondary" 
                  sx={{ borderRadius: 2 }}>
            Cancel
          </Button>
          <Button color="success" 
                  variant="contained" 
                  onClick={handleAddAndVerify} 
                  disabled={busy || !enrollmentPrefix || !addData.semester || !addData.yearOfAdmission || !addData.program || !addData.department || !addData.enrollmentNo || (enrollmentPrefix && addData.enrollmentNo.length !== enrollmentPrefix.length + 3)} 
                  sx={{ borderRadius: 2, minWidth: 140 }}>
            {busy ? <CircularProgress size={18} sx={{ color: "white" }} /> : "Verify Data"}
          </Button>
        </DialogActions>
      </Dialog>
      
      <Snackbar open={toast.open} 
                onClose={() => setToast((t) => ({ ...t, open: false }))} 
                autoHideDuration={3000} 
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}>
        <Alert severity={toast.type === "success" ? "success" : "error"} 
               variant="filled" 
               onClose={() => setToast((t) => ({ ...t, open: false }))} 
               sx={{ borderRadius: 2 }}>
          {toast.msg}
        </Alert>
      </Snackbar>
    </Paper>
  );
}

function Info({ label, value }) { 
  return ( 
    <Stack direction="row" spacing={2} alignItems="center">
      <Typography sx={{ minWidth: 120, fontWeight: 500, color: "text.primary" }}>
        {label}
      </Typography>
      <Typography sx={{ fontWeight: 400, color: "text.secondary" }}>
        {value || "-"}
      </Typography>
    </Stack> 
  ); 
}

Info.propTypes = { 
  label: PropTypes.string.isRequired, 
  value: PropTypes.any 
};
