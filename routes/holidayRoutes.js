const express = require('express');
const router = express.Router();
const Holiday = require('../models/Holiday');

// Parsing
const toDateOrNull = (v) => {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(`${v}T00:00:00+05:30`);
  const d = new Date(v);
  return isNaN(d) ? null : d;
};

// GET /api/holidays
router.get('/', async (req, res) => {
  try {
    const { year, month, start, end, type } = req.query;
    const q = {};
    if (year) q.year = Number(year);
    if (type) q.type = type;

    // Range filter has priority if provided
    if (start || end) {
      const s = toDateOrNull(start);
      const e = toDateOrNull(end);
      q.date = {};
      if (s) q.date.$gte = s;
      if (e) q.date.$lte = e;
    } else if (year && month) {
      // Month filter within year 
      const m = Number(month);
      const startMonth = new Date(`${year}-${String(m).padStart(2, '0')}-01T00:00:00+05:30`);
      const endMonth = new Date(new Date(startMonth).setMonth(startMonth.getMonth() + 1) - 1);
      q.date = { $gte: startMonth, $lte: endMonth };
    }

    const docs = await Holiday.find(q).sort({ date: 1, name: 1 }).lean();
    return res.json(docs);
  } catch (err) {
    console.error('List holidays error:', err);
    return res.status(500).json({ error: 'Failed to fetch holidays' });
  }
});

// GET /api/holidays/upcoming?from=YYYY-MM-DD
router.get('/upcoming', async (req, res) => {
  try {
    const { from } = req.query;
    const pivot = toDateOrNull(from) || new Date();
    const docs = await Holiday.find({ date: { $gte: pivot } })
      .sort({ date: 1, name: 1 })
      .limit(100)
      .lean();
    return res.json(docs);
  } catch (err) {
    console.error('Upcoming holidays error:', err);
    return res.status(500).json({ error: 'Failed to fetch upcoming holidays' });
  }
});

// GET /api/holidays/:id
router.get('/:id', async (req, res) => {
  try {
    const doc = await Holiday.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ error: 'Holiday not found' });
    return res.json(doc);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch holiday' });
  }
});

// POST /api/holidays
router.post('/', async (req, res) => {
  try {
    const { name, type, date, year, notes } = req.body || {};
    if (!name || !type || !date) {
      return res.status(400).json({ error: 'name, type, and date are required' });
    }
    const doc = await Holiday.create({
      name: String(name).trim(),
      type,
      date, 
      year,
      notes,
    });
    return res.status(201).json(doc);
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: 'Duplicate holiday for this date/year/name' });
    }
    return res.status(500).json({ error: 'Failed to create holiday' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, type, date, year, notes } = req.body || {};
    const updates = {};
    if (name != null) updates.name = String(name).trim();
    if (type != null) updates.type = type;
    if (date != null) updates.date = date;
    if (year != null) updates.year = Number(year);
    if (notes != null) updates.notes = String(notes).trim();

    const doc = await Holiday.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    if (!doc) return res.status(404).json({ error: 'Holiday not found' });
    return res.json(doc);
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: 'Duplicate holiday for this date/year/name' });
    }
    return res.status(500).json({ error: 'Failed to update holiday' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const del = await Holiday.findByIdAndDelete(req.params.id);
    if (!del) return res.status(404).json({ error: 'Holiday not found' });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete holiday' });
  }
});

module.exports = router;