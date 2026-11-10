import { useState } from 'react';
import { api } from '../api.js';
import { GAMES, CONDITIONS, GRADERS, WALLETS, money, today, fmtDate } from '../format.js';
import WherePicker from './WherePicker.jsx';

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Fix a card's details, switch it to graded (with the grading fee), or correct what you paid
export default function EditCardForm({ card, onDone, onCancel }) {
  const fees = r2((card.gradingFees || []).reduce((a, f) => a + (f.amount || 0), 0));
  const oldPaid = r2(card.cost - fees);
  const wasGraded = Boolean(card.graded?.company);
  const [f, setF] = useState({
    name: card.name, number: card.number || '', setName: card.setName || '', game: card.game, japanese: card.language === 'JP',
    condition: card.condition || 'NM', graded: wasGraded, company: card.graded?.company || 'PSA', grade: card.graded?.grade || '',
    boughtDate: card.boughtDate || '', paid: String(oldPaid), notes: card.notes || '',
    feeAmount: '', feeWallet: 'Cash', feeDate: today(),
    boughtAt: card.boughtAt || null, saleAt: card.sale?.at || null,
  });
  const sold = card.status === 'sold';
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }); setError(''); };

  const paidDiff = f.paid === '' ? 0 : r2(Number(f.paid) - oldPaid);
  const fee = Number(f.feeAmount) > 0 ? r2(Number(f.feeAmount)) : 0;
  const newCost = r2(oldPaid + paidDiff + fees + fee);

  async function submit(e) {
    e.preventDefault();
    if (!f.name.trim()) return setError('Name can’t be empty.');
    if (f.graded && !String(f.grade).trim()) return setError('Enter the grade.');
    if (f.paid === '' || !(Number(f.paid) >= 0)) return setError('Enter what you paid (0 or more).');
    setBusy(true);
    try {
      await api.updateCard(card._id, {
        name: f.name.trim(), number: f.number.trim(), setName: f.setName.trim(), game: f.game, language: f.japanese ? 'JP' : 'EN',
        condition: f.condition, graded: f.graded ? { company: f.company, grade: String(f.grade).trim() } : null,
        boughtDate: f.boughtDate || card.boughtDate, notes: f.notes,
        ...(f.boughtAt !== (card.boughtAt || null) ? { boughtAt: f.boughtAt } : {}),
        ...(sold && f.saleAt !== (card.sale?.at || null) ? { saleAt: f.saleAt } : {}),
        ...(paidDiff !== 0 ? { paid: Number(f.paid) } : {}),
        ...(fee > 0 ? { gradingFee: { amount: fee, wallet: f.feeWallet, date: f.feeDate } } : {}),
      });
      onDone?.();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function removeFee(fe) {
    if (!window.confirm(`Remove the ${money(fe.amount)} grading fee? It comes off the card's cost and goes back into ${fe.wallet}.`)) return;
    try {
      await api.removeGradingFee(card._id, fe._id);
      onDone?.();
    } catch (err) {
      setError(err.message);
    }
  }

  const walletNote = paidDiff === 0 ? '' : card.tradeIn
    ? 'This card came in on a trade, so its cost is locked to the trade value.'
    : card.purchase
      ? `${paidDiff > 0 ? `${money(paidDiff)} more` : `${money(-paidDiff)} less`} comes out of the wallet this was bought from.`
      : 'No wallet changes (this card wasn’t bought through Add purchase).';

  return (
    <form className="inline-form edit-card" onSubmit={submit}>
      <div className="form-row" style={{ gridTemplateColumns: '2fr 1fr 1.2fr 1fr' }}>
        <label className="field">Name<input value={f.name} onChange={set('name')} /></label>
        <label className="field">Number<input value={f.number} onChange={set('number')} /></label>
        <label className="field">Set<input value={f.setName} onChange={set('setName')} /></label>
        <label className="field">Game<select value={f.game} onChange={set('game')}>{GAMES.map((g) => <option key={g}>{g}</option>)}</select></label>
      </div>
      <label className="check" style={{ marginTop: 8, fontSize: 13 }}>
        <input type="checkbox" checked={f.japanese} onChange={set('japanese')} /> Japanese card
        {f.japanese && f.game !== 'Pokemon' && <span className="faint"> · no price source; set its price with $</span>}
      </label>

      <div className="form-row" style={{ gridTemplateColumns: 'auto 1fr 1fr 1fr 1fr', marginTop: 10 }}>
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
        <label className="field">What we paid<input type="number" min="0" step="0.01" value={f.paid} onChange={set('paid')} disabled={Boolean(card.tradeIn)} /></label>
        <label className="field">Bought<input type="date" value={f.boughtDate} onChange={set('boughtDate')} /></label>
      </div>
      <div className="form-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginTop: 8 }}>
        <WherePicker label={card.tradeIn ? 'Traded in at' : 'Bought at'} allowUnset value={f.boughtAt} onChange={(v) => setF((x) => ({ ...x, boughtAt: v }))} />
        {sold && <WherePicker label={card.sale?.trade ? 'Traded away at' : 'Sold at'} allowUnset value={f.saleAt} onChange={(v) => setF((x) => ({ ...x, saleAt: v }))} />}
      </div>
      {walletNote && <div className="hint" style={{ marginTop: 6 }}>{walletNote}</div>}

      {f.graded && (
        <div className="edit-grading">
          <div className="hint">{wasGraded ? 'Add a grading fee (e.g. a regrade)' : 'Grading fee'}: added to the card’s cost and paid from a wallet.</div>
          <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginTop: 4 }}>
            <label className="field">Fee<input type="number" min="0" step="0.01" placeholder="0.00" value={f.feeAmount} onChange={set('feeAmount')} /></label>
            <label className="field">Paid from<select value={f.feeWallet} onChange={set('feeWallet')}>{WALLETS.map((w) => <option key={w}>{w}</option>)}</select></label>
            <label className="field">Date<input type="date" value={f.feeDate} onChange={set('feeDate')} /></label>
          </div>
        </div>
      )}
      {card.gradingFees?.length > 0 && (
        <div className="edit-grading">
          <div className="hint">Grading fees so far</div>
          {card.gradingFees.map((fe) => (
            <div className="list-row" key={fe._id}>
              <span>{money(fe.amount)} <span className="faint">· {fe.company} {fe.grade} · {fmtDate(fe.date)} · from {fe.wallet}</span></span>
              <button type="button" className="small ghost danger" aria-label="Remove grading fee" onClick={() => removeFee(fe)}>✕</button>
            </div>
          ))}
        </div>
      )}

      <label className="field" style={{ marginTop: 10 }}>Notes<input value={f.notes} onChange={set('notes')} /></label>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="primary" disabled={busy}>Save changes</button>
        <button type="button" onClick={onCancel}>Cancel</button>
        <span className="hint" style={{ marginLeft: 'auto' }}>
          Cost {money(card.cost)}{newCost !== r2(card.cost) && <> → <b>{money(newCost)}</b></>}{fees + fee > 0 && ` (${money(oldPaid + paidDiff)} paid + ${money(fees + fee)} grading)`}
        </span>
      </div>
      {f.graded && !wasGraded && <div className="faint" style={{ marginTop: 6 }}>After saving, press ↻ or $ to update its market price as a graded card.</div>}
      {error && <div className="error">{error}</div>}
    </form>
  );
}
