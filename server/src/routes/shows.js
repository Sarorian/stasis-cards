import { Router } from 'express';
import mongoose from 'mongoose';
import Show, { SHOW_PAID_WITH, EXPENSE_KINDS } from '../models/Show.js';
import Card from '../models/Card.js';
import BinderEntry from '../models/BinderEntry.js';
import MiscEntry from '../models/MiscEntry.js';
import Purchase from '../models/Purchase.js';
import Trade from '../models/Trade.js';
import DebtEntry from '../models/DebtEntry.js';
import Transaction from '../models/Transaction.js';
import { ah, HttpError, positive } from '../util.js';
import { today, round2, debtPerson } from '../constants.js';
import { balances } from './debt.js';

const r = Router();
const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const money = (n) => `$${Number(n).toFixed(2)}`;
const sum = (list, f) => round2(list.reduce((a, x) => a + (f(x) || 0), 0));

/*
  Pay one show cost. paidWith = a wallet (money leaves it), "Owen (debt)" / "Ben (debt)" (they paid,
  the business owes them; it shows on the Debt page) or "Already paid" (counted as a cost, no money moves).
*/
async function payCost(show, { amount, paidWith, date, label }) {
  if (!SHOW_PAID_WITH.includes(paidWith)) throw new HttpError(400, 'Pick how it was paid.');
  const out = { tx: null, debt: null };
  if (paidWith === 'Already paid' || !(amount > 0)) return out;
  const person = debtPerson(paidWith);
  if (person) {
    const d = await DebtEntry.create({ person, type: 'add', how: 'expense', date, amount, source: `${show.name}: ${label}`, show: show._id });
    out.debt = d._id;
  } else {
    const t = await Transaction.create({ date, wallet: paidWith, amount: -amount, kind: 'show_expense', show: show._id, note: `${show.name}: ${label}` });
    out.tx = t._id;
  }
  return out;
}

// Undo a cost's money. Refuses if removing someone's debt would leave them owing the business.
async function checkUnpay(cost) {
  if (!cost?.debt) return;
  const entry = await DebtEntry.findById(cost.debt).lean();
  if (!entry) return;
  const owed = balances(await DebtEntry.find({ person: entry.person }).lean())[entry.person].owed;
  if (owed - entry.amount < -0.004) {
    throw new HttpError(409, `Removing this would leave ${entry.person} owing the business ${money(entry.amount - owed)}. Undo a cleanse on the Debt page first.`);
  }
}
async function unpay(cost) {
  if (cost?.tx) await Transaction.deleteOne({ _id: cost.tx });
  if (cost?.debt) await DebtEntry.deleteOne({ _id: cost.debt });
}

// Everything that happened at each show, from the records that point at it
export async function showStats(shows) {
  const ids = shows.map((s) => String(s._id));
  const [cardsSold, cardsBought, binder, misc] = await Promise.all([
    Card.find({ 'sale.at': { $in: ids } }, 'name cost sale').lean(),
    Card.find({ boughtAt: { $in: ids } }, 'name cost tradeIn boughtAt').lean(),
    BinderEntry.find({ at: { $in: ids } }).lean(),
    MiscEntry.find({ at: { $in: ids }, type: 'sell' }).lean(),
  ]);
  const out = new Map();
  for (const s of shows) {
    const id = String(s._id);
    const sold = cardsSold.filter((c) => c.sale?.at === id);
    const cashSold = sold.filter((c) => !c.sale.trade && !c.sale.debt);
    const tradedAway = sold.filter((c) => c.sale.trade);
    const bSells = binder.filter((e) => e.at === id && e.type === 'sell');
    const bBuys = binder.filter((e) => e.at === id && e.type === 'buy');
    const mSells = misc.filter((e) => e.at === id);
    const bought = cardsBought.filter((c) => c.boughtAt === id);

    const liquidRevenue = round2(sum(cashSold, (c) => c.sale.price) + sum(bSells.filter((e) => !e.trade), (e) => e.amount) + sum(mSells, (e) => e.amount));
    const liquidProfit = round2(
      sum(cashSold, (c) => c.sale.price - (c.sale.fees || 0) - c.cost)
      + sum(bSells.filter((e) => !e.trade), (e) => e.amount - (e.costBasis || 0))
      + sum(mSells, (e) => e.amount - (e.fees || 0) - e.costBasis),
    );
    const tradeRevenue = round2(sum(tradedAway, (c) => c.sale.price) + sum(bSells.filter((e) => e.trade), (e) => e.amount));
    const tradeProfit = round2(sum(tradedAway, (c) => c.sale.price - c.cost) + sum(bSells.filter((e) => e.trade), (e) => e.amount - (e.costBasis || 0)));
    const expenses = round2((s.tableFee?.amount || 0) + sum(s.expenses || [], (e) => e.amount));

    out.set(id, {
      liquid: { revenue: liquidRevenue, profit: liquidProfit, cardsSold: cashSold.length, binderSold: sum(bSells.filter((e) => !e.trade), (e) => e.count), sealedSold: sum(mSells, (e) => e.units) },
      trade: { revenue: tradeRevenue, profit: tradeProfit, cardsOut: tradedAway.length, binderOut: sum(bSells.filter((e) => e.trade), (e) => e.count) },
      bought: {
        cards: bought.filter((c) => !c.tradeIn).length, cardsCost: sum(bought.filter((c) => !c.tradeIn), (c) => c.cost),
        tradedIn: bought.filter((c) => c.tradeIn).length,
        binder: sum(bBuys, (e) => e.count), binderCost: sum(bBuys.filter((e) => e.method !== 'Trade'), (e) => e.amount),
      },
      expenses,
      net: round2(liquidProfit + tradeProfit - expenses),
    });
  }
  return out;
}

// How many records point at a show (it can't be deleted while any do)
async function usage(id) {
  const sid = String(id);
  const counts = await Promise.all([
    Purchase.countDocuments({ at: sid }), Card.countDocuments({ 'sale.at': sid }), Card.countDocuments({ boughtAt: sid }),
    BinderEntry.countDocuments({ at: sid }), MiscEntry.countDocuments({ at: sid }), Trade.countDocuments({ at: sid }),
  ]);
  return counts.reduce((a, b) => a + b, 0);
}

const load = async (id) => {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, 'Show not found.');
  const s = await Show.findById(id);
  if (!s) throw new HttpError(404, 'Show not found.');
  return s;
};
const withStats = async (show) => ({ ...show.toObject(), stats: (await showStats([show])).get(String(show._id)) });

function checkDates(date, endDate) {
  if (!dateRe.test(date || '')) throw new HttpError(400, 'Pick the show date.');
  if (endDate && (!dateRe.test(endDate) || endDate < date)) throw new HttpError(400, 'The end date must be on or after the start date.');
}

// Where we sell best: shows vs eBay vs private sales (vs older sales with no "where").
// Liquid = sold for money; trades are counted separately (their value, not cash).
r.get('/channels', ah(async (req, res) => {
  const [cards, binder, misc] = await Promise.all([
    Card.find({ status: 'sold', 'sale.debt': { $in: [null, undefined] } }, 'cost boughtDate sale').lean(),
    BinderEntry.find({ type: 'sell' }).lean(),
    MiscEntry.find({ type: 'sell' }).lean(),
  ]);
  const channel = (at) => (!at ? 'unset' : at === 'ebay' || at === 'private' ? at : 'shows');
  const rows = Object.fromEntries(['shows', 'ebay', 'private', 'unset'].map((k) => [k, {
    channel: k, revenue: 0, fees: 0, profit: 0, sales: 0, cardDays: [], tradeRevenue: 0, tradeProfit: 0,
  }]));
  const days = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
  for (const c of cards) {
    if (c.sale?.debt) continue;
    const row = rows[channel(c.sale?.at)];
    if (c.sale.trade) {
      row.tradeRevenue += c.sale.price;
      row.tradeProfit += c.sale.price - c.cost;
      continue;
    }
    row.revenue += c.sale.price;
    row.fees += c.sale.fees || 0;
    row.profit += c.sale.price - (c.sale.fees || 0) - c.cost;
    row.sales += 1;
    if (c.boughtDate && c.sale.date) row.cardDays.push(days(c.boughtDate, c.sale.date));
  }
  for (const e of binder) {
    const row = rows[channel(e.at)];
    if (e.trade) { row.tradeRevenue += e.amount; row.tradeProfit += e.amount - (e.costBasis || 0); continue; }
    row.revenue += e.amount; row.profit += e.amount - (e.costBasis || 0); row.sales += 1;
  }
  for (const e of misc) {
    const row = rows[channel(e.at)];
    row.revenue += e.amount; row.fees += e.fees || 0; row.profit += e.amount - (e.fees || 0) - e.costBasis; row.sales += 1;
  }
  // Show costs come off the shows row
  const shows = await Show.find().lean();
  const showCosts = round2(shows.reduce((a, sh) => a + (sh.tableFee?.amount || 0) + sum(sh.expenses || [], (x) => x.amount), 0));
  res.json(Object.values(rows).map((r0) => {
    const { cardDays, ...row } = r0;
    const costs = row.channel === 'shows' ? showCosts : 0;
    const profit = round2(row.profit);
    return {
      ...row, revenue: round2(row.revenue), fees: round2(row.fees), profit, tradeRevenue: round2(row.tradeRevenue), tradeProfit: round2(row.tradeProfit),
      costs, net: round2(profit + row.tradeProfit - costs),
      marginPct: row.revenue > 0 ? Math.round((profit / row.revenue) * 1000) / 10 : null,
      avgDaysToSell: cardDays.length ? Math.round(cardDays.reduce((a, b) => a + b, 0) / cardDays.length) : null,
    };
  }));
}));

// List shows, newest first, each with its numbers
r.get('/', ah(async (req, res) => {
  const shows = await Show.find().sort({ date: -1 }).lean();
  const stats = await showStats(shows);
  res.json(shows.map((s) => ({ ...s, stats: stats.get(String(s._id)) })));
}));

// Add a show: { name, date, endDate?, location?, notes?, tableFee?, paidWith }
r.post('/', ah(async (req, res) => {
  const b = req.body || {};
  if (!String(b.name || '').trim()) throw new HttpError(400, 'Give the show a name.');
  checkDates(b.date, b.endDate || null);
  const fee = round2(Number(b.tableFee) || 0);
  if (fee < 0) throw new HttpError(400, 'The table fee can’t be negative.');
  if (fee > 0 && !SHOW_PAID_WITH.includes(b.paidWith)) throw new HttpError(400, 'Pick how the table fee was paid.');
  const show = new Show({
    name: String(b.name).trim(), date: b.date, endDate: b.endDate || null, location: String(b.location || '').trim(), notes: b.notes || '',
  });
  const feeDate = b.paidWith === 'Already paid' ? b.date : today();
  const paid = fee > 0 ? await payCost(show, { amount: fee, paidWith: b.paidWith, date: feeDate, label: 'table fee' }) : {};
  show.tableFee = { date: feeDate, amount: fee, paidWith: fee > 0 ? b.paidWith : null, ...paid };
  await show.save();
  res.status(201).json(await withStats(show));
}));

// Edit name, dates, location, notes
r.patch('/:id', ah(async (req, res) => {
  const show = await load(req.params.id);
  const b = req.body || {};
  if ('name' in b) { if (!String(b.name || '').trim()) throw new HttpError(400, 'Name can’t be empty.'); show.name = String(b.name).trim(); }
  const date = 'date' in b ? b.date : show.date;
  const endDate = 'endDate' in b ? (b.endDate || null) : show.endDate;
  checkDates(date, endDate);
  show.date = date;
  show.endDate = endDate;
  if ('location' in b) show.location = String(b.location || '').trim();
  if ('notes' in b) show.notes = b.notes || '';
  await show.save();
  res.json(await withStats(show));
}));

// Change the table fee: { amount, paidWith }. The old payment is undone and the new one made.
r.put('/:id/table-fee', ah(async (req, res) => {
  const show = await load(req.params.id);
  const amount = round2(Number(req.body.amount) || 0);
  if (amount < 0) throw new HttpError(400, 'The table fee can’t be negative.');
  if (amount > 0 && !SHOW_PAID_WITH.includes(req.body.paidWith)) throw new HttpError(400, 'Pick how the table fee was paid.');
  await checkUnpay(show.tableFee);
  await unpay(show.tableFee);
  const date = req.body.paidWith === 'Already paid' ? show.date : today();
  const paid = amount > 0 ? await payCost(show, { amount, paidWith: req.body.paidWith, date, label: 'table fee' }) : {};
  show.tableFee = { date, amount, paidWith: amount > 0 ? req.body.paidWith : null, tx: null, debt: null, ...paid };
  await show.save();
  res.json(await withStats(show));
}));

// Add an expense: { kind, amount, paidWith, date?, note? }
r.post('/:id/expenses', ah(async (req, res) => {
  const show = await load(req.params.id);
  const b = req.body || {};
  const kind = EXPENSE_KINDS.includes(b.kind) ? b.kind : 'Other';
  const amount = round2(positive(b.amount, 'Amount'));
  if (b.paidWith === 'Already paid' || !SHOW_PAID_WITH.includes(b.paidWith)) throw new HttpError(400, 'Pick who or what paid for it.');
  const date = b.date || today();
  if (!dateRe.test(date)) throw new HttpError(400, 'Pick a date.');
  const note = String(b.note || '').trim();
  const paid = await payCost(show, { amount, paidWith: b.paidWith, date, label: note ? `${kind.toLowerCase()} (${note})` : kind.toLowerCase() });
  show.expenses.push({ kind, amount, paidWith: b.paidWith, date, note, ...paid });
  await show.save();
  res.status(201).json(await withStats(show));
}));

r.delete('/:id/expenses/:eid', ah(async (req, res) => {
  const show = await load(req.params.id);
  const exp = show.expenses.id(req.params.eid);
  if (!exp) throw new HttpError(404, 'Expense not found.');
  await checkUnpay(exp);
  await unpay(exp);
  show.expenses = show.expenses.filter((e) => String(e._id) !== req.params.eid);
  await show.save();
  res.json(await withStats(show));
}));

// Delete a show (only when nothing was bought or sold there). Its costs' money is undone.
r.delete('/:id', ah(async (req, res) => {
  const show = await load(req.params.id);
  const n = await usage(show._id);
  if (n) throw new HttpError(409, `${n} buy/sale record${n === 1 ? '' : 's'} point at this show. Change or undo those first.`);
  for (const c of [show.tableFee, ...show.expenses]) await checkUnpay(c);
  for (const c of [show.tableFee, ...show.expenses]) await unpay(c);
  await show.deleteOne();
  res.json({ deleted: show._id });
}));

export default r;
