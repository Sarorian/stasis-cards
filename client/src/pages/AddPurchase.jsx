import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { WALLETS, money, today, fmtDate } from '../format.js';
import CardEntry, { blankCard } from '../components/CardEntry.jsx';

export default function AddPurchase() {
  const [tab, setTab] = useState('singles');
  return (
    <>
      <div className="page-head">
        <h1>Add purchase</h1>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className={`tab${tab === 'singles' ? ' on' : ''}`} onClick={() => setTab('singles')}>Singles</button>
          <button className={`tab${tab === 'binder' ? ' on' : ''}`} onClick={() => setTab('binder')}>Binder cards</button>
        </div>
      </div>
      {tab === 'singles' ? <SinglesForm /> : <BinderBuyForm />}
    </>
  );
}

function SinglesForm() {
  const navigate = useNavigate();
  const [date, setDate] = useState(today());
  const [paidFrom, setPaidFrom] = useState('Cash');
  const [total, setTotal] = useState('');
  const [cards, setCards] = useState([blankCard()]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const totalCost = Number(total) > 0 ? Number(total) : 0;
  const useTotal = totalCost > 0;
  const totalMarket = cards.reduce((a, c) => a + (Number(c.marketValue) || 0), 0);
  const allocations = cards.map((c) =>
    useTotal && totalMarket > 0 && Number(c.marketValue) > 0 ? Math.round(((totalCost * Number(c.marketValue)) / totalMarket) * 100) / 100 : null
  );
  const spend = useTotal ? totalCost : cards.reduce((a, c) => a + (Number(c.cost) || 0), 0);

  const patch = (i) => (p) => { setCards((cs) => cs.map((c, j) => (j === i ? { ...c, ...p } : c))); setError(''); };

  async function save() {
    for (const [i, c] of cards.entries()) {
      if (!c.name.trim()) return setError(`Card ${i + 1} needs a name.`);
      if (!(Number(c.marketValue) > 0)) return setError(`Card ${i + 1} needs a market value. Use "Find price" or enter it.`);
      if (!useTotal && !(Number(c.cost) > 0)) return setError(`Card ${i + 1} needs a bought-for price, or fill in the total purchase cost.`);
      if (c.graded && !c.grade.trim()) return setError(`Card ${i + 1} needs a grade.`);
    }
    setBusy(true);
    try {
      await api.createPurchase({
        date,
        paidFrom,
        totalCost: useTotal ? totalCost : null,
        cards: cards.map((c) => ({
          name: c.name.trim(),
          number: c.number.trim(),
          game: c.game,
          condition: c.condition,
          graded: c.graded ? { company: c.company, grade: c.grade.trim() } : null,
          marketValue: Number(c.marketValue),
          cost: useTotal ? undefined : Number(c.cost),
          imageUrl: c.imageUrl,
          setName: c.setName,
          external: c.external,
          sources: c.sources,
        })),
      });
      navigate('/inventory');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <>
      <div className="panel">
        <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <label className="field">Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="field">Paid from
            <select value={paidFrom} onChange={(e) => setPaidFrom(e.target.value)}>{WALLETS.map((w) => <option key={w}>{w}</option>)}</select>
          </label>
          <label className="field">Total purchase cost (optional)
            <input type="number" min="0" step="0.01" placeholder="300.00" value={total} onChange={(e) => { setTotal(e.target.value); setError(''); }} />
          </label>
        </div>
        <div className="hint" style={{ marginTop: 8 }}>
          {useTotal
            ? totalMarket > 0
              ? `Splitting ${money(totalCost)} across cards by market value. You're paying ${((totalCost / totalMarket) * 100).toFixed(1)}% of ${money(totalMarket)} market.`
              : `Add market values to split ${money(totalCost)} across the cards.`
            : 'Leave the total blank to enter a bought-for price on each card.'}
        </div>
      </div>

      {cards.map((c, i) => (
        <CardEntry
          key={i}
          index={i}
          card={c}
          onPatch={patch(i)}
          onRemove={cards.length > 1 ? () => setCards((cs) => cs.filter((_, j) => j !== i)) : null}
          useTotal={useTotal}
          allocated={allocations[i]}
        />
      ))}

      {error && <div className="toast">{error}</div>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => setCards((cs) => [...cs, blankCard(cs[cs.length - 1]?.game)])}>+ Add card</button>
        <button className="primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save purchase'}</button>
        <span className="hint" style={{ marginLeft: 'auto' }}>
          {cards.length} card{cards.length > 1 ? 's' : ''} · spending {money(spend)} from {paidFrom} · market {money(totalMarket)}
        </span>
      </div>
    </>
  );
}

function BinderBuyForm() {
  const [f, setF] = useState({ date: today(), count: '', amount: '', method: 'Cash' });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setError(''); setOk(''); };

  const load = () => api.binder().then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function submit(e) {
    e.preventDefault();
    if (!(Number(f.count) > 0)) return setError('Enter how many binder cards you bought.');
    if (!(Number(f.amount) > 0)) return setError('Enter what you paid in total.');
    try {
      await api.binderBuy({ ...f, count: Number(f.count), amount: Number(f.amount) });
      setOk(`Added ${f.count} binder cards for ${money(f.amount)}.`);
      setF({ date: today(), count: '', amount: '', method: f.method });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(entry) {
    if (!window.confirm(`Delete this binder ${entry.type} of ${entry.count} cards? Its money is removed too.`)) return;
    try {
      await api.deleteBinderEntry(entry._id);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <form className="panel" onSubmit={submit}>
        <div className="panel-head">
          <h2>Binder purchase</h2>
          {data && <span className="hint">{data.pool.count} in stock · avg {money(data.pool.avgCost)} each</span>}
        </div>
        <div className="form-row" style={{ gridTemplateColumns: '1.1fr 1fr 1fr 1fr auto' }}>
          <label className="field">Date<input type="date" value={f.date} onChange={set('date')} /></label>
          <label className="field">Number of cards<input type="number" min="1" step="1" placeholder="100" value={f.count} onChange={set('count')} /></label>
          <label className="field">Total paid<input type="number" min="0" step="0.01" placeholder="150.00" value={f.amount} onChange={set('amount')} /></label>
          <label className="field">Paid from
            <select value={f.method} onChange={set('method')}>{WALLETS.map((w) => <option key={w}>{w}</option>)}</select>
          </label>
          <button className="primary">Save</button>
        </div>
        {f.count > 0 && f.amount > 0 && <div className="hint" style={{ marginTop: 6 }}>{money(f.amount / f.count)} per card</div>}
        {error && <div className="error">{error}</div>}
        {ok && <div className="faint pos" style={{ marginTop: 6 }}>{ok}</div>}
      </form>

      {data?.entries.length > 0 && (
        <div className="panel">
          <div className="panel-head"><h2>Binder history</h2></div>
          <table className="simple">
            <thead><tr><th>Date</th><th>Type</th><th className="num">Cards</th><th className="num">Amount</th><th>Wallet</th><th /></tr></thead>
            <tbody>
              {data.entries.map((e) => (
                <tr key={e._id}>
                  <td>{fmtDate(e.date)}</td>
                  <td>{e.type === 'buy' ? 'Bought' : 'Sold'}</td>
                  <td className="num">{e.count}</td>
                  <td className={`num ${e.type === 'sell' ? 'pos' : ''}`}>{money(e.amount)}</td>
                  <td>{e.method}</td>
                  <td className="num"><button className="small ghost danger" onClick={() => remove(e)} aria-label="Delete entry">✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
