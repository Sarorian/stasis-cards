import { Router } from 'express';
import Trade from '../models/Trade.js';
import Card from '../models/Card.js';
import BinderEntry from '../models/BinderEntry.js';
import Transaction from '../models/Transaction.js';
import { ah, HttpError, parsePayments, binderPool } from '../util.js';
import { today, round2, GAMES } from '../constants.js';

const r = Router();

const nonNeg = (n, label) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) throw new HttpError(400, `${label} must be 0 or more.`);
  return round2(v);
};

// Spread `diff` across values in proportion to their size (evenly if all are 0). Cents stay exact.
export function spread(values, diff) {
  if (!values.length || !diff) return values.map(round2);
  const total = values.reduce((a, b) => a + b, 0);
  const out = values.map((v) => round2(v + (total > 0 ? (diff * v) / total : diff / values.length)));
  const target = round2(total + diff);
  const biggest = out.indexOf(Math.max(...out));
  out[biggest] = round2(out[biggest] + (target - out.reduce((a, b) => a + b, 0)));
  return out;
}

/*
  Work out a trade without saving anything. Same math the page shows.
  Returns final values for every line after cash rounding.
*/
export function settle({ outValues, outBinderValue = 0, inValues, inBinderValue = 0, cash }) {
  const outTotal = round2(outValues.reduce((a, b) => a + b, 0) + outBinderValue);
  const inTotal = round2(inValues.reduce((a, b) => a + b, 0) + inBinderValue);
  const calculatedCash = round2(outTotal - inTotal); // + they pay us, - we pay them
  const finalCash = cash === undefined || cash === null || cash === '' ? calculatedCash : round2(cash);
  const diff = round2(calculatedCash - finalCash); // how much more (or less) their side is worth after rounding

  const hasIn = inValues.length > 0 || inBinderValue > 0;
  let finalOut = [...outValues, outBinderValue];
  let finalIn = [...inValues, inBinderValue];

  if (diff) {
    if (hasIn) {
      // Rounding goes to their side: we took their cards in for a little more (or less)
      const lines = [...inValues, ...(inBinderValue > 0 ? [inBinderValue] : [])];
      const adj = spread(lines, diff);
      finalIn = [...adj.slice(0, inValues.length), inBinderValue > 0 ? adj[adj.length - 1] : 0];
    } else {
      // Nothing coming in (a plain sale for cash): rounding changes what our cards went for
      const lines = [...outValues, ...(outBinderValue > 0 ? [outBinderValue] : [])];
      const adj = spread(lines, -diff);
      finalOut = [...adj.slice(0, outValues.length), outBinderValue > 0 ? adj[adj.length - 1] : 0];
    }
  }
  if ([...finalIn, ...finalOut].some((v) => v < 0)) {
    throw new HttpError(400, 'That cash amount would make a card worth less than $0. Check the cash amount.');
  }
  return {
    outValues: finalOut.slice(0, outValues.length),
    outBinderValue: finalOut[finalOut.length - 1],
    inValues: finalIn.slice(0, inValues.length),
    inBinderValue: finalIn[finalIn.length - 1],
    outTotal,
    inTotal,
    calculatedCash,
    cash: finalCash,
    roundingAdjustment: diff,
  };
}

r.get('/', ah(async (req, res) => {
  res.json(await Trade.find().sort({ date: -1, createdAt: -1 }).limit(Math.min(Number(req.query.limit) || 50, 500)));
}));

/*
  Record a trade.
  {
    date?, tradeInPct?, notes?,
    outCards: [{ id, value }],                     // our in-stock cards leaving
    outBinder?: { count, value },                  // our binder cards leaving
    inCards: [{ name, number, game, setName, condition, graded?: {company, grade},
                imageUrl, external, sources, market, value }],   // their cards coming in
    inBinder?: { count, value },                   // their binder cards coming in
    cash?,                                         // + they pay us, - we pay them; blank = exact difference
    method?                                        // wallet for the cash (required if cash != 0)
    payments?: [{ method, amount }]                // or split the cash across wallets (adds up to |cash|)
  }
*/
r.post('/', ah(async (req, res) => {
  const b = req.body || {};
  const date = b.date || today();
  const outIn = Array.isArray(b.outCards) ? b.outCards : [];
  const inIn = Array.isArray(b.inCards) ? b.inCards : [];
  const outBinderCount = Math.round(Number(b.outBinder?.count) || 0);
  const inBinderCount = Math.round(Number(b.inBinder?.count) || 0);
  if (!outIn.length && !inIn.length && !outBinderCount && !inBinderCount) {
    throw new HttpError(400, 'Add at least one card to the trade.');
  }

  // ---- Validate everything before writing anything ----
  const ids = outIn.map((c) => String(c.id));
  if (new Set(ids).size !== ids.length) throw new HttpError(400, 'The same card is in the trade twice.');
  const ourCards = await Card.find({ _id: { $in: ids } });
  const byId = new Map(ourCards.map((c) => [String(c._id), c]));
  const outCards = outIn.map((line, i) => {
    const card = byId.get(String(line.id));
    if (!card) throw new HttpError(400, `Our card ${i + 1} wasn't found. Refresh the page.`);
    if (card.status !== 'in_stock') throw new HttpError(400, `${card.name} is already sold.`);
    return { card, value: nonNeg(line.value, `${card.name}'s trade value`) };
  });

  const inCards = inIn.map((c, i) => {
    if (!c.name?.trim()) throw new HttpError(400, `Their card ${i + 1} needs a name.`);
    if (!GAMES.includes(c.game)) throw new HttpError(400, `Their card ${i + 1} needs a game.`);
    const market = Number(c.market);
    if (!(market > 0)) throw new HttpError(400, `${c.name}: enter its market value.`);
    if (c.graded?.company && !String(c.graded.grade || '').trim()) throw new HttpError(400, `${c.name} needs a grade.`);
    return { ...c, market: round2(market), value: nonNeg(c.value, `${c.name}'s trade-in value`) };
  });

  const outBinderValue = outBinderCount ? nonNeg(b.outBinder.value, 'Our binder cards value') : 0;
  const inBinderValue = inBinderCount ? nonNeg(b.inBinder.value, 'Their binder cards value') : 0;
  if (outBinderCount < 0 || inBinderCount < 0) throw new HttpError(400, 'Binder card counts must be positive.');

  const pool = await binderPool();
  if (outBinderCount > pool.count) throw new HttpError(400, `Only ${pool.count} binder cards in stock.`);

  const s = settle({
    outValues: outCards.map((c) => c.value),
    outBinderValue,
    inValues: inCards.map((c) => c.value),
    inBinderValue,
    cash: b.cash,
  });
  // Cash can be split across wallets: { payments: [{ method, amount }] } adding up to the cash amount
  const payments = s.cash !== 0 ? parsePayments(b, Math.abs(s.cash), 'cash') : [];
  const method = payments[0]?.method || null;

  // ---- Write ----
  const trade = await Trade.create({
    date,
    tradeInPct: Number(b.tradeInPct) || 80,
    notes: b.notes || '',
    outTotal: s.outTotal,
    inTotal: s.inTotal,
    calculatedCash: s.calculatedCash,
    cash: s.cash,
    method,
    payments: payments.length > 1 ? payments : [],
    roundingAdjustment: s.roundingAdjustment,
  });

  const created = { cards: [], entries: [], tx: [] };
  try {
    // Our cards leave: sold for their trade value, no wallet
    for (const [i, { card }] of outCards.entries()) {
      card.status = 'sold';
      card.sale = { date, price: s.outValues[i], fees: 0, method: null, trade: trade._id };
      await card.save();
      trade.outCards.push({
        card: card._id, name: card.name, number: card.number, game: card.game,
        market: card.market?.price || 0, value: s.outValues[i], cost: card.cost,
      });
    }

    if (outBinderCount) {
      const costBasis = round2(pool.avgCost * outBinderCount);
      const entry = await BinderEntry.create({
        type: 'sell', date, count: outBinderCount, amount: s.outBinderValue, method: 'Trade', costBasis,
        trade: trade._id, notes: 'Traded away',
      });
      created.entries.push(entry._id);
      trade.outBinder = { count: outBinderCount, value: s.outBinderValue, entry: entry._id };
    }

    // Their cards come in: cost = trade-in value
    if (inCards.length) {
      const docs = await Card.insertMany(inCards.map((c, i) => {
        const isGraded = Boolean(c.graded?.company);
        const cost = s.inValues[i];
        return {
          name: c.name.trim(),
          number: (c.number || '').trim(),
          game: c.game,
          language: c.language === 'JP' ? 'JP' : 'EN',
          setName: c.setName || '',
          condition: isGraded ? 'NM' : c.condition || 'NM',
          graded: isGraded ? { company: c.graded.company, grade: String(c.graded.grade) } : { company: null, grade: null },
          imageUrl: c.imageUrl || '',
          external: c.external || {},
          tradeIn: trade._id,
          boughtDate: date,
          cost,
          marketAtPurchase: c.market,
          pctOfMarket: Math.round((cost / c.market) * 1000) / 10,
          market: {
            price: c.market,
            sources: c.sources?.length ? c.sources : [{ source: 'At trade', price: c.market }],
            updatedAt: new Date(),
          },
          priceHistory: [{ date, price: c.market }],
          notes: 'Traded in',
        };
      }));
      created.cards.push(...docs.map((d) => d._id));
      docs.forEach((d, i) => trade.inCards.push({
        card: d._id, name: d.name, number: d.number, game: d.game, market: inCards[i].market, value: s.inValues[i],
      }));
    }

    if (inBinderCount) {
      const entry = await BinderEntry.create({
        type: 'buy', date, count: inBinderCount, amount: s.inBinderValue, method: 'Trade',
        trade: trade._id, notes: 'Traded in',
      });
      created.entries.push(entry._id);
      trade.inBinder = { count: inBinderCount, value: s.inBinderValue, entry: entry._id };
    }

    // Only the cash touches a wallet (one row per wallet when split)
    if (s.cash !== 0) {
      const sign = s.cash > 0 ? 1 : -1;
      const txs = await Transaction.insertMany(payments.map((p) => ({
        date, wallet: p.method, amount: round2(sign * p.amount), kind: 'trade', trade: trade._id,
        note: sign > 0 ? `Trade: they paid ${p.method}` : `Trade: we paid from ${p.method}`,
      })));
      created.tx.push(...txs.map((t) => t._id));
    }

    await trade.save();
  } catch (err) {
    // Roll back anything written so a failed trade leaves no half-records
    await Card.updateMany({ 'sale.trade': trade._id }, { status: 'in_stock', $unset: { sale: 1 } });
    await Card.deleteMany({ _id: { $in: created.cards } });
    await BinderEntry.deleteMany({ _id: { $in: created.entries } });
    await Transaction.deleteMany({ _id: { $in: created.tx } });
    await trade.deleteOne();
    throw err;
  }

  res.status(201).json(trade);
}));

// Undo a trade: our cards come back, their cards and binder cards go, the cash is reversed
r.delete('/:id', ah(async (req, res) => {
  const trade = await Trade.findById(req.params.id);
  if (!trade) throw new HttpError(404, 'Trade not found.');

  const soldSince = await Card.find({ tradeIn: trade._id, status: 'sold' }, 'name');
  if (soldSince.length) {
    throw new HttpError(409, `Undo the sale of ${soldSince.map((c) => c.name).join(', ')} first. It came in on this trade.`);
  }
  if (trade.inBinder?.count) {
    const pool = await binderPool();
    if (pool.count - trade.inBinder.count < 0) {
      throw new HttpError(409, `The ${trade.inBinder.count} binder cards from this trade have already been sold.`);
    }
  }

  await Card.deleteMany({ tradeIn: trade._id });
  await Card.updateMany({ 'sale.trade': trade._id }, { status: 'in_stock', $unset: { sale: 1 } });
  await BinderEntry.deleteMany({ trade: trade._id });
  await Transaction.deleteMany({ trade: trade._id });
  await trade.deleteOne();
  res.json({ deleted: trade._id });
}));

export default r;
