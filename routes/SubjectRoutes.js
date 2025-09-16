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

// Create subject
router.post('/', async (req, res) => {
  try {
    const { _id, subjectName, credit } = req.body;
    if (!_id || !subjectName || credit == null) return res.status(400).json({ error: 'Missing _id, subjectName or credit' });
    const exists = await Subject.findById(_id);
    if (exists) return res.status(409).json({ error: 'Subject already exists' });
    const doc = await Subject.create({ _id, subjectName, credit });
    res.status(201).json(doc);
  } catch (e) { res.status(500).json({ error: 'Failed to create subject' }); }
});

// Update subject
router.put('/:id', async (req, res) => {
  try {
    const { subjectName, credit } = req.body;
    const doc = await Subject.findByIdAndUpdate(req.params.id, { subjectName, credit }, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ error: 'Subject not found' });
    res.json(doc);
  } catch (e) { res.status(500).json({ error: 'Failed to update subject' }); }
});

// Delete subject
router.delete('/:id', async (req, res) => {
  try {
    const doc = await Subject.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Subject not found' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Failed to delete subject' }); }
});


module.exports = router;