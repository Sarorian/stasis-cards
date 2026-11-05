import mongoose from 'mongoose';

// Single document holding app-wide settings
const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'main', unique: true },
    startingCapital: { type: Number, default: 0 },
    log: [
      {
        _id: false,
        date: String,
        at: { type: Date, default: Date.now },
        text: String,
      },
    ],
    pricesUpdatedAt: Date,
    // When the last "Update market prices" run started (graded cards priced before this get asked again)
    pricesUpdateStartedAt: Date,
    // Binder cards aren't priced one by one: their value is the pool's cost times this (set on Admin)
    binderMarkup: { type: Number, default: 1.2 },
    // The day the app's numbers start (everything before is "Year 1" from the old system)
    startDate: { type: String, default: null },
    // Summary of the old system's records, shown separately on the Dashboard
    yearOne: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

settingsSchema.statics.get = async function () {
  return (await this.findOne({ key: 'main' })) || this.create({ key: 'main' });
};

export default mongoose.model('Settings', settingsSchema);
