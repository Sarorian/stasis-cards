import mongoose from 'mongoose';
import { WALLETS } from '../constants.js';

// A purchase of one or more single cards from the same deal
const purchaseSchema = new mongoose.Schema(
  {
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    paidFrom: { type: String, enum: WALLETS, required: true },
    // Set when the deal used one bulk price, otherwise null
    totalCost: { type: Number, default: null },
    totalSpent: { type: Number, required: true },
    totalMarket: { type: Number, required: true },
    cards: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Card' }],
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.model('Purchase', purchaseSchema);
