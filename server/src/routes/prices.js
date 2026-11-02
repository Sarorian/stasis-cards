import { Router } from 'express';
import { ah, HttpError } from '../util.js';
import { GAMES } from '../constants.js';
import { lookup, startUpdateAll, jobStatus } from '../prices/index.js';
import { checkLinks } from '../prices/providers.js';

const r = Router();

// Look up market price + image for the Add purchase form
// Query: name, number?, game, gradedCompany?, gradedGrade?
r.get('/lookup', ah(async (req, res) => {
  const { name, number = '', game, gradedCompany, gradedGrade } = req.query;
  if (!name || String(name).length < 2) throw new HttpError(400, 'Enter at least 2 letters of the card name.');
  if (!GAMES.includes(game)) throw new HttpError(400, 'Pick a game.');
  const graded = gradedCompany ? { company: gradedCompany, grade: gradedGrade } : null;
  const result = await lookup({ name, number, game, graded });
  res.json({ ...result, links: checkLinks({ name, number, game, graded }) });
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
