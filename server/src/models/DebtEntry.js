import mongoose from 'mongoose';
import { WALLETS, PARTNERS } from '../constants.js';

/*
  Money the business owes Owen or Ben ("debt"), and paying it back ("cleansing").
    add   + expense : they paid a business cost (show, gas, food). Counts as a business expense.
    add   + loan    : they put their own money into a wallet. Wallet goes up.
    add   + record  : carried over from the old sheet. Only the debt changes.
    clean + wallet  : they took money (cash out, or kept Venmo). Wallet goes down.
    clean + card    : they took a card at an agreed value. Card counts as sold for that value.
    clean + record  : carried over from the old sheet. Only the debt changes.
*/
const debtEntrySchema = new mongoose.Schema(
  {
    person: { type: String, enum: PARTNERS, required: true },
    type: { type: String, enum: ['add', 'clean'], required: true },
    how: { type: String, enum: ['expense', 'loan', 'record', 'wallet', 'card'], required: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    amount: { type: Number, required: true, min: 0.01 },
    source: { type: String, default: '', trim: true }, // "Castle Rock Card Show", "CCs DCS Venmo", ...
    wallet: { type: String, enum: [...WALLETS, null], default: null },
    card: { type: mongoose.Schema.Types.ObjectId, ref: 'Card' },
  },
  { timestamps: true }
);

export default mongoose.model('DebtEntry', debtEntrySchema);
