import mongoose from 'mongoose';

// What the inventory was worth on a day. One row per day, kept up to date while the app is used.
const inventorySnapshotSchema = new mongoose.Schema(
  {
    date: { type: String, required: true, unique: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    cards: {
      count: { type: Number, default: 0 },
      market: { type: Number, default: 0 }, // market value of in-stock singles and slabs
      cost: { type: Number, default: 0 }, // what they cost us
    },
    binderCost: { type: Number, default: 0 },
    sealedCost: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model('InventorySnapshot', inventorySnapshotSchema);
