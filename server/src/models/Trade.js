import mongoose from 'mongoose';
import { WALLETS } from '../constants.js';

/*
  A trade: our cards (and/or binder cards) go out, their cards (and/or binder cards) come in,
  and cash settles the difference.
    Our cards count as sold for the value we gave them.
    Their cards count as bought for the value we gave them (their cost).
    Only the cash moves a wallet.
  Balance: outTotal = inTotal + cash   (cash > 0 = they paid us, < 0 = we paid them)
*/
const lineSchema = new mongoose.Schema(
  {
    card: { type: mongoose.Schema.Types.ObjectId, ref: 'Card' },
    name: String,
    number: String,
    game: String,
    market: Number,
    value: Number, // final value used for the trade (after any cash rounding)
    // For our cards: what it cost us (so history shows profit even after undo/edits)
    cost: Number,
  },
  { _id: false }
);

const binderSideSchema = new mongoose.Schema(
  {
    count: { type: Number, min: 1 },
    value: Number,
    // Their binder cards: what we decided they're worth at market (value = the credit we gave)
    market: Number,
    entry: { type: mongoose.Schema.Types.ObjectId, ref: 'BinderEntry' },
  },
  { _id: false }
);

const tradeSchema = new mongoose.Schema(
  {
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    // Where: a show id, 'private' or 'ebay' (null = not set)
    at: { type: String, default: null },
    tradeInPct: { type: Number, default: 80 },
    outCards: [lineSchema],
    outBinder: { type: binderSideSchema, default: null },
    inCards: [lineSchema],
    inBinder: { type: binderSideSchema, default: null },
    outTotal: Number,
    inTotal: Number,
    // What the values said the cash should be, and what was actually paid (+ in to us, - out from us)
    calculatedCash: Number,
    cash: { type: Number, default: 0 },
    method: { type: String, enum: [...WALLETS, null], default: null }, // biggest share when split
    // Split cash, e.g. they paid $50 Cash + $30 Venmowen. Amounts are positive; direction comes from `cash`.
    payments: [{ _id: false, method: { type: String, enum: WALLETS }, amount: Number }],
    // cash - calculatedCash difference that was absorbed into card values
    roundingAdjustment: { type: Number, default: 0 },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.model('Trade', tradeSchema);
