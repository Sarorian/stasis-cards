import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { WALLETS, DEBT_METHODS, money, fmtDate, today, tone } from '../format.js';
import { clearShowsCache } from '../components/WherePicker.jsx';

const FEE_METHODS = [...WALLETS, ...DEBT_METHODS, 'Already paid'];
const EXPENSE_METHODS = [...WALLETS, ...DEBT_METHODS];
const KINDS = ['Parking', 'Food', 'Gas', 'Hotel', 'Other'];

const dates = (s) => (s.endDate && s.endDate !== s.date ? `${fmtDate(s.date)} – ${fmtDate(s.endDate)}` : fmtDate(s.date));
const paidText = (m) => (m === 'Already paid' ? 'already paid' : m);
const sumOf = (list, f) => Math.round(list.reduce((a, x) => a + f(x), 0) * 100) / 100;

export default function Shows() {
  const [shows, setShows] = useState(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    clearShowsCache();
    api.shows().then(setShows).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const t = today();
  const upcoming = (shows || []).filter((s) => (s.endDate || s.date) >= t).sort((a, b) => a.date.localeCompare(b.date));
  const past = (shows || []).filter((s) => (s.endDate || s.date) < t);
  const all = shows || [];
  const totals = {
    liquid: sumOf(all, (s) => s.stats.liquid.revenue), liquidProfit: sumOf(all, (s) => s.stats.liquid.profit),
    trade: sumOf(all, (s) => s.stats.trade.revenue), tradeProfit: sumOf(all, (s) => s.stats.trade.profit),
    expenses: sumOf(all, (s) => s.stats.expenses), net: sumOf(all, (s) => s.stats.net),
  };

  return (
    <>
      <div className="page-head">
        <h1>Shows</h1>
        <button className="primary" onClick={() => setAdding(!adding)}>{adding ? 'Close' : 'Add show'}</button>
      </div>
      {error && <div className="toast">{error}</div>}
      {adding && <AddShowForm onSaved={() => { setAdding(false); load(); }} />}

      {all.length > 0 && (
        <div className="grid stats show-totals">
          <div className="stat"><div className="label">Liquid revenue</div><div className="value">{money(totals.liquid)}</div><div className="sub">profit <span className={tone(totals.liquidProfit)}>{money(totals.liquidProfit)}</span></div></div>
          <div className="stat"><div className="label">Trade revenue</div><div className="value">{money(totals.trade)}</div><div className="sub">profit <span className={tone(totals.tradeProfit)}>{money(totals.tradeProfit)}</span></div></div>
          <div className="stat"><div className="label">Show expenses</div><div className="value">{money(totals.expenses)}</div><div className="sub">tables, parking, food, gas</div></div>
          <div className="stat"><div className="label">Net from shows</div><div className={`value ${tone(totals.net)}`}>{money(totals.net)}</div><div className="sub">{all.length} show{all.length === 1 ? '' : 's'}</div></div>
        </div>
      )}

      {all.length > 0 && <ShowComparison shows={all} />}

      {shows && shows.length === 0 && !adding && (
        <div className="panel"><p className="hint">No shows yet. Add the ones you're signed up for, and buys and sales will default to the nearest one.</p></div>
      )}

      {upcoming.length > 0 && <h2 className="section-title">Upcoming and current</h2>}
      {upcoming.map((s) => <ShowPanel key={s._id} show={s} onChange={load} />)}
      {past.length > 0 && <h2 className="section-title">Past</h2>}
      {past.map((s) => <ShowPanel key={s._id} show={s} onChange={load} />)}
    </>
  );
}

function AddShowForm({ onSaved }) {
  const [f, setF] = useState({ name: '', date: today(), endDate: '', location: '', tableFee: '', paidWith: 'Cash' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setError(''); };

  async function submit(e) {
    e.preventDefault();
    if (!f.name.trim()) return setError('Give the show a name.');
    if (f.tableFee !== '' && !(Number(f.tableFee) >= 0)) return setError('The table fee must be 0 or more.');
    setBusy(true);
    try {
      await api.createShow({ ...f, endDate: f.endDate || null, tableFee: Number(f.tableFee) || 0 });
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const fee = Number(f.tableFee) || 0;
  return (
    <form className="panel" onSubmit={submit}>
      <div className="panel-head"><h2>Add a show</h2></div>
      <div className="form-row show-form">
        <label className="field">Show name<input value={f.name} placeholder="Castle Rock Card Show" autoFocus onChange={set('name')} /></label>
        <label className="field">Date<input type="date" value={f.date} onChange={set('date')} /></label>
        <label className="field">Ends (optional)<input type="date" value={f.endDate} min={f.date} onChange={set('endDate')} /></label>
        <label className="field">Location<input value={f.location} placeholder="City or venue" onChange={set('location')} /></label>
        <label className="field">Table fee<input type="number" min="0" step="0.01" placeholder="0.00" value={f.tableFee} onChange={set('tableFee')} /></label>
        <label className="field">Paid with
          <select value={f.paidWith} onChange={set('paidWith')}>{FEE_METHODS.map((m) => <option key={m}>{m}</option>)}</select>
        </label>
        <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Add show'}</button>
      </div>
      <div className="hint" style={{ marginTop: 6 }}>
        {fee > 0 && (f.paidWith === 'Already paid'
          ? 'Counts as a cost of the show. No money moves now, since it was paid before.'
          : DEBT_METHODS.includes(f.paidWith)
            ? `${money(fee)} is added to ${f.paidWith.replace(' (debt)', '')}'s debt.`
            : `${money(fee)} comes out of ${f.paidWith}.`)}
      </div>
      {error && <div className="error">{error}</div>}
    </form>
  );
}

function ShowPanel({ show: s, onChange }) {
  const [mode, setMode] = useState(null); // 'expense' | 'fee' | 'edit'
  const [error, setError] = useState('');
  const st = s.stats;
  const t = today();
  const live = s.date <= t && (s.endDate || s.date) >= t;

  async function act(fn, confirmText) {
    if (confirmText && !window.confirm(confirmText)) return;
    setError('');
    try {
      await fn();
      setMode(null);
      onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  const fee = s.tableFee?.amount || 0;
  return (
    <div className="panel show-panel">
      <div className="panel-head">
        <div>
          <h2>{s.name} {live && <span className="pill pos">Today</span>}</h2>
          <span className="hint">{dates(s)}{s.location ? ` · ${s.location}` : ''}</span>
        </div>
        <div className="row-actions">
          <button className="small" onClick={() => setMode(mode === 'expense' ? null : 'expense')}>Add expense</button>
          <button className="small ghost" onClick={() => setMode(mode === 'edit' ? null : 'edit')}>Edit</button>
          <button className="small ghost danger" title="Delete show"
            onClick={() => act(() => api.deleteShow(s._id), `Delete ${s.name}? Its table fee and expenses are undone (money back, debt removed).`)}>✕</button>
        </div>
      </div>

      <div className="show-grid">
        <div className="show-box">
          <div className="label">Liquid</div>
          <div className="show-line"><span>Revenue</span><b>{money(st.liquid.revenue)}</b></div>
          <div className="show-line"><span>Profit</span><b className={tone(st.liquid.profit)}>{money(st.liquid.profit)}</b></div>
          <div className="faint">{[st.liquid.cardsSold && `${st.liquid.cardsSold} card${st.liquid.cardsSold === 1 ? '' : 's'}`, st.liquid.binderSold && `${st.liquid.binderSold} binder`, st.liquid.sealedSold && `${st.liquid.sealedSold} sealed`].filter(Boolean).join(' · ') || 'nothing sold yet'}</div>
        </div>
        <div className="show-box">
          <div className="label">Trade</div>
          <div className="show-line"><span>Revenue</span><b>{money(st.trade.revenue)}</b></div>
          <div className="show-line"><span>Profit</span><b className={tone(st.trade.profit)}>{money(st.trade.profit)}</b></div>
          <div className="faint">{[st.trade.cardsOut && `${st.trade.cardsOut} card${st.trade.cardsOut === 1 ? '' : 's'} out`, st.trade.binderOut && `${st.trade.binderOut} binder out`].filter(Boolean).join(' · ') || 'no trades yet'}</div>
        </div>
        <div className="show-box">
          <div className="label">Expenses</div>
          <div className="show-line"><span>Total</span><b>{money(st.expenses)}</b></div>
          <div className="show-line"><span>Net profit</span><b className={tone(st.net)}>{money(st.net)}</b></div>
          <div className="faint">liquid + trade profit − expenses</div>
        </div>
        <div className="show-box">
          <div className="label">Bought here</div>
          <div className="show-line"><span>Cards</span><b>{st.bought.cards} <span className="faint">· {money(st.bought.cardsCost)}</span></b></div>
          <div className="show-line"><span>Binder</span><b>{st.bought.binder}{st.bought.binderCost > 0 && <span className="faint"> · {money(st.bought.binderCost)}</span>}</b></div>
          <div className="faint">{st.bought.tradedIn ? `${st.bought.tradedIn} card${st.bought.tradedIn === 1 ? '' : 's'} traded in` : ' '}</div>
        </div>
      </div>

      <table className="simple show-costs">
        <tbody>
          <tr>
            <td>Table fee</td>
            <td className="faint">{fee > 0 ? `${paidText(s.tableFee.paidWith)}` : 'none'}</td>
            <td className="num">{money(fee)}</td>
            <td className="num"><button className="small ghost" onClick={() => setMode(mode === 'fee' ? null : 'fee')}>Change</button></td>
          </tr>
          {s.expenses.map((e) => (
            <tr key={e._id}>
              <td>{e.kind}{e.note && <span className="faint"> · {e.note}</span>}</td>
              <td className="faint">{fmtDate(e.date)} · {e.paidWith}</td>
              <td className="num">{money(e.amount)}</td>
              <td className="num">
                <button className="small ghost danger" title="Remove expense"
                  onClick={() => act(() => api.deleteShowExpense(s._id, e._id), `Remove this ${money(e.amount)} ${e.kind.toLowerCase()} expense? ${DEBT_METHODS.includes(e.paidWith) ? 'It comes off their debt.' : `The money goes back into ${e.paidWith}.`}`)}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {mode === 'expense' && <ExpenseForm show={s} onSave={(body) => act(() => api.addShowExpense(s._id, body))} onCancel={() => setMode(null)} />}
      {mode === 'fee' && <FeeForm show={s} onSave={(body) => act(() => api.setShowTableFee(s._id, body))} onCancel={() => setMode(null)} />}
      {mode === 'edit' && <EditShowForm show={s} onSave={(body) => act(() => api.updateShow(s._id, body))} onCancel={() => setMode(null)} />}
      {error && <div className="error">{error}</div>}
    </div>
  );
}

function ExpenseForm({ show, onSave, onCancel }) {
  const inRange = today() >= show.date && today() <= (show.endDate || show.date);
  const [f, setF] = useState({ kind: 'Parking', amount: '', paidWith: 'Cash', date: inRange ? today() : show.date, note: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <form className="inline-form" onSubmit={(e) => { e.preventDefault(); onSave({ ...f, amount: Number(f.amount) }); }}>
      <div className="form-row show-expense">
        <label className="field">What<select value={f.kind} onChange={set('kind')}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select></label>
        <label className="field">Amount<input type="number" min="0" step="0.01" autoFocus placeholder="0.00" value={f.amount} onChange={set('amount')} /></label>
        <label className="field">Paid with<select value={f.paidWith} onChange={set('paidWith')}>{EXPENSE_METHODS.map((m) => <option key={m}>{m}</option>)}</select></label>
        <label className="field">Date<input type="date" value={f.date} onChange={set('date')} /></label>
        <label className="field">Note (optional)<input value={f.note} placeholder="Lunch for 2" onChange={set('note')} /></label>
        <button className="primary">Add</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
      <div className="hint" style={{ marginTop: 6 }}>
        {DEBT_METHODS.includes(f.paidWith) ? `Added to ${f.paidWith.replace(' (debt)', '')}'s debt (shows on the Debt page).` : `Comes out of ${f.paidWith}.`}
      </div>
    </form>
  );
}

function FeeForm({ show, onSave, onCancel }) {
  const [f, setF] = useState({ amount: String(show.tableFee?.amount || ''), paidWith: show.tableFee?.paidWith || 'Cash' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <form className="inline-form" onSubmit={(e) => { e.preventDefault(); onSave({ amount: Number(f.amount) || 0, paidWith: f.paidWith }); }}>
      <div className="form-row" style={{ gridTemplateColumns: 'minmax(120px, 180px) minmax(150px, 220px) auto auto 1fr' }}>
        <label className="field">Table fee<input type="number" min="0" step="0.01" autoFocus value={f.amount} onChange={set('amount')} /></label>
        <label className="field">Paid with<select value={f.paidWith} onChange={set('paidWith')}>{FEE_METHODS.map((m) => <option key={m}>{m}</option>)}</select></label>
        <button className="primary">Save</button>
        <button type="button" onClick={onCancel}>Cancel</button>
        <span />
      </div>
      <div className="hint" style={{ marginTop: 6 }}>The old payment is undone (money back or debt removed) and this one recorded instead.</div>
    </form>
  );
}

function EditShowForm({ show, onSave, onCancel }) {
  const [f, setF] = useState({ name: show.name, date: show.date, endDate: show.endDate || '', location: show.location || '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <form className="inline-form" onSubmit={(e) => { e.preventDefault(); onSave({ ...f, endDate: f.endDate || null }); }}>
      <div className="form-row" style={{ gridTemplateColumns: '1.6fr 1fr 1fr 1.4fr auto auto' }}>
        <label className="field">Name<input value={f.name} onChange={set('name')} /></label>
        <label className="field">Date<input type="date" value={f.date} onChange={set('date')} /></label>
        <label className="field">Ends<input type="date" value={f.endDate} min={f.date} onChange={set('endDate')} /></label>
        <label className="field">Location<input value={f.location} onChange={set('location')} /></label>
        <button className="primary">Save</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

const CHANNEL = { shows: 'Shows', ebay: 'eBay', private: 'Private sales', unset: 'Not set (older sales)' };

// Which shows were worth it, and how shows stack up against eBay and private sales
function ShowComparison({ shows }) {
  const [channels, setChannels] = useState(null);
  useEffect(() => { api.showChannels().then(setChannels).catch(() => setChannels([])); }, [shows]);

  const ranked = shows
    .filter((s) => s.date <= today())
    .map((s) => ({ ...s, revenue: s.stats.liquid.revenue + s.stats.trade.revenue, ret: s.stats.expenses > 0 ? s.stats.net / s.stats.expenses : null }))
    .sort((a, b) => b.stats.net - a.stats.net);
  const rows = (channels || []).filter((c) => c.sales > 0 || c.tradeRevenue > 0 || c.costs > 0);

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Show comparison</h2>
        <span className="hint">net = liquid + trade profit − table fee &amp; expenses</span>
      </div>
      {ranked.length === 0 ? <p className="hint">Rankings show up once a show's date has passed.</p> : (
        <div className="table-scroll">
          <table className="simple show-rank">
            <thead>
              <tr><th>#</th><th>Show</th><th className="num">Revenue</th><th className="num">Costs</th><th className="num">Net</th><th className="num" title="Net profit for every $1 of table fee and expenses">Per $1 spent</th></tr>
            </thead>
            <tbody>
              {ranked.map((s, i) => (
                <tr key={s._id}>
                  <td className="faint">{i + 1}</td>
                  <td>{s.name} <span className="faint">· {fmtDate(s.date)}</span></td>
                  <td className="num">{money(s.revenue)}</td>
                  <td className="num">{money(s.stats.expenses)}</td>
                  <td className={`num ${tone(s.stats.net)}`}><b>{money(s.stats.net)}</b></td>
                  <td className={`num ${s.ret === null ? 'faint' : tone(s.ret)}`}>{s.ret === null ? '—' : `${s.ret >= 0 ? '+' : '−'}$${Math.abs(s.ret).toFixed(2)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 className="section-title" style={{ marginTop: 16 }}>Where you sell best</h3>
      {!channels ? <p className="hint">Loading…</p> : rows.length === 0 ? <p className="hint">No sales with a "where" yet.</p> : (
        <div className="table-scroll">
          <table className="simple show-rank">
            <thead>
              <tr><th>Where</th><th className="num">Sales</th><th className="num">Revenue</th><th className="num">Fees</th><th className="num">Profit</th><th className="num">Margin</th><th className="num">Trades</th><th className="num">Show costs</th><th className="num">Net</th><th className="num">Avg days to sell</th></tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.channel} className={c.channel === 'unset' ? 'faint' : ''}>
                  <td>{CHANNEL[c.channel]}</td>
                  <td className="num">{c.sales}</td>
                  <td className="num">{money(c.revenue)}</td>
                  <td className="num">{c.fees ? money(c.fees) : '—'}</td>
                  <td className={`num ${tone(c.profit)}`}>{money(c.profit)}</td>
                  <td className="num">{c.marginPct === null ? '—' : `${c.marginPct}%`}</td>
                  <td className="num">{c.tradeRevenue ? <>{money(c.tradeRevenue)} <span className="faint">({money(c.tradeProfit)})</span></> : '—'}</td>
                  <td className="num">{c.costs ? money(c.costs) : '—'}</td>
                  <td className={`num ${tone(c.net)}`}><b>{money(c.net)}</b></td>
                  <td className="num">{c.avgDaysToSell ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="hint" style={{ marginTop: 6 }}>Margin = profit ÷ revenue on money sales. Trades show their value, with trade profit in brackets.</p>
    </div>
  );
}
