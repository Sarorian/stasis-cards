import Transaction from './models/Transaction.js';
import BinderEntry from './models/BinderEntry.js';
import Settings from './models/Settings.js';
import { WALLETS, round2, binderMarketOf } from './constants.js';

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

/*
  Who paid what, into which wallet. Accepts either
    { payments: [{ method, amount }, ...] }   (split, e.g. $200 Cash + $100 Venmowen)
    { method }                                (all of `total` into one wallet)
  Same wallet twice is merged. The amounts must add up to `total`.
*/
export function parsePayments(body, total, label = 'payment') {
  const t = round2(total);
  let list;
  if (Array.isArray(body.payments) && body.payments.length) {
    const merged = new Map();
    for (const p of body.payments) {
      const method = checkWallet(p.method);
      const amount = positive(p.amount, `${method} ${label} amount`);
      merged.set(method, round2((merged.get(method) || 0) + amount));
    }
    list = [...merged].map(([method, amount]) => ({ method, amount }));
    const sum = round2(list.reduce((a, p) => a + p.amount, 0));
    if (Math.abs(sum - t) > 0.004) {
      throw new HttpError(400, `The split adds up to $${sum.toFixed(2)} but should be $${t.toFixed(2)}.`);
    }
  } else {
    list = [{ method: checkWallet(body.method), amount: t }];
  }
  // Biggest share first: it's the "main" method shown in short labels, and takes any fees
  return list.sort((a, b) => b.amount - a.amount);
}

export const paymentLabel = (payments, fallback) =>
  payments?.length ? payments.map((p) => p.method).join(' + ') : fallback || '';

export async function walletBalances() {
  const rows = await Transaction.aggregate([{ $group: { _id: '$wallet', total: { $sum: '$amount' } } }]);
  const balances = Object.fromEntries(WALLETS.map((w) => [w, 0]));
  rows.forEach((r) => {
    if (r._id in balances) balances[r._id] = round2(r.total);
  });
  return balances;
}

/*
  The binder pool.
    cost: what we paid for the cards still in it (each sale removes the average cost per card)
    value: estimated market value. Starts from the latest hand-counted re-estimate (if any),
           adds each later buy's market value and takes off each later sale's price.
*/
export async function binderPool() {
  const [entries, settings] = await Promise.all([BinderEntry.find().lean(), Settings.get()]);
  const vals = settings.binderValuations || [];
  const latest = vals.length ? vals.reduce((a, v) => (new Date(v.at) > new Date(a.at) ? v : a)) : null;
  let count = 0;
  let cost = 0;
  let value = latest ? latest.value : 0;
  for (const e of entries) {
    const afterValuation = !latest || new Date(e.createdAt) > new Date(latest.at);
    if (e.type === 'buy') {
      count += e.count;
      cost += e.amount;
      if (afterValuation) value += binderMarketOf(e);
    } else {
      count -= e.count;
      cost -= e.costBasis;
      if (afterValuation) value -= e.amount;
    }
  }
  return {
    count, cost: round2(Math.max(cost, 0)), avgCost: count > 0 ? round2(cost / count) : 0,
    value: count > 0 ? round2(Math.max(value, 0)) : 0,
    valuedAt: latest ? latest.date : null, valuedAs: latest ? latest.value : null,
  };
}
