import { Router } from 'express';
import Card from '../models/Card.js';
import Transaction from '../models/Transaction.js';
import Purchase from '../models/Purchase.js';
import { ah, HttpError, positive, parsePayments, checkWallet } from '../util.js';
import { today, round2, GAMES, CONDITIONS, GRADERS } from '../constants.js';
import { refreshCard, manualReason } from '../prices/index.js';

const r = Router();

// Plain fields that can be edited directly (cost and grading are handled separately below)
const EDITABLE = ['name', 'number', 'setName', 'imageUrl', 'boughtDate', 'marketAtPurchase', 'notes'];
const feeTotal = (card) => round2((card.gradingFees || []).reduce((a, f) => a + (f.amount || 0), 0));

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

/*
  Edit a card. Besides the plain fields:
    game, condition
    graded: { company, grade } or null
    paid: what we paid for it (cost without grading fees). For cards from a purchase,
          the purchase payment changes by the difference so the wallet stays right.
    gradingFee: { amount, wallet, date? }   adds to cost and comes out of that wallet
*/
r.patch('/:id', ah(async (req, res) => {
  const card = await Card.findById(req.params.id);
  if (!card) throw new HttpError(404, 'Card not found.');
  const b = req.body || {};
  for (const k of EDITABLE) if (k in b) card[k] = b[k];
  if ('name' in b && !String(b.name || '').trim()) throw new HttpError(400, 'Name can’t be empty.');
  if ('game' in b) {
    if (!GAMES.includes(b.game)) throw new HttpError(400, 'Pick a game.');
    card.game = b.game;
  }
  if ('language' in b) card.language = b.language === 'JP' ? 'JP' : 'EN';
  if ('condition' in b) {
    if (!CONDITIONS.includes(b.condition)) throw new HttpError(400, 'Pick a condition.');
    card.condition = b.condition;
  }
  if ('graded' in b) {
    if (b.graded?.company) {
      if (!GRADERS.includes(b.graded.company)) throw new HttpError(400, 'Pick a grading company.');
      if (!String(b.graded.grade || '').trim()) throw new HttpError(400, 'Enter the grade.');
      card.graded = { company: b.graded.company, grade: String(b.graded.grade).trim() };
    } else {
      card.graded = { company: null, grade: null };
    }
  }

  // Fix what we paid
  const txToCreate = [];
  if ('paid' in b && b.paid !== null && b.paid !== '') {
    const paid = Number(b.paid);
    if (!(paid >= 0)) throw new HttpError(400, 'What you paid must be 0 or more.');
    const oldPaid = round2(card.cost - feeTotal(card));
    const diff = round2(paid - oldPaid);
    if (diff !== 0) {
      if (card.tradeIn) throw new HttpError(409, `${card.name} came in on a trade, so its cost is the trade value. Undo and redo the trade to change it.`);
      card.cost = round2(card.cost + diff);
      if (card.opening) card.costEstimated = false;
      if (card.purchase) {
        // Correct the money: the purchase cost more (or less) than recorded
        const p = await Purchase.findById(card.purchase);
        if (p) {
          p.totalSpent = round2(p.totalSpent + diff);
          if (p.totalCost !== null && p.totalCost !== undefined) p.totalCost = round2(p.totalCost + diff);
          await p.save();
          await Transaction.updateOne({ purchase: p._id, kind: 'purchase' }, { $inc: { amount: -diff } });
        }
      }
    }
  }

  // Grading fee: adds to cost, paid from a wallet
  if (b.gradingFee && Number(b.gradingFee.amount) > 0) {
    const amount = positive(b.gradingFee.amount, 'Grading fee');
    const wallet = checkWallet(b.gradingFee.wallet);
    const date = b.gradingFee.date || today();
    card.gradingFees.push({ date, amount, wallet, company: card.graded?.company || '', grade: card.graded?.grade || '' });
    card.cost = round2(card.cost + amount);
    txToCreate.push({ date, wallet, amount: -amount, kind: 'grading', card: card._id, note: `Grading ${card.name}${card.graded?.company ? ` (${card.graded.company} ${card.graded.grade})` : ''}` });
  }
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
  if (txToCreate.length) {
    const txs = await Transaction.insertMany(txToCreate);
    // Remember which ledger row belongs to the newest fee, so it can be undone
    const last = card.gradingFees[card.gradingFees.length - 1];
    last.tx = txs[0]._id;
    await card.save();
  }
  res.json(card);
}));

// Undo a grading fee: cost goes back down and the money returns to its wallet
r.delete('/:id/grading/:feeId', ah(async (req, res) => {
  const card = await Card.findById(req.params.id);
  if (!card) throw new HttpError(404, 'Card not found.');
  const fee = card.gradingFees.id(req.params.feeId);
  if (!fee) throw new HttpError(404, 'Grading fee not found.');
  card.cost = round2(card.cost - fee.amount);
  if (fee.tx) await Transaction.deleteOne({ _id: fee.tx });
  // Rebuild the list without this fee (saved as a whole, so it can't be left behind)
  card.gradingFees = card.gradingFees.filter((f) => String(f._id) !== String(fee._id)).map((f) => f.toObject());
  card.markModified('gradingFees');
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

// Refresh one card's market price and image now (in-stock only: sold cards keep their history)
r.post('/:id/refresh', ah(async (req, res) => {
  const card = await Card.findById(req.params.id);
  if (!card) throw new HttpError(404, 'Card not found.');
  if (card.status !== 'in_stock') throw new HttpError(400, `${card.name} isn't in stock, so its price isn't updated.`);
  const why = manualReason(card);
  if (why === 'graded' || why === 'japanese') {
    throw new HttpError(400, `${why === 'graded' ? 'Graded' : 'Japanese ' + card.game} cards are priced by hand. Use the $ button or "Prices to enter" on the Dashboard.`);
  }
  const result = await refreshCard(card, { force: true });
  res.json({ card, result });
}));

/*
  Link a card to the exact printing picked in "Find match".
  { external, imageUrl, setName, name, number, price, source, url, rename }
  Updates which listing future price updates follow, the picture, and the current market price.
  Never touches cost or sales. rename = also take the listing's name / number / set.
*/
r.post('/:id/link', ah(async (req, res) => {
  const card = await Card.findById(req.params.id);
  if (!card) throw new HttpError(404, 'Card not found.');
  if (card.status !== 'in_stock') throw new HttpError(400, `${card.name} isn't in stock.`);
  const b = req.body || {};
  const ext = b.external || {};
  if (!ext.tcgapiId && !ext.pokemontcgId) throw new HttpError(400, 'Pick a card from the search results.');

  // Replace the old match entirely, keep any graded-price id
  const keep = card.external?.pricechartingId;
  card.external = {
    tcgapiId: ext.tcgapiId || undefined,
    tcgapiPrinting: ext.tcgapiPrinting || undefined,
    pokemontcgId: ext.pokemontcgId || undefined,
    pokemontcgVariant: ext.pokemontcgVariant || undefined,
    pricechartingId: keep || undefined,
  };
  if (b.imageUrl) card.imageUrl = b.imageUrl;
  if (b.language) card.language = b.language === 'JP' ? 'JP' : 'EN';
  if (b.rename) {
    if (String(b.name || '').trim()) card.name = String(b.name).trim();
    if (b.number !== undefined) card.number = String(b.number || '').trim();
    if (b.setName !== undefined) card.setName = String(b.setName || '').trim();
  } else if (b.setName && !card.setName) {
    card.setName = b.setName;
  }

  const price = Number(b.price);
  if (price > 0) {
    const graded = Boolean(card.graded?.company);
    card.market.price = round2(price);
    card.market.sources = [{ source: `${b.source || 'TCGplayer'}${graded ? ' (raw)' : ''}`, price: round2(price), url: b.url }];
    card.market.updatedAt = new Date();
    card.market.manualOverride = false;
    const d = today();
    const last = card.priceHistory[card.priceHistory.length - 1];
    if (last?.date === d) last.price = card.market.price;
    else card.priceHistory.push({ date: d, price: card.market.price });
  }
  await card.save();
  res.json(card);
}));

export default r;
