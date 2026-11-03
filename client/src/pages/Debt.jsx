import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { WALLETS, PARTNERS, partnerWallet, money, today, fmtDate } from '../format.js';
import CardImage from '../components/CardImage.jsx';

const ADD_HOW = {
  expense: { label: 'Paid a business cost', hint: 'Shows, gas, food… Counts as a business expense.' },
  loan: { label: 'Lent money into a wallet', hint: 'Their own money goes into a business wallet to buy stock.' },
  record: { label: 'From the old sheet', hint: 'Record only: just changes the debt (use for "Updated Total" and old lines).' },
};
const CLEAN_HOW = {
  wallet: { label: 'Took money', hint: 'Cash out, or keeping Venmo instead of moving it to cash. Comes out of that wallet.' },
  card: { label: 'Took a card', hint: 'The card counts as sold for the value you enter.' },
  record: { label: 'From the old sheet', hint: 'Record only: just changes the debt.' },
};
const TAG = { expense: 'expense', loan: 'loan', record: 'old sheet', wallet: 'money', card: 'card' };

export default function Debt() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = () => api.debt().then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  if (error && !data) return <div className="toast">{error}</div>;
  if (!data) return <p className="hint">Loading…</p>;

  return (
    <>
      <div className="page-head">
        <h1>Debt</h1>
        <div className="debt-total">
          <span className="hint">Business owes</span>
          <b>{money(data.total)}</b>
        </div>
      </div>
      {error && <div className="toast">{error}</div>}
      <div className="grid two-col debt-cols">
        {data.people.map((p) => <PersonLedger key={p.person} p={p} onChange={load} onError={setError} />)}
      </div>
    </>
  );
}

function PersonLedger({ p, onChange, onError }) {
  const [mode, setMode] = useState(null); // 'add' | 'clean'
  const adds = p.entries.filter((e) => e.type === 'add');
  const cleans = p.entries.filter((e) => e.type === 'clean');

  async function undo(e) {
    const what = e.type === 'add' ? 'debt' : 'cleanse';
    const extra = e.how === 'loan' || e.how === 'wallet' ? ` The ${money(e.amount)} ${e.how === 'loan' ? 'comes back out of' : 'goes back into'} ${e.wallet}.`
      : e.how === 'card' ? ` ${e.card?.name || 'The card'} goes back into inventory.` : '';
    if (!window.confirm(`Remove this ${what} line (${money(e.amount)}${e.source ? `, ${e.source}` : ''})?${extra}`)) return;
    try {
      await api.deleteDebt(e._id);
      onError('');
      onChange();
    } catch (err) {
      onError(err.message);
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{p.person}</h2>
        <span className="hint">added {money(p.added)} · cleansed {money(p.cleaned)}</span>
      </div>
      <div className="debt-owed">
        <span className="hint">Total debt</span>
        <span className="value">{money(p.owed)}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, margin: '10px 0' }}>
        <button className={mode === 'add' ? 'primary' : ''} onClick={() => setMode(mode === 'add' ? null : 'add')}>+ Add debt</button>
        <button className={mode === 'clean' ? 'primary' : ''} onClick={() => setMode(mode === 'clean' ? null : 'clean')} disabled={p.owed <= 0}>Cleanse</button>
      </div>
      {mode && <DebtForm key={mode} person={p.person} type={mode} owed={p.owed} onCancel={() => setMode(null)} onDone={() => { setMode(null); onChange(); }} />}

      <div className="debt-ledger">
        <LedgerColumn title="Add debt" rows={adds} onUndo={undo} />
        <LedgerColumn title="Cleanse debt" rows={cleans} onUndo={undo} />
      </div>
    </div>
  );
}

function LedgerColumn({ title, rows, onUndo }) {
  return (
    <div>
      <div className="debt-col-head"><span>{title}</span><span>{money(rows.reduce((a, e) => a + e.amount, 0))}</span></div>
      {rows.length === 0 && <div className="faint" style={{ padding: '6px 0' }}>Nothing yet</div>}
      {rows.map((e) => (
        <div className="debt-line" key={e._id}>
          <span className="debt-amt">{money(e.amount)}</span>
          <span className="debt-src">
            <span className="debt-source">{e.source || '—'}</span>
            <span className="faint">{fmtDate(e.date)} · {TAG[e.how]}{e.wallet ? ` · ${e.wallet}` : ''}</span>
          </span>
          <button className="small ghost danger" aria-label={`Remove ${e.source || 'line'}`} onClick={() => onUndo(e)}>✕</button>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function DebtForm({ person, type, owed, onCancel, onDone }) {
  const hows = type === 'add' ? ADD_HOW : CLEAN_HOW;
  const [f, setF] = useState({
    how: type === 'add' ? 'expense' : 'wallet', amount: '', date: today(), source: '',
    wallet: type === 'add' ? 'Cash' : partnerWallet(person),
  });
  const [card, setCard] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setError(''); };

  async function submit(e) {
    e.preventDefault();
    const amount = Number(f.amount);
    if (!(amount > 0)) return setError('Enter an amount.');
    if (type === 'clean' && amount > owed + 0.004) return setError(`The business only owes ${person} ${money(owed)}.`);
    if (f.how === 'card' && !card) return setError('Pick the card being taken.');
    setBusy(true);
    try {
      await api.addDebt({ person, type, how: f.how, amount, date: f.date, source: f.source, wallet: f.wallet, cardId: card?._id });
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form className="inline-form debt-form" onSubmit={submit}>
      <div className="chips" role="radiogroup" aria-label="How">
        {Object.entries(hows).map(([k, v]) => (
          <button type="button" key={k} role="radio" aria-checked={f.how === k} className={`chip${f.how === k ? ' on' : ''}`}
            onClick={() => { setF({ ...f, how: k }); setError(''); }}>{v.label}</button>
        ))}
      </div>
      <div className="hint" style={{ marginBottom: 8 }}>{hows[f.how].hint}</div>

      {f.how === 'card' && <CardPicker card={card} onPick={(c) => { setCard(c); if (c) setF((x) => ({ ...x, amount: x.amount || String(c.market?.price || '') })); }} />}

      <div className="form-row" style={{ gridTemplateColumns: (f.how === 'loan' || f.how === 'wallet') ? '1fr 1fr 1.6fr 1fr' : '1fr 1fr 1.6fr' }}>
        <label className="field">{f.how === 'card' ? 'Cleansed at' : 'Amount'}
          <input type="number" min="0" step="0.01" autoFocus={f.how !== 'card'} placeholder="0.00" value={f.amount} onChange={set('amount')} />
        </label>
        <label className="field">Date<input type="date" value={f.date} onChange={set('date')} /></label>
        <label className="field">Source / note
          <input placeholder={type === 'add' ? 'Castle Rock Card Show' : f.how === 'card' ? 'optional' : 'CCs DCS Venmo'} value={f.source} onChange={set('source')} />
        </label>
        {(f.how === 'loan' || f.how === 'wallet') && (
          <label className="field">{f.how === 'loan' ? 'Into' : 'Out of'}
            <select value={f.wallet} onChange={set('wallet')}>{WALLETS.map((w) => <option key={w}>{w}</option>)}</select>
          </label>
        )}
      </div>
      {type === 'clean' && <div className="hint" style={{ marginTop: 6 }}>{person} is owed {money(owed)}{Number(f.amount) > 0 && Number(f.amount) <= owed ? ` · ${money(owed - Number(f.amount))} left after this` : ''}</div>}
      {f.how === 'card' && card && Number(f.amount) > 0 && (
        <div className="hint">{card.name} cost {money(card.cost)}, so this counts as <span className={Number(f.amount) - card.cost >= 0 ? 'pos' : 'neg'}>{money(Number(f.amount) - card.cost)}</span> profit.</div>
      )}
      {error && <div className="error">{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button className="primary" disabled={busy}>{type === 'add' ? 'Add debt' : 'Cleanse'}</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

// Search in-stock cards to take as a cleanse
export function CardPicker({ card, onPick }) {
  const [stock, setStock] = useState([]);
  const [q, setQ] = useState('');
  useEffect(() => { api.cards({ status: 'in_stock' }).then(setStock).catch(() => {}); }, []);
  const matches = q.trim() ? stock.filter((c) => `${c.name} ${c.number} ${c.setName}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6) : [];

  if (card) {
    return (
      <div className="trade-line" style={{ marginBottom: 8 }}>
        <CardImage src={card.imageUrl} game={card.game} alt="" className="result-img" />
        <div className="trade-line-main">
          <div className="result-name">{card.name}</div>
          <div className="faint">{[card.number, card.setName].filter(Boolean).join(' · ')} · market {money(card.market?.price)} · cost {money(card.cost)}</div>
        </div>
        <span />
        <button type="button" className="small" onClick={() => { setQ(''); onPick(null); }}>Change</button>
      </div>
    );
  }
  return (
    <div style={{ marginBottom: 8 }}>
      <label className="field">Card from inventory
        <input value={q} autoFocus placeholder="Type a card name…" onChange={(e) => setQ(e.target.value)} />
      </label>
      {q.trim() && (
        <div className="results">
          <div className="results-list">
            {matches.map((c) => (
              <button type="button" key={c._id} className="result" onClick={() => onPick(c)}>
                <CardImage src={c.imageUrl} game={c.game} alt="" className="result-img" />
                <span className="result-main"><span className="result-name">{c.name}</span><span className="faint">{[c.number, c.setName, `cost ${money(c.cost)}`].filter(Boolean).join(' · ')}</span></span>
                <span className="result-price">{money(c.market?.price)}</span>
              </button>
            ))}
            {!matches.length && <div className="hint" style={{ padding: 10 }}>No in-stock cards match.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
