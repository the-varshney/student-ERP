/* eslint-disable no-unused-vars */
import React, { useContext, useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { createUserWithEmailAndPassword, onAuthStateChanged } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  Box, Card, Typography, TextField, Button, Stack,
  FormControl, InputLabel, Select, MenuItem, IconButton,
  Dialog, DialogContent, useTheme, Alert, FormHelperText
} from "@mui/material";
import VisibilityIcon from "@mui/icons-material/Visibility";
import { LocalizationProvider, DatePicker } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";
import { auth, db, storage } from "../../firebase/Firebase";
import { ThemeContext } from "../../context/ThemeContext";
import axios from "axios";
import AuthContext from "../../context/AuthContext";

function Register() {
  const { mode } = useContext(ThemeContext);
  const theme = useTheme();
  const navigate = useNavigate();

  // Form state
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [displayPhone, setDisplayPhone] = useState(""); 
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState(dayjs());
  const [abcId, setAbcId] = useState("");
  const [profilePicUrl, setProfilePicUrl] = useState("");
  const [profilePicPreview, setProfilePicPreview] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [gender, setGender] = useState("");
  const [college, setCollege] = useState("");

  const [message, setMessage] = useState(null);
  const [messageType, setMessageType] = useState("");
  const [errors, setErrors] = useState({});
  const { role, loading } = useContext(AuthContext);


  const [collegesList, setCollegesList] = useState([]);

  // Refs for field navigation
  const firstNameRef = useRef(null);
  const lastNameRef = useRef(null);
  const dobRef = useRef(null);
  const genderRef = useRef(null);
  const collegeRef = useRef(null);
  const phoneRef = useRef(null);
  const abcIdRef = useRef(null);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const confirmPasswordRef = useRef(null);

  // Error timeout refs
  const errorTimeouts = useRef({});

  // If already authenticated, redirect to home
  useEffect(() => {
    if (!loading && role) {
      if (role === "unverified") {
        navigate("/message");
      } else if (role=== "verified"){
        navigate("/message")
      } else if (role === "Admin") {
        navigate("/admin/home");
      } else if (role === "Teacher") {
        navigate("/teacher/home");
      } else if (role === "Student") {
        navigate("/home");
      }
    }
  }, [role, loading, navigate]);

  // Clear error timeouts on unmount
  useEffect(() => {
    return () => {
      Object.values(errorTimeouts.current).forEach((timeout) => {
        if (timeout) clearTimeout(timeout);
      });
    };
  }, []);

  // Set error with auto-clear after 10 seconds
  const setFieldError = (field, errorMessage) => {
    setErrors((prev) => ({ ...prev, [field]: errorMessage }));

    // Clear existing timeout for this field
    if (errorTimeouts.current[field]) {
      clearTimeout(errorTimeouts.current[field]);
    }

    // Set new timeout to clear error after 10 seconds
    errorTimeouts.current[field] = setTimeout(() => {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
      delete errorTimeouts.current[field];
    }, 10000);
  };

  // Clear specific field error
  const clearFieldError = (field) => {
    if (errorTimeouts.current[field]) {
      clearTimeout(errorTimeouts.current[field]);
      delete errorTimeouts.current[field];
    }
    setErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[field];
      return newErrors;
    });
  };

  // Validation functions
  const validateName = (name, fieldName) => {
    if (!name.trim()) {
      setFieldError(
        fieldName,
        `${fieldName === "firstName" ? "First" : "Last"} name is required`
      );
      return false;
    }
    if (/[^a-zA-Z\s]/.test(name)) {
      setFieldError(
        fieldName,
        `${fieldName === "firstName" ? "First" : "Last"} name can only contain letters and spaces`
      );
      return false;
    }
    if (name.trim().length < 2) {
      setFieldError(
        fieldName,
        `${fieldName === "firstName" ? "First" : "Last"} name must be at least 2 characters long`
      );
      return false;
    }
    clearFieldError(fieldName);
    return true;
  };

  const validateDOB = (dateOfBirth) => {
    if (!dateOfBirth) {
      setFieldError("dob", "Date of birth is required");
      return false;
    }

    const today = dayjs();
    const birthDate = dayjs(dateOfBirth);
    const age = today.diff(birthDate, "year");

    if (age < 16) {
      setFieldError("dob", "You must be at least 16 years old to register");
      return false;
    }
    if (age > 100) {
      setFieldError("dob", "Please enter a valid date of birth");
      return false;
    }

    clearFieldError("dob");
    return true;
  };

  const validateGender = (selectedGender) => {
    if (!selectedGender) {
      setFieldError("gender", "Please select your gender");
      return false;
    }
    clearFieldError("gender");
    return true;
  };

  const validateCollege = (selectedCollege) => {
    if (!selectedCollege) {
      setFieldError("college", "Please select your college");
      return false;
    }
    clearFieldError("college");
    return true;
  };

  const validatePhone = (phoneNumber) => {
    const cleanPhone = phoneNumber.replace(/[^0-9]/g, "");
    if (!cleanPhone) {
      setFieldError("phone", "Phone number is required");
      return false;
    }
    if (!/^\d{10}$/.test(cleanPhone)) {
      setFieldError("phone", "Phone number must be exactly 10 digits");
      return false;
    }
    clearFieldError("phone");
    return true;
  };

  const validateAbcId = (id) => {
    if (!id.trim()) {
      setFieldError("abcId", "ABC ID is required");
      return false;
    }
    if (!/^[a-zA-Z0-9]{12}$/.test(id)) {
      setFieldError("abcId", "ABC ID must be exactly 12 alphanumeric characters");
      return false;
    }
    clearFieldError("abcId");
    return true;
  };

  const validateEmail = (emailAddress) => {
    if (!emailAddress.trim()) {
      setFieldError("email", "Email address is required");
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailAddress)) {
      setFieldError("email", "Please enter a valid email address");
      return false;
    }
    clearFieldError("email");
    return true;
  };

  const validatePassword = (pwd) => {
    if (!pwd) {
      setFieldError("password", "Password is required");
      return false;
    }
    if (pwd.length < 8) {
      setFieldError("password", "Password must be at least 8 characters long");
      return false;
    }
    if (!/(?=.*[a-zA-Z])/.test(pwd)) {
      setFieldError("password", "Password must contain at least one letter");
      return false;
    }
    if (!/(?=.*\d)/.test(pwd)) {
      setFieldError("password", "Password must contain at least one number");
      return false;
    }
    clearFieldError("password");
    return true;
  };

  const validateConfirmPassword = (confirmPwd) => {
    if (!confirmPwd) {
      setFieldError("confirmPassword", "Please confirm your password");
      return false;
    }
    if (confirmPwd !== password) {
      setFieldError("confirmPassword", "Passwords do not match");
      return false;
    }
    clearFieldError("confirmPassword");
    return true;
  };

  // Handle field changes with validation
  const handleFirstNameChange = (e) => {
    const value = e.target.value;
    setFirstName(value);
    if (value.trim()) validateName(value, "firstName");
  };

  const handleLastNameChange = (e) => {
    const value = e.target.value;
    setLastName(value);
    if (value.trim()) validateName(value, "lastName");
  };

  const handleDOBChange = (newValue) => {
    setDob(newValue);
    if (newValue) validateDOB(newValue);
  };

  const handleGenderChange = (e) => {
    const value = e.target.value;
    setGender(value);
    validateGender(value);
    //Focus College after selection
    setTimeout(() => collegeRef.current && collegeRef.current.focus(), 0);
  };

  const handleCollegeChange = (e) => {
    const value = e.target.value;
    setCollege(value);
    validateCollege(value);
    // Focus Phone after selection
    setTimeout(() => phoneRef.current && phoneRef.current.focus(), 0);
  };

  const handlePhoneChange = (e) => {
    let value = e.target.value.replace(/[^0-9]/g, "");
    if (value.length <= 10) {
      setPhone(value);
      // Format for display
      if (value.length > 5) {
        setDisplayPhone(value.slice(0, 5) + "-" + value.slice(5));
      } else {
        setDisplayPhone(value);
      }
      if (value.length > 0) validatePhone(value);
    }
  };

  const handleAbcIdChange = (e) => {
    const value = e.target.value;
    if (value.length <= 12) {
      setAbcId(value);
      if (value.trim()) validateAbcId(value);
    }
  };

  const handleEmailChange = (e) => {
    const value = e.target.value;
    setEmail(value);
    if (value.trim()) validateEmail(value);
  };

  const handlePasswordChange = (e) => {
    const value = e.target.value;
    setPassword(value);
    if (value) {
      validatePassword(value);
      if (confirmPassword) validateConfirmPassword(confirmPassword);
    }
  };

  const handleConfirmPasswordChange = (e) => {
    const value = e.target.value;
    setConfirmPassword(value);
    if (value) validateConfirmPassword(value);
  };

  // Handle Enter key handling
  const handleKeyDown = (e, nextRef) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (nextRef && nextRef.current) {
        nextRef.current.focus();
      } else if (!nextRef) {
        handleRegister(e);
      }
    }
  };

  // Upload profile picture
  const handleProfilePicUpload = async (file) => {
    const profilePicRef = ref(
      storage,
      `profile_pictures/${Date.now()}_${file.name}`
    );
    await uploadBytes(profilePicRef, file);
    return await getDownloadURL(profilePicRef);
  };

  const handleProfilePicChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 250 * 1024) {
        setMessage("Image size should be under 250KB.");
        setMessageType("error");
        return;
      }
      if (!["image/jpeg", "image/png", "image/jpg"].includes(file.type)) {
        setMessage("Only JPEG, JPG, PNG allowed.");
        setMessageType("error");
        return;
      }
      try {
        const url = await handleProfilePicUpload(file);
        setProfilePicUrl(url);
        setProfilePicPreview(URL.createObjectURL(file));
        setMessage("Profile picture uploaded successfully.");
        setMessageType("success");
      } catch (error) {
        setMessage("Failed to upload profile picture.");
        setMessageType("error");
      }
    }
  };

  // Complete validation before submission
  const validateAllFields = () => {
    const isFirstNameValid = validateName(firstName, "firstName");
    const isLastNameValid = validateName(lastName, "lastName");
    const isDOBValid = validateDOB(dob);
    const isGenderValid = validateGender(gender);
    const isCollegeValid = validateCollege(college);
    const isPhoneValid = validatePhone(phone);
    const isAbcIdValid = validateAbcId(abcId);
    const isEmailValid = validateEmail(email);
    const isPasswordValid = validatePassword(password);
    const isConfirmPasswordValid = validateConfirmPassword(confirmPassword);

    return (
      isFirstNameValid &&
      isLastNameValid &&
      isDOBValid &&
      isGenderValid &&
      isCollegeValid &&
      isPhoneValid &&
      isAbcIdValid &&
      isEmailValid &&
      isPasswordValid &&
      isConfirmPasswordValid
    );
  };

  useEffect(() => {
    const BASE_URL = import.meta.env.VITE_API_BASE_URL; 
    const fetchColleges = async () => {
      try {
        const res = await axios.get(`${BASE_URL}/api/colleges`);
        setCollegesList(res.data);
      } catch (err) {
        console.error("Failed to fetch colleges:", err);
      }
    };
    fetchColleges();
  }, []);

  // Submit registration
  const handleRegister = async (e) => {
    e.preventDefault();
    setMessage(null);
    setMessageType("");

    if (!validateAllFields()) {
      setMessage("Please correct the errors in the form before submitting.");
      setMessageType("error");
      return;
    }

    try {
      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      const selectedCollege = collegesList.find((c) => c._id === college);
      await setDoc(doc(db, "Students", user.uid), {
        firebaseId: user.uid,
        email,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        dob: dob.format("DD/MM/YYYY"),
        abcId,
        profilePicUrl,
        gender,
        collegeId: selectedCollege?._id || null,
        collegeName: selectedCollege?.name || null,
        phone,
        role: "unverified",
      });
      setMessage("Registration submitted successfully. Please await verification.");
      setMessageType("success");
      setTimeout(() => navigate("/message"), 2000);
    } catch (err) {
      let errorMessage = "Registration failed. Please try again.";
      if (err.code === "auth/email-already-in-use") {
        errorMessage = "This email address is already registered.";
      } else if (err.code === "auth/weak-password") {
        errorMessage = "Password is too weak. Please choose a stronger password.";
      } else if (err.code === "auth/invalid-email") {
        errorMessage = "Please enter a valid email address.";
      }
      setMessage(errorMessage);
      setMessageType("error");
    }
  };

  return (
    <section
      style={{
        background:
          mode === "default"
            ? "linear-gradient(135deg, hsl(220, 100%, 71%) 0%, hsla(265, 100%, 70%, 0.28) 100%)"
            : "hsl(219, 100%, 93.90%)",
      }}
    >
      <Box sx={{ display: "flex", justifyContent: "center", minHeight: "100vh", p: 2 }}>
        <Card sx={{ width: "100%", maxWidth: 950, p: 4, borderRadius: 3 }}>
          <Typography variant="h4" align="center" fontWeight="bold" gutterBottom>
            Student Registration
          </Typography>

          {message && <Alert severity={messageType} sx={{ mb: 2 }}>{message}</Alert>}

          <Box component="form" onSubmit={handleRegister}>
            {/* Row 1: Name Fields */}
            <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mb: 2 }}>
              <TextField
                inputRef={firstNameRef}
                label="First Name"
                fullWidth
                value={firstName}
                onChange={handleFirstNameChange}
                onKeyDown={(e) => handleKeyDown(e, lastNameRef)}
                error={!!errors.firstName}
                helperText={errors.firstName}
                inputProps={{ maxLength: 50 }}
              />
              <TextField
                inputRef={lastNameRef}
                label="Last Name"
                fullWidth
                value={lastName}
                onChange={handleLastNameChange}
                onKeyDown={(e) => handleKeyDown(e, dobRef)}
                error={!!errors.lastName}
                helperText={errors.lastName}
                inputProps={{ maxLength: 50 }}
              />
            </Stack>

            {/* Row 2: DOB and Gender */}
            <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mb: 2 }}>
              <LocalizationProvider dateAdapter={AdapterDayjs}>
                <DatePicker
                  label="Date of Birth"
                  value={dob}
                  onChange={handleDOBChange}
                  format="DD/MM/YYYY"
                  disableFuture
                  maxDate={dayjs().subtract(16, "year")}
                  slotProps={{
                    textField: {
                      fullWidth: true,
                      error: !!errors.dob,
                      helperText: errors.dob,
                      inputRef: dobRef,
                      onKeyDown: (e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          genderRef.current?.focus();
                        }
                      },
                    },
                  }}
                />
              </LocalizationProvider>
              <FormControl fullWidth error={!!errors.gender}>
                <InputLabel>Gender</InputLabel>
                <Select
                  inputRef={genderRef}
                  value={gender}
                  onChange={handleGenderChange}
                  label="Gender"
                >
                  <MenuItem value="">Select Gender</MenuItem>
                  <MenuItem value="Male">Male</MenuItem>
                  <MenuItem value="Female">Female</MenuItem>
                  <MenuItem value="Other">Other</MenuItem>
                </Select>
                {errors.gender && <FormHelperText>{errors.gender}</FormHelperText>}
              </FormControl>
            </Stack>
=
            <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mb: 2 }}>
              <FormControl fullWidth error={!!errors.college}>
                <InputLabel>College</InputLabel>
                <Select
                  inputRef={collegeRef}
                  value={college}
                  label="College"
                  onChange={handleCollegeChange}
                >
                  <MenuItem value="">Select College</MenuItem>
                  {collegesList.map((col) => (
                    <MenuItem key={col._id} value={col._id}>
                      {col.name} - {col.address}
                  </MenuItem>
                  ))}
                </Select>
                {errors.college && <FormHelperText>{errors.college}</FormHelperText>}
              </FormControl>
              <TextField
                inputRef={phoneRef}
                label="Phone Number"
                fullWidth
                value={displayPhone}
                onChange={handlePhoneChange}
                onKeyDown={(e) => handleKeyDown(e, abcIdRef)}
                error={!!errors.phone}
                helperText={errors.phone}
                placeholder="12345-67890"
                inputProps={{ inputMode: "numeric" }}
              />
            </Stack>

            {/* Row 4: */}
            <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mb: 2 }}>
              <TextField
                inputRef={abcIdRef}
                label="ABC ID"
                fullWidth
                value={abcId}
                onChange={handleAbcIdChange}
                onKeyDown={(e) => handleKeyDown(e, emailRef)}
                error={!!errors.abcId}
                helperText={errors.abcId}
                placeholder="12 alphanumeric characters"
                inputProps={{ maxLength: 12 }}
              />
              <Button variant="contained" component="label" fullWidth>
                Upload Picture
                <input
                  type="file"
                  hidden
                  accept="image/*"
                  onChange={handleProfilePicChange}
                />
              </Button>
              {profilePicUrl && (
                <IconButton onClick={() => setPreviewOpen(true)} color="success">
                  <VisibilityIcon />
                </IconButton>
              )}
            </Stack>

            {/* Preview dialog */}
            <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)}>
              <DialogContent>
                {profilePicPreview && (
                  <Box
                    component="img"
                    src={profilePicPreview}
                    sx={{ maxWidth: 400, height: "auto" }}
                  />
                )}
              </DialogContent>
            </Dialog>

            {/* Row 5: Email */}
            <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mb: 2 }}>
              <TextField
                inputRef={emailRef}
                label="Email Address"
                type="email"
                fullWidth
                value={email}
                onChange={handleEmailChange}
                onKeyDown={(e) => handleKeyDown(e, passwordRef)}
                error={!!errors.email}
                helperText={errors.email}
                inputProps={{ maxLength: 100 }}
              />
            </Stack>

            {/* Row 6: Password Fields */}
            <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mb: 2 }}>
              <TextField
                inputRef={passwordRef}
                label="Password"
                type="password"
                fullWidth
                value={password}
                onChange={handlePasswordChange}
                onKeyDown={(e) => handleKeyDown(e, confirmPasswordRef)}
                error={!!errors.password}
                helperText={errors.password}
                inputProps={{ maxLength: 128 }}
              />
              <TextField
                inputRef={confirmPasswordRef}
                label="Confirm Password"
                type="password"
                fullWidth
                value={confirmPassword}
                onChange={handleConfirmPasswordChange}
                onKeyDown={(e) => handleKeyDown(e, null)} // Last field
                error={!!errors.confirmPassword}
                helperText={errors.confirmPassword}
                inputProps={{ maxLength: 128 }}
              />
            </Stack>

            <Button
              variant="contained"
              type="submit"
              fullWidth
              size="large"
              sx={{ mt: 2, py: 1.5 }}
            >
              Register
            </Button>
          </Box>
        </Card>
      </Box>
    </section>
  );
}

export default Register;
