import { Router } from 'express';
import { ah, HttpError } from '../util.js';
import { GAMES } from '../constants.js';
import { lookup, startUpdateAll, jobStatus, manualReason } from '../prices/index.js';
import Card from '../models/Card.js';
import Settings from '../models/Settings.js';
import { recordSnapshot } from '../snapshots.js';
import { round2, today } from '../constants.js';
import { checkLinks, searchCards, pricecharting, QuotaError } from '../prices/providers.js';

const r = Router();

// "Find card" picker: shorthand text -> list of matching cards with prices
// Query: q, game, broad? (1 = search the first word only)
r.get('/search', ah(async (req, res) => {
  const { q = '', game, broad, language } = req.query;
  if (!GAMES.includes(game)) throw new HttpError(400, 'Pick a game.');
  try {
    res.json(await searchCards({ text: String(q), game, broad: broad === '1' || broad === 'true', language: language === 'JP' ? 'JP' : 'EN' }));
  } catch (err) {
    if (err instanceof QuotaError) throw new HttpError(429, 'Daily lookup limit reached. Enter the card by hand for now, or try again tomorrow.');
    if (err.status) throw err;
    throw new HttpError(502, `Card search failed: ${err.message}`);
  }
}));

// Graded price for a picked card (PriceCharting). Never uses TCG API lookups.
// Query: name, number?, gradedCompany, gradedGrade
r.get('/graded', ah(async (req, res) => {
  const { name, number = '', gradedCompany, gradedGrade } = req.query;
  if (!name || !gradedCompany || !gradedGrade) throw new HttpError(400, 'Need a card name, grading company, and grade.');
  if (!process.env.PRICECHARTING_TOKEN) return res.json({ configured: false, hit: null });
  try {
    const hit = await pricecharting({ name, number, graded: { company: gradedCompany, grade: gradedGrade } });
    res.json({ configured: true, hit });
  } catch (err) {
    res.json({ configured: true, hit: null, error: err.message });
  }
}));

// Look up market price + image for the Add purchase form
// Query: name, number?, game, gradedCompany?, gradedGrade?
r.get('/lookup', ah(async (req, res) => {
  const { name, number = '', game, gradedCompany, gradedGrade, language = 'EN' } = req.query;
  if (!name || String(name).length < 2) throw new HttpError(400, 'Enter at least 2 letters of the card name.');
  if (!GAMES.includes(game)) throw new HttpError(400, 'Pick a game.');
  const graded = gradedCompany ? { company: gradedCompany, grade: gradedGrade } : null;
  const result = await lookup({ name, number, game, graded, language });
  res.json({ ...result, links: checkLinks({ name, number, game, graded, language }) });
}));

// Quick-check links for any card
r.get('/links', (req, res) => {
  const { name, number, game, gradedCompany, gradedGrade } = req.query;
  res.json(checkLinks({ name, number, game, graded: gradedCompany ? { company: gradedCompany, grade: gradedGrade } : null }));
});

// Start updating every in-stock card (runs in the background)
r.post('/update', (req, res) => res.status(202).json(startUpdateAll()));

r.get('/status', (req, res) => res.json(jobStatus()));

// Cards that need a price typed in by hand (graded, Japanese non-Pokemon, or not found)
r.get('/manual', ah(async (req, res) => {
  const [cards, settings] = await Promise.all([Card.find({ status: 'in_stock' }).select('-priceHistory').lean(), Settings.get()]);
  const lastRun = settings.pricesUpdateStartedAt ? new Date(settings.pricesUpdateStartedAt) : null;
  const list = cards
    .map((c) => ({ c, reason: manualReason(c) }))
    .filter((x) => x.reason)
    .map(({ c, reason }) => ({
      id: c._id, name: c.name, number: c.number, setName: c.setName, game: c.game, language: c.language || 'EN',
      graded: c.graded?.company ? c.graded : null, condition: c.condition, imageUrl: c.imageUrl, cost: c.cost,
      price: c.market?.price || 0, manual: Boolean(c.market?.manualOverride), updatedAt: c.market?.updatedAt || null, reason,
      // Still waiting on a price. Graded cards are asked again after every price update,
      // even if they already have a price (it's prefilled so you can confirm or change it).
      needed: Boolean(reason === 'notFound' || !c.market?.manualOverride
        || (reason === 'graded' && lastRun && (!c.market?.updatedAt || new Date(c.market.updatedAt) < lastRun))),
    }))
    // Oldest prices first
    .sort((a, b) => new Date(a.updatedAt || 0) - new Date(b.updatedAt || 0));
  res.json(list);
}));

// Save hand-entered prices: { prices: [{ id, price }] }. Each becomes a manual price.
r.post('/manual', ah(async (req, res) => {
  const list = Array.isArray(req.body?.prices) ? req.body.prices : [];
  let saved = 0;
  for (const p of list) {
    const price = Number(p.price);
    if (!(price > 0)) continue;
    const card = await Card.findById(p.id);
    if (!card || card.status !== 'in_stock') continue;
    card.market.price = round2(price);
    card.market.manualOverride = true;
    card.market.lookupFailed = false;
    card.market.updatedAt = new Date();
    card.market.sources = [{ source: 'Manual', price: card.market.price }];
    const d = today();
    const last = card.priceHistory[card.priceHistory.length - 1];
    if (last?.date === d) last.price = card.market.price;
    else card.priceHistory.push({ date: d, price: card.market.price });
    await card.save();
    saved++;
  }
  if (saved) await recordSnapshot().catch(() => {});
  res.json({ saved });
}));

export default r;
