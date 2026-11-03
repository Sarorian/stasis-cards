import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { money, fmtDate, checkLinks } from '../format.js';
import CardImage from './CardImage.jsx';

const REASON = {
  graded: { label: 'Graded', cls: 'graded' },
  japanese: { label: 'Japanese', cls: 'jp' },
  notFound: { label: 'Not found', cls: 'neg' },
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
  const changed = list.filter((c) => Number(values[c.id]) > 0 && Number(values[c.id]) !== (c.manual ? c.price : -1));

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
        Graded and Japanese One Piece / Riftbound cards are always priced by hand, and so are cards the lookup couldn't find.
        Use the links to check recent sales. Leave a box empty to skip it.
      </p>
      {shown.length === 0 && <p className="hint">Nothing waiting. 🎉</p>}
      <div className="mp-list">
        {shown.map((c) => {
          const r = REASON[c.reason];
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
                  {checkLinks(c).map(([label, url]) => <a key={label} href={url} target="_blank" rel="noreferrer">{label} ↗</a>)}
                </span>
              </div>
              <div className="mp-now faint">
                {c.manual ? <>now {money(c.price)}<br />set {fmtDate(c.updatedAt?.slice(0, 10))}</> : c.reason === 'notFound' ? <>shows {money(c.price)}<br />(no match)</> : <>shows {money(c.price)}</>}
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
