import { useState } from 'react';
import { api } from '../api.js';
import { WALLETS, money, today } from '../format.js';

// Wallet balances with a "Move to cash" action for digital wallets
export default function WalletsPanel({ wallets, onChange }) {
  const [moving, setMoving] = useState(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [error, setError] = useState('');

  const open = (w) => {
    setMoving(w);
    setAmount(wallets[w] > 0 ? String(wallets[w]) : '');
    setDate(today());
    setError('');
  };

  async function submit() {
    if (!(Number(amount) > 0)) return setError('Enter an amount above 0.');
    try {
      await api.transfer({ from: moving, to: 'Cash', amount: Number(amount), date });
      setMoving(null);
      onChange?.();
    } catch (err) {
      setError(err.message);
    }
  }

  const digital = WALLETS.filter((w) => w !== 'Cash').reduce((a, w) => a + (wallets[w] || 0), 0);

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Wallets</h2>
        <span className="hint">{money(digital)} in digital wallets to convert to cash</span>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
        {WALLETS.map((w) => (
          <div key={w}>
            <div className="hint">{w}</div>
            <div style={{ fontWeight: 600, fontSize: 18 }} className={wallets[w] < 0 ? 'neg' : ''}>{money(wallets[w])}</div>
            {w !== 'Cash' && (
              <button className="small" style={{ marginTop: 4 }} onClick={() => open(w)}>Move to cash</button>
            )}
          </div>
        ))}
      </div>
      {moving && (
        <div className="inline-form" style={{ marginTop: 12 }}>
          <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr auto auto' }}>
            <label className="field">Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
            <label className="field">Amount from {moving}
              <input type="number" min="0" step="0.01" value={amount} onChange={(e) => { setAmount(e.target.value); setError(''); }} />
            </label>
            <button className="primary" onClick={submit}>Move</button>
            <button onClick={() => setMoving(null)}>Cancel</button>
          </div>
          {error && <div className="error">{error}</div>}
        </div>
      )}
    </div>
  );
}
