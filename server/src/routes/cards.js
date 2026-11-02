import { Router } from 'express';
import Card from '../models/Card.js';
import Transaction from '../models/Transaction.js';
import { ah, HttpError, positive, checkWallet } from '../util.js';
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
  const card = await Card.findByIdAndDelete(req.params.id);
  if (!card) throw new HttpError(404, 'Card not found.');
  await Transaction.deleteMany({ card: card._id, kind: 'sale' });
  res.json({ deleted: card._id });
}));

// Sell a card: { price, method, date?, fees? }
r.post('/:id/sell', ah(async (req, res) => {
  const card = await Card.findById(req.params.id);
  if (!card) throw new HttpError(404, 'Card not found.');
  if (card.status === 'sold') throw new HttpError(400, 'That card is already sold.');
  const price = positive(req.body.price, 'Sale price');
  const method = checkWallet(req.body.method);
  const fees = round2(Number(req.body.fees) || 0);
  const date = req.body.date || today();

  card.status = 'sold';
  card.sale = { date, price, fees, method };
  await card.save();
  await Transaction.create({
    date, wallet: method, amount: round2(price - fees), kind: 'sale', card: card._id,
    note: `Sold ${card.name}`,
  });
  res.json(card);
}));

// Undo a sale (puts the card back in stock and removes the money)
r.post('/:id/unsell', ah(async (req, res) => {
  const card = await Card.findById(req.params.id);
  if (!card) throw new HttpError(404, 'Card not found.');
  if (card.status !== 'sold') throw new HttpError(400, 'That card is not sold.');
  card.status = 'in_stock';
  card.sale = { date: undefined, price: undefined, fees: 0, method: null };
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
