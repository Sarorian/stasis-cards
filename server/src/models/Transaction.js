import mongoose from 'mongoose';
import { WALLETS } from '../constants.js';

// Every money movement is a ledger entry. Wallet balances = sum of amounts.
const transactionSchema = new mongoose.Schema(
  {
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    wallet: { type: String, enum: WALLETS, required: true },
    amount: { type: Number, required: true }, // + money in, - money out
    kind: {
      type: String,
      enum: ['capital', 'purchase', 'sale', 'binder_buy', 'binder_sell', 'transfer', 'adjustment', 'trade', 'misc_buy', 'misc_sell', 'debt_loan', 'debt_clean', 'grading', 'correction'],
      required: true,
    },
    card: { type: mongoose.Schema.Types.ObjectId, ref: 'Card' },
    purchase: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase' },
    binderEntry: { type: mongoose.Schema.Types.ObjectId, ref: 'BinderEntry' },
    trade: { type: mongoose.Schema.Types.ObjectId, ref: 'Trade' },
    miscItem: { type: mongoose.Schema.Types.ObjectId, ref: 'MiscItem' },
    miscEntry: { type: mongoose.Schema.Types.ObjectId, ref: 'MiscEntry' },
    debtEntry: { type: mongoose.Schema.Types.ObjectId, ref: 'DebtEntry' },
    transferId: { type: String },
    note: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.model('Transaction', transactionSchema);
