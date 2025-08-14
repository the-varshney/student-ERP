import React, { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createUserWithEmailAndPassword, onAuthStateChanged } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { TextField, Button, Typography, Box, Alert, Stack, Card } from "@mui/material";
import { LocalizationProvider, DatePicker } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";
import { auth, db, storage } from "../../firebase/Firebase"; 
import { ThemeContext } from "../../context/ThemeContext";


function Register() {
  const { mode } = useContext(ThemeContext);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState(dayjs());
  const [enrollmentNo, setEnrollmentNo] = useState("");
  const [abcId, setAbcId] = useState("");
  const [profilePicUrl, setProfilePicUrl] = useState("");
  const [message, setMessage] = useState(null);
  const [messageType, setMessageType] = useState("");
  const [errors, setErrors] = useState({});
  const navigate = useNavigate();

  // Redirect authenticated users to '/home'
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        navigate("/home");
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  const handleProfilePicUpload = async (file) => {
    try {
      const profilePicRef = ref(storage, `profile_pictures/${file.name}`);
      await uploadBytes(profilePicRef, file);
      const downloadURL = await getDownloadURL(profilePicRef);
      setProfilePicUrl(downloadURL);
      setMessage("Profile picture uploaded successfully.");
      setMessageType("success");
    } catch (error) {
      console.error("Error uploading profile picture:", error);
      setMessage("Failed to upload profile picture.");
      setMessageType("error");
    }
  };

  const handleProfilePicChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 250 * 1024) {
        setMessage("Image size should be under 250KB.");
        setMessageType("error");
        return;
      }
      const validFormats = ["image/jpeg", "image/png", "image/jpg"];
      if (!validFormats.includes(file.type)) {
        setMessage("Only JPEG, JPG, and PNG formats are allowed.");
        setMessageType("error");
        return;
      }
      setMessage(null);
      await handleProfilePicUpload(file);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setMessage(null);
    const newErrors = {};
    let formIsValid = true;

    if (!firstName) {
      newErrors.firstName = "First Name is required.";
      formIsValid = false;
    } else if (!/^[a-zA-Z]+$/.test(firstName)) {
      newErrors.firstName = "First Name must contain only letters.";
      formIsValid = false;
    }

    if (!lastName) {
      newErrors.lastName = "Last Name is required.";
      formIsValid = false;
    } else if (!/^[a-zA-Z]+$/.test(lastName)) {
      newErrors.lastName = "Last Name must contain only letters.";
      formIsValid = false;
    }

    if (!email) {
      newErrors.email = "Email is required.";
      formIsValid = false;
    }

    if (!password) {
      newErrors.password = "Password is required.";
      formIsValid = false;
    }

    if (!confirmPassword) {
      newErrors.confirmPassword = "Please confirm your password.";
      formIsValid = false;
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match.";
      formIsValid = false;
    }

    if (!dob) {
      newErrors.dob = "Date of Birth is required.";
      formIsValid = false;
    } else {
      const dobDate = new Date(dob);
      const age = new Date().getFullYear() - dobDate.getFullYear();
      const monthDiff = new Date().getMonth() - dobDate.getMonth();
      const dayDiff = new Date().getDate() - dobDate.getDate();
      if (age < 16 || (age === 15 && monthDiff < 0) || (age === 15 && monthDiff === 0 && dayDiff < 0)) {
        newErrors.dob = "Minimum age is 16 years.";
        formIsValid = false;
      }
    }

    if (!enrollmentNo) {
      newErrors.enrollmentNo = "Enrollment Number is required.";
      formIsValid = false;
    } else if (!/^\d{8}$/.test(enrollmentNo)) {
      newErrors.enrollmentNo = "Enrollment Number must be an 8-digit integer.";
      formIsValid = false;
    }

    if (!abcId) {
      newErrors.abcId = "ABC ID is required.";
      formIsValid = false;
    } else if (!/^[a-zA-Z0-9]{12}$/.test(abcId)) {
      newErrors.abcId = "ABC ID must be 12 alphanumeric characters.";
      formIsValid = false;
    }

    setErrors(newErrors);
    if (!formIsValid) {
      setMessage("Please correct the highlighted errors.");
      setMessageType("error");
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await setDoc(doc(db, "Students", user.uid), {
        email: user.email,
        firstName,
        lastName,
        dob: dob.format("DD/MM/YYYY"),
        enrollmentNo,
        abcId,
        profilePicUrl,
        role: "Student"
      });

      setMessage("Registration successful! Redirecting...");
      setMessageType("success");
      setTimeout(() => navigate("/home"), 2500);
    } catch (error) {
      let errorMessage = "Registration failed!";
      if (error.code === "auth/email-already-in-use") {
        errorMessage = "Email already in use!";
      } else if (error.code === "auth/weak-password") {
        errorMessage = "Password is too weak!";
      }
      console.error("Registration error:", error);
      setMessage(errorMessage);
      setMessageType("error");
    }
  };

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 1500);
      return () => clearTimeout(timer);
    }
  }, [message]);

  return (
    <section
      className="hero is-fullheight"
      style={{
        background:
          mode === "default"
            ? "linear-gradient(135deg, hsl(220, 100%, 71%) 0%, hsla(265, 100%, 70%, 0.28) 100%)"
            : "hsl(219, 100%, 93.90%)",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          pl: 4, // slight shift to right
          pt: 4, // slight shift down
          flexDirection: "column",
        }}
      >
  
        <Card
          sx={{
            maxWidth: 500,
            width: "100%",
            p: 4,
            borderRadius: 3,
            bgcolor: "rgba(255, 255, 255, 0.85)",
            backdropFilter: "blur(20px)",
            boxShadow:
              messageType === "error"
                ? "0px 0px 10px red"
                : "0px 12px 40px rgba(19, 24, 85, 0.37)",
            border:
              messageType === "error" ? "2px solid red" : "1px solid purple",
          }}
        >
          {message && (
            <Alert severity={messageType} sx={{ mb: 2 }}>
              {message}
            </Alert>
          )}
  
          <Typography variant="h4" align="center" gutterBottom className="text-blue-900">
            Register
          </Typography>
  
          <Box component="form" onSubmit={handleRegister} noValidate sx={{ mt: 1 }}>
            <Stack spacing={2}>
              <TextField
                label="First Name"
                variant="outlined"
                fullWidth
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                error={!!errors.firstName}
                helperText={errors.firstName}
                className="bg-white"
              />
  
              <TextField
                label="Last Name"
                variant="outlined"
                fullWidth
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                error={!!errors.lastName}
                helperText={errors.lastName}
                className="bg-white"
              />
  
              <LocalizationProvider dateAdapter={AdapterDayjs}>
                <DatePicker
                  label="Date of Birth"
                  value={dob}
                  onChange={(newValue) => setDob(newValue)}
                  format="DD/MM/YYYY"
                  disableFuture
                  slotProps={{
                    textField: {
                      fullWidth: true,
                      variant: "outlined",
                      required: true,
                      error: !!errors.dob,
                      helperText: errors.dob,
                      className: "bg-white",
                    },
                  }}
                />
              </LocalizationProvider>
  
              <TextField
                label="Enrollment Number"
                variant="outlined"
                fullWidth
                value={enrollmentNo}
                onChange={(e) => setEnrollmentNo(e.target.value)}
                error={!!errors.enrollmentNo}
                helperText={errors.enrollmentNo}
                className="bg-white"
              />
  
              <TextField
                label="ABC ID"
                variant="outlined"
                fullWidth
                value={abcId}
                onChange={(e) => setAbcId(e.target.value)}
                error={!!errors.abcId}
                helperText={errors.abcId}
                className="bg-white"
              />
  
              <Button
                variant="contained"
                color="info"
                component="label"
                fullWidth
                className="bg-blue-500 hover:bg-blue-600"
              >
                Upload Profile Picture
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={handleProfilePicChange}
                />
              </Button>
  
              <TextField
                label="Email Address"
                variant="outlined"
                fullWidth
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={!!errors.email}
                helperText={errors.email}
                className="bg-white"
              />
  
              <TextField
                label="Password"
                variant="outlined"
                fullWidth
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={!!errors.password}
                helperText={errors.password}
                className="bg-white"
              />
  
              <TextField
                label="Confirm Password"
                variant="outlined"
                fullWidth
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                error={!!errors.confirmPassword}
                helperText={errors.confirmPassword}
                className="bg-white"
              />
  
              <Button
                variant="contained"
                type="submit"
                fullWidth
                className="bg-blue-700 hover:bg-blue-800"
              >
                Register
              </Button>
  
              <Typography align="center" className="text-gray-600">
                Already registered?{" "}
                <span
                  className="text-blue-600 cursor-pointer underline"
                  onClick={() => navigate("/login")}
                >
                  Log in
                </span>
              </Typography>
            </Stack>
          </Box>
        </Card>
      </Box>
    </section>
  );
}

export default Register;