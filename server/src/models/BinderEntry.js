import mongoose from 'mongoose';
import { WALLETS } from '../constants.js';

// Binder cards are tracked as one pool: buys add cards + cost + estimated market value,
// sells remove cards at the pool's average cost (for profit) and their sale price from the value.
const binderEntrySchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['buy', 'sell'], required: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    count: { type: Number, required: true, min: 1 },
    amount: { type: Number, required: true, min: 0 },
    // 'Trade' = binder cards traded in or out; no wallet moved
    // 'Trade' = binder cards traded in or out, 'Opening' = already owned on the start date; no wallet moved
    method: { type: String, enum: [...WALLETS, 'Trade', 'Opening'], required: true },
    trade: { type: mongoose.Schema.Types.ObjectId, ref: 'Trade' },
    // For buys: what we decided the cards are worth at market (amount = what we paid)
    market: { type: Number, default: null },
    // For sells: cost basis removed from the pool
    costBasis: { type: Number, default: 0 },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.model('BinderEntry', binderEntrySchema);
