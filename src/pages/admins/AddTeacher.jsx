import React, { useState, useEffect, useRef } from "react";
import { Box, Card, Typography, TextField, Button, Stack, FormControl, InputLabel, Select, MenuItem, IconButton, CircularProgress, Divider, Dialog, DialogTitle, DialogContent, Snackbar, Slide, FormHelperText, useTheme,
} from "@mui/material";
import AddCircleIcon from "@mui/icons-material/AddCircle";
import RemoveCircleIcon from "@mui/icons-material/RemoveCircle";
import VisibilityIcon from "@mui/icons-material/Visibility";
import PreviewIcon from "@mui/icons-material/Preview";
import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { secondaryAuth, db, storage } from "../../firebase/Firebase";
import { doc, setDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { v4 as uuidv4 } from "uuid";
import { toast } from "react-toastify";
import axios from "axios";
import { HeaderBackButton } from "../../components/header";
import SecondaryHeader from "../../components/secondaryHeader";

function SlideTransition(props) {
  return <Slide {...props} direction="left" />;
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

// Cache
const CACHE_TTL = 1000 * 60 * 60;
const setCache = (key, data) => {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({ data, expiry: Date.now() + CACHE_TTL })
    );
  } catch (error) {
    console.error("Could not set cache", error);
  }
};
const getCache = (key) => {
  try {
    const cached = localStorage.getItem(key);
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    if (Date.now() > parsed.expiry) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch (error) {
    console.error("Could not get cache", error);
    return null;
  }
};

function AddTeacher() {
  const theme = useTheme();

  const [teacherData, setTeacherData] = useState({teacherId: "", firstName: "", lastName: "", email: "", 
    password: "", contactNumber: "", college: "", collegeName: "", department: "", departmentName: "", 
    program: "", programName: "", profilePic: null, subjects: [{ semester: "", subjectId: "", subjectName: "" }], 
    isCollegeAssociate: false,
  });

  const [profilePicUrl, setProfilePicUrl] = useState("");
  const [profilePicPreview, setProfilePicPreview] = useState(null);
  const [imageUploaded, setImageUploaded] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [teacherCreated, setTeacherCreated] = useState(false);
  const [snackbarOpen, setSnackbarOpen] = useState(false);

  const [collegesList, setCollegesList] = useState([]);
  const [departmentsList, setDepartmentsList] = useState([]);
  const [programsList, setProgramsList] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [subjectsOptionsByRow, setSubjectsOptionsByRow] = useState({});
  //Refs for Enter Key handeling
  const firstNameRef = useRef(null);
  const lastNameRef = useRef(null);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const teacherIdRef = useRef(null);
  const contactRef = useRef(null);
  const collegeRef = useRef(null);
  const departmentRef = useRef(null);
  const programRef = useRef(null);
  const semesterRef = useRef(null);
  const subjectRef = useRef(null);

  useEffect(() => {
    const fetchColleges = async () => {
      try {
        let data = getCache("colleges");
        if (!data) {
          const res = await axios.get(`${BASE_URL}/api/colleges/names`);
          data = res.data;
          setCache("colleges", data);
        }
        setCollegesList(data);
      } catch (error) {
        toast.error("Failed to fetch colleges.");
        console.error("Error fetching colleges:", error);
      }
    };
    fetchColleges();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setTeacherData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const handleCheckboxChange = (e) => {
    setTeacherData((prev) => ({
      ...prev,
      isCollegeAssociate: e.target.checked,
    }));
  };

  const handleCollegeChange = async (e) => {
    const collegeId = e.target.value ?? '';
    const selectedCollege = collegesList.find((c) => c._id === collegeId);
    
    setTeacherData((prev) => ({
      ...prev,
      college: collegeId,
      collegeName: selectedCollege?.name || "",
      department: "",
      departmentName: "",
      program: "",
      programName: "",
      subjects: [{ semester: "", subjectId: "", subjectName: "" }],
    }));
    
    setDepartmentsList([]);
    setProgramsList([]);
    setSemesters([]);
    setSubjectsOptionsByRow({});

    if (!collegeId) return;

    setTimeout(() => departmentRef.current?.focus(), 100);
    const cacheKey = `college-${collegeId}-departments`;
    
    try {
      let data = getCache(cacheKey);
      if (!data) {
        const res = await axios.get(`${BASE_URL}/api/colleges/${collegeId}/departments`);
        data = res.data;
        setCache(cacheKey, data);
      }
      setDepartmentsList(data);
    } catch (error) {
        toast.error("Failed to fetch departments for the selected college.");
        console.error("Error fetching departments:", error);
    }
  };
  
  const handleDepartmentChange = async (e) => {
    const departmentId = e.target.value ?? '';
    const { college: collegeId } = teacherData;
    
    const deptDoc = departmentsList.find((d) => d._id === departmentId);

    setTeacherData((prev) => ({
      ...prev,
      department: departmentId,
      departmentName: deptDoc?.departmentName || "",
      program: "",
      programName: "",
      subjects: [{ semester: "", subjectId: "", subjectName: "" }],
    }));

    setProgramsList([]);
    setSemesters([]);
    setSubjectsOptionsByRow({});
    if (!departmentId || !collegeId) return;
    setTimeout(() => programRef.current?.focus(), 100);
    const cacheKey = `college-${collegeId}-dept-${departmentId}-programs`;
    try {
      let data = getCache(cacheKey);
      if (!data) {
        const res = await axios.get(
          `${BASE_URL}/api/departments/${collegeId}/${departmentId}/programs`
        );
        data = res.data;
        setCache(cacheKey, data);
      }
      setProgramsList(data);
    } catch (error) {
      toast.error("Failed to fetch programs for the selected department.");
      console.error("Error fetching programs:", error);
    }
  };

  const handleProgramChange = async (e) => {
    const programId = e.target.value ?? '';
    const progDoc = programsList.find((p) => p._id === programId);

    setTeacherData((prev) => ({
      ...prev,
      program: programId,
      programName: progDoc?.programName || "",
      subjects: [{ semester: "", subjectId: "", subjectName: "" }],
    }));
    
    setSemesters([]);
    setSubjectsOptionsByRow({});

    if (!programId) return;

    setTimeout(() => semesterRef.current?.focus(), 100);
    
    const cacheKey = `program-${programId}-semesters`;
    try {
      let data = getCache(cacheKey);
      if (!data) {
        const res = await axios.get(`${BASE_URL}/api/programs/${programId}/semesters`);
        data = res.data;
        setCache(cacheKey, data);
      }
      setSemesters(data);
    } catch (error) {
      toast.error("Failed to fetch semesters for the selected program.");
      console.error("Error fetching semesters:", error);
    }
  };
  
  const handleSemesterChange = async (idx, e) => {
    const semesterValue = e.target.value ?? '';
    const { program: programId } = teacherData;
    
    setTeacherData(prev => {
      const updatedSubjects = [...prev.subjects];
      updatedSubjects[idx] = { ...updatedSubjects[idx], semester: semesterValue, subjectId: "", subjectName: "" };
      return { ...prev, subjects: updatedSubjects };
    });

    if (!semesterValue || !programId) {
      setSubjectsOptionsByRow(prev => ({ ...prev, [idx]: [] }));
      return;
    }
    
    const cacheKey = `program-${programId}-sem-${semesterValue}-subjects`;
    try {
      let data = getCache(cacheKey);
      if (!data) {
        const res = await axios.get(
          `${BASE_URL}/api/programs/${programId}/semesters/${semesterValue}/subjects`
        );
        data = res.data;
        setCache(cacheKey, data);
      }
      setSubjectsOptionsByRow(prev => ({ ...prev, [idx]: data }));
      setTimeout(() => subjectRef.current?.focus(), 100);
    } catch (error) {
      toast.error("Failed to fetch subjects for the selected semester.");
      console.error("Error fetching subjects:", error);
    }
  };
  
  const handleSubjectChange = (index, field, value) => {
    const subjectIdValue = value ?? '';
    const options = subjectsOptionsByRow[index] || [];
    const subjDoc = options.find(s => s._id === subjectIdValue);
    
    setTeacherData(prev => {
      const updatedSubjects = [...prev.subjects];
      updatedSubjects[index] = {
        ...updatedSubjects[index],
        [field]: subjectIdValue,
        subjectName: subjDoc ? subjDoc.subjectName : ""
      };
      return { ...prev, subjects: updatedSubjects };
    });
  };

  const addSubject = () => {
    setTeacherData(prev => ({
      ...prev,
      subjects: [...prev.subjects, { semester: "", subjectId: "", subjectName: "" }],
    }));
  };

  const removeSubject = (index) => {
    setTeacherData(prev => ({
      ...prev,
      subjects: prev.subjects.filter((_, i) => i !== index),
    }));
    setSubjectsOptionsByRow(prev => {
      const newOptions = { ...prev };
      delete newOptions[index];
      return newOptions;
    });
  };

  const handleProfilePicChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 250 * 1024) {
        toast.error("Image size should be under 250KB.");
        return;
      }
      if (!["image/jpeg", "image/png", "image/jpg"].includes(file.type)) {
        toast.error("Only JPEG, JPG, and PNG formats are allowed.");
        return;
      }
      setTeacherData((prev) => ({ ...prev, profilePic: file }));
      setProfilePicPreview(URL.createObjectURL(file));
      try {
        const profilePicRef = ref(
          storage,
          `profile_pictures/teachers/${uuidv4()}_${file.name}`
        );
        await uploadBytes(profilePicRef, file);
        const downloadURL = await getDownloadURL(profilePicRef);
        setProfilePicUrl(downloadURL);
        setImageUploaded(true);
        toast.success("Profile picture uploaded successfully.");
      } catch (error) {
        toast.error("Failed to upload profile picture.");
        console.error("Upload error:", error);
      }
    }
  };

  const handleKeyDown = (e, nextRef) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (nextRef && nextRef.current) {
        nextRef.current.focus();
      } else if (!nextRef) {
        handleSubmit(e);
      }
    }
  };

  const validateForm = () => {
    const newErrors = {};
    const { firstName, lastName, email, password, teacherId, contactNumber, college, department, subjects } = teacherData;

    if (!firstName.trim()) newErrors.firstName = "First name is required.";
    if (!lastName.trim()) newErrors.lastName = "Last name is required.";
    if (!email) {
      newErrors.email = "Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = "Please enter a valid email address.";
    }
    if (!password) newErrors.password = "Password is required.";
    if (!teacherId || !/^\d{8}$/.test(teacherId)) {
        newErrors.teacherId = "Teacher ID must be exactly 8 digits.";
    }
    if (!contactNumber) {
        newErrors.contactNumber = "Contact number is required.";
    } else if (!/^\d{10}$/.test(contactNumber)) {
        newErrors.contactNumber = "Contact number must be exactly 10 digits.";
    }
    if (!college) newErrors.college = "College is required.";
    if (!department) newErrors.department = "Department is required.";

    subjects.forEach((subject, i) => {
      if (!subject.semester) newErrors[`subjectSemester${i}`] = "Semester is required.";
      if (!subject.subjectId) newErrors[`subjectName${i}`] = "Subject is required.";
    });
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
        toast.error("Please fill all required fields correctly.");
        return;
    }
    setLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(
        secondaryAuth,
        teacherData.email,
        teacherData.password
      );
      const user = userCredential.user;
      await signOut(secondaryAuth);

      const newTeacher = {
        teacherId: teacherData.teacherId,
        firstName: teacherData.firstName, lastName: teacherData.lastName,
        email: teacherData.email,
        contactNumber: Number(teacherData.contactNumber),
        college: teacherData.college, department: teacherData.department,  program: teacherData.program,
        profilePicUrl: profilePicUrl || "",  role: "Teacher",
        isCollegeAssociate: teacherData.isCollegeAssociate,
        subjects: teacherData.subjects.map((s) => ({
          semester: Number(s.semester),
          subjectId: s.subjectId,
          subjectName: s.subjectName,
        })), uid: user.uid,
      };

      await setDoc(doc(db, "Teachers", user.uid), newTeacher);
      toast.success("Teacher created successfully!");
      setTeacherCreated(true);
      setSnackbarOpen(true);
    } catch (error) {
        console.error("Error creating teacher:", error);
        if (error.code === 'auth/email-already-in-use') {
            toast.error("This email is already registered. Please use a different email.");
            setErrors(prev => ({ ...prev, email: "Email already in use." }));
        } else if (error.code === 'auth/weak-password') {
            toast.error("The password is too weak. It must be at least 6 characters long.");
            setErrors(prev => ({ ...prev, password: "Password is too weak." }));
        } else {
            toast.error("An unexpected error occurred while adding the teacher.");
        }
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setTeacherData({
      teacherId: "", firstName: "", lastName: "", email: "", password: "", contactNumber: "", department: "", 
      program: "", college: "", profilePic: null, subjects: [{ semester: "", subjectId: "", subjectName: "" }],
      isCollegeAssociate: false,
    });
    setProfilePicUrl("");
    setProfilePicPreview(null);
    setImageUploaded(false);
    setTeacherCreated(false);
    setErrors({});
    setDepartmentsList([]);
    setProgramsList([]);
    setSemesters([]);
    setSubjectsOptionsByRow({});
  };
  
  return (
    <section>
      <Box sx={{ px: { xs: 1.5, md: 2 }, pt: 2 ,maxWidth:{xs:"100vw", md:"90vw"}, mx:"auto"}}>
              <SecondaryHeader
                title="Add New Teacher"
                subtitle="Create a teacher account, assign department/program, and map subjects."
                leftArea={<HeaderBackButton/>}
              />
            </Box>
      <Box sx={{ display: "flex", justifyContent: "center", minHeight: "100vh", p: 2 }}>
        <Card sx={{ width: "90%", maxWidth: "90vw", p: 4, borderRadius: 3 }}>
          <Typography variant="h6" align="start" fontWeight={"bold"} gutterBottom>
                      Teacher Data
                    </Typography>
                    
          <Box component="form" onSubmit={handleSubmit} noValidate>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mb: 2 }}>
              <TextField label="First Name" name="firstName" value={teacherData.firstName} inputRef={firstNameRef} onChange={handleInputChange} onKeyDown={(e) => handleKeyDown(e, lastNameRef)} error={!!errors.firstName} helperText={errors.firstName} fullWidth/>
              <TextField label="Last Name" name="lastName" value={teacherData.lastName} inputRef={lastNameRef} onChange={handleInputChange} onKeyDown={(e) => handleKeyDown(e, emailRef)} error={!!errors.lastName} helperText={errors.lastName} fullWidth/>
            </Stack>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mb: 2 }}>
              <TextField label="Email" name="email" type="email" value={teacherData.email} inputRef={emailRef} onChange={handleInputChange} onKeyDown={(e) => handleKeyDown(e, passwordRef)} error={!!errors.email} helperText={errors.email} fullWidth/>
              <TextField label="Password" name="password" type="password" value={teacherData.password} inputRef={passwordRef} onChange={handleInputChange} onKeyDown={(e) => handleKeyDown(e, teacherIdRef)} error={!!errors.password} helperText={errors.password} fullWidth/>
            </Stack>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mb: 2 }}>
              <TextField label="Teacher ID" name="teacherId" value={teacherData.teacherId} inputRef={teacherIdRef} onChange={handleInputChange} onKeyDown={(e) => handleKeyDown(e, contactRef)} error={!!errors.teacherId} helperText={errors.teacherId} fullWidth/>
              <TextField label="Contact Number" name="contactNumber" type="tel" value={teacherData.contactNumber} inputRef={contactRef} onChange={handleInputChange} onKeyDown={(e) => handleKeyDown(e, collegeRef)} error={!!errors.contactNumber} helperText={errors.contactNumber} fullWidth/>
            </Stack>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mb: 2 }}>
              <FormControl fullWidth error={!!errors.college}>
                <InputLabel>College</InputLabel>
                <Select name="college" value={teacherData.college} label="College" inputRef={collegeRef} onChange={handleCollegeChange}>
                  <MenuItem value=""><em>Select College</em></MenuItem>
                  {collegesList.map((col) => (
                    <MenuItem key={col._id} value={col._id}>{col.name} - {col.address}</MenuItem>
                  ))}
                </Select>
                {errors.college && <FormHelperText>{errors.college}</FormHelperText>}
              </FormControl>
              <FormControl fullWidth error={!!errors.department}>
                <InputLabel>Department</InputLabel>
                <Select name="department" value={teacherData.department} label="Department" inputRef={departmentRef} onChange={handleDepartmentChange} disabled={!teacherData.college || departmentsList.length === 0}>
                  <MenuItem value=""><em>Select Department</em></MenuItem>
                  {departmentsList.map(dep => (
                    <MenuItem key={dep._id} value={dep._id}>{dep.departmentName}</MenuItem>
                  ))}
                </Select>
                {errors.department && <FormHelperText>{errors.department}</FormHelperText>}
              </FormControl>
            </Stack>
            <Stack direction="row" spacing={2} sx={{ mb: 2, alignItems: "center" }}>
              <FormControl sx={{width: {xs: '100%', md: '49.25%'}}} error={!!errors.program}>
                <InputLabel>Program</InputLabel>
                <Select name="program" label="Program" value={teacherData.program} onChange={handleProgramChange} inputRef={programRef} disabled={!teacherData.department || programsList.length === 0}>
                  <MenuItem value=""><em>Select Program</em></MenuItem>
                  {programsList.map(prog => (
                    <MenuItem key={prog._id} value={prog._id}>{prog.programName}</MenuItem>
                  ))}
                </Select>
                {errors.program && <FormHelperText>{errors.program}</FormHelperText>}
              </FormControl>
            </Stack>
            <Stack direction="row" spacing={2} sx={{ mb: 2, alignItems: "center" }}>
              <Button variant="contained" component="label" sx={{ backgroundColor: theme.palette.green.focus, color: theme.palette.contrastText, "&:hover": { backgroundColor: theme.palette.red.hover } }}>
                Upload Picture
                <input type="file" hidden accept="image/*" onChange={handleProfilePicChange} />
              </Button>
              {imageUploaded && (
                <IconButton onClick={() => setPreviewOpen(true)} color="success">
                  <VisibilityIcon />
                </IconButton>
              )}
            </Stack>
            <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)}>
              <DialogContent>
                <Box component="img" src={profilePicPreview} sx={{ maxWidth: 400 }} />
              </DialogContent>
            </Dialog>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
              <input type="checkbox" id="collegeAssociate" checked={teacherData.isCollegeAssociate} onChange={handleCheckboxChange} style={{ transform: "scale(1.2)" }} />
              <label htmlFor="collegeAssociate" style={{ cursor: "pointer" }}>Assign <b>College Associate</b> Role</label>
            </Stack>
            <Divider sx={{ my: 2 }} />
            {teacherData.subjects.map((subject, idx) => (
              <Stack direction={{ xs: "column", md: "row" }} spacing={2} key={idx} sx={{ mb: 2, alignItems:"center" }}>
                <FormControl fullWidth error={!!errors[`subjectSemester${idx}`]}>
                  <InputLabel>Semester</InputLabel>
                  <Select name="semester" value={subject.semester} label="Semester" inputRef={semesterRef} onChange={(e) => handleSemesterChange(idx, e)} disabled={!teacherData.program || semesters.length === 0}>
                    <MenuItem value=""><em>Select Semester</em></MenuItem>
                    {semesters.map(sem => (
                      <MenuItem key={sem._id || sem.semesterNumber} value={sem.semesterNumber}>Semester {sem.semesterNumber}</MenuItem>
                    ))}
                  </Select>
                  {errors[`subjectSemester${idx}`] && <FormHelperText>{errors[`subjectSemester${idx}`]}</FormHelperText>}
                </FormControl>
                <FormControl fullWidth error={!!errors[`subjectName${idx}`]}>
                  <InputLabel>Subject</InputLabel>
                  <Select label="Subject" name="subjectId" fullWidth inputRef={subjectRef} value={subject.subjectId} onChange={(e) => handleSubjectChange(idx, "subjectId", e.target.value)} disabled={!subject.semester || (subjectsOptionsByRow[idx] || []).length === 0}>
                    <MenuItem value=""><em>Select Subject</em></MenuItem>
                    {(subjectsOptionsByRow[idx] || []).map(sub => (
                      <MenuItem key={sub._id} value={sub._id}>{sub.subjectName}</MenuItem>
                    ))}
                  </Select>
                  {errors[`subjectName${idx}`] && <FormHelperText>{errors[`subjectName${idx}`]}</FormHelperText>}
                </FormControl>
                {teacherData.subjects.length > 1 && (
                  <IconButton color="error" onClick={() => removeSubject(idx)}>
                    <RemoveCircleIcon />
                  </IconButton>
                )}
              </Stack>
            ))}
            <Button startIcon={<AddCircleIcon />} sx={{ mb: 2, backgroundColor: theme.palette.green.focus, color: theme.palette.contrastText, "&:hover": { backgroundColor: theme.palette.red.hover } }} onClick={addSubject}>
              Add Subject
            </Button>
            {teacherCreated ? (
              <Stack direction="row" spacing={2}>
                <Button variant="contained" onClick={resetForm} fullWidth sx={{ backgroundColor: theme.palette.green.main, color: theme.palette.contrastText, "&:hover": { backgroundColor: theme.palette.red.hover } }}>
                  Add Another Teacher
                </Button>
                <Button variant="outlined" startIcon={<PreviewIcon />} onClick={() => setProfileDialogOpen(true)} fullWidth>
                  Preview Profile
                </Button>
              </Stack>
            ) : (
              <Button variant="contained" type="submit" disabled={loading} fullWidth sx={{ backgroundColor: theme.palette.green.focus, color: theme.palette.contrastText, "&:hover": { backgroundColor: theme.palette.red.hover } }}>
                {loading ? <CircularProgress size={24} color="inherit" /> : "Add Teacher"}
              </Button>
            )}
          </Box>
        </Card>
      </Box>
      <Snackbar open={snackbarOpen} autoHideDuration={3000} onClose={() => setSnackbarOpen(false)} message="Teacher Created Successfully!" TransitionComponent={SlideTransition} elevation={6} anchorOrigin={{ vertical: "top", horizontal: "right" }} sx={{ borderRadius: "12px", boxShadow: "0 5px 15px rgba(0,0,0,0.2)" }}/>
      <Dialog open={profileDialogOpen} onClose={() => setProfileDialogOpen(false)} maxWidth="sm" fullWidth sx={{ backdropFilter: "blur(2px)" }}>
        <DialogTitle>Teacher Profile Preview</DialogTitle>
        <DialogContent dividers>
          <Box textAlign="center" mb={2}>
            {profilePicUrl && <Box component="img" src={profilePicUrl} sx={{ borderRadius: "50%", width: 120, height: 120, objectFit: 'cover' }} />}
          </Box>
          <Typography><b>ID:</b> {teacherData.teacherId}</Typography>
          <Typography><b>Name:</b> {teacherData.firstName} {teacherData.lastName}</Typography>
          <Typography><b>Email:</b> {teacherData.email}</Typography>
          <Typography><b>Contact:</b> {teacherData.contactNumber}</Typography>
          <Typography><b>College:</b> {teacherData.collegeName}</Typography>
          <Typography><b>Department:</b> {teacherData.departmentName}</Typography>
          <Typography><b>Program:</b> {teacherData.programName}</Typography>
          <Typography><b>College Associate:</b> {teacherData.isCollegeAssociate ? 'Yes' : 'No'}</Typography>
          <Typography sx={{ mt: 2 }}><b>Subjects:</b></Typography>
          {teacherData.subjects.map((s, idx) => (
            <Typography key={idx}>&bull; Semester {s.semester} - {s.subjectName}</Typography>
          ))}
        </DialogContent>
      </Dialog>
    </section>
  );
}

export default AddTeacher;