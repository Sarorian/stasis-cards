import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { GAMES, CONDITIONS, GRADERS, money, today, fmtDate } from '../format.js';
import { identify, unsoldCards, yearOneSummary } from '../oldSystem.js';
import CardFinder from '../components/CardFinder.jsx';
import CardImage from '../components/CardImage.jsx';

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const ESTIMATE_PCT = 80; // unknown cost = 80% of current market

export default function Setup() {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const load = () => api.setup().then(setInfo).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  if (!info) return <p className="hint">{error || 'Loading…'}</p>;
  return (
    <>
      <div className="page-head">
        <h1>Starting setup</h1>
        <span className="hint">Nothing on this page moves money</span>
      </div>
      {error && <div className="toast">{error}</div>}
      <StartDate info={info} onSaved={load} />
      <OldSystem info={info} onChange={load} />
      <NewCards startDate={info.startDate} onChange={load} />
      <OpeningBinder info={info} onSaved={load} />
      <div className="panel">
        <div className="panel-head"><h2>Then</h2></div>
        <ol className="setup-steps">
          <li>Set your real wallet balances on the <Link to="/admin">Admin page</Link> (Correct wallet balances).</li>
          <li>Enter Owen's and Ben's debt on the <Link to="/debt">Debt page</Link> ("From the old sheet").</li>
          <li>On the <Link to="/">Dashboard</Link>, run <b>Update market prices</b> so old cards get real market prices (it uses your daily lookups; cards without a price go first).</li>
        </ol>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */

function StartDate({ info, onSaved }) {
  const [date, setDate] = useState(info.startDate || today());
  const [msg, setMsg] = useState('');
  async function save() {
    try {
      await api.setStartDate(date);
      setMsg('Saved.');
      onSaved();
    } catch (err) {
      setMsg(err.message);
    }
  }
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>1. Start date</h2>
        <span className="hint">{info.startDate ? `Tracking since ${fmtDate(info.startDate)}` : 'Not set yet'}</span>
      </div>
      <div className="form-row" style={{ gridTemplateColumns: 'minmax(160px, 220px) auto 1fr' }}>
        <label className="field">The app's numbers start on<input type="date" value={date} onChange={(e) => { setDate(e.target.value); setMsg(''); }} /></label>
        <button className="primary" onClick={save}>Save</button>
        <span className="hint">{msg || 'Everything before this is "Year 1" from the old system.'}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function OldSystem({ info, onChange }) {
  const [files, setFiles] = useState({}); // { items, expenses, others }
  const [fileMsg, setFileMsg] = useState('');
  const [rows, setRows] = useState([]);
  const [checked, setChecked] = useState(new Set());
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function readFiles(list) {
    const next = { ...files };
    const notes = [];
    for (const f of list) {
      try {
        const recs = JSON.parse(await f.text());
        const kind = identify(recs);
        if (!kind) { notes.push(`${f.name}: not recognized`); continue; }
        next[kind] = recs;
        notes.push(`${f.name} → ${kind} (${recs.length})`);
      } catch {
        notes.push(`${f.name}: couldn't read it as JSON`);
      }
    }
    setFiles(next);
    setFileMsg(notes.join(' · '));
    if (next.items) setRows(unsoldCards(next.items));
  }

  const imported = useMemo(() => new Set(info.importedOldIds), [info.importedOldIds]);
  const summary = useMemo(() => (files.items || files.expenses || files.others ? yearOneSummary(files, info.startDate) : null), [files, info.startDate]);
  const shown = rows.filter((r) => !q.trim() || `${r.name} ${r.number} ${r.setName} ${r.game}`.toLowerCase().includes(q.trim().toLowerCase()));
  const pending = rows.filter((r) => checked.has(r.oldId) && !imported.has(r.oldId));
  const patch = (oldId, p) => setRows((rs) => rs.map((r) => (r.oldId === oldId ? { ...r, ...p } : r)));
  const toggle = (oldId) => setChecked((s) => { const n = new Set(s); n.has(oldId) ? n.delete(oldId) : n.add(oldId); return n; });

  async function saveYearOne() {
    try {
      await api.saveYearOne(summary);
      setMsg('Year 1 summary saved. It shows at the bottom of the Dashboard.');
      onChange();
    } catch (err) {
      setMsg(err.message);
    }
  }

  async function addChecked() {
    if (!pending.length) return;
    if (!window.confirm(`Add ${pending.length} card${pending.length === 1 ? '' : 's'} to inventory at their old-system cost? No money moves.`)) return;
    setBusy(true);
    setMsg('');
    try {
      const res = await api.addOpeningCards(pending.map((r) => ({
        oldId: r.oldId, name: r.name, number: r.number, setName: r.setName, game: r.game,
        condition: r.condition, graded: r.graded, cost: Number(r.cost) || 0, boughtDate: r.boughtDate,
      })));
      setMsg(`Added ${res.added} card${res.added === 1 ? '' : 's'}${res.skipped.length ? ` (${res.skipped.length} were already added)` : ''}.`);
      setChecked(new Set());
      onChange();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>2. Old system</h2>
        <span className="hint">{info.yearOne ? `Year 1 saved · ${info.importedOldIds.length} old cards added` : `${info.importedOldIds.length} old cards added`}</span>
      </div>
      <label className="field">Load the exported files (items, expenses, others). They're read here in your browser.
        <input type="file" accept=".json,application/json" multiple onChange={(e) => readFiles([...e.target.files])} />
      </label>
      {fileMsg && <div className="faint" style={{ marginTop: 4 }}>{fileMsg}</div>}

      {summary && (
        <div className="setup-sub">
          <div className="panel-head"><h3>Year 1 summary</h3>
            <button className="small primary" onClick={saveYearOne}>{info.yearOne ? 'Replace saved summary' : 'Save to Dashboard'}</button>
          </div>
          {!files.items || !files.expenses || !files.others ? <div className="toast">Load all three files for a complete summary.</div> : null}
          <YearOneFigures y={summary} />
        </div>
      )}

      {rows.length > 0 && (
        <div className="setup-sub">
          <div className="panel-head">
            <h3>Still in stock in the old system <span className="faint">tick what you still have</span></h3>
            <span className="hint">{rows.length} cards · {money(rows.reduce((a, r) => a + r.cost, 0))} cost</span>
          </div>
          <div className="filters">
            <input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="small" onClick={() => setChecked(new Set(rows.filter((r) => !imported.has(r.oldId)).map((r) => r.oldId)))}>Tick all</button>
            <button className="small ghost" onClick={() => setChecked(new Set())}>Clear</button>
          </div>
          <div className="checklist">
            <div className="check-row head"><span /><span>Card</span><span>Game</span><span>Condition</span><span>Cost</span><span>Bought</span></div>
            {shown.map((r) => {
              const done = imported.has(r.oldId);
              return (
                <div className={`check-row${done ? ' done' : ''}`} key={r.oldId}>
                  <input type="checkbox" aria-label={`Still have ${r.name}`} disabled={done} checked={done || checked.has(r.oldId)} onChange={() => toggle(r.oldId)} />
                  <span className="check-name">
                    <b>{r.name}</b>
                    <span className="faint">{[r.number, r.setName, r.notes].filter(Boolean).join(' · ')}{done && ' · added'}</span>
                  </span>
                  <select value={r.game} disabled={done} onChange={(e) => patch(r.oldId, { game: e.target.value })} aria-label="Game">
                    {GAMES.map((g) => <option key={g}>{g}</option>)}
                  </select>
                  {r.graded ? <span className="pill graded">{r.graded.company} {r.graded.grade}</span> : (
                    <select value={r.condition} disabled={done} onChange={(e) => patch(r.oldId, { condition: e.target.value })} aria-label="Condition">
                      {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  )}
                  <input type="number" min="0" step="0.01" value={r.cost} disabled={done} onChange={(e) => patch(r.oldId, { cost: e.target.value })} aria-label="Cost" />
                  <span className="faint">{fmtDate(r.boughtDate)}</span>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
            <button className="primary" disabled={busy || !pending.length} onClick={addChecked}>
              {busy ? 'Adding…' : `Add ${pending.length} ticked card${pending.length === 1 ? '' : 's'} to inventory`}
            </button>
            <span className="hint">Game is guessed from the set name; fix any that are wrong before adding.</span>
          </div>
        </div>
      )}
      {msg && <div className="faint pos" style={{ marginTop: 8 }}>{msg}</div>}
    </div>
  );
}

export function YearOneFigures({ y }) {
  const tone = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
  return (
    <>
      <div className="y1-grid">
        <div><span className="hint">Revenue</span><b>{money(y.totals.revenue)}</b></div>
        <div><span className="hint">Net profit</span><b className={tone(y.totals.profit)}>{money(y.totals.profit)}</b></div>
        <div><span className="hint">Card profit</span><b className={tone(y.cards.profit)}>{money(y.cards.profit)}</b><span className="faint">{y.cards.sold} sold</span></div>
        <div><span className="hint">Binder net</span><b className={tone(y.binder.net)}>{money(y.binder.net)}</b><span className="faint">{money(y.binder.revenue)} in · {money(y.binder.spent)} out</span></div>
        <div><span className="hint">Sealed / packs net</span><b className={tone(y.sealed.net)}>{money(y.sealed.net)}</b><span className="faint">{money(y.sealed.revenue)} in · {money(y.sealed.spent)} out</span></div>
        <div><span className="hint">Expenses</span><b>{money(y.expenses.total)}</b><span className="faint">{Object.entries(y.expenses.groups).map(([k, v]) => `${k} ${money(v)}`).join(' · ')}</span></div>
      </div>
      <div className="faint" style={{ marginTop: 6 }}>
        {fmtDate(y.from)} – {fmtDate(y.lastRecord)} · {y.stockAtEnd.count} cards ({money(y.stockAtEnd.cost)} cost) still in stock at the end, not counted in profit
        {y.cards.best && ` · best flip ${y.cards.best.name} ${money(y.cards.best.profit)}`}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */

const blankNew = (game = 'Pokemon') => ({
  game, language: 'EN', pick: null, name: '', number: '', setName: '', imageUrl: '', external: {}, sources: [],
  condition: 'NM', graded: false, company: 'PSA', grade: '', market: '', cost: '', boughtDate: '',
});

function NewCards({ startDate, onChange }) {
  const [f, setF] = useState(blankNew('Riftbound'));
  const [added, setAdded] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [finderKey, setFinderKey] = useState(0);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }); setError(''); };

  const market = Number(f.market) || 0;
  const estimated = f.cost === '';
  const cost = estimated ? r2((market * ESTIMATE_PCT) / 100) : Number(f.cost);

  function pick(r) {
    setF({
      ...f, pick: r, name: r.name, number: r.number, setName: r.setName, imageUrl: r.imageUrl || '', external: r.external || {},
      sources: r.price ? [{ source: r.source, price: r.price, url: r.url }] : [], market: r.price ? String(r.price) : '',
    });
    setError('');
  }

  async function add(e) {
    e.preventDefault();
    if (!f.name.trim()) return setError('Find the card or type its name.');
    if (estimated && !(market > 0)) return setError('Enter what you paid, or a market price to estimate from.');
    if (f.graded && !String(f.grade).trim()) return setError('Enter the grade.');
    setBusy(true);
    try {
      const res = await api.addOpeningCards([{
        name: f.name, number: f.number, setName: f.setName, game: f.game, language: f.language, imageUrl: f.imageUrl, external: f.external, sources: f.sources,
        condition: f.condition, graded: f.graded ? { company: f.company, grade: f.grade } : null,
        market: market || undefined, cost, costEstimated: estimated, boughtDate: f.boughtDate || startDate || today(),
      }]);
      setAdded((a) => [{ id: res.ids[0], name: f.name, number: f.number, game: f.language === 'JP' ? `${f.game} JP` : f.game, imageUrl: f.imageUrl, cost, estimated, market }, ...a]);
      setF({ ...blankNew(f.game), language: f.language, boughtDate: f.boughtDate });
      setFinderKey((k) => k + 1);
      onChange();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(c) {
    if (!window.confirm(`Remove ${c.name} from inventory?`)) return;
    try {
      await api.deleteOpeningCard(c.id);
      setAdded((a) => a.filter((x) => x.id !== c.id));
      onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="panel" onSubmit={add}>
      <div className="panel-head">
        <h2>3. Cards that were never in the old system</h2>
        <span className="hint">Blank cost = {ESTIMATE_PCT}% of current market</span>
      </div>
      <div style={{ display: 'flex', gap: 14 }}>
        <CardImage src={f.imageUrl} game={f.game} alt={f.name || 'Card'} className="thumb" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <CardFinder key={finderKey} game={f.game} onGameChange={(g) => setF({ ...f, game: g })} onPick={pick} picked={Boolean(f.pick)}
            language={f.language} onLanguageChange={(l) => setF({ ...f, language: l })} />
          <div className="form-row" style={{ gridTemplateColumns: '2fr 1fr 1.2fr', marginTop: 10 }}>
            <label className="field">Card name<input value={f.name} placeholder="Filled in when you pick a card" onChange={set('name')} /></label>
            <label className="field">Number<input value={f.number} onChange={set('number')} /></label>
            <label className="field">Set<input value={f.setName} onChange={set('setName')} /></label>
          </div>
          <div className="form-row" style={{ gridTemplateColumns: 'auto 1fr 1fr 1fr 1fr 1fr', marginTop: 10 }}>
            <label className="check" style={{ paddingBottom: 8 }}><input type="checkbox" checked={f.graded} onChange={set('graded')} /> Graded</label>
            {f.graded ? (
              <>
                <label className="field">Company<select value={f.company} onChange={set('company')}>{GRADERS.map((g) => <option key={g}>{g}</option>)}</select></label>
                <label className="field">Grade<input value={f.grade} placeholder="10" onChange={set('grade')} /></label>
              </>
            ) : (
              <>
                <label className="field">Condition<select value={f.condition} onChange={set('condition')}>{CONDITIONS.map((c) => <option key={c}>{c}</option>)}</select></label>
                <span />
              </>
            )}
            <label className="field">Market now<input type="number" min="0" step="0.01" value={f.market} placeholder="0.00" onChange={set('market')} /></label>
            <label className="field">What we paid<input type="number" min="0" step="0.01" value={f.cost} placeholder={market ? `${cost.toFixed(2)} (est.)` : 'blank = estimate'} onChange={set('cost')} /></label>
            <label className="field">Bought (roughly)<input type="date" value={f.boughtDate} onChange={set('boughtDate')} /></label>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
            <button className="primary" disabled={busy}>{busy ? 'Adding…' : 'Add to inventory'}</button>
            {f.name && <span className="hint">{estimated ? `Cost ${money(cost)} (estimated at ${ESTIMATE_PCT}% of ${money(market)})` : `Cost ${money(cost)}`}{!f.boughtDate && ` · bought date ${fmtDate(startDate || today())}`}</span>}
          </div>
          {error && <div className="error">{error}</div>}
        </div>
      </div>
      {added.length > 0 && (
        <div className="setup-sub">
          <div className="hint" style={{ marginBottom: 4 }}>Added just now ({added.length})</div>
          {added.map((c) => (
            <div className="list-row" key={c.id}>
              <span>{c.name} <span className="faint">{c.number} · {c.game}</span></span>
              <span>{money(c.cost)}{c.estimated && <span className="faint"> est.</span>} <button type="button" className="small ghost danger" aria-label={`Remove ${c.name}`} onClick={() => remove(c)}>✕</button></span>
            </div>
          ))}
        </div>
      )}
    </form>
  );
}

/* ------------------------------------------------------------------ */

function OpeningBinder({ info, onSaved }) {
  const current = info.openingBinder?.[0];
  const [f, setF] = useState({ count: current ? String(current.count) : '', value: current ? String(current.amount) : '' });
  const [msg, setMsg] = useState('');
  async function save(e) {
    e.preventDefault();
    if (!(Number(f.count) >= 1)) return setMsg('Enter how many binder cards you have.');
    try {
      await api.setOpeningBinder({ count: Number(f.count), value: Number(f.value) || 0 });
      setMsg('Saved.');
      onSaved();
    } catch (err) {
      setMsg(err.message);
    }
  }
  const per = Number(f.count) > 0 && Number(f.value) > 0 ? Number(f.value) / Number(f.count) : null;
  return (
    <form className="panel" onSubmit={save}>
      <div className="panel-head">
        <h2>4. Binder cards on hand</h2>
        <span className="hint">{current ? `Set: ${current.count} cards · ${money(current.amount)}` : 'Optional, you can do this later'}</span>
      </div>
      <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr auto 2fr' }}>
        <label className="field">How many<input type="number" min="1" step="1" value={f.count} onChange={(e) => { setF({ ...f, count: e.target.value }); setMsg(''); }} /></label>
        <label className="field">Total value<input type="number" min="0" step="0.01" value={f.value} onChange={(e) => { setF({ ...f, value: e.target.value }); setMsg(''); }} /></label>
        <button className="primary">{current ? 'Update' : 'Save'}</button>
        <span className="hint">{msg || (per !== null ? `${money(per)} per card. This becomes the binder pool's starting cost.` : 'This becomes the binder pool’s starting cost.')}</span>
      </div>
    </form>
  );
}
