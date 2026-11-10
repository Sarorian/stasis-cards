import { Router } from 'express';
import DebtEntry from '../models/DebtEntry.js';
import Card from '../models/Card.js';
import Transaction from '../models/Transaction.js';
import { ah, HttpError, positive, checkWallet } from '../util.js';
import { today, round2, PARTNERS } from '../constants.js';

const r = Router();

const ADD_HOW = ['expense', 'loan', 'record'];
const CLEAN_HOW = ['wallet', 'card', 'record'];
const money = (n) => `$${Number(n).toFixed(2)}`;

// What the business owes each partner right now
export function balances(entries) {
  const out = Object.fromEntries(PARTNERS.map((p) => [p, { person: p, added: 0, cleaned: 0, owed: 0 }]));
  for (const e of entries) {
    const b = out[e.person];
    if (!b) continue;
    if (e.type === 'add') b.added = round2(b.added + e.amount);
    else b.cleaned = round2(b.cleaned + e.amount);
    b.owed = round2(b.added - b.cleaned);
  }
  return out;
}

const checkPerson = (p) => {
  if (!PARTNERS.includes(p)) throw new HttpError(400, `Pick who: ${PARTNERS.join(' or ')}.`);
  return p;
};

r.get('/', ah(async (req, res) => {
  const entries = await DebtEntry.find().sort({ date: 1, createdAt: 1 }) // oldest first, like the sheet.populate('card', 'name number game imageUrl cost').lean();
  const b = balances(entries);
  res.json({
    people: PARTNERS.map((p) => ({ ...b[p], entries: entries.filter((e) => e.person === p) })),
    total: round2(PARTNERS.reduce((a, p) => a + b[p].owed, 0)),
  });
}));

/*
  Add or cleanse debt.
  { person, type: 'add'|'clean', how, amount, date?, source?, wallet?, cardId? }
    add:   how = expense | loan (needs wallet) | record
    clean: how = wallet (needs wallet) | card (needs cardId; amount = value it's cleansed at) | record
*/
r.post('/', ah(async (req, res) => {
  const b = req.body || {};
  const person = checkPerson(b.person);
  const type = b.type;
  if (!['add', 'clean'].includes(type)) throw new HttpError(400, 'Type must be add or clean.');
  const how = b.how;
  if (!(type === 'add' ? ADD_HOW : CLEAN_HOW).includes(how)) throw new HttpError(400, 'Pick how this debt was added or cleansed.');
  const amount = positive(b.amount, type === 'add' ? 'Debt amount' : 'Cleanse amount');
  const date = b.date || today();
  const source = String(b.source || '').trim();
  const wallet = how === 'loan' || how === 'wallet' ? checkWallet(b.wallet) : null;

  let card = null;
  if (type === 'clean') {
    const owed = balances(await DebtEntry.find({ person }).lean())[person].owed;
    if (amount > owed + 0.004) {
      throw new HttpError(400, `The business only owes ${person} ${money(owed)}. You can't cleanse ${money(amount)}.`);
    }
    if (how === 'card') {
      card = await Card.findById(b.cardId);
      if (!card) throw new HttpError(400, 'Pick the card being taken.');
      if (card.status !== 'in_stock') throw new HttpError(400, `${card.name} isn't in stock.`);
    }
  }

  const entry = await DebtEntry.create({
    person, type, how, date, amount, wallet,
    source: source || (card ? card.name : ''),
    card: card?._id,
  });

  try {
    if (how === 'loan') {
      await Transaction.create({ date, wallet, amount, kind: 'debt_loan', debtEntry: entry._id, note: `${person} lent${source ? ` · ${source}` : ''}` });
    }
    if (how === 'wallet') {
      await Transaction.create({ date, wallet, amount: -amount, kind: 'debt_clean', debtEntry: entry._id, note: `${person} cleansed${source ? ` · ${source}` : ''}` });
    }
    if (card) {
      // The card leaves at the cleansed value, like a sale with no wallet
      card.status = 'sold';
      card.sale = { date, price: amount, fees: 0, method: null, payments: [], debt: entry._id, cleansedBy: person };
      await card.save();
    }
  } catch (err) {
    await Transaction.deleteMany({ debtEntry: entry._id });
    await entry.deleteOne();
    throw err;
  }
  res.status(201).json(entry);
}));

// Undo an entry (and the money / card it moved)
r.delete('/:id', ah(async (req, res) => {
  const entry = await DebtEntry.findById(req.params.id);
  if (!entry) throw new HttpError(404, 'Entry not found.');
  if (entry.purchase) throw new HttpError(409, 'This debt came from a card purchase. Delete that purchase to remove it.');
  if (entry.show) throw new HttpError(409, 'This is a show cost. Remove it on the Shows page.');
  if (entry.type === 'add') {
    const owed = balances(await DebtEntry.find({ person: entry.person }).lean())[entry.person].owed;
    if (owed - entry.amount < -0.004) {
      throw new HttpError(409, `Removing this would leave ${entry.person} owing the business ${money(entry.amount - owed)}. Undo a cleanse first.`);
    }
  }
  await Transaction.deleteMany({ debtEntry: entry._id });
  if (entry.how === 'card' && entry.card) {
    await Card.updateOne({ _id: entry.card, 'sale.debt': entry._id }, { status: 'in_stock', $unset: { sale: 1 } });
  }
  await entry.deleteOne();
  res.json({ deleted: entry._id });
}));

export default r;
