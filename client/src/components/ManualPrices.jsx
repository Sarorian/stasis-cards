import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { money, fmtDate, checkLinks } from '../format.js';
import CardImage from './CardImage.jsx';

const REASON = {
  graded: { label: 'Graded', cls: 'graded' },
  japanese: { label: 'Japanese', cls: 'jp' },
  notFound: { label: 'Not found', cls: 'neg' },
  condition: { label: 'Below NM', cls: 'cond' },
};

// Cards whose market price has to be typed in: graded, Japanese non-Pokemon, or not found by the lookup
export default function ManualPrices({ onSaved, onClose }) {
  const [list, setList] = useState(null);
  const [values, setValues] = useState({});
  const [filter, setFilter] = useState('needed');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = () => api.manualPrices().then((l) => {
    setList(l);
    setValues(Object.fromEntries(l.map((c) => [c.id, c.manual && c.price ? String(c.price) : ''])));
  }).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, []);

  if (!list) return <div className="panel hint">{msg || 'Loading…'}</div>;

  const shown = list.filter((c) => filter === 'all' || c.needed);
  // Waiting cards with a price in the box get saved (a prefilled graded price = "still right"),
  // plus any other hand-priced card whose price you changed
  const changed = list.filter((c) => Number(values[c.id]) > 0 && (c.needed || Number(values[c.id]) !== (c.manual ? c.price : -1)));

  async function save() {
    setBusy(true);
    setMsg('');
    try {
      const r = await api.saveManualPrices(changed.map((c) => ({ id: c.id, price: Number(values[c.id]) })));
      setMsg(`Saved ${r.saved} price${r.saved === 1 ? '' : 's'}.`);
      await load();
      onSaved?.();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel manual-prices">
      <div className="panel-head">
        <h2>Prices to enter <span className="faint">{list.filter((c) => c.needed).length} waiting</span></h2>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className={`tab small${filter === 'needed' ? ' on' : ''}`} onClick={() => setFilter('needed')}>Waiting</button>
          <button className={`tab small${filter === 'all' ? ' on' : ''}`} onClick={() => setFilter('all')}>All hand-priced</button>
          {onClose && <button className="small ghost" onClick={onClose} aria-label="Close">✕</button>}
        </div>
      </div>
      <p className="hint" style={{ marginTop: 0 }}>
        Graded cards, cards below NM (LP/MP/HP/DMG) and Japanese One Piece / Riftbound cards are always priced by hand, and so are cards the lookup couldn't find.
        Graded and below-NM cards come back here after every price update with their last price filled in: change it, or save it as-is if it's still right.
        Use the links to check recent sales. Clear a box to skip that card.
      </p>
      <BinderValueBox onSaved={onSaved} />
      {shown.length === 0 && <p className="hint">Nothing waiting. 🎉</p>}
      <div className="mp-list">
        {shown.map((c) => {
          const r = c.reason === 'condition' ? { ...REASON.condition, label: c.condition } : REASON[c.reason];
          const links = checkLinks(c).map(([label, url]) => (label === 'TCGplayer' && c.tcgplayerUrl ? [label, c.tcgplayerUrl] : [label, url]));
          return (
            <div className="mp-row" key={c.id}>
              <CardImage src={c.imageUrl} game={c.game} alt="" className="result-img" />
              <div className="mp-name">
                <b>{c.name}</b>
                <span className="faint">
                  {[c.number, c.setName, c.game].filter(Boolean).join(' · ')}
                  {c.graded ? ` · ${c.graded.company} ${c.graded.grade}` : ` · ${c.condition}`}
                  {' · '}cost {money(c.cost)}
                </span>
                <span className="mp-links">
                  <span className={`pill ${r.cls}`}>{r.label}</span>
                  {links.map(([label, url]) => <a key={label} href={url} target="_blank" rel="noreferrer">{label} ↗</a>)}
                  {c.reason === 'condition' && c.nmPrice ? <span className="faint">NM market {money(c.nmPrice)}</span> : null}
                </span>
              </div>
              <div className="mp-now faint">
                {c.manual ? <>{c.needed && (c.reason === 'graded' || c.reason === 'condition') ? 're-check · ' : ''}was {money(c.price)}<br />set {fmtDate(c.updatedAt?.slice(0, 10))}</> : c.reason === 'notFound' ? <>shows {money(c.price)}<br />(no match)</> : <>shows {money(c.price)}</>}
              </div>
              <label className="field mp-input">Market price
                <input type="number" min="0" step="0.01" placeholder="0.00" value={values[c.id] ?? ''}
                  onChange={(e) => { setValues({ ...values, [c.id]: e.target.value }); setMsg(''); }} />
              </label>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
        <button className="primary" disabled={busy || changed.length === 0} onClick={save}>
          {busy ? 'Saving…' : `Save ${changed.length} price${changed.length === 1 ? '' : 's'}`}
        </button>
        <span className="hint">{msg || 'Saved prices stick until you change them; automatic updates won’t overwrite them.'}</span>
      </div>
    </div>
  );
}

// Optional: the whole binder's market value, counted by hand card by card
function BinderValueBox({ onSaved }) {
  const [pool, setPool] = useState(null);
  const [value, setValue] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => api.binder().then((d) => setPool(d.pool)).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!pool || pool.count <= 0) return null;

  async function save(e) {
    e.preventDefault();
    if (!(Number(value) >= 0) || value === '') return setMsg('Enter the binder\'s total market value.');
    setBusy(true);
    try {
      const r = await api.setBinderValue(Number(value));
      setMsg(`Binder now worth ${money(r.pool.value)}.`);
      setPool(r.pool);
      setValue('');
      onSaved?.();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="mp-row binder-value" onSubmit={save}>
      <span className="perf-logo binder-mark" aria-hidden="true">B</span>
      <div className="mp-name">
        <b>Binder <span className="faint">(optional)</span></b>
        <span className="faint">{pool.count} cards · paid {money(pool.cost)}</span>
        <span className="faint">If you've counted up the binder card by card, enter its total market value. Costs and sale profit don't change.</span>
      </div>
      <div className="mp-now faint">
        now ~{money(pool.value)}<br />{pool.valuedAt ? `counted ${fmtDate(pool.valuedAt)}` : 'from buy estimates'}
      </div>
      <div className="bv-input" style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
        <label className="field mp-input">Binder market value
          <input type="number" min="0" step="0.01" placeholder={pool.value.toFixed(2)} value={value} onChange={(e) => { setValue(e.target.value); setMsg(''); }} />
        </label>
        <button className="small" disabled={busy || value === ''}>Save</button>
      </div>
      {msg && <div className="hint" style={{ gridColumn: '1 / -1' }}>{msg}</div>}
    </form>
  );
}
