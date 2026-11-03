import mongoose from 'mongoose';
import { WALLETS } from '../constants.js';

/*
  Units leaving a misc item:
    sell = sold (amount = total price for these units, money goes to `method`)
    open = opened ourselves and written off (no money; costBasis counts as a loss)
*/
const miscEntrySchema = new mongoose.Schema(
  {
    item: { type: mongoose.Schema.Types.ObjectId, ref: 'MiscItem', required: true, index: true },
    type: { type: String, enum: ['sell', 'open'], required: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    units: { type: Number, required: true, min: 1 },
    amount: { type: Number, default: 0, min: 0 },
    fees: { type: Number, default: 0, min: 0 },
    method: { type: String, enum: [...WALLETS, null], default: null },
    costBasis: { type: Number, required: true, min: 0 },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.model('MiscEntry', miscEntrySchema);
