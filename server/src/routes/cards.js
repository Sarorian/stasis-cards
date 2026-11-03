import { Router } from 'express';
import Card from '../models/Card.js';
import Transaction from '../models/Transaction.js';
import { ah, HttpError, positive, parsePayments } from '../util.js';
import { today, round2 } from '../constants.js';
import { refreshCard } from '../prices/index.js';

const r = Router();

const EDITABLE = [
  'name', 'number', 'game', 'setName', 'condition', 'graded', 'imageUrl',
  'boughtDate', 'cost', 'marketAtPurchase', 'notes',
];

// List cards. Query: status=in_stock|sold|all (default in_stock), game, q
r.get('/', ah(async (req, res) => {
  const { status = 'in_stock', game, q } = req.query;
  const filter = {};
  if (status !== 'all') filter.status = status;
  if (game) filter.game = game;
  if (q) filter.name = { $regex: String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  const sort = status === 'sold' ? { 'sale.date': -1 } : { boughtDate: -1, createdAt: -1 };
  res.json(await Card.find(filter).sort(sort).select('-priceHistory'));
}));

r.get('/:id', ah(async (req, res) => {
  const card = await Card.findById(req.params.id);
  if (!card) throw new HttpError(404, 'Card not found.');
  res.json(card);
}));

// Create a single card without a purchase (e.g. fixing records). Normal buys go through /purchases.
r.post('/', ah(async (req, res) => {
  const body = { boughtDate: today(), ...req.body };
  body.market = { price: body.marketAtPurchase, sources: [], updatedAt: new Date() };
  const card = await Card.create(body);
  res.status(201).json(card);
}));

r.patch('/:id', ah(async (req, res) => {
  const card = await Card.findById(req.params.id);
  if (!card) throw new HttpError(404, 'Card not found.');
  for (const k of EDITABLE) if (k in req.body) card[k] = req.body[k];
  // Manually set the current market price (turns off auto-updates for this card until cleared)
  if ('marketPrice' in req.body) {
    if (req.body.marketPrice === null) {
      card.market.manualOverride = false;
    } else {
      card.market.price = positive(req.body.marketPrice, 'Market price');
      card.market.manualOverride = true;
      card.market.updatedAt = new Date();
      card.market.sources = [{ source: 'Manual', price: card.market.price }];
    }
  }
  await card.save();
  res.json(card);
}));

r.delete('/:id', ah(async (req, res) => {
  const existing = await Card.findById(req.params.id);
  if (!existing) throw new HttpError(404, 'Card not found.');
  if (existing.sale?.trade || existing.tradeIn) {
    throw new HttpError(409, `${existing.name} is part of a trade. Undo the trade on the Trade page instead.`);
  }
  if (existing.sale?.debt) throw new HttpError(409, `${existing.name} was taken to cleanse debt. Undo that on the Debt page instead.`);
  const card = await Card.findByIdAndDelete(req.params.id);
  await Transaction.deleteMany({ card: card._id, kind: 'sale' });
  res.json({ deleted: card._id });
}));

// Sell a card: { price, method, date?, fees? }  or split: { price, payments: [{ method, amount }], date?, fees? }
r.post('/:id/sell', ah(async (req, res) => {
  const card = await Card.findById(req.params.id);
  if (!card) throw new HttpError(404, 'Card not found.');
  if (card.status === 'sold') throw new HttpError(400, 'That card is already sold.');
  const price = positive(req.body.price, 'Sale price');
  const payments = parsePayments(req.body, price);
  const fees = round2(Number(req.body.fees) || 0);
  if (fees < 0 || fees > payments[0].amount) throw new HttpError(400, `Fees must be between $0 and the ${payments[0].method} amount.`);
  const date = req.body.date || today();

  card.status = 'sold';
  card.sale = { date, price, fees, method: payments[0].method, payments: payments.length > 1 ? payments : [] };
  await card.save();
  // One ledger row per wallet; fees come out of the biggest share
  await Transaction.insertMany(payments.map((p, i) => ({
    date, wallet: p.method, amount: round2(p.amount - (i === 0 ? fees : 0)), kind: 'sale', card: card._id,
    note: payments.length > 1 ? `Sold ${card.name} (split ${i + 1}/${payments.length})` : `Sold ${card.name}`,
  })));
  res.json(card);
}));

// Undo a sale (puts the card back in stock and removes the money)
r.post('/:id/unsell', ah(async (req, res) => {
  const card = await Card.findById(req.params.id);
  if (!card) throw new HttpError(404, 'Card not found.');
  if (card.status !== 'sold') throw new HttpError(400, 'That card is not sold.');
  if (card.sale?.trade) throw new HttpError(409, `${card.name} left in a trade. Undo the trade on the Trade page instead.`);
  if (card.sale?.debt) throw new HttpError(409, `${card.name} was taken to cleanse debt. Undo that on the Debt page instead.`);
  card.status = 'in_stock';
  card.sale = { date: undefined, price: undefined, fees: 0, method: null, payments: [] };
  await card.save();
  await Transaction.deleteMany({ card: card._id, kind: 'sale' });
  res.json(card);
}));

// Refresh one card's market price and image now
r.post('/:id/refresh', ah(async (req, res) => {
  const card = await Card.findById(req.params.id);
  if (!card) throw new HttpError(404, 'Card not found.');
  const result = await refreshCard(card, { force: true });
  res.json({ card, result });
}));

export default r;
