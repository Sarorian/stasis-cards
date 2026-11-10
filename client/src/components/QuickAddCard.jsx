import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { CONDITIONS, GRADERS, DEBT_METHODS, money, today } from '../format.js';
import PaymentSplit, { singlePayment, resolvePayments, splitError } from './PaymentSplit.jsx';
import CardFinder from './CardFinder.jsx';
import CardImage from './CardImage.jsx';
import WherePicker from './WherePicker.jsx';

const blank = (game = 'Pokemon', language = 'EN') => ({
  game, language, pick: null, name: '', number: '', setName: '', imageUrl: '', external: {}, sources: [],
  condition: 'NM', graded: false, company: 'PSA', grade: '', market: '', cost: '', date: today(), at: undefined,
});

// Buy one card in a few clicks (a one-card purchase). Bigger buys go through Add purchase.
export default function QuickAddCard({ onAdded }) {
  const [f, setF] = useState(blank());
  const [pay, setPay] = useState(singlePayment());
  const [finderKey, setFinderKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }); setError(''); setDone(''); };

  function pick(r) {
    setF({
      ...f, pick: r, name: r.name, number: r.number, setName: r.setName, imageUrl: r.imageUrl || '', external: r.external || {},
      sources: r.price ? [{ source: r.source, price: r.price, url: r.url }] : [], market: r.price ? String(r.price) : '',
    });
    setError('');
    setDone('');
  }

  async function add(e) {
    e.preventDefault();
    if (!f.name.trim()) return setError('Find the card first (or type its name).');
    if (!(Number(f.market) > 0)) return setError('Enter its market value.');
    if (!(Number(f.cost) > 0)) return setError('Enter what you paid.');
    if (f.graded && !String(f.grade).trim()) return setError('Enter the grade.');
    if (splitError(pay, Number(f.cost))) return setError(splitError(pay, Number(f.cost)));
    const payments = resolvePayments(pay, Number(f.cost));
    const payText = payments.map((p) => (payments.length > 1 ? `${money(p.amount)} ${p.method}` : p.method)).join(' + ');
    setBusy(true);
    try {
      await api.createPurchase({
        date: f.date, totalCost: null, at: f.at,
        ...(payments.length > 1 ? { payments } : { paidFrom: payments[0].method }),
        cards: [{
          name: f.name.trim(), number: f.number.trim(), game: f.game, language: f.language, setName: f.setName,
          condition: f.condition, graded: f.graded ? { company: f.company, grade: String(f.grade).trim() } : null,
          marketValue: Number(f.market), cost: Number(f.cost), imageUrl: f.imageUrl, external: f.external, sources: f.sources,
        }],
      });
      setDone(`Added ${f.name} for ${money(Number(f.cost))} (${payText}).`);
      setF(blank(f.game, f.language));
      setPay(singlePayment(pay[0].method));
      setFinderKey((k) => k + 1);
      onAdded?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const pctPaid = Number(f.cost) > 0 && Number(f.market) > 0 ? Math.round((Number(f.cost) / Number(f.market)) * 1000) / 10 : null;

  return (
    <form className="panel quick-add" onSubmit={add}>
      <div className="panel-head">
        <h2>Add a card</h2>
        <Link to="/add" className="hint">Several cards or a bulk price? Use Add purchase</Link>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <CardImage src={f.imageUrl} game={f.game} alt={f.name || 'Card'} className="thumb" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <CardFinder key={finderKey} game={f.game} onGameChange={(g) => setF({ ...f, game: g })} onPick={pick} picked={Boolean(f.pick)}
            language={f.language} onLanguageChange={(l) => setF({ ...f, language: l })} />
          {f.name && <div className="hint" style={{ marginTop: 6 }}><b>{f.name}</b> {[f.number, f.setName].filter(Boolean).join(' · ')}</div>}
          <div className="form-row quick-row" style={{ marginTop: 8 }}>
            <label className="check" style={{ paddingBottom: 8 }}><input type="checkbox" checked={f.graded} onChange={set('graded')} /> Graded</label>
            {f.graded ? (
              <>
                <label className="field">Company<select value={f.company} onChange={set('company')}>{GRADERS.map((g) => <option key={g}>{g}</option>)}</select></label>
                <label className="field">Grade<input value={f.grade} placeholder="10" onChange={set('grade')} /></label>
              </>
            ) : (
              <label className="field" style={{ gridColumn: 'span 2' }}>Condition
                <select value={f.condition} onChange={set('condition')}>{CONDITIONS.map((c) => <option key={c}>{c}</option>)}</select>
              </label>
            )}
          </div>
          <div className="form-row" style={{ marginTop: 8, gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.4fr)' }}>
            <label className="field">Date<input type="date" value={f.date} onChange={set('date')} /></label>
            <WherePicker label="Bought at" value={f.at} date={f.date} onChange={(at) => setF((x) => ({ ...x, at }))} />
          </div>
          <div className="form-row quick-row2" style={{ marginTop: 8 }}>
            <label className="field">Market<input type="number" min="0" step="0.01" placeholder="0.00" value={f.market} onChange={set('market')} /></label>
            <label className="field">Paid<input type="number" min="0" step="0.01" placeholder="0.00" value={f.cost} onChange={set('cost')} /></label>
            <PaymentSplit label="Paid with" rows={pay} onChange={(r) => { setPay(r); setError(''); setDone(''); }} total={Number(f.cost) || 0} extraMethods={DEBT_METHODS} />
            <button className="primary" disabled={busy}>{busy ? 'Adding…' : 'Add card'}</button>
          </div>
          <div className="hint" style={{ marginTop: 4 }}>
            {pctPaid !== null ? `${pctPaid}% of market` : ''}
            {f.condition !== 'NM' && !f.graded && f.market && ' · market from the search is the NM price; adjust it for condition'}
          </div>
          {error && <div className="error">{error}</div>}
          {done && <div className="faint pos" style={{ marginTop: 4 }}>{done} <Link to="/inventory">See inventory</Link></div>}
        </div>
      </div>
    </form>
  );
}
