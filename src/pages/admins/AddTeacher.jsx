/* eslint-disable no-unused-vars */
import React, { useState, useContext } from "react";
import {
  Box,
  Card,
  Typography,
  TextField,
  Button,
  Stack,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  CircularProgress,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  Snackbar,
  Slide,
  useTheme,
} from "@mui/material";
import AddCircleIcon from "@mui/icons-material/AddCircle";
import RemoveCircleIcon from "@mui/icons-material/RemoveCircle";
import VisibilityIcon from "@mui/icons-material/Visibility";
import PreviewIcon from "@mui/icons-material/Preview";
import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { secondaryAuth } from "../../firebase/Firebase";
import { doc, setDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { v4 as uuidv4 } from "uuid";
import { toast } from "react-toastify";
import { ThemeContext } from "../../context/ThemeContext";
import { db, storage } from "../../firebase/Firebase";
import { color } from "framer-motion";

function SlideTransition(props) {
  return <Slide {...props} direction="left" />;
}

function AddTeacher() {
  const { mode } = useContext(ThemeContext);
  const theme = useTheme();

  const [teacherData, setTeacherData] = useState({
    teacherId: "",
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    contactNumber: "",
    department: "",
    college: "",
    profilePic: null,
    subjects: [{ semester: "", subjectName: "" }],
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

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setTeacherData((prev) => ({ ...prev, [name]: value }));
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
          `profile_pictures/${uuidv4()}_${file.name}`
        );
        await uploadBytes(profilePicRef, file);
        const downloadURL = await getDownloadURL(profilePicRef);
        setProfilePicUrl(downloadURL);
        setImageUploaded(true);
        toast.success("Profile picture uploaded successfully.");
      } catch (_error) {
        toast.error("Failed to upload profile picture.");
      }
    }
  };

  const handleSubjectChange = (index, field, value) => {
    const updatedSubjects = [...teacherData.subjects];
    updatedSubjects[index][field] = value;
    setTeacherData((prev) => ({ ...prev, subjects: updatedSubjects }));
  };

  const addSubject = () => {
    setTeacherData((prev) => ({
      ...prev,
      subjects: [...prev.subjects, { semester: "", subjectName: "" }],
    }));
  };

  const removeSubject = (index) => {
    const updatedSubjects = teacherData.subjects.filter((_, i) => i !== index);
    setTeacherData((prev) => ({ ...prev, subjects: updatedSubjects }));
  };

  const validateForm = () => {
    const newErrors = {};
    let valid = true;

    if (!teacherData.teacherId || !/^\d{8}$/.test(teacherData.teacherId)) {
      newErrors.teacherId = "Teacher ID must be exactly 8 digits.";
      valid = false;
    }
    if (!teacherData.firstName) {
      newErrors.firstName = "Required";
      valid = false;
    }
    if (!teacherData.lastName) {
      newErrors.lastName = "Required";
      valid = false;
    }
    if (!teacherData.email) {
      newErrors.email = "Required";
      valid = false;
    }
    if (!teacherData.password) {
      newErrors.password = "Required";
      valid = false;
    }
    if (!teacherData.contactNumber) {
      newErrors.contactNumber = "Required";
      valid = false;
    }
    if (!teacherData.department) {
      newErrors.department = "Required";
      valid = false;
    }
    if (!teacherData.college) {
      newErrors.college = "Required";
      valid = false;
    }

    teacherData.subjects.forEach((subject, i) => {
      if (!subject.semester) {
        newErrors[`subjectSemester${i}`] = "Required";
        valid = false;
      }
      if (!subject.subjectName) {
        newErrors[`subjectName${i}`] = "Required";
        valid = false;
      }
    });

    setErrors(newErrors);
    return valid;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setLoading(true);

    try {
      // Create teacher with secondaryAuth to keep admin logged in
      const userCredential = await createUserWithEmailAndPassword(
        secondaryAuth,
        teacherData.email,
        teacherData.password
      );
      const user = userCredential.user;

      // Sign out from the secondary auth session
      await signOut(secondaryAuth);

      // Save teacher data in Firestore
      const newTeacher = {
        teacherId: teacherData.teacherId,
        firstName: teacherData.firstName,
        lastName: teacherData.lastName,
        email: teacherData.email,
        contactNumber: Number(teacherData.contactNumber),
        department: teacherData.department,
        college: teacherData.college,
        profilePicUrl: profilePicUrl || "",
        role: "Teacher",
        subjects: teacherData.subjects.map((s) => ({
          semester: Number(s.semester),
          subjectName: s.subjectName,
        })),
        uid: user.uid,
      };

      await setDoc(doc(db, "Teachers", user.uid), newTeacher);
      toast.success("Teacher created successfully!");
      setTeacherCreated(true);
      setSnackbarOpen(true);
    } catch (_error) {
      toast.error("Error adding teacher.");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setTeacherData({
      teacherId: "",
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      contactNumber: "",
      department: "",
      college: "",
      profilePic: null,
      subjects: [{ semester: "", subjectName: "" }],
    });
    setProfilePicUrl("");
    setProfilePicPreview(null);
    setImageUploaded(false);
    setTeacherCreated(false);
  };

  return (
    <section
      style={{
        background:
          mode === "default"
            ? `linear-gradient(135deg, ${theme.palette.red.main}-25%, ${theme.palette.red.focus} 100%)`
            : theme.palette.background.default,
      }}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          minHeight: "100vh",
          p: 2,
        }}
      >
        <Card sx={{ width: "100%", maxWidth: 950, p: 4, borderRadius: 3 }}>
          <Typography
            variant="h4"
            align="center"
            fontWeight={"bold"}
            gutterBottom
          >
            Add New Teacher
          </Typography>

          <Box component="form" onSubmit={handleSubmit}>
            {/* Row 1 */}
            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={2}
              sx={{ mb: 2 }}
            >
              <TextField
                label="First Name"
                name="firstName"
                value={teacherData.firstName}
                onChange={handleInputChange}
                error={!!errors.firstName}
                helperText={errors.firstName}
                fullWidth
              />
              <TextField
                label="Last Name"
                name="lastName"
                value={teacherData.lastName}
                onChange={handleInputChange}
                error={!!errors.lastName}
                helperText={errors.lastName}
                fullWidth
              />
            </Stack>

            {/* Row 2 */}
            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={2}
              sx={{ mb: 2 }}
            >
              <TextField
                label="Email"
                name="email"
                value={teacherData.email}
                onChange={handleInputChange}
                error={!!errors.email}
                helperText={errors.email}
                fullWidth
              />
              <TextField
                label="Password"
                name="password"
                type="password"
                value={teacherData.password}
                onChange={handleInputChange}
                error={!!errors.password}
                helperText={errors.password}
                fullWidth
              />
            </Stack>

            {/* Row 3 */}
            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={2}
              sx={{ mb: 2 }}
            >
              <TextField
                label="Teacher ID"
                name="teacherId"
                value={teacherData.teacherId}
                onChange={handleInputChange}
                error={!!errors.teacherId}
                helperText={errors.teacherId}
                fullWidth
              />
              <TextField
                label="Contact Number"
                name="contactNumber"
                value={teacherData.contactNumber}
                onChange={handleInputChange}
                error={!!errors.contactNumber}
                helperText={errors.contactNumber}
                fullWidth
              />
            </Stack>

            {/* Row 4 */}
            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={2}
              sx={{ mb: 2 }}
            >
              <FormControl fullWidth error={!!errors.department}>
                <InputLabel>Department</InputLabel>
                <Select
                  name="department"
                  value={teacherData.department}
                  label="Department"
                  onChange={handleInputChange}
                >
                  <MenuItem value="" disabled>
                    Select Department
                  </MenuItem>
                  <MenuItem value="Diploma in Computer Science">
                    Diploma in Computer Science
                  </MenuItem>
                  <MenuItem value="BTech in CS">BTech in CS</MenuItem>
                </Select>
              </FormControl>

              <FormControl fullWidth error={!!errors.college}>
                <InputLabel>College</InputLabel>
                <Select
                  name="college"
                  value={teacherData.college}
                  label="College"
                  onChange={handleInputChange}
                >
                  <MenuItem value="" disabled>
                    Select College
                  </MenuItem>
                  <MenuItem value="College of Engineering">
                    College of Engineering
                  </MenuItem>
                  <MenuItem value="College of Arts">College of Arts</MenuItem>
                </Select>
              </FormControl>
            </Stack>

            <Stack
              direction="row"
              spacing={2}
              sx={{ mb: 2, alignItems: "center" }}
            >
              <Button
                variant="contained"
                component="label"
                sx={{
                  backgroundColor: theme.palette.green.focus,
                  color: theme.palette.contrastText,
                  "&:hover": { backgroundColor: theme.palette.red.hover },
                }}
              >
                Upload Picture
                <input
                  type="file"
                  hidden
                  accept="image/*"
                  onChange={handleProfilePicChange}
                />
              </Button>
              {imageUploaded && (
                <IconButton onClick={() => setPreviewOpen(true)} color="success">
                  <VisibilityIcon />
                </IconButton>
              )}
            </Stack>

            {/* Preview Picture Dialog */}
            <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)}>
              <DialogContent>
                <Box
                  component="img"
                  src={profilePicPreview}
                  sx={{ maxWidth: 400 }}
                />
              </DialogContent>
            </Dialog>

            <Divider sx={{ my: 2 }} />

            {teacherData.subjects.map((subject, idx) => (
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={2}
                key={idx}
                sx={{ mb: 2 }}
              >
                <FormControl fullWidth error={!!errors[`subjectSemester${idx}`]}>
                  <InputLabel>Semester</InputLabel>
                  <Select
                    value={subject.semester}
                    label="Semester"
                    onChange={(e) =>
                      handleSubjectChange(idx, "semester", e.target.value)
                    }
                  >
                    <MenuItem value="" disabled>
                      Select Semester
                    </MenuItem>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
                      <MenuItem key={sem} value={sem}>
                        {sem}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  label="Subject Name"
                  fullWidth
                  value={subject.subjectName}
                  onChange={(e) =>
                    handleSubjectChange(idx, "subjectName", e.target.value)
                  }
                  error={!!errors[`subjectName${idx}`]}
                  helperText={errors[`subjectName${idx}`]}
                />
                {teacherData.subjects.length > 1 && (
                  <IconButton color="error" onClick={() => removeSubject(idx)}>
                    <RemoveCircleIcon />
                  </IconButton>
                )}
              </Stack>
            ))}

            <Button
              startIcon={<AddCircleIcon />}
              sx={{
                mb: 2,
                backgroundColor: theme.palette.green.focus,
                color: theme.palette.contrastText,
                "&:hover": { backgroundColor: theme.palette.red.hover },
              }}
              onClick={addSubject}
            >
              Add Subject
            </Button>

            {/* Action Buttons */}
            {teacherCreated ? (
              <Stack direction="row" spacing={2}>
                <Button
                  variant="contained"
                  onClick={resetForm}
                  fullWidth
                  sx={{
                    backgroundColor: theme.palette.green.main,
                    color: theme.palette.contrastText,
                    "&:hover": { backgroundColor: theme.palette.red.hover },
                  }}
                >
                  Add Another Teacher
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<PreviewIcon />}
                  onClick={() => setProfileDialogOpen(true)}
                  fullWidth
                >
                  Preview Profile
                </Button>
              </Stack>
            ) : (
              <Button
                variant="contained"
                type="submit"
                disabled={loading}
                fullWidth
                sx={{
                  backgroundColor: theme.palette.green.focus,
                  color: theme.palette.contrastText,
                  "&:hover": { backgroundColor: theme.palette.red.hover },
                }}
              >
                {loading ? <CircularProgress size={20} /> : "Add Teacher"}
              </Button>
            )}
          </Box>
        </Card>
      </Box>

      {/* notification bar */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        message="Teacher Created Successfully!"
        TransitionComponent={SlideTransition}
        elevation={6}      
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
        sx={{ 
          borderRadius: '12px',
          boxShadow: '0 5px 15px rgba(0,0,0,0.2)'
        }}
      />
   
      {/* Profile Detail show div */}
      <Dialog
        open={profileDialogOpen}
        onClose={() => setProfileDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        sx={{backdropFilter: 'blur(2px)',
        }}
      >
        <DialogTitle>Teacher Profile</DialogTitle>
        <DialogContent dividers>
          <Box textAlign="center" mb={2}>
            {profilePicUrl && (
              <Box
                component="img"
                src={profilePicUrl}
                sx={{ borderRadius: "50%", width: 120, height: 120 }}
              />
            )}
          </Box>
          <Typography>
            <b>ID:</b> {teacherData.teacherId}
          </Typography>
          <Typography>
            <b>Name:</b> {teacherData.firstName} {teacherData.lastName}
          </Typography>
          <Typography>
            <b>Email:</b> {teacherData.email}
          </Typography>
          <Typography>
            <b>Contact:</b> {teacherData.contactNumber}
          </Typography>
          <Typography>
            <b>Department:</b> {teacherData.department}
          </Typography>
          <Typography>
            <b>College:</b> {teacherData.college}
          </Typography>
          <Typography sx={{ mt: 2 }}>
            <b>Subjects:</b>
          </Typography>
          {teacherData.subjects.map((s, idx) => (
            <Typography key={idx}>
              Sem {s.semester} - {s.subjectName}
            </Typography>
          ))}
        </DialogContent>
      </Dialog>
    </section>
  );
}

export default AddTeacher;