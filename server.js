const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();

// CORS config
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "*")
  .split(",")
  .map(s => s.trim());

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

//  Routes 
const collegeRoutes = require("./routes/collegeRoutes");
const departmentRoutes = require("./routes/DepartmentRoutes");
const programRoutes = require("./routes/ProgramRoutes");
const subjectRoutes = require("./routes/SubjectRoutes");
const studentRoutes = require("./routes/studentRoutes");
const attendanceRoutes = require("./routes/attendanceRoutes");

// Mount API routes
app.use("/api/colleges", collegeRoutes);
app.use("/api/departments", departmentRoutes);
app.use("/api/programs", programRoutes);
app.use("/api/subjects", subjectRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/attendance", attendanceRoutes);

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
    // MongoDB connection with better options
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