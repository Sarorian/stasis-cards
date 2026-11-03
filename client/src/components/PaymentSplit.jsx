import { WALLETS, money } from '../format.js';

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/*
  rows: [{ method, amount }]  (amount is a string while typing)
  One row = everything goes to that wallet.
  Several rows = split; the last row is always "the rest" so the parts add up to `total`.
*/
export const singlePayment = (method = 'Cash') => [{ method, amount: '' }];

// Rows -> [{ method, amount }] numbers that add up to total (last row = remainder)
export function resolvePayments(rows, total) {
  const t = r2(total);
  if (rows.length <= 1) return [{ method: rows[0]?.method || 'Cash', amount: t }];
  const head = rows.slice(0, -1).map((r) => ({ method: r.method, amount: r2(Number(r.amount) || 0) }));
  const rest = r2(t - head.reduce((a, r) => a + r.amount, 0));
  return [...head, { method: rows[rows.length - 1].method, amount: rest }];
}

// Problem with a split, or '' when it's fine
export function splitError(rows, total) {
  if (rows.length <= 1) return '';
  const parts = resolvePayments(rows, total);
  if (parts.slice(0, -1).some((p) => !(p.amount > 0))) return 'Enter an amount for each wallet.';
  if (parts[parts.length - 1].amount <= 0) return `The split is more than ${money(total)}.`;
  return '';
}

export default function PaymentSplit({ label = 'Paid via', rows, onChange, total, disabled = false }) {
  const split = rows.length > 1;
  const parts = resolvePayments(rows, total);
  const set = (i, patch) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const unused = (i) => WALLETS.filter((w) => w === rows[i].method || !rows.some((r) => r.method === w));

  if (!split) {
    return (
      <label className="field">
        <span className="split-label">
          {label}
          {!disabled && (
            <button type="button" className="linkish" onClick={() => onChange([
              { method: rows[0].method, amount: '' },
              { method: WALLETS.find((w) => w !== rows[0].method), amount: '' },
            ])}>split</button>
          )}
        </span>
        <select value={rows[0].method} disabled={disabled} onChange={(e) => set(0, { method: e.target.value })}>
          {WALLETS.map((w) => <option key={w}>{w}</option>)}
        </select>
      </label>
    );
  }

  const err = splitError(rows, total);
  return (
    <div className="field split-box">
      <span className="split-label">{label} <span className="faint">(split)</span></span>
      {rows.map((r, i) => {
        const last = i === rows.length - 1;
        return (
          <div className="split-row" key={i}>
            <select value={r.method} aria-label={`Wallet ${i + 1}`} onChange={(e) => set(i, { method: e.target.value })}>
              {unused(i).map((w) => <option key={w}>{w}</option>)}
            </select>
            {last ? (
              <input value={total > 0 ? parts[i].amount.toFixed(2) : ''} readOnly tabIndex={-1} className="split-rest" aria-label={`${r.method} amount (the rest)`} title="The rest of the total" />
            ) : (
              <input type="number" min="0" step="0.01" placeholder="0.00" value={r.amount} aria-label={`${r.method} amount`}
                onChange={(e) => set(i, { amount: e.target.value })} />
            )}
            <button type="button" className="small ghost danger" aria-label={`Remove ${r.method}`}
              onClick={() => onChange(rows.length === 2 ? [{ method: rows[1 - i].method, amount: '' }] : rows.filter((_, j) => j !== i))}>✕</button>
          </div>
        );
      })}
      <span className="faint">
        {rows.length < WALLETS.length && (
          <button type="button" className="linkish" onClick={() => onChange([...rows.slice(0, -1), { ...rows[rows.length - 1], amount: '' }, { method: WALLETS.find((w) => !rows.some((r) => r.method === w)), amount: '' }])}>
            + another wallet
          </button>
        )}
        {' '}Last line is the rest of {money(total)}.
      </span>
      {err && <span className="error" style={{ marginTop: 0 }}>{err}</span>}
    </div>
  );
}
