import { Router } from 'express';
import BinderEntry from '../models/BinderEntry.js';
import Transaction from '../models/Transaction.js';
import { ah, HttpError, positive, checkWallet, binderPool } from '../util.js';
import { today, round2 } from '../constants.js';

const r = Router();

r.get('/', ah(async (req, res) => {
  const entries = await BinderEntry.find().sort({ date: -1, createdAt: -1 });
  res.json({ pool: await binderPool(), entries });
}));

// Buy binder cards: { count, amount, method, date? }
r.post('/buy', ah(async (req, res) => {
  const count = Math.round(positive(req.body.count, 'Card count'));
  const amount = positive(req.body.amount, 'Total paid');
  const method = checkWallet(req.body.method);
  const date = req.body.date || today();
  const entry = await BinderEntry.create({ type: 'buy', date, count, amount, method, notes: req.body.notes });
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

r.delete('/:id', ah(async (req, res) => {
  const entry = await BinderEntry.findByIdAndDelete(req.params.id);
  if (!entry) throw new HttpError(404, 'Entry not found.');
  await Transaction.deleteMany({ binderEntry: entry._id });
  res.json({ deleted: entry._id, pool: await binderPool() });
}));

export default r;
