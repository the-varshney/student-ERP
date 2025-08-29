import React, { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import {
  TextField,
  Button,
  Typography,
  Box,
  Alert,
  Stack,
  Card,
  IconButton,
  InputAdornment,
  CircularProgress,
} from "@mui/material";
import { Visibility, VisibilityOff } from "@mui/icons-material";
import { motion, AnimatePresence } from "framer-motion";
import { auth, db } from "../../firebase/Firebase";
import { ThemeContext } from "../../context/ThemeContext";

function Login() {
  const { mode } = useContext(ThemeContext);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState(null);
  const [messageType, setMessageType] = useState("");
  const [errors, setErrors] = useState({ email: "", password: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const validateInputs = () => {
    let isValid = true;
    const newErrors = { email: "", password: "" };

    if (!email) {
      newErrors.email = "Email is required.";
      isValid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = "Invalid email address.";
      isValid = false;
    }

    if (!password) {
      newErrors.password = "Password is required.";
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const fetchUserRole = async (uid) => {
    const collections = ["Admins", "Teachers", "Students"];
    for (const collectionName of collections) {
      const docRef = doc(db, collectionName, uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const details = docSnap.data();
        let role = details.role || "unverified";

        if (collectionName === "Teachers") {
          role = details.isCollegeAssociate ? "CollegeAssociate" : "Teacher";
        }
        
        console.log(`Fetched role: ${role} from ${collectionName}`);
        return { role, details };
      }
    }
    
    console.log("No user document found, defaulting to unverified");
    return { role: "unverified", details: null };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(null);
    setErrors({ email: "", password: "" });

    if (!validateInputs()) {
      setMessage("Please correct the highlighted errors.");
      setMessageType("error");
      return;
    }

    setIsSubmitting(true);
    try {
      console.log("Login attempt with email:", email);
      const uid = auth.currentUser?.uid;
      if (uid) {
        localStorage.removeItem(`role_${uid}`);
        localStorage.removeItem(`userDetails_${uid}`);
      }

      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      setMessage("Login successful! Fetching role...");
      setMessageType("success");

      const { role, details } = await fetchUserRole(user.uid);

      localStorage.setItem(`role_${user.uid}`, role);
      if (details) {
        localStorage.setItem(`userDetails_${user.uid}`, JSON.stringify(details));
      }

      const redirectTo =
        role === "Admin" ? "/admin" :
        role === "Teacher" || role === "CollegeAssociate" ? "/teacher" :
        role === "Student" ? "/home" :
        role === "verified" || role === "unverified" ? "/message" :
        "/login";

      console.log("Redirecting to:", redirectTo);
      navigate(redirectTo, { replace: true });

    } catch (error) {
      console.error("Login error:", error.code, error.message);
      let errorMessage = "Login failed!";
      switch (error.code) {
        case "auth/invalid-email":
          setErrors((prev) => ({ ...prev, email: "Invalid email address." }));
          errorMessage = "Invalid email address.";
          break;
        case "auth/user-not-found":
          setErrors((prev) => ({ ...prev, email: "No account found with this email." }));
          errorMessage = "No account found with this email.";
          break;
        case "auth/wrong-password":
          setErrors((prev) => ({ ...prev, password: "Invalid password." }));
          errorMessage = "Invalid password.";
          break;
        case "auth/too-many-requests":
          errorMessage = "Too many failed attempts. Please try again later.";
          break;
        default:
          setErrors((prev) => ({
            ...prev,
            email: "Invalid email or password.",
            password: "Invalid email or password.",
          }));
          errorMessage = "Invalid email or password.";
      }
      setMessage(errorMessage);
      setMessageType("error");
    }
    setIsSubmitting(false);
  };

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const toggleShowPassword = () => {
    setShowPassword(!showPassword);
  };

  const notificationVariants = {
    hidden: { y: 200, opacity: 0 },
    visible: { y: 180, opacity: 1, transition: { duration: 0.5, ease: "easeOut" } },
    exit: { y: 100, opacity: 0, transition: { duration: 0.3, ease: "easeIn" } },
  };

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
          pl: 4,
          pt: 4,
          flexDirection: "column",
          position: "relative",
        }}
      >
        <AnimatePresence>
          {message && (
            <motion.div
              variants={notificationVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              style={{
                position: "absolute",
                top: -100,
                width: "100%",
                maxWidth: 500,
                zIndex: 10,
              }}
            >
              <Alert severity={messageType} sx={{ width: "100%", borderRadius: 2 }}>
                {message}
              </Alert>
            </motion.div>
          )}
        </AnimatePresence>

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
            transition: "transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out",
            "&:hover": {
              transform: "scale(1.02)",
              boxShadow:
                messageType === "error"
                  ? "0px 0px 15px red"
                  : "0px 15px 50px rgba(19, 24, 85, 0.5)",
            },
          }}
        >
          <Typography variant="h4" align="center" gutterBottom className="text-blue-900">
            Welcome Back!
          </Typography>

          <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 1 }}>
            <Stack spacing={2}>
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
                sx={{
                  "& .MuiOutlinedInput-root": {
                    transition: "all 0.3s ease-in-out",
                    "&:hover": {
                      borderColor: "purple",
                      boxShadow: "0 0 8px rgba(128, 0, 128, 0.3)",
                    },
                    "&.Mui-focused": {
                      borderColor: "purple",
                      boxShadow: "0 0 12px rgba(128, 0, 128, 0.5)",
                    },
                  },
                }}
              />

              <TextField
                label="Password"
                variant="outlined"
                fullWidth
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={!!errors.password}
                helperText={errors.password}
                className="bg-white"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={toggleShowPassword}
                        edge="end"
                        sx={{
                          transition: "color 0.3s ease-in-out",
                          "&:hover": {
                            color: "purple",
                          },
                        }}
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    transition: "all 0.3s ease-in-out",
                    "&:hover": {
                      borderColor: "purple",
                      boxShadow: "0 0 8px rgba(128, 0, 128, 0.3)",
                    },
                    "&.Mui-focused": {
                      borderColor: "purple",
                      boxShadow: "0 0 12px rgba(128, 0, 128, 0.5)",
                    },
                  },
                }}
              />

              <Button
                variant="contained"
                type="submit"
                fullWidth
                disabled={isSubmitting}
                className="bg-blue-700 hover:bg-blue-800"
                sx={{
                  py: 1.5,
                  transition: "all 0.3s ease-in-out",
                  "&:hover": {
                    transform: "scale(1.05)",
                    boxShadow: "0 0 15px rgba(0, 0, 255, 0.3)",
                  },
                }}
              >
                {isSubmitting ? <CircularProgress size={24} color="inherit" /> : "Login"}
              </Button>

              <Typography align="center" className="text-gray-600">
                Don&apos;t have an account?{" "}
                <span
                  className="text-blue-600 cursor-pointer underline"
                  onClick={() => navigate("/register")}
                  style={{
                    transition: "color 0.3s ease-in-out",
                  }}
                  onMouseEnter={(e) => (e.target.style.color = "purple")}
                  onMouseLeave={(e) => (e.target.style.color = "#2563eb")}
                >
                  Register
                </span>
              </Typography>
            </Stack>
          </Box>
        </Card>
      </Box>
    </section>
  );
}

export default Login;