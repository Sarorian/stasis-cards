import { useState } from 'react';
import { api } from '../api.js';
import { WALLETS, money, today, pct, tone } from '../format.js';

export default function SellForm({ card, onDone, onCancel }) {
  const [f, setF] = useState({ date: today(), price: '', method: 'Cash', fees: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setError(''); };

  const net = Number(f.price || 0) - Number(f.fees || 0);
  const profit = net - card.cost;

  async function submit(e) {
    e.preventDefault();
    if (!(Number(f.price) > 0)) return setError('Enter a sale price.');
    if (!f.date) return setError('Pick a sale date.');
    setBusy(true);
    try {
      await api.sellCard(card._id, { date: f.date, price: Number(f.price), method: f.method, fees: Number(f.fees) || 0 });
      onDone?.();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form className="inline-form" onSubmit={submit}>
      <div className="form-row" style={{ gridTemplateColumns: '1.1fr 1fr 1fr 0.8fr auto auto' }}>
        <label className="field">Sold on<input type="date" value={f.date} onChange={set('date')} /></label>
        <label className="field">Sold for<input type="number" min="0" step="0.01" autoFocus placeholder={card.market?.price} value={f.price} onChange={set('price')} /></label>
        <label className="field">Paid via
          <select value={f.method} onChange={set('method')}>{WALLETS.map((w) => <option key={w}>{w}</option>)}</select>
        </label>
        <label className="field">Fees (optional)<input type="number" min="0" step="0.01" placeholder="0.00" value={f.fees} onChange={set('fees')} /></label>
        <button className="primary" disabled={busy}>Confirm sale</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
      {Number(f.price) > 0 && (
        <div className="hint" style={{ marginTop: 6 }}>
          Profit <span className={tone(profit)}>{money(profit)} ({pct((profit / card.cost) * 100)})</span> on a cost of {money(card.cost)}
        </div>
      )}
      {error && <div className="error">{error}</div>}
    </form>
  );
}
