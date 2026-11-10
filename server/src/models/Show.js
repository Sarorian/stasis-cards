import mongoose from 'mongoose';
import { WALLETS, DEBT_METHODS } from '../constants.js';

export const SHOW_PAID_WITH = [...WALLETS, ...DEBT_METHODS, 'Already paid'];
export const EXPENSE_KINDS = ['Parking', 'Food', 'Gas', 'Hotel', 'Other'];

/*
  A card show we go to. Buys, sales, trades and binder entries point at it with `at: <show id>`.
  Costs:
    tableFee  paid from a wallet, with someone's debt, or "Already paid" (counts as a cost, no money moves now)
    expenses  parking, food, gas... paid from a wallet or someone's debt
  Each cost keeps the ledger row (tx) or debt entry (debt) it made, so removing it undoes the money.
*/
const costSchema = {
  date: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
  amount: { type: Number, min: 0, default: 0 },
  paidWith: { type: String, enum: [...SHOW_PAID_WITH, null], default: null },
  tx: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null },
  debt: { type: mongoose.Schema.Types.ObjectId, ref: 'DebtEntry', default: null },
};

const showSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    endDate: { type: String, default: null }, // multi-day shows
    location: { type: String, default: '', trim: true },
    notes: { type: String, default: '' },
    tableFee: costSchema,
    expenses: [{ ...costSchema, kind: { type: String, enum: EXPENSE_KINDS, default: 'Other' }, note: { type: String, default: '' } }],
  },
  { timestamps: true }
);

export default mongoose.model('Show', showSchema);
