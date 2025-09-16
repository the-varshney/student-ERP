const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const admin = require('firebase-admin');
require("dotenv").config();
const serviceAccount = require('./AdminSDK.json');

const app = express();

// CORS config with fallback for development
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(",").map(s => s.trim())
  : ["http://localhost:3000", "http://localhost:3001", "http://localhost:5173", "http://192.168.56.1:5173/"];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
      return cb(null, true);
    }
    return cb(new Error("Not allowed by CORS"));
  },
  credentials: true
}));


app.use(express.json({ limit: '5mb' })); 
app.use(express.urlencoded({ extended: true }));

//INITIALIZE THE ADMIN APP
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

//  Routes 
const collegeRoutes = require("./routes/collegeRoutes");
const departmentRoutes = require("./routes/DepartmentRoutes");
const programRoutes = require("./routes/ProgramRoutes");
const subjectRoutes = require("./routes/SubjectRoutes");
const studentRoutes = require("./routes/studentRoutes");
const attendanceRoutes = require("./routes/attendanceRoutes");
const resultsRoutes = require("./routes/resultsRoutes");
const examScheduleRoutes = require("./routes/examScheduleRoutes");
const holidayRoutes = require('./routes/holidayRoutes');
const paymentRoutes = require('./routes/payment'); 

// Mount API routes
app.use("/api/colleges", collegeRoutes);
app.use("/api/departments", departmentRoutes);
app.use("/api/programs", programRoutes);
app.use("/api/subjects", subjectRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/results", resultsRoutes);
app.use("/api/exam-schedules", examScheduleRoutes);
app.use('/api/holidays', holidayRoutes);
app.use('/api/payment', paymentRoutes);

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  
  if (error.message === "Not allowed by CORS") {
    return res.status(403).json({ error: "CORS: Origin not allowed" });
  }
  
  res.status(500).json({ 
    error: "Internal server error", 
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({ error: "Route not found" });
});

//  DB and Server 
(async () => {
  try {
    // MongoDB connection
    await mongoose.connect(process.env.MONGODB_URI, {
      useUnifiedTopology: true,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      retryWrites: true,
      w: 'majority'
    });
    
    console.log("MongoDB connected successfully");
    console.log(`Database: ${mongoose.connection.db.databaseName}`);

    const port = process.env.PORT || 5000;
    const server = app.listen(port, () => {
      console.log(`API server running on port ${port}`);
    });

  } catch (err) {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  }
})();