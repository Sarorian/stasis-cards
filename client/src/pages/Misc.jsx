import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { GAMES, WALLETS, money, tone, today, fmtDate, logoFor } from '../format.js';

const MISC_GAMES = [...GAMES.filter((g) => g !== 'Misc'), 'Other'];
const num = (v) => Number(v) || 0;
const unitWord = (label, n) => (n === 1 ? label.replace(/s$/, '') : label);

export default function Misc() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [view, setView] = useState('stock');
  const [q, setQ] = useState('');

  const load = () => api.miscItems().then(setItems).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  const replace = (updated) => setItems((list) => list.map((i) => (i._id === updated._id ? updated : i)));

  const shown = (items || []).filter((i) =>
    (view === 'all' || (view === 'stock' ? i.remaining > 0 : i.remaining === 0)) &&
    (!q.trim() || `${i.name} ${i.game} ${i.notes}`.toLowerCase().includes(q.trim().toLowerCase())));

  const totals = (items || []).reduce((a, i) => ({
    left: a.left + i.remainingCost, profit: a.profit + i.profit, units: a.units + i.remaining,
  }), { left: 0, profit: 0, units: 0 });

  return (
    <>
      <div className="page-head">
        <h1>Misc <span className="faint" style={{ fontSize: 14, fontWeight: 400 }}>sealed product &amp; other items</span></h1>
      </div>

      <PurchaseForm onSaved={(item) => { setItems((list) => [item, ...(list || [])]); setView('stock'); }} />

      <div className="panel">
        <div className="filters">
          {[['stock', 'In stock'], ['out', 'Sold out'], ['all', 'All']].map(([k, label]) => (
            <button key={k} className={`tab${view === k ? ' on' : ''}`} onClick={() => setView(k)}>{label}</button>
          ))}
          <input placeholder="Search items" value={q} onChange={(e) => setQ(e.target.value)} />
          {items && (
            <span className="hint" style={{ marginLeft: 'auto' }}>
              {totals.units} left · cost {money(totals.left)} · profit so far <span className={tone(totals.profit)}>{money(totals.profit)}</span>
            </span>
          )}
        </div>
        {error && <div className="toast">{error}</div>}
        {!items && !error && <p className="hint">Loading…</p>}
        {items && shown.length === 0 && (
          <p className="hint">{items.length === 0 ? 'Log a booster box or other item above to get started.' : 'Nothing here.'}</p>
        )}
        {shown.map((i) => <MiscItemRow key={i._id} item={i} onChange={replace} onDeleted={() => setItems((l) => l.filter((x) => x._id !== i._id))} />)}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */

function PurchaseForm({ onSaved }) {
  const blank = { date: today(), name: '', game: 'Riftbound', units: '', unitLabel: 'packs', cost: '', paidFrom: 'Cash', notes: '' };
  const [f, setF] = useState(blank);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setError(''); setOk(''); };

  async function submit(e) {
    e.preventDefault();
    if (!f.name.trim()) return setError('Give it a name, like "Riftbound Origins booster box".');
    if (!(Number.isInteger(num(f.units)) && num(f.units) >= 1)) return setError('Enter how many packs (or items) it contains.');
    if (!(num(f.cost) > 0)) return setError('Enter what you paid in total.');
    try {
      const item = await api.createMiscItem({ ...f, units: num(f.units), cost: num(f.cost) });
      setOk(`Logged ${item.name}.`);
      setF({ ...blank, game: f.game, paidFrom: f.paidFrom, unitLabel: f.unitLabel });
      onSaved(item);
    } catch (err) {
      setError(err.message);
    }
  }

  const per = num(f.units) >= 1 && num(f.cost) > 0 ? num(f.cost) / num(f.units) : null;

  return (
    <form className="panel" onSubmit={submit}>
      <div className="panel-head"><h2>Log a purchase</h2>{per !== null && <span className="hint">{money(per)} per {unitWord(f.unitLabel || 'packs', 1)}</span>}</div>
      <div className="form-row misc-form">
        <label className="field">Date<input type="date" value={f.date} onChange={set('date')} /></label>
        <label className="field">What is it<input placeholder="Riftbound Origins booster box" value={f.name} onChange={set('name')} /></label>
        <label className="field">Game
          <select value={f.game} onChange={set('game')}>{MISC_GAMES.map((g) => <option key={g}>{g}</option>)}</select>
        </label>
        <label className="field">How many<input type="number" min="1" step="1" placeholder="36" value={f.units} onChange={set('units')} /></label>
        <label className="field">Of what
          <input list="unit-labels" value={f.unitLabel} onChange={set('unitLabel')} />
          <datalist id="unit-labels"><option value="packs" /><option value="items" /><option value="boxes" /><option value="bundles" /></datalist>
        </label>
        <label className="field">Total cost<input type="number" min="0" step="0.01" placeholder="200.00" value={f.cost} onChange={set('cost')} /></label>
        <label className="field">Paid from
          <select value={f.paidFrom} onChange={set('paidFrom')}>{WALLETS.map((w) => <option key={w}>{w}</option>)}</select>
        </label>
        <button className="primary">Save</button>
      </div>
      <label className="field" style={{ marginTop: 8 }}>Notes (optional)<input placeholder="Where, from who…" value={f.notes} onChange={set('notes')} /></label>
      {error && <div className="error">{error}</div>}
      {ok && <div className="faint pos" style={{ marginTop: 6 }}>{ok}</div>}
    </form>
  );
}

/* ------------------------------------------------------------------ */

function MiscItemRow({ item: i, onChange, onDeleted }) {
  const [mode, setMode] = useState(null); // 'sell' | 'open' | 'history'
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function act(fn, confirmText) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setMsg('');
    try {
      const res = await fn();
      if (res?.deleted) onDeleted(); else onChange(res);
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  const usedPct = Math.round(((i.sold + i.opened) / i.units) * 100);
  const label = i.unitLabel;
  const done = i.remaining === 0;

  return (
    <div className="misc-row">
      <div className="misc-main">
        <img src={logoFor(i.game === 'Other' ? 'Misc' : i.game)} alt="" className="perf-logo" />
        <div style={{ minWidth: 0 }}>
          <div className="card-name">{i.name}</div>
          <div className="hint">
            {i.game} · bought {fmtDate(i.date)} · {money(i.cost)} from {i.paidFrom} · {money(i.unitCost)} per {unitWord(label, 1)}
            {i.notes && <> · <span className="faint">{i.notes}</span></>}
          </div>
          <div className="misc-progress">
            <div className="progress"><div style={{ width: `${usedPct}%` }} /></div>
            <span className="faint">
              <b className="misc-left">{i.remaining}</b> of {i.units} {label} left
              {i.sold > 0 && ` · ${i.sold} sold`}{i.opened > 0 && ` · ${i.opened} opened`}
            </span>
          </div>
        </div>
        <div className="misc-money">
          <div>{money(i.revenue)} <span className="faint">revenue</span></div>
          <div className={tone(i.profit)}>{i.profit >= 0 ? '+' : ''}{money(i.profit)} <span className="faint">profit so far</span></div>
        </div>
        <div className="row-actions">
          {!done && <button className="small primary" onClick={() => setMode(mode === 'sell' ? null : 'sell')}>Sell</button>}
          {!done && <button className="small" onClick={() => setMode(mode === 'open' ? null : 'open')}>Opened</button>}
          <button className="small ghost" onClick={() => setMode(mode === 'history' ? null : 'history')} aria-expanded={mode === 'history'}>
            History{i.entries.length ? ` (${i.entries.length})` : ''}
          </button>
          <button className="small ghost danger" title="Delete item" disabled={busy}
            onClick={() => act(() => api.deleteMiscItem(i._id), `Delete ${i.name}? This removes the purchase${i.entries.length ? ` and all ${i.entries.length} sale/opened entries` : ''}, and their money from the wallets.`)}>✕</button>
        </div>
      </div>
      {msg && <div className="error">{msg}</div>}
      {mode === 'sell' && <SellForm item={i} onCancel={() => setMode(null)} onDone={(res) => { onChange(res); setMode('history'); }} />}
      {mode === 'open' && <OpenForm item={i} onCancel={() => setMode(null)} onDone={(res) => { onChange(res); setMode('history'); }} />}
      {mode === 'history' && (
        <div className="inline-form">
          {i.entries.length === 0 && <p className="hint" style={{ margin: 0 }}>No sales yet.</p>}
          {i.entries.length > 0 && (
            <table className="simple">
              <thead><tr><th>Date</th><th>What</th><th className="num">Price</th><th>Via</th><th className="num">Cost</th><th className="num">Profit</th><th /></tr></thead>
              <tbody>
                {i.entries.map((e) => {
                  const profit = (e.type === 'sell' ? e.amount - (e.fees || 0) : 0) - e.costBasis;
                  return (
                    <tr key={e._id}>
                      <td>{fmtDate(e.date)}</td>
                      <td>{e.type === 'sell' ? `Sold ${e.units} ${unitWord(label, e.units)}` : `Opened ${e.units} ${unitWord(label, e.units)}`}
                        {e.type === 'sell' && e.units > 1 && <span className="faint"> · {money(e.amount / e.units)} each</span>}
                        {e.fees > 0 && <span className="faint"> · {money(e.fees)} fees</span>}</td>
                      <td className="num">{e.type === 'sell' ? money(e.amount) : '—'}</td>
                      <td>{e.method || <span className="faint">written off</span>}</td>
                      <td className="num">{money(e.costBasis)}</td>
                      <td className={`num ${tone(profit)}`}>{money(profit)}</td>
                      <td className="num">
                        <button className="small ghost danger" aria-label="Undo this entry" disabled={busy}
                          onClick={() => act(() => api.deleteMiscEntry(e._id), `Undo this ${e.type === 'sell' ? 'sale' : 'opening'}? The ${label} go back in stock${e.type === 'sell' ? ` and ${money(e.amount - (e.fees || 0))} comes back out of ${e.method}` : ''}.`)}>✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function SellForm({ item: i, onCancel, onDone }) {
  const [f, setF] = useState({ date: today(), units: '1', amount: '', fees: '', method: 'Cash' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setError(''); };
  const units = num(f.units);
  const cost = units >= 1 ? (units === i.remaining ? i.remainingCost : (i.cost / i.units) * units) : 0;
  const profit = num(f.amount) - num(f.fees) - cost;

  async function submit(e) {
    e.preventDefault();
    if (!(Number.isInteger(units) && units >= 1)) return setError('Enter how many were sold.');
    if (units > i.remaining) return setError(`Only ${i.remaining} ${i.unitLabel} left.`);
    if (!(num(f.amount) > 0)) return setError('Enter the total sale price.');
    setBusy(true);
    try {
      onDone(await api.sellMisc(i._id, { ...f, units, amount: num(f.amount), fees: num(f.fees) }));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form className="inline-form" onSubmit={submit}>
      <div className="form-row misc-sell">
        <label className="field">Date<input type="date" value={f.date} onChange={set('date')} /></label>
        <label className="field">How many {i.unitLabel}<input type="number" min="1" max={i.remaining} step="1" autoFocus value={f.units} onChange={set('units')} /></label>
        <label className="field">Sold for (total)<input type="number" min="0" step="0.01" placeholder="18.00" value={f.amount} onChange={set('amount')} /></label>
        <label className="field">Fees<input type="number" min="0" step="0.01" placeholder="0.00" value={f.fees} onChange={set('fees')} /></label>
        <label className="field">Paid via<select value={f.method} onChange={set('method')}>{WALLETS.map((w) => <option key={w}>{w}</option>)}</select></label>
        <button className="primary" disabled={busy}>Record sale</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
      {units >= 1 && num(f.amount) > 0 && (
        <div className="hint" style={{ marginTop: 6 }}>
          {units > 1 && `${money(num(f.amount) / units)} each · `}cost {money(cost)} · profit <span className={tone(profit)}>{money(profit)}</span>
        </div>
      )}
      {error && <div className="error">{error}</div>}
    </form>
  );
}

function OpenForm({ item: i, onCancel, onDone }) {
  const [f, setF] = useState({ date: today(), units: '1' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const units = num(f.units);
  const cost = units >= 1 ? (units === i.remaining ? i.remainingCost : (i.cost / i.units) * units) : 0;

  async function submit(e) {
    e.preventDefault();
    if (!(Number.isInteger(units) && units >= 1)) return setError('Enter how many were opened.');
    if (units > i.remaining) return setError(`Only ${i.remaining} ${i.unitLabel} left.`);
    setBusy(true);
    try {
      onDone(await api.openMisc(i._id, { ...f, units }));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form className="inline-form" onSubmit={submit}>
      <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr auto auto' }}>
        <label className="field">Date<input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
        <label className="field">How many {i.unitLabel} opened<input type="number" min="1" max={i.remaining} step="1" autoFocus value={f.units} onChange={(e) => { setF({ ...f, units: e.target.value }); setError(''); }} /></label>
        <button className="primary" disabled={busy}>Write off</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
      <div className="hint" style={{ marginTop: 6 }}>
        Opened {i.unitLabel} count as a loss of their cost{units >= 1 ? ` (${money(cost)})` : ''}.
      </div>
      {error && <div className="error">{error}</div>}
    </form>
  );
}
