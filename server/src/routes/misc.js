import { Router } from 'express';
import MiscItem from '../models/MiscItem.js';
import MiscEntry from '../models/MiscEntry.js';
import Transaction from '../models/Transaction.js';
import { ah, HttpError, positive, checkWallet } from '../util.js';
import { today, round2, GAMES } from '../constants.js';

const r = Router();

const wholeUnits = (n, label = 'Quantity') => {
  const v = Number(n);
  if (!Number.isInteger(v) || v < 1) throw new HttpError(400, `${label} must be a whole number of 1 or more.`);
  return v;
};
const checkGame = (g) => {
  if (![...GAMES, 'Other'].includes(g)) throw new HttpError(400, 'Pick a game, or Other.');
  return g;
};

// Item + its entries -> what's left and how it's doing
export function summarize(item, entries) {
  const it = item.toObject ? item.toObject() : item;
  const sells = entries.filter((e) => e.type === 'sell');
  const opens = entries.filter((e) => e.type === 'open');
  const sold = sells.reduce((a, e) => a + e.units, 0);
  const opened = opens.reduce((a, e) => a + e.units, 0);
  const revenue = round2(sells.reduce((a, e) => a + e.amount, 0));
  const fees = round2(sells.reduce((a, e) => a + (e.fees || 0), 0));
  const cogs = round2(sells.reduce((a, e) => a + e.costBasis, 0));
  const writtenOff = round2(opens.reduce((a, e) => a + e.costBasis, 0));
  const remaining = it.units - sold - opened;
  return {
    ...it,
    unitCost: round2(it.cost / it.units),
    sold,
    opened,
    remaining,
    remainingCost: round2(it.cost - cogs - writtenOff),
    revenue,
    fees,
    cogs,
    writtenOff,
    profit: round2(revenue - fees - cogs - writtenOff),
    entries: [...entries].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt > a.createdAt ? 1 : -1)),
  };
}

async function loadOne(id) {
  const item = await MiscItem.findById(id);
  if (!item) throw new HttpError(404, 'Item not found.');
  const entries = await MiscEntry.find({ item: item._id }).lean();
  return { item, entries, s: summarize(item, entries) };
}

r.get('/', ah(async (req, res) => {
  const [items, entries] = await Promise.all([MiscItem.find().sort({ date: -1, createdAt: -1 }).lean(), MiscEntry.find().lean()]);
  const byItem = new Map();
  entries.forEach((e) => byItem.set(String(e.item), [...(byItem.get(String(e.item)) || []), e]));
  res.json(items.map((i) => summarize(i, byItem.get(String(i._id)) || [])));
}));

// Log a purchase: { name, game, units, unitLabel?, cost, paidFrom, date?, notes? }
r.post('/', ah(async (req, res) => {
  const b = req.body || {};
  if (!b.name?.trim()) throw new HttpError(400, 'Give the item a name, like "Riftbound Origins booster box".');
  const item = await MiscItem.create({
    name: b.name.trim(),
    game: checkGame(b.game || 'Other'),
    date: b.date || today(),
    units: wholeUnits(b.units),
    unitLabel: (b.unitLabel || 'packs').trim() || 'packs',
    cost: positive(b.cost, 'Total cost'),
    paidFrom: checkWallet(b.paidFrom),
    notes: b.notes || '',
  });
  await Transaction.create({
    date: item.date, wallet: item.paidFrom, amount: -item.cost, kind: 'misc_buy', miscItem: item._id,
    note: `Bought ${item.name}`,
  });
  res.status(201).json(summarize(item, []));
}));

// Edit an item. Quantity and cost can only change before anything has been sold or opened.
r.patch('/:id', ah(async (req, res) => {
  const { item, entries } = await loadOne(req.params.id);
  const b = req.body || {};
  if ('name' in b) { if (!String(b.name).trim()) throw new HttpError(400, 'Name can’t be empty.'); item.name = String(b.name).trim(); }
  if ('game' in b) item.game = checkGame(b.game);
  if ('notes' in b) item.notes = b.notes || '';
  if ('unitLabel' in b) item.unitLabel = String(b.unitLabel || 'packs').trim() || 'packs';
  if ('date' in b && b.date) item.date = b.date;
  if ('paidFrom' in b) item.paidFrom = checkWallet(b.paidFrom);
  if ('units' in b || 'cost' in b) {
    if (entries.length) throw new HttpError(409, 'Quantity and cost are locked once something has been sold or opened. Undo those entries first.');
    if ('units' in b) item.units = wholeUnits(b.units);
    if ('cost' in b) item.cost = positive(b.cost, 'Total cost');
  }
  await item.save();
  await Transaction.updateMany({ miscItem: item._id, kind: 'misc_buy' }, { date: item.date, wallet: item.paidFrom, amount: -item.cost, note: `Bought ${item.name}` });
  res.json(summarize(item, entries));
}));

// Delete an item with all its sales and money
r.delete('/:id', ah(async (req, res) => {
  const { item } = await loadOne(req.params.id);
  await Transaction.deleteMany({ miscItem: item._id });
  await MiscEntry.deleteMany({ item: item._id });
  await item.deleteOne();
  res.json({ deleted: item._id });
}));

// Cost of `units` leaving now. The last units out take whatever cost is left, so cents always add up.
function costFor(s, units) {
  if (units > s.remaining) throw new HttpError(400, `Only ${s.remaining} ${s.unitLabel} left.`);
  return units === s.remaining ? s.remainingCost : round2((s.cost / s.units) * units);
}

// Sell units: { units, amount, method, fees?, date?, notes? }
r.post('/:id/sell', ah(async (req, res) => {
  const { item, s } = await loadOne(req.params.id);
  const units = wholeUnits(req.body.units, 'Number sold');
  const amount = positive(req.body.amount, 'Sale price');
  const fees = round2(Number(req.body.fees) || 0);
  if (fees < 0) throw new HttpError(400, 'Fees can’t be negative.');
  const method = checkWallet(req.body.method);
  const date = req.body.date || today();
  const entry = await MiscEntry.create({
    item: item._id, type: 'sell', date, units, amount, fees, method, costBasis: costFor(s, units), notes: req.body.notes || '',
  });
  await Transaction.create({
    date, wallet: method, amount: round2(amount - fees), kind: 'misc_sell', miscItem: item._id, miscEntry: entry._id,
    note: `Sold ${units} ${s.unitLabel} of ${item.name}`,
  });
  const { s: after } = await loadOne(item._id);
  res.status(201).json(after);
}));

// Opened ourselves: { units, date?, notes? } -> written off at cost, no money moves
r.post('/:id/open', ah(async (req, res) => {
  const { item, s } = await loadOne(req.params.id);
  const units = wholeUnits(req.body.units, 'Number opened');
  const date = req.body.date || today();
  await MiscEntry.create({ item: item._id, type: 'open', date, units, costBasis: costFor(s, units), notes: req.body.notes || '' });
  const { s: after } = await loadOne(item._id);
  res.status(201).json(after);
}));

// Undo one sale or opening
r.delete('/entries/:entryId', ah(async (req, res) => {
  const entry = await MiscEntry.findById(req.params.entryId);
  if (!entry) throw new HttpError(404, 'Entry not found.');
  await Transaction.deleteMany({ miscEntry: entry._id });
  await entry.deleteOne();
  const { s } = await loadOne(entry.item);
  res.json(s);
}));

export default r;
