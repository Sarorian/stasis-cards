import Transaction from './models/Transaction.js';
import BinderEntry from './models/BinderEntry.js';
import { WALLETS, round2 } from './constants.js';

// Wraps async route handlers so thrown errors reach the error middleware
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function requireFields(body, fields) {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null || body[f] === '');
  if (missing.length) throw new HttpError(400, `Missing: ${missing.join(', ')}`);
}

export function positive(n, label) {
  const v = Number(n);
  if (!(v > 0)) throw new HttpError(400, `${label} must be greater than 0.`);
  return round2(v);
}

export function checkWallet(w) {
  if (!WALLETS.includes(w)) throw new HttpError(400, `Unknown payment method: ${w}`);
  return w;
}

export async function walletBalances() {
  const rows = await Transaction.aggregate([{ $group: { _id: '$wallet', total: { $sum: '$amount' } } }]);
  const balances = Object.fromEntries(WALLETS.map((w) => [w, 0]));
  rows.forEach((r) => {
    if (r._id in balances) balances[r._id] = round2(r.total);
  });
  return balances;
}

export async function binderPool() {
  const entries = await BinderEntry.find().lean();
  let count = 0;
  let cost = 0;
  for (const e of entries) {
    if (e.type === 'buy') {
      count += e.count;
      cost += e.amount;
    } else {
      count -= e.count;
      cost -= e.costBasis;
    }
  }
  return { count, cost: round2(Math.max(cost, 0)), avgCost: count > 0 ? round2(cost / count) : 0 };
}
