import mongoose from 'mongoose';
import { GAMES, WALLETS } from '../constants.js';

/*
  Sealed product and other non-single items bought to resell.
  e.g. "Riftbound Origins booster box", 36 packs, $200.
  Each unit (pack) costs cost / units. Sales and openings are MiscEntry rows.
*/
const miscItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    game: { type: String, enum: [...GAMES, 'Other'], default: 'Other' },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    units: { type: Number, required: true, min: 1 },
    unitLabel: { type: String, default: 'packs', trim: true }, // "packs", "items", ...
    cost: { type: Number, required: true, min: 0 },
    paidFrom: { type: String, enum: WALLETS, required: true },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.model('MiscItem', miscItemSchema);
