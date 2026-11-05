import { Router } from 'express';
import Settings from '../models/Settings.js';
import Transaction from '../models/Transaction.js';
import { ah, HttpError, checkWallet, walletBalances } from '../util.js';
import { today, round2 } from '../constants.js';

const r = Router();
const money = (n) => `$${Number(n).toFixed(2)}`;

r.get('/', ah(async (req, res) => {
  const s = await Settings.get();
  res.json({
    startingCapital: s.startingCapital,
    binderPct: s.binderPct || 80,
    log: [...s.log].reverse(),
    wallets: await walletBalances(),
  });
}));

/*
  Set starting capital: { amount, note?, depositTo? }
  depositTo (optional wallet) also adds the difference to that wallet's balance,
  e.g. first-time setup where the starting money is sitting in Cash.
*/
r.put('/capital', ah(async (req, res) => {
  const amount = Number(req.body.amount);
  if (!(amount >= 0)) throw new HttpError(400, 'Starting capital must be 0 or more.');
  const s = await Settings.get();
  const prev = s.startingCapital;
  const diff = round2(amount - prev);
  s.startingCapital = round2(amount);
  let text = `Starting capital ${money(prev)} → ${money(amount)}`;
  if (req.body.depositTo && diff !== 0) {
    const wallet = checkWallet(req.body.depositTo);
    await Transaction.create({ date: today(), wallet, amount: diff, kind: 'capital', note: 'Starting capital change' });
    text += ` (${diff > 0 ? 'added to' : 'removed from'} ${wallet})`;
  }
  if (req.body.note) text += ` · ${req.body.note}`;
  s.log.push({ date: today(), text });
  await s.save();
  res.json({ startingCapital: s.startingCapital, log: [...s.log].reverse(), wallets: await walletBalances() });
}));

// Correct wallet balances to match real accounts: { balances: { Cash: 100, ... }, note? }
// What % of market we pay for binder cards: { pct } e.g. 80. Binder value = cost ÷ pct%.
r.put('/binder-pct', ah(async (req, res) => {
  const pct = Number(req.body.pct);
  if (!(pct > 0 && pct <= 100)) throw new HttpError(400, 'Use a percentage between 1 and 100 (e.g. 80).');
  const s = await Settings.get();
  const prev = s.binderPct || 80;
  s.binderPct = Math.round(pct * 10) / 10;
  s.log.push({ date: today(), text: `Binder cards bought at ${prev}% → ${s.binderPct}% of market` });
  await s.save();
  res.json({ binderPct: s.binderPct });
}));

r.put('/wallets', ah(async (req, res) => {
  const target = req.body.balances || {};
  const current = await walletBalances();
  const s = await Settings.get();
  for (const [wallet, value] of Object.entries(target)) {
    checkWallet(wallet);
    const v = Number(value);
    if (Number.isNaN(v)) throw new HttpError(400, `${wallet} needs a number.`);
    const diff = round2(v - current[wallet]);
    if (diff === 0) continue;
    await Transaction.create({ date: today(), wallet, amount: diff, kind: 'adjustment', note: req.body.note || 'Balance correction' });
    s.log.push({ date: today(), text: `${wallet} adjusted ${money(current[wallet])} → ${money(v)}${req.body.note ? ` · ${req.body.note}` : ''}` });
  }
  await s.save();
  res.json({ startingCapital: s.startingCapital, log: [...s.log].reverse(), wallets: await walletBalances() });
}));

export default r;
