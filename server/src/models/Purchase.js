import mongoose from 'mongoose';
import { WALLETS, DEBT_METHODS } from '../constants.js';

// A purchase of one or more single cards from the same deal
const purchaseSchema = new mongoose.Schema(
  {
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    // Biggest share of the payment: a wallet, or "Owen (debt)" / "Ben (debt)"
    paidFrom: { type: String, enum: [...WALLETS, ...DEBT_METHODS], required: true },
    // How it was paid when split (e.g. $100 Cash + $230 Owen (debt)). Empty = all from paidFrom.
    payments: [{ _id: false, method: { type: String, enum: [...WALLETS, ...DEBT_METHODS] }, amount: Number }],
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
