import Card from './models/Card.js';
import MiscItem from './models/MiscItem.js';
import MiscEntry from './models/MiscEntry.js';
import InventorySnapshot from './models/InventorySnapshot.js';
import { binderPool } from './util.js';
import { today, round2 } from './constants.js';

/*
  Save (or refresh) today's inventory value. Pass numbers you already have to skip the queries.
  Called when the Dashboard loads, after price updates, and after hand-entered prices.
*/
export async function recordSnapshot(values) {
  let v = values;
  if (!v) {
    const [inStock, pool, items, entries] = await Promise.all([
      Card.find({ status: 'in_stock' }, 'cost market.price').lean(),
      binderPool(),
      MiscItem.find().lean(),
      MiscEntry.find().lean(),
    ]);
    const usedCost = new Map();
    entries.forEach((e) => usedCost.set(String(e.item), (usedCost.get(String(e.item)) || 0) + e.costBasis));
    v = {
      count: inStock.length,
      market: round2(inStock.reduce((a, c) => a + (c.market?.price || 0), 0)),
      cost: round2(inStock.reduce((a, c) => a + (c.cost || 0), 0)),
      binderCost: pool.cost,
      sealedCost: round2(items.reduce((a, i) => a + (i.cost - (usedCost.get(String(i._id)) || 0)), 0)),
    };
  }
  await InventorySnapshot.updateOne(
    { date: today() },
    { $set: { cards: { count: v.count, market: v.market, cost: v.cost }, binderCost: v.binderCost, sealedCost: v.sealedCost } },
    { upsert: true }
  );
}

// Last year of snapshots, oldest first
export async function snapshotHistory(days = 366) {
  const from = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const rows = await InventorySnapshot.find({ date: { $gte: from } }).sort({ date: 1 }).lean();
  return rows.map((r) => ({ date: r.date, count: r.cards?.count || 0, market: r.cards?.market || 0, cost: r.cards?.cost || 0, binderCost: r.binderCost || 0, sealedCost: r.sealedCost || 0 }));
}
