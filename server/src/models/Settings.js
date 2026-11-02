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
  },
  { timestamps: true }
);

settingsSchema.statics.get = async function () {
  return (await this.findOne({ key: 'main' })) || this.create({ key: 'main' });
};

export default mongoose.model('Settings', settingsSchema);
