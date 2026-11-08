import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { money } from '../format.js';

// Move an inventory card into the binder pool: +1 binder card, its cost, and its market value. No money moves.
export default function ToBinderForm({ card, onCancel, onDone }) {
  const [market, setMarket] = useState(card.market?.price ? String(card.market.price) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (market === '' || !(Number(market) >= 0)) return setError('Enter its market value (0 is fine).');
    setBusy(true);
    try {
      await api.cardToBinder(card._id, { market: Number(market) });
      onDone?.();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form className="inline-form" onSubmit={submit}>
      <div className="form-row" style={{ gridTemplateColumns: 'minmax(140px, 200px) auto auto 1fr' }}>
        <label className="field">Adds to binder value<input type="number" min="0" step="0.01" autoFocus value={market} onChange={(e) => { setMarket(e.target.value); setError(''); }} /></label>
        <button className="primary" disabled={busy}>{busy ? 'Moving…' : 'Move to binder'}</button>
        <button type="button" onClick={onCancel}>Cancel</button>
        <span />
      </div>
      <div className="hint" style={{ marginTop: 6 }}>
        {card.name} leaves inventory. The binder gets +1 card and its {money(card.cost)} cost; the value above (its market price) is added to the binder's worth.
        No money moves. Undo it in <Link to="/add?tab=binder">Binder history</Link>.
      </div>
      {error && <div className="error">{error}</div>}
    </form>
  );
}
