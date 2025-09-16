const express = require("express");
const router = express.Router();
const Department = require("../models/Department");
const Program = require("../models/Program");
const College = require("../models/College");

// GET all departments
router.get("/", async (req, res) => {
  try {
    const depts = await Department.find({}, { __v: 0 }).sort({ _id: 1 });
    res.json(depts);
  } catch (err) {
    console.error("Error fetching departments:", err);
    res.status(500).json({ error: "Failed to fetch departments" });
  }
});

// GET department by id
router.get("/:id", async (req, res) => {
  try {
    const dept = await Department.findById(req.params.id);
    if (!dept) return res.status(404).json({ error: "Department not found" });
    res.json(dept);
  } catch (err) {
    console.error("Error fetching department:", err);
    res.status(500).json({ error: "Failed to fetch department" });
  }
});

// GET programs for a department (without collegeId)
router.get("/:deptId/programs", async (req, res) => {
  try {
    const { deptId } = req.params;

    // Find all colleges that include this department
    const colleges = await College.find({ "departments.deptId": deptId });
    if (!colleges || colleges.length === 0) {
      return res.status(404).json({ error: "No college found with this department" });
    }

    // Collect all program IDs offered in this department (across all colleges)
    const programIds = colleges.flatMap(c => {
      const dept = c.departments.find(d => d.deptId === deptId);
      return dept ? dept.offeredProgramIds : [];
    });

    if (!programIds || programIds.length === 0) {
      return res.json([]); // no programs found
    }

    // Fetch program details
    const programs = await Program.find({ _id: { $in: programIds } });
    res.json(programs);

  } catch (err) {
    console.error("Error fetching programs by department:", err);
    res.status(500).json({ error: "Failed to fetch programs for department" });
  }
});


// GET programs for a department in a specific college
router.get("/:collegeId/:deptId/programs", async (req, res) => {
  try {
    const { collegeId, deptId } = req.params;

    // Find the college
    const college = await College.findById(collegeId);
    if (!college) return res.status(404).json({ error: "College not found" });

    // Find specific department inside this college
    const department = college.departments.find(d => d.deptId === deptId);
    if (!department) {
      return res.status(404).json({ error: "Department not found in this college" });
    }

    // Take only offered programs of this college's department
    const programIds = department.offeredProgramIds || [];

    if (programIds.length === 0) {
      return res.json([]);
    }

    // Fetch program documents
    const programs = await Program.find({ _id: { $in: programIds } });
    res.json(programs);
  } catch (err) {
    console.error("Error fetching programs:", err);
    res.status(500).json({ error: "Failed to fetch programs" });
  }
});

// Create department
router.post('/', async (req, res) => {
  try {
    const { _id, departmentName } = req.body;
    if (!_id || !departmentName) return res.status(400).json({ error: 'Missing _id or departmentName' });
    const exists = await Department.findById(_id);
    if (exists) return res.status(409).json({ error: 'Department already exists' });
    const doc = await Department.create({ _id, departmentName });
    res.status(201).json(doc);
  } catch (e) { res.status(500).json({ error: 'Failed to create department' }); }
});

// Update department
router.put('/:id', async (req, res) => {
  try {
    const { departmentName } = req.body;
    const doc = await Department.findByIdAndUpdate(req.params.id, { departmentName }, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ error: 'Department not found' });
    res.json(doc);
  } catch (e) { res.status(500).json({ error: 'Failed to update department' }); }
});

// Delete department
router.delete('/:id', async (req, res) => {
  try {
    const doc = await Department.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Department not found' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Failed to delete department' }); }
});



module.exports = router;