import { Router } from 'express';
import { ah, HttpError } from '../util.js';
import { GAMES } from '../constants.js';
import { lookup, startUpdateAll, jobStatus } from '../prices/index.js';
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

export default r;
