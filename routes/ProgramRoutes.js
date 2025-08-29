const express = require("express");
const router = express.Router();
const Program = require("../models/Program");
const Subject = require("../models/Subject");

// GET all programs
router.get("/", async (req, res) => {
  try {
    const programs = await Program.find({}, { __v: 0 });
    res.json(programs);
  } catch (err) {
    console.error("Error fetching programs:", err);
    res.status(500).json({ error: "Failed to fetch programs" });
  }
});

// GET program by id
router.get("/:id", async (req, res) => {
  try {
    const prog = await Program.findById(req.params.id);
    if (!prog) return res.status(404).json({ error: "Program not found" });
    res.json(prog);
  } catch (err) {
    console.error("Error fetching program:", err);
    res.status(500).json({ error: "Failed to fetch program" });
  }
});

// GET semesters for a program
router.get("/:id/semesters", async (req, res) => {
  try {
    const prog = await Program.findById(req.params.id);
    if (!prog) return res.status(404).json({ error: "Program not found" });
    res.json(prog.semesters);
  } catch (err) {
    console.error("Error fetching semesters:", err);
    res.status(500).json({ error: "Failed to fetch semesters" });
  }
});

// Get subjects for a semester of a program
router.get("/:id/semesters/:sem/subjects", async (req, res) => {
  try {
    const program = await Program.findById(req.params.id);
    if (!program) return res.status(404).json({ error: "Program not found" });

    // find semester
    const semester = program.semesters.find(s => s.semesterNumber === parseInt(req.params.sem));
    if (!semester) return res.status(404).json({ error: "Semester not found" });

    // fetch subjects by IDs
    const subjects = await Subject.find({ _id: { $in: semester.subjectIds } });
    res.json(subjects);
  } catch (err) {
    console.error("Error fetching subjects:", err);
    res.status(500).json({ error: "Failed to fetch subjects" });
  }
});


module.exports = router;