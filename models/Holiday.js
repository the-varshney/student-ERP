const mongoose = require('mongoose');

const HolidaySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
    },
    type: {
      type: String,
      enum: ['Gazetted', 'Restricted', 'Observance'],
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    year: {
      type: Number,
      required: true,
      min: 1900,
      max: 3000,
    },
    notes: { type: String, trim: true, maxlength: 300 },
  },
  { timestamps: true }
);

// Ensure year consistency and normalize inputs like YYYY-MM-DD
function toIstMidnight(dateLike) {
  // If string 'YYYY-MM-DD', convert to Date at 00:00 IST to avoid TZ drift
  if (typeof dateLike === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateLike)) {
    return new Date(`${dateLike}T00:00:00+05:30`);
  }
  // If string ISO with explicit offset, trust it; else pass to Date
  return new Date(dateLike);
}

HolidaySchema.pre('validate', function (next) {
  if (this.isModified('date')) {
    this.date = toIstMidnight(this.date);
  }
  if (!this.year && this.date instanceof Date && !isNaN(this.date)) {
    this.year = this.date.getFullYear();
  }
  next();
});

HolidaySchema.index({ year: 1, date: 1, name: 1 }, { unique: true });

HolidaySchema.index({ date: 1 });
HolidaySchema.index({ year: 1 });

module.exports = mongoose.model('Holiday', HolidaySchema);
