const express = require("express");
const router = express.Router();
const Student = require("../models/Student");

// Create a new student record
router.post("/", async (req, res) => {
  try {
    const { firebaseId, department, program, semester, yearOfAdmission, enrollmentNo } = req.body;
    
    // validation
    if (!firebaseId || !department || !program || !semester || !yearOfAdmission || !enrollmentNo) {
      return res.status(400).json({ error: "Missing required academic fields." });
    }

    // Check if a student with this firebaseId already exists to prevent duplicates
    const existingStudent = await Student.findOne({ firebaseId });
    if (existingStudent) {
        return res.status(409).json({ error: "A student with this ID already has academic data." });
    }

    const student = new Student({
      firebaseId,
      department,
      program,
      semester,
      yearOfAdmission,
      enrollmentNo,
    });
    
    await student.save();
    res.status(201).json(student);
  } catch (err) {
    console.error("Error creating student:", err);
    res.status(500).json({ error: "Failed to create student record.", message: err.message });
  }
});

// Fetch a single student's academic data
router.get("/:firebaseId", async (req, res) => {
  try {
    const student = await Student.findOne({ firebaseId: req.params.firebaseId });
    if (!student) {
      return res.status(404).json({ error: "Student academic data not found." });
    }
    res.json(student);
  } catch (err) {
    console.error("Error fetching student:", err);
    res.status(500).json({ error: "Failed to fetch student data.", message: err.message });
  }
});

//Update an existing student's academic data
router.put("/:firebaseId", async (req, res) => {
    try {
        const { department, program, semester, yearOfAdmission, enrollmentNo } = req.body;
        const updatedData = { department, program, semester, yearOfAdmission, enrollmentNo };

        const student = await Student.findOneAndUpdate(
            { firebaseId: req.params.firebaseId },
            updatedData,
            { new: true, runValidators: true } // Return the updated document and run schema validators
        );

        if (!student) {
            return res.status(404).json({ error: "Student not found to update." });
        }
        res.status(200).json(student);
    } catch (err) {
        console.error("Error updating student:", err);
        res.status(500).json({ error: "Failed to update student data.", message: err.message });
    }
});


// Remove a student's academic data upon rejection
router.delete("/:firebaseId", async (req, res) => {
    try {
        const student = await Student.findOneAndDelete({ firebaseId: req.params.firebaseId });

        if (!student) {
            // It's okay if the student doesn't exist; maybe they were already rejected.
            // Sending a 204 No Content response is appropriate here.
            return res.status(204).send(); 
        }
        res.status(200).json({ message: "Student academic data deleted successfully." });
    } catch (err) {
        console.error("Error deleting student:", err);
        res.status(500).json({ error: "Failed to delete student data.", message: err.message });
    }
});


module.exports = router;
