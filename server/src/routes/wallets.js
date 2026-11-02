import { Router } from 'express';
import crypto from 'node:crypto';
import Transaction from '../models/Transaction.js';
import { ah, HttpError, positive, checkWallet, walletBalances } from '../util.js';
import { today } from '../constants.js';

const r = Router();

r.get('/', ah(async (req, res) => {
  res.json(await walletBalances());
}));

// Ledger, newest first. Query: wallet, kind, limit (default 100)
r.get('/transactions', ah(async (req, res) => {
  const filter = {};
  if (req.query.wallet) filter.wallet = req.query.wallet;
  if (req.query.kind) filter.kind = req.query.kind;
  const limit = Math.min(Number(req.query.limit) || 100, 1000);
  res.json(await Transaction.find(filter).sort({ date: -1, createdAt: -1 }).limit(limit));
}));

// Move money between wallets: { from, to = 'Cash', amount, date? }
r.post('/transfer', ah(async (req, res) => {
  const from = checkWallet(req.body.from);
  const to = checkWallet(req.body.to || 'Cash');
  if (from === to) throw new HttpError(400, 'Pick two different wallets.');
  const amount = positive(req.body.amount, 'Amount');
  const date = req.body.date || today();
  const transferId = crypto.randomUUID();
  const note = `${from} → ${to}`;
  await Transaction.insertMany([
    { date, wallet: from, amount: -amount, kind: 'transfer', transferId, note },
    { date, wallet: to, amount, kind: 'transfer', transferId, note },
  ]);
  res.status(201).json(await walletBalances());
}));

// Undo a transfer by its transferId
r.delete('/transfer/:transferId', ah(async (req, res) => {
  const { deletedCount } = await Transaction.deleteMany({ kind: 'transfer', transferId: req.params.transferId });
  if (!deletedCount) throw new HttpError(404, 'Transfer not found.');
  res.json(await walletBalances());
}));

export default r;
