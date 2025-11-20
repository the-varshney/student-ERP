import React, { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { TextField, Button, Typography, Box, Alert, Stack, Card, IconButton, InputAdornment, CircularProgress, Link, useTheme, Grid,
        } from "@mui/material";
import { Visibility, VisibilityOff, ArrowBack } from "@mui/icons-material";
import { motion, AnimatePresence } from "framer-motion";
import { auth, db } from "../../firebase/Firebase";
import { ThemeContext } from "../../context/ThemeContext";
import { UTSLogo } from "../../components/header";

function Login() {
  const { mode } = useContext(ThemeContext);
  const theme = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState(null);
  const [messageType, setMessageType] = useState("");
  const [errors, setErrors] = useState({ email: "", password: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResetMode, setIsResetMode] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetSuccess, setResetSuccess] = useState(false);
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

  const validateResetEmail = () => {
    if (!resetEmail) {
      setResetError("Email is required.");
      return false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resetEmail)) {
      setResetError("Invalid email address.");
      return false;
    }
    setResetError("");
    return true;
  };

    const fetchUserRole = async (uid) => {
      const collections = ["Admins", "Teachers", "Students"];
      for (const collectionName of collections) {
        const docRef = doc(db, collectionName, uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const details = docSnap.data();
          let role = details.role || "unverified";
          // Check for tester role
          if (details.role === "tester" || details.isTester === true) {
            role = "tester";
          } else if (collectionName === "Teachers") {
            role = details.isCollegeAssociate ? "CollegeAssociate" : "Teacher";
          }
          return { role, details };
        }
      }
      return { role: "unverified", details: null };
    };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(null);
    setErrors({ email: "", password: "" });

    if (!validateInputs()) {
      return;
    }
    setIsSubmitting(true);
    try {
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
        role === "tester" ? "/test" :
        role === "Admin" ? "/admin" :
        role === "Teacher" || role === "CollegeAssociate" ? "/teacher" :
        role === "Student" ? "/home" :
        role === "verified" || role === "unverified" ? "/message" :
        "/login";
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

  const handlePasswordReset = async (e) => {
    e.preventDefault();
    setResetError("");
    setResetSuccess(false);

    if (!validateResetEmail()) {
      return;
    }
    setIsSubmitting(true);
    try {
      await sendPasswordResetEmail(auth, resetEmail);
      setResetSuccess(true);
      setMessage("Password reset email sent successfully!");
      setMessageType("success");
    } catch (error) {
      console.error("Password reset error:", error);
      let errorMessage = "Failed to send password reset email.";

      switch (error.code) {
        case "auth/user-not-found":
          setResetError("No account found with this email address.");
          errorMessage = "No account found with this email address.";
          break;
        case "auth/invalid-email":
          setResetError("Invalid email address.");
          errorMessage = "Invalid email address.";
          break;
        case "auth/too-many-requests":
          setResetError("Too many requests. Please try again later.");
          errorMessage = "Too many requests. Please try again later.";
          break;
        default:
          setResetError("Failed to send reset email. Please try again.");
      }
      setMessage(errorMessage);
      setMessageType("error");
    }
    setIsSubmitting(false);
  };

  const handleKeyDown = (e, nextField) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (nextField) {
        document.getElementById(nextField)?.focus();
      } else {
        if (isResetMode) {
          handlePasswordReset(e);
        } else {
          handleSubmit(e);
        }
      }
    }
  };

  const switchToResetMode = () => {
    setIsResetMode(true);
    setMessage(null);
    setErrors({ email: "", password: "" });
    setResetEmail(email);
  };

  const switchToLoginMode = () => {
    setIsResetMode(false);
    setResetError("");
    setResetSuccess(false);
    setMessage(null);
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
    hidden: { y: -50, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { duration: 0.5, ease: "easeOut" } },
    exit: { y: -50, opacity: 0, transition: { duration: 0.3, ease: "easeIn" } },
  };

  const pageVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.6, ease: "easeOut" } },
  };

  const cardTransition = { duration: 0.5, ease: "easeInOut" };

  return (
    <motion.section
      className="hero is-fullheight"
      style={{
        background:
          mode === "default"
            ? theme.palette.mode === 'dark' 
              ? theme.palette.background.default
              : "linear-gradient(135deg, hsl(200, 100%, 90%) 0%, hsl(265, 100%, 95%) 100%)"
            : theme.palette.background.default,
        }}
        variants={pageVariants}
        initial="hidden"
        animate="visible"
      >
      <Box
        sx={{
          position: "absolute",
          top: { xs: '3%', sm: '3%', md: "0" },
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10,
        }}
      >
        <UTSLogo clickable={false} width={170}/>
      </Box>

      <Grid
        container
        sx={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: { xs: 2, md: 4 },
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
                top: theme.spacing(2),
                left: "50%",
                transform: "translateX(-50%)",
                width: "90%",
                maxWidth: 400,
                zIndex: 10,
              }}
            >
              <Alert severity={messageType} sx={{ width: "100%", borderRadius: 2 }}>
                {message}
              </Alert>
            </motion.div>
          )}
        </AnimatePresence>
        
        <Grid item xs={12} sm={10} md={8} lg={6}>
          <motion.div
            key={isResetMode ? "reset" : "login"}
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            transition={cardTransition}
          >
            <Card
              sx={{
                mt:3,
                width: {md:"40vw", xs:"90vw"},
                p: { xs: 3, sm: 1, md: 4 },
                borderRadius: 3,
                backdropFilter: "blur(20px)",
                boxShadow:
                  messageType === "error"
                    ? "0px 0px 15px red"
                    : "0px 12px 40px rgba(19, 24, 85, 0.1)",
                border: messageType === "error" ? "2px solid red" : "1px solid rgba(0,0,0,0.1)",
                transition: "transform 0.3s ease-in-out, box-shadow 0.3s ease-in-out, border 0.3s ease-in-out",
                "&:hover": {
                  transform: "scale(1.01)",
                  boxShadow:
                    messageType === "error"
                      ? "0px 0px 20px red"
                      : "0px 20px 60px rgba(19, 24, 85, 0.15)",
                },
              }}
            >
              {isResetMode ? (
                // Password Reset Form
                <>
                  <Box sx={{ display: "flex", alignItems: "center", mb: 2}}>
                    <IconButton
                      onClick={switchToLoginMode}
                      sx={{ mr: 1, color: theme.palette.primary.main }}
                      aria-label="back to login"
                    >
                      <ArrowBack />
                    </IconButton>
                    <Typography variant="h4" component="h1" fontWeight="bold" sx={{ color: theme.palette.text.primary }}>
                      Reset Password
                    </Typography>
                  </Box>

                  <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    Enter your email address and we&apos;ll send you a link to reset your password.
                  </Typography>

                  {resetSuccess && (
                    <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>
                      Password reset email sent! Check your inbox.
                    </Alert>
                  )}

                  <Box component="form" onSubmit={handlePasswordReset} noValidate>
                    <Stack spacing={3}>
                      <TextField
                        id="reset-email"
                        label="Email Address"
                        variant="outlined"
                        fullWidth
                        type="email"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, null)}
                        error={!!resetError}
                        helperText={resetError}
                        sx={{
                          "& .MuiOutlinedInput-root": {
                            backgroundColor: "white",
                            transition: "box-shadow 0.3s ease-in-out, border-color 0.3s ease-in-out",
                            "&:hover fieldset": { borderColor: theme.palette.primary.main },
                            "&.Mui-focused fieldset": {
                              borderColor: theme.palette.primary.main,
                              boxShadow: `0 0 10px ${theme.palette.primary.main}33`,
                            },
                          },
                        }}
                      />

                      <Button
                        variant="contained"
                        type="submit"
                        fullWidth
                        disabled={isSubmitting}
                        sx={{
                          py: 1.5,
                          borderRadius: 2,
                          bgcolor: theme.palette.primary.main,
                          "&:hover": {
                            bgcolor: theme.palette.primary.dark,
                            transform: "translateY(-2px)",
                          },
                          transition: "transform 0.2s ease-in-out",
                        }}
                      >
                        {isSubmitting ? (
                          <CircularProgress size={24} color="inherit" />
                        ) : (
                          "Send Reset Email"
                        )}
                      </Button>

                      <Typography align="center" variant="body2" sx={{ color: theme.palette.text.secondary }}>
                        Remember your password?{" "}
                        <Link
                          component="button"
                          type="button"
                          onClick={switchToLoginMode}
                          sx={{
                            fontWeight: 'bold',
                            color: theme.palette.primary.main,
                            textDecoration: "underline",
                            transition: "color 0.3s ease-in-out",
                            "&:hover": { color: theme.palette.primary.dark },
                          }}
                        >
                          Back to Login
                        </Link>
                      </Typography>
                    </Stack>
                  </Box>
                </>
              ) : (
                // Login Form
                <>
                  <Typography variant="h4" align="center" gutterBottom fontWeight="bold" sx={{ color: theme.palette.text.primary }}>
                    Welcome Back!
                  </Typography>
                  <Typography variant="body2" align="center" color="text.secondary" sx={{ mb: 3 }}>
                    Sign in to your account
                  </Typography>

                  <Box component="form" onSubmit={handleSubmit} noValidate>
                    <Stack spacing={3}>
                      <TextField
                        id="email"
                        label="Email Address"
                        variant="outlined"
                        fullWidth
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, 'password')}
                        error={!!errors.email}
                        helperText={errors.email}
                        sx={{
                          "& .MuiOutlinedInput-root": {
                            backgroundColor: "white",
                            transition: "box-shadow 0.3s ease-in-out, border-color 0.3s ease-in-out",
                            "&:hover fieldset": { borderColor: theme.palette.primary.main },
                            "&.Mui-focused fieldset": {
                              borderColor: theme.palette.primary.main,
                              boxShadow: `0 0 10px ${theme.palette.primary.main}33`,
                            },
                          },
                        }}
                      />

                      <TextField
                        id="password"
                        label="Password"
                        variant="outlined"
                        fullWidth
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, null)}
                        error={!!errors.password}
                        helperText={errors.password}
                        InputProps={{
                          endAdornment: (
                            <InputAdornment position="end">
                              <IconButton
                                onClick={toggleShowPassword}
                                edge="end"
                                sx={{
                                  transition: "color 0.3s ease-in-out",
                                  "&:hover": { color: theme.palette.primary.main },
                                }}
                                aria-label="toggle password visibility"
                              >
                                {showPassword ? <VisibilityOff /> : <Visibility />}
                              </IconButton>
                            </InputAdornment>
                          ),
                        }}
                        sx={{
                          "& .MuiOutlinedInput-root": {
                            backgroundColor: "white",
                            transition: "box-shadow 0.3s ease-in-out, border-color 0.3s ease-in-out",
                            "&:hover fieldset": { borderColor: theme.palette.primary.main },
                            "&.Mui-focused fieldset": {
                              borderColor: theme.palette.primary.main,
                              boxShadow: `0 0 10px ${theme.palette.primary.main}33`,
                            },
                          },
                        }}
                      />

                      <Button
                        variant="contained"
                        type="submit"
                        fullWidth
                        disabled={isSubmitting}
                        sx={{
                          py: 1.5,
                          borderRadius: 2,
                          bgcolor: theme.palette.primary.main,
                          "&:hover": {
                            bgcolor: theme.palette.primary.dark,
                            transform: "translateY(-2px)",
                          },
                          transition: "transform 0.2s ease-in-out",
                        }}
                      >
                        {isSubmitting ? <CircularProgress size={24} color="inherit" /> : "Login"}
                      </Button>

                      <Typography align="center" variant="body2" sx={{ color: theme.palette.text.secondary, mt: 2 }}>
                        <Link
                          component="button"
                          type="button"
                          onClick={switchToResetMode}
                          sx={{
                            display: "block",
                            fontWeight: 'bold',
                            color: theme.palette.primary.main,
                            textDecoration: "underline",
                            transition: "color 0.3s ease-in-out",
                            "&:hover": { color: theme.palette.primary.dark },
                          }}
                        >
                          Forgot Password?
                        </Link>
                        Don&apos;t have an account?{" "}
                        <Link
                          component="button"
                          type="button"
                          onClick={() => navigate("/register")}
                          sx={{
                            fontWeight: 'bold',
                            color: theme.palette.primary.main,
                            textDecoration: "underline",
                            transition: "color 0.3s ease-in-out",
                            "&:hover": { color: theme.palette.primary.dark },
                          }}
                        >
                          Register
                        </Link>
                      </Typography>
                    </Stack>
                  </Box>
                </>
              )}
            </Card>
          </motion.div>
        </Grid>
      </Grid>
    </motion.section>
  );
}

export default Login;