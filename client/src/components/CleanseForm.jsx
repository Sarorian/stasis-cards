import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { PARTNERS, money, today, tone } from '../format.js';

// Owen or Ben takes this card to cleanse debt, at a value you choose
export default function CleanseForm({ card, onDone, onCancel }) {
  const [owed, setOwed] = useState(null); // { Owen: 486, Ben: 1377 }
  const [f, setF] = useState({ person: PARTNERS[0], value: String(card.market?.price || ''), date: today(), source: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setError(''); };

  useEffect(() => {
    api.debt().then((d) => setOwed(Object.fromEntries(d.people.map((p) => [p.person, p.owed])))).catch((e) => setError(e.message));
  }, []);

  const value = Number(f.value);
  const max = owed?.[f.person] ?? 0;
  const profit = value - card.cost;

  async function submit(e) {
    e.preventDefault();
    if (!(value > 0)) return setError('Enter the value it cleanses.');
    if (owed && value > max + 0.004) return setError(`The business only owes ${f.person} ${money(max)}.`);
    setBusy(true);
    try {
      await api.addDebt({ person: f.person, type: 'clean', how: 'card', amount: value, date: f.date, source: f.source || card.name, cardId: card._id });
      onDone?.();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form className="inline-form" onSubmit={submit}>
      <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr 1.1fr auto auto' }}>
        <label className="field">Taken by
          <select value={f.person} onChange={set('person')}>
            {PARTNERS.map((p) => <option key={p} value={p}>{p}{owed ? ` (owed ${money(owed[p])})` : ''}</option>)}
          </select>
        </label>
        <label className="field">Cleanses<input type="number" min="0" step="0.01" autoFocus value={f.value} onChange={set('value')} /></label>
        <label className="field">Date<input type="date" value={f.date} onChange={set('date')} /></label>
        <button className="primary" disabled={busy || (owed && max <= 0)}>Cleanse debt</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
      {owed && (
        <div className="hint" style={{ marginTop: 6 }}>
          {max <= 0 ? `The business doesn't owe ${f.person} anything right now.` : (
            <>{f.person}'s debt goes {money(max)} → {money(Math.max(max - (value || 0), 0))}.
              {value > 0 && <> Counts as a {money(value)} sale: <span className={tone(profit)}>{money(profit)}</span> profit on a cost of {money(card.cost)}.</>}</>
          )}
        </div>
      )}
      {error && <div className="error">{error}</div>}
    </form>
  );
}
