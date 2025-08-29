import React, { useContext, useState, useEffect } from "react";
import { Box, Card, Typography, Button, Stack, useMediaQuery } from "@mui/material";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../../firebase/Firebase";
import AuthContext from "../../context/AuthContext";
import axios from "axios";

export default function Message() {
  const { userDetails, currentUser } = useContext(AuthContext);
  const navigate = useNavigate();
  const [showDetails, setShowDetails] = useState(false);
  const [mongoData, setMongoData] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const isMobile = useMediaQuery("(max-width:768px)");

  // Fetch MongoDB data
  useEffect(() => {
    const fetchMongoData = async () => {
      if (userDetails?.firebaseId || currentUser?.uid) {
        setLoadingDetails(true);
        try {
          const response = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/api/students/${userDetails?.firebaseId || currentUser.uid}`);
          setMongoData(response.data);
        } catch (error) {
          console.error("Error fetching MongoDB data:", error);
        } finally {
          setLoadingDetails(false);
        }
      }
    };
    fetchMongoData();
  }, [userDetails, currentUser]);

  // Logout button clears localStorage and signs out
  const handleLogout = async () => {
    if (currentUser?.uid) {
      localStorage.removeItem(`role_${currentUser.uid}`);
      localStorage.removeItem(`userDetails_${currentUser.uid}`);
    }
    await signOut(auth);
    setShowDetails(false); // Reset details view on logout
    navigate("/login");
  };

  const isVerified = userDetails?.role === "verified";

  return (
    <Box
      component={motion.div}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        minHeight: "100vh",
        p: 2,
        background: "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)",
      }}
    >
      <Box sx={{ mb: 4 }}>
        <Box
          component="img"
          src="/uts.png"
          alt="UTS Logo"
          sx={{
            width: isMobile ? 120 : 200,
            height: "auto",
            display: "block",
            mx: "auto",
          }}
        />
      </Box>

      <Card
        component={motion.div}
        whileHover={{ scale: 1.02 }}
        transition={{ type: "spring", stiffness: 120 }}
        sx={{
          p: 4,
          maxWidth: 650,
          width: "100%",
          textAlign: "center",
          borderRadius: 4,
          boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
          background: "rgba(255,255,255,0.95)",
          backdropFilter: "blur(10px)",
        }}
      >
        <Typography
          variant={isMobile ? "h5" : "h4"}
          fontWeight="bold"
          gutterBottom
          component={motion.div}
          initial={{ y: -30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
        >
          {isVerified ? "Account Verified Successfully!" : "Registration Form Submitted"}
        </Typography>

        <Typography
          variant="body1"
          color="text.primary"
          component={motion.div}
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          sx={{ mb: 3 }}
        >
          {isVerified ? (
            <>
              Your application has been verified successfully.
              <br />
              Please wait until an administrator approves your account.
              <br />
              <br />
              Once your account is approved, you will receive a confirmation email from the University. After that, you will be able to log in to your University ERP system.
              <br />
              <br />
              Account approval process may take up to <strong>24 hours</strong>. If any of the submitted information is found to be incorrect or incomplete, our team will reach out to you via your registered email.
            </>
          ) : (
            <>
              Your application has been submitted successfully.
              <br />
              Please wait until an administrator verifies your account.
              <br />
              <br />
              Once your data is verified, you will receive a confirmation email from the University. After that, you will be able to log in to your University ERP system.
              <br />
              <br />
              Data verification may take up to <strong>2 working days</strong>. If any of the submitted information is found to be incorrect or incomplete, our team will reach out to you via your registered email.
            </>
          )}
        </Typography>

        {/* Actions */}
        <Stack direction="column" spacing={2}>
          <Button
            component={motion.button}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            variant="contained"
            color="primary"
            onClick={() => setShowDetails((prev) => !prev)}
          >
            {showDetails ? "Hide Details" : "See My Details"}
          </Button>

          <Button
            component={motion.button}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            variant="outlined"
            color="error"
            onClick={handleLogout}
          >
            Logout
          </Button>
        </Stack>

        {/*details area */}
        <AnimatePresence>
          {showDetails && (
            <Box
              component={motion.div}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.4 }}
              sx={{
                mt: 3,
                p: 2,
                border: "1px solid #ccc",
                borderRadius: 2,
                textAlign: "left",
                backgroundColor: "#fff",
                color: "text.primary",
              }}
            >
              <Typography variant="h6" gutterBottom color="text.primary">
                My Details
              </Typography>
              {/* Firebase Data */}
              <Typography><strong>Name:</strong> {userDetails?.firstName} {userDetails?.lastName}</Typography>
              <Typography><strong>Email:</strong> {userDetails?.email}</Typography>
              <Typography><strong>Phone:</strong> {userDetails?.phone}</Typography>
              <Typography><strong>College:</strong> {userDetails?.collegeName}</Typography>
              <Typography><strong>ABC ID:</strong> {userDetails?.abcId}</Typography>
              <Typography><strong>DOB:</strong> {userDetails?.dob}</Typography>
              
              {/* MongoDB Data */}
              {mongoData && (
                <>
                  <Typography><strong>Enrollment No:</strong> {mongoData.enrollmentNo}</Typography>
                  <Typography><strong>Department:</strong> {mongoData.department}</Typography>
                  <Typography><strong>Program:</strong> {mongoData.program}</Typography>
                  <Typography><strong>Semester:</strong> {mongoData.semester}</Typography>
                  <Typography><strong>Year of Admission:</strong> {mongoData.yearOfAdmission}</Typography>
                </>
              )}
              {loadingDetails && <Typography>Loading MongoDB data...</Typography>}
            </Box>
          )}
        </AnimatePresence>
      </Card>
    </Box>
  );
}