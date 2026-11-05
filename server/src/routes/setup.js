import { Router } from 'express';
import Card from '../models/Card.js';
import BinderEntry from '../models/BinderEntry.js';
import Settings from '../models/Settings.js';
import InventorySnapshot from '../models/InventorySnapshot.js';
import { ah, HttpError, positive } from '../util.js';
import { today, round2, binderPctOf, binderValueOf, GAMES, CONDITIONS, GRADERS } from '../constants.js';

/*
  One-time setup for moving off the old system:
    - start date (the app's numbers begin here)
    - starting inventory: cards already owned, added WITHOUT moving any money
    - binder cards already owned
    - Year 1 summary of the old system's records (shown on its own on the Dashboard)
*/
const r = Router();
const dateOk = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));

r.get('/', ah(async (req, res) => {
  const s = await Settings.get();
  const [importedOldIds, openingCount, openingBinder] = await Promise.all([
    Card.distinct('oldId', { oldId: { $ne: null } }),
    Card.countDocuments({ opening: true }),
    BinderEntry.find({ method: 'Opening' }).lean(),
  ]);
  res.json({ startDate: s.startDate, yearOne: s.yearOne, importedOldIds, openingCount, openingBinder, binderPct: binderPctOf(s) });
}));

r.put('/start-date', ah(async (req, res) => {
  if (!dateOk(req.body.date)) throw new HttpError(400, 'Pick a start date.');
  const s = await Settings.get();
  s.startDate = req.body.date;
  s.log.push({ date: today(), text: `Start date set to ${req.body.date}` });
  await s.save();
  res.json({ startDate: s.startDate });
}));

r.put('/year-one', ah(async (req, res) => {
  const y = req.body?.yearOne;
  if (!y || typeof y !== 'object' || !y.totals) throw new HttpError(400, 'Missing the Year 1 summary.');
  const s = await Settings.get();
  s.yearOne = { ...y, savedAt: new Date().toISOString() };
  s.markModified('yearOne');
  s.log.push({ date: today(), text: 'Year 1 summary imported from the old system' });
  await s.save();
  res.json({ yearOne: s.yearOne });
}));

r.delete('/year-one', ah(async (req, res) => {
  const s = await Settings.get();
  s.yearOne = null;
  s.markModified('yearOne');
  await s.save();
  res.json({ yearOne: null });
}));

/*
  Add starting inventory (no money moves).
  { cards: [{ name, number?, game, setName?, condition?, graded?: {company, grade}, imageUrl?, external?, sources?,
              cost, market?, boughtDate?, costEstimated?, oldId? }] }
  market: current market price if known; otherwise the cost is used until the price updater runs.
*/
r.post('/cards', ah(async (req, res) => {
  const list = Array.isArray(req.body?.cards) ? req.body.cards : [];
  if (!list.length) throw new HttpError(400, 'No cards to add.');
  if (list.length > 500) throw new HttpError(400, 'Add at most 500 cards at a time.');
  const s = await Settings.get();
  const fallbackDate = s.startDate || today();

  const already = new Set(await Card.distinct('oldId', { oldId: { $in: list.map((c) => c.oldId).filter(Boolean) } }));
  const skipped = [];
  const docs = [];
  list.forEach((c, i) => {
    if (c.oldId && already.has(String(c.oldId))) { skipped.push(c.name); return; }
    if (!String(c.name || '').trim()) throw new HttpError(400, `Card ${i + 1} needs a name.`);
    if (!GAMES.includes(c.game)) throw new HttpError(400, `${c.name}: pick a game.`);
    const cost = Number(c.cost);
    if (!(cost >= 0)) throw new HttpError(400, `${c.name}: cost must be 0 or more.`);
    const graded = c.graded?.company && GRADERS.includes(c.graded.company) && String(c.graded.grade || '').trim()
      ? { company: c.graded.company, grade: String(c.graded.grade).trim() } : { company: null, grade: null };
    const market = Number(c.market) > 0 ? round2(c.market) : null;
    const date = dateOk(c.boughtDate) ? c.boughtDate : fallbackDate;
    docs.push({
      name: String(c.name).trim(),
      number: String(c.number || '').trim(),
      game: c.game,
      language: c.language === 'JP' ? 'JP' : 'EN',
      setName: c.setName || '',
      condition: graded.company ? 'NM' : (CONDITIONS.includes(c.condition) ? c.condition : 'NM'),
      graded,
      imageUrl: c.imageUrl || '',
      external: c.external || {},
      opening: true,
      costEstimated: Boolean(c.costEstimated),
      oldId: c.oldId ? String(c.oldId) : null,
      boughtDate: date,
      cost: round2(cost),
      // Unknown market at purchase for starting inventory: left at 0 so it's excluded from "% of market paid"
      marketAtPurchase: 0,
      market: market
        ? { price: market, sources: c.sources?.length ? c.sources : [{ source: 'At setup', price: market }], updatedAt: new Date() }
        // No price yet: show the cost until "Update market prices" finds one (oldest-first, so these go first)
        : { price: round2(cost), sources: [{ source: 'Cost (no market price yet)', price: round2(cost) }], updatedAt: null },
      priceHistory: market ? [{ date: today(), price: market }] : [],
      notes: c.oldId ? 'From the old system' : 'Starting inventory',
    });
  });
  const created = docs.length ? await Card.insertMany(docs) : [];
  res.status(201).json({ added: created.length, skipped, ids: created.map((d) => d._id) });
}));

// Remove a starting-inventory card added by mistake (only if it hasn't been sold, traded, or cleansed)
r.delete('/cards/:id', ah(async (req, res) => {
  const card = await Card.findById(req.params.id);
  if (!card || !card.opening) throw new HttpError(404, 'Starting-inventory card not found.');
  if (card.status !== 'in_stock') throw new HttpError(409, `${card.name} has already left inventory. Undo that first.`);
  await card.deleteOne();
  res.json({ deleted: card._id });
}));

// Binder cards already owned on the start date: { count, value, date? }. Replaces any earlier opening entry.
r.put('/binder', ah(async (req, res) => {
  // { count, marketValue }: the binder's current market value. It's recorded at what we'd
  // have paid for it (binderPct% of market, 80% by default), so it shows back at full market value.
  const count = Math.round(positive(req.body.count, 'Binder card count'));
  const marketValue = round2(Number(req.body.marketValue) || 0);
  if (marketValue < 0) throw new HttpError(400, 'Market value must be 0 or more.');
  const s = await Settings.get();
  const pct = binderPctOf(s);
  const cost = round2(marketValue * pct / 100);
  const old = await BinderEntry.find({ method: 'Opening' }).lean();
  const oldCost = round2(old.reduce((a, e) => a + e.amount, 0));
  await BinderEntry.deleteMany({ method: 'Opening' });
  // The opening binder was there from the start, so fix the saved daily inventory values too
  const diff = round2(cost - oldCost);
  if (diff !== 0) {
    const snaps = await InventorySnapshot.find({ binderCost: { $ne: null } });
    for (const snap of snaps) {
      snap.binderCost = round2(Math.max(0, (snap.binderCost || 0) + diff));
      snap.binderValue = binderValueOf(snap.binderCost, pct);
      await snap.save();
    }
  }
  const entry = await BinderEntry.create({
    type: 'buy', date: req.body.date || s.startDate || today(), count, amount: cost, method: 'Opening',
    notes: `Binder cards on hand at start · market ${marketValue.toFixed(2)} at ${pct}%`,
  });
  res.json({ entry });
}));

export default r;
