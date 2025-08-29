const express = require("express");
const router = express.Router();
const Subject = require("../models/Subject");

// GET all subjects
router.get("/", async (req, res) => {
  try {
    const subjects = await Subject.find({}, { __v: 0 }).sort({ _id: 1 });
    res.json(subjects);
  } catch (err) {
    console.error("Error fetching subjects:", err);
    res.status(500).json({ error: "Failed to fetch subjects" });
  }
});

// GET subject by id
router.get("/:id", async (req, res) => {
  try {
    const subject = await Subject.findById(req.params.id);
    if (!subject) return res.status(404).json({ error: "Subject not found" });
    res.json(subject);
  } catch (err) {
    console.error("Error fetching subject:", err);
    res.status(500).json({ error: "Failed to fetch subject" });
  }
});

module.exports = router;