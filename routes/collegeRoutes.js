const express = require("express");
const router = express.Router();
const College = require("../models/College");
const Department = require("../models/Department");


//  Get all colleges 
router.get("/", async (req, res) => {
  try {
    const colleges = await College.find({}, { __v: 0 }).sort({ _id: 1 });
    res.json(colleges);
  } catch (err) {
    console.error("Error fetching colleges:", err);
    res.status(500).json({ error: "Failed to fetch colleges" });
  }
});


//  Get all college names
router.get("/names", async (req, res) => {
  try {
    const colleges = await College.find({}, { _id: 1, name: 1, address: 1 }).sort({ name: 1 });
    res.json(colleges);
  } catch (err) {
    console.error("Error fetching college names:", err);
    res.status(500).json({ error: "Failed to fetch college names" });
  }
});


//  Get one specific college by id
router.get("/:id", async (req, res) => {
  try {
    const college = await College.findById(req.params.id);
    if (!college) return res.status(404).json({ error: "College not found" });
    res.json(college);
  } catch (err) {
    console.error("Error fetching college:", err);
    res.status(500).json({ error: "Failed to fetch college" });
  }
});


router.get("/:id/departments", async (req, res) => {
  try {
    const college = await College.findById(req.params.id);
    if (!college) return res.status(404).json({ error: "College not found" });
    if (!Array.isArray(college.departments) || college.departments.length === 0) {
      return res.json([]);
    }

    // Extract real deptIds
    const deptIds = college.departments.map(d => d.deptId);

    // Fetch department docs by ID
    const departments = await Department.find({ _id: { $in: deptIds } });
    res.json(departments);
  } catch (err) {
    console.error("Error fetching departments:", err);
    res.status(500).json({ error: "Failed to fetch departments" });
  }
});

module.exports = router;