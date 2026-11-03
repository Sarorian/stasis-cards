import { Router } from 'express';
import Purchase from '../models/Purchase.js';
import Card from '../models/Card.js';
import Transaction from '../models/Transaction.js';
import { ah, HttpError, checkWallet } from '../util.js';
import { today, round2, GAMES } from '../constants.js';

const r = Router();

r.get('/', ah(async (req, res) => {
  res.json(await Purchase.find().sort({ date: -1, createdAt: -1 }).populate('cards', 'name number game cost status'));
}));

r.get('/:id', ah(async (req, res) => {
  const p = await Purchase.findById(req.params.id).populate('cards');
  if (!p) throw new HttpError(404, 'Purchase not found.');
  res.json(p);
}));

/*
  Record a purchase of single cards.
  {
    date?, paidFrom, totalCost?,       // totalCost blank/0 = use each card's cost
    cards: [{ name, number, game, condition?, graded?: {company, grade},
              marketValue, cost?, imageUrl?, setName?, external? }]
  }
  With totalCost, each card's cost = totalCost * (card market / total market).
*/
r.post('/', ah(async (req, res) => {
  const { paidFrom, cards = [] } = req.body;
  const date = req.body.date || today();
  checkWallet(paidFrom);
  if (!Array.isArray(cards) || cards.length === 0) throw new HttpError(400, 'Add at least one card.');

  const totalCost = Number(req.body.totalCost) > 0 ? round2(req.body.totalCost) : null;
  cards.forEach((c, i) => {
    if (!c.name) throw new HttpError(400, `Card ${i + 1} needs a name.`);
    if (!GAMES.includes(c.game)) throw new HttpError(400, `Card ${i + 1} needs a game.`);
    if (!(Number(c.marketValue) > 0)) throw new HttpError(400, `Card ${i + 1} needs a market value.`);
    if (!totalCost && !(Number(c.cost) > 0)) throw new HttpError(400, `Card ${i + 1} needs a bought-for price (or enter a total cost).`);
  });

  const totalMarket = round2(cards.reduce((a, c) => a + Number(c.marketValue), 0));
  let costs = cards.map((c) => (totalCost ? round2((totalCost * Number(c.marketValue)) / totalMarket) : round2(c.cost)));
  if (totalCost) {
    // Push any rounding remainder onto the last card so the total matches exactly
    const diff = round2(totalCost - costs.reduce((a, b) => a + b, 0));
    costs[costs.length - 1] = round2(costs[costs.length - 1] + diff);
  }
  const totalSpent = round2(costs.reduce((a, b) => a + b, 0));

  const purchase = await Purchase.create({ date, paidFrom, totalCost, totalSpent, totalMarket, cards: [] });
  const docs = await Card.insertMany(
    cards.map((c, i) => {
      const isGraded = Boolean(c.graded?.company);
      return {
        name: c.name,
        number: c.number || '',
        game: c.game,
        language: c.language === 'JP' ? 'JP' : 'EN',
        setName: c.setName || '',
        condition: isGraded ? 'NM' : c.condition || 'NM',
        graded: isGraded ? { company: c.graded.company, grade: String(c.graded.grade || '') } : { company: null, grade: null },
        imageUrl: c.imageUrl || '',
        external: c.external || {},
        purchase: purchase._id,
        boughtDate: date,
        cost: costs[i],
        marketAtPurchase: round2(c.marketValue),
        pctOfMarket: Math.round((costs[i] / Number(c.marketValue)) * 1000) / 10,
        market: {
          price: round2(c.marketValue),
          sources: c.sources?.length ? c.sources : [{ source: 'At purchase', price: round2(c.marketValue) }],
          updatedAt: new Date(),
        },
        priceHistory: [{ date, price: round2(c.marketValue) }],
      };
    })
  );
  purchase.cards = docs.map((d) => d._id);
  await purchase.save();
  await Transaction.create({
    date, wallet: paidFrom, amount: -totalSpent, kind: 'purchase', purchase: purchase._id,
    note: `Bought ${docs.length} card${docs.length > 1 ? 's' : ''}`,
  });
  res.status(201).json(await purchase.populate('cards'));
}));

// Edit date or wallet of a purchase (card details are edited via /cards)
r.patch('/:id', ah(async (req, res) => {
  const p = await Purchase.findById(req.params.id);
  if (!p) throw new HttpError(404, 'Purchase not found.');
  if (req.body.date) p.date = req.body.date;
  if (req.body.paidFrom) p.paidFrom = checkWallet(req.body.paidFrom);
  if ('notes' in req.body) p.notes = req.body.notes;
  await p.save();
  await Transaction.updateMany({ purchase: p._id }, { date: p.date, wallet: p.paidFrom });
  if (req.body.date) await Card.updateMany({ purchase: p._id }, { boughtDate: p.date });
  res.json(p);
}));

// Delete a purchase, its cards, and the money it moved
r.delete('/:id', ah(async (req, res) => {
  const p = await Purchase.findById(req.params.id);
  if (!p) throw new HttpError(404, 'Purchase not found.');
  const traded = await Card.countDocuments({ purchase: p._id, 'sale.trade': { $exists: true, $ne: null } });
  if (traded) throw new HttpError(409, `${traded} card(s) from this purchase left in a trade. Undo the trade first.`);
  const cleansed = await Card.countDocuments({ purchase: p._id, 'sale.debt': { $exists: true, $ne: null } });
  if (cleansed) throw new HttpError(409, `${cleansed} card(s) from this purchase were taken to cleanse debt. Undo that on the Debt page first.`);
  const sold = await Card.countDocuments({ purchase: p._id, status: 'sold' });
  if (sold && req.query.force !== 'true') {
    throw new HttpError(409, `${sold} card(s) from this purchase were already sold. Add ?force=true to delete anyway.`);
  }
  const cardIds = (await Card.find({ purchase: p._id }, '_id')).map((c) => c._id);
  await Transaction.deleteMany({ $or: [{ purchase: p._id }, { card: { $in: cardIds } }] });
  await Card.deleteMany({ _id: { $in: cardIds } });
  await p.deleteOne();
  res.json({ deleted: p._id });
}));

export default r;
