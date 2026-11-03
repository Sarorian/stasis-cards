import { useState } from 'react';
import { api } from '../api.js';
import { money, today, pct, tone } from '../format.js';
import PaymentSplit, { singlePayment, resolvePayments, splitError } from './PaymentSplit.jsx';

export default function SellForm({ card, onDone, onCancel }) {
  const [f, setF] = useState({ date: today(), price: '', fees: '' });
  const [pay, setPay] = useState(singlePayment());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setError(''); };

  const net = Number(f.price || 0) - Number(f.fees || 0);
  const profit = net - card.cost;

  async function submit(e) {
    e.preventDefault();
    if (!(Number(f.price) > 0)) return setError('Enter a sale price.');
    if (!f.date) return setError('Pick a sale date.');
    const splitErr = splitError(pay, Number(f.price));
    if (splitErr) return setError(splitErr);
    const payments = resolvePayments(pay, Number(f.price));
    setBusy(true);
    try {
      await api.sellCard(card._id, {
        date: f.date, price: Number(f.price), fees: Number(f.fees) || 0,
        ...(payments.length > 1 ? { payments } : { method: payments[0].method }),
      });
      onDone?.();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form className="inline-form" onSubmit={submit}>
      <div className="form-row sell-row">
        <label className="field">Sold on<input type="date" value={f.date} onChange={set('date')} /></label>
        <label className="field">Sold for<input type="number" min="0" step="0.01" autoFocus placeholder={card.market?.price} value={f.price} onChange={set('price')} /></label>
        <PaymentSplit rows={pay} onChange={(r) => { setPay(r); setError(''); }} total={Number(f.price) || 0} />
        <label className="field">Fees (optional)<input type="number" min="0" step="0.01" placeholder="0.00" value={f.fees} onChange={set('fees')} /></label>
        <button className="primary" disabled={busy}>Confirm sale</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
      {Number(f.price) > 0 && (
        <div className="hint" style={{ marginTop: 6 }}>
          Profit <span className={tone(profit)}>{money(profit)} ({pct((profit / card.cost) * 100)})</span> on a cost of {money(card.cost)}
          {pay.length > 1 && Number(f.fees) > 0 && ` · fees come out of the biggest share`}
        </div>
      )}
      {error && <div className="error">{error}</div>}
    </form>
  );
}
