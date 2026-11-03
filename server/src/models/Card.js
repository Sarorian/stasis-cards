import mongoose from 'mongoose';
import { GAMES, WALLETS, CONDITIONS, GRADERS } from '../constants.js';

const dateStr = { type: String, match: /^\d{4}-\d{2}-\d{2}$/ };

const priceSourceSchema = new mongoose.Schema(
  { source: String, price: Number, url: String },
  { _id: false }
);

const cardSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    number: { type: String, trim: true, default: '' },
    game: { type: String, enum: GAMES, required: true },
    setName: { type: String, default: '' },

    // Raw cards use condition; graded cards use graded.company + graded.grade
    condition: { type: String, enum: CONDITIONS, default: 'NM' },
    graded: {
      company: { type: String, enum: [...GRADERS, null], default: null },
      grade: { type: String, default: null },
    },

    imageUrl: { type: String, default: '' },

    purchase: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase' },
    // Set when this card came in through a trade
    tradeIn: { type: mongoose.Schema.Types.ObjectId, ref: 'Trade' },
    boughtDate: { ...dateStr, required: true },
    cost: { type: Number, required: true, min: 0 },
    marketAtPurchase: { type: Number, required: true, min: 0 },
    // cost / marketAtPurchase * 100, frozen at purchase time
    pctOfMarket: { type: Number },

    market: {
      price: { type: Number, default: 0 },
      sources: [priceSourceSchema],
      updatedAt: Date,
      manualOverride: { type: Boolean, default: false },
    },
    priceHistory: [{ _id: false, date: String, price: Number }],
    external: {
      tcgapiId: String,
      tcgapiPrinting: String,
      pokemontcgId: String,
      pokemontcgVariant: String,
      pricechartingId: String,
    },

    status: { type: String, enum: ['in_stock', 'sold'], default: 'in_stock' },
    sale: {
      date: dateStr,
      price: Number,
      fees: { type: Number, default: 0 },
      method: { type: String, enum: [...WALLETS, null], default: null }, // biggest share when split
      // Split payments, e.g. [{ Cash, 200 }, { Venmowen, 100 }]. Empty = all to `method`.
      payments: [{ _id: false, method: { type: String, enum: WALLETS }, amount: Number }],
      // Set when this card left in a trade (no wallet: sale.price is the trade value)
      trade: { type: mongoose.Schema.Types.ObjectId, ref: 'Trade' },
      // Set when a partner took this card to cleanse debt (sale.price is the cleansed value)
      debt: { type: mongoose.Schema.Types.ObjectId, ref: 'DebtEntry' },
      cleansedBy: { type: String, default: null },
    },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

cardSchema.virtual('isGraded').get(function () {
  return Boolean(this.graded?.company);
});

cardSchema.pre('validate', function (next) {
  if (this.marketAtPurchase > 0) {
    this.pctOfMarket = Math.round((this.cost / this.marketAtPurchase) * 1000) / 10;
  }
  next();
});

cardSchema.set('toJSON', { virtuals: true });

export default mongoose.model('Card', cardSchema);
