import { useState } from 'react';
import { api } from '../api.js';
import { WALLETS, money, today } from '../format.js';
import WherePicker from './WherePicker.jsx';

export default function BinderSaleForm({ pool, onSaved }) {
  const [f, setF] = useState({ date: today(), count: '', amount: '', method: 'Cash', at: undefined });
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setError(''); setOk(''); };

  async function submit(e) {
    e.preventDefault();
    const count = Number(f.count);
    if (!(count > 0)) return setError('Enter how many binder cards you sold.');
    if (count > pool.count) return setError(`Only ${pool.count} binder cards in stock.`);
    if (!(Number(f.amount) > 0)) return setError('Enter what you sold them for.');
    try {
      await api.binderSell({ ...f, count, amount: Number(f.amount) });
      setOk(`Sold ${count} binder cards for ${money(f.amount)}.`);
      setF({ date: today(), count: '', amount: '', method: f.method, at: undefined });
      onSaved?.();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="panel" onSubmit={submit}>
      <div className="panel-head">
        <h2>Binder sale</h2>
        <span className="hint">{pool.count} in stock · avg cost {money(pool.avgCost)} each</span>
      </div>
      <div className="form-row" style={{ gridTemplateColumns: '1.1fr 0.9fr 0.9fr 1fr 1.3fr auto' }}>
        <label className="field">Date<input type="date" value={f.date} onChange={set('date')} /></label>
        <label className="field">Cards sold<input type="number" min="1" step="1" placeholder="40" value={f.count} onChange={set('count')} /></label>
        <label className="field">Sold for<input type="number" min="0" step="0.01" placeholder="110.00" value={f.amount} onChange={set('amount')} /></label>
        <label className="field">Paid via
          <select value={f.method} onChange={set('method')}>{WALLETS.map((w) => <option key={w}>{w}</option>)}</select>
        </label>
        <WherePicker value={f.at} date={f.date} onChange={(at) => setF((x) => ({ ...x, at }))} />
        <button className="primary">Record sale</button>
      </div>
      {error && <div className="error">{error}</div>}
      {ok && <div className="faint pos" style={{ marginTop: 6 }}>{ok}</div>}
    </form>
  );
}
