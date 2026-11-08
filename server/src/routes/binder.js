import { Router } from 'express';
import BinderEntry from '../models/BinderEntry.js';
import Settings from '../models/Settings.js';
import Card from '../models/Card.js';
import Transaction from '../models/Transaction.js';
import { ah, HttpError, positive, checkWallet, binderPool } from '../util.js';
import { today, round2 } from '../constants.js';

const r = Router();

r.get('/', ah(async (req, res) => {
  const entries = await BinderEntry.find().sort({ date: -1, createdAt: -1 });
  res.json({ pool: await binderPool(), entries });
}));

// Buy binder cards: { count, market, amount, method, date? }  market = what they're worth, amount = what we paid
r.post('/buy', ah(async (req, res) => {
  const count = Math.round(positive(req.body.count, 'Card count'));
  const market = round2(positive(req.body.market, 'Market value'));
  const amount = positive(req.body.amount, 'Total paid');
  const method = checkWallet(req.body.method);
  const date = req.body.date || today();
  const entry = await BinderEntry.create({ type: 'buy', date, count, amount, market, method, notes: req.body.notes });
  await Transaction.create({
    date, wallet: method, amount: -amount, kind: 'binder_buy', binderEntry: entry._id,
    note: `Bought ${count} binder cards`,
  });
  res.status(201).json({ entry, pool: await binderPool() });
}));

// Sell binder cards: { count, amount, method, date? }
r.post('/sell', ah(async (req, res) => {
  const count = Math.round(positive(req.body.count, 'Card count'));
  const amount = positive(req.body.amount, 'Sale price');
  const method = checkWallet(req.body.method);
  const date = req.body.date || today();
  const pool = await binderPool();
  if (count > pool.count) throw new HttpError(400, `Only ${pool.count} binder cards in stock.`);
  const costBasis = round2(pool.avgCost * count);
  const entry = await BinderEntry.create({ type: 'sell', date, count, amount, method, costBasis, notes: req.body.notes });
  await Transaction.create({
    date, wallet: method, amount, kind: 'binder_sell', binderEntry: entry._id,
    note: `Sold ${count} binder cards`,
  });
  res.status(201).json({ entry, pool: await binderPool() });
}));

// Re-estimate the whole binder (counted by hand): { value, date? }
r.put('/value', ah(async (req, res) => {
  const value = Number(req.body.value);
  if (!(value >= 0)) throw new HttpError(400, 'Enter the binder\'s market value.');
  const before = await binderPool();
  if (before.count <= 0) throw new HttpError(400, 'There are no binder cards to value.');
  const s = await Settings.get();
  s.binderValuations.push({ date: req.body.date || today(), value: round2(value), prev: before.value, at: new Date() });
  s.log.push({ date: today(), text: `Binder re-estimated: $${before.value.toFixed(2)} → $${round2(value).toFixed(2)}` });
  await s.save();
  res.json({ pool: await binderPool() });
}));

r.delete('/:id', ah(async (req, res) => {
  const existing = await BinderEntry.findById(req.params.id);
  if (!existing) throw new HttpError(404, 'Entry not found.');
  if (existing.trade) throw new HttpError(409, 'This binder entry is part of a trade. Undo the trade on the Trade page instead.');
  if (existing.type === 'buy') {
    const pool = await binderPool();
    if (pool.count - existing.count < 0) {
      throw new HttpError(409, `The binder only has ${pool.count} card${pool.count === 1 ? '' : 's'} left, so ${existing.count} can't come out. Undo a binder sale first.`);
    }
  }
  // Undoing a conversion puts the card back in inventory
  if (existing.method === 'Convert' && existing.card) {
    await Card.updateOne({ _id: existing.card, binderEntry: existing._id }, { status: 'in_stock', binderEntry: null });
  }
  const entry = await BinderEntry.findByIdAndDelete(req.params.id);
  await Transaction.deleteMany({ binderEntry: entry._id });
  res.json({ deleted: entry._id, pool: await binderPool() });
}));

export default r;
