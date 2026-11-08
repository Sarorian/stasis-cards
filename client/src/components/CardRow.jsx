import { useState } from 'react';
import { api } from '../api.js';
import { money, pct, tone, fmtDate, fmtTime, roiPct, checkLinks } from '../format.js';
import CardImage from './CardImage.jsx';
import SellForm from './SellForm.jsx';
import CleanseForm from './CleanseForm.jsx';
import EditCardForm from './EditCardForm.jsx';
import FindMatchForm from './FindMatchForm.jsx';
import ToBinderForm from './ToBinderForm.jsx';

export default function CardRow({ card, onChange }) {
  const [mode, setMode] = useState(null); // 'sell' | 'price' | null
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [priceInput, setPriceInput] = useState('');

  const sold = card.status === 'sold';
  const tradedAway = sold && Boolean(card.sale?.trade);
  const cleansed = sold && Boolean(card.sale?.debt);
  const inTrade = tradedAway || Boolean(card.tradeIn) || cleansed;
  const graded = card.graded?.company;
  const market = card.market?.price || 0;
  const value = sold ? card.sale.price - (card.sale.fees || 0) : market;
  const roi = roiPct(card.cost, value);

  async function act(fn, confirmText) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setMsg('');
    try {
      const res = await fn();
      if (res?.result && !res.result.price) setMsg(res.result.errors?.[0] || 'No price found for this card.');
      onChange?.();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function savePrice(e) {
    e.preventDefault();
    if (!(Number(priceInput) > 0)) return setMsg('Enter a price above 0.');
    await act(() => api.updateCard(card._id, { marketPrice: Number(priceInput) }));
    setMode(null);
  }

  const sources = card.market?.sources || [];

  return (
    <>
      <div className="inv-row">
        <CardImage src={card.imageUrl} game={card.game} alt={card.name} />
        <div style={{ minWidth: 0 }}>
          <div className="card-name">{card.name}</div>
          <div className="hint">
            {[card.number, card.setName, card.game].filter(Boolean).join(' · ')}{' '}
            <span className={`pill${graded ? ' graded' : ''}`}>{graded ? `${card.graded.company} ${card.graded.grade}` : card.condition}</span>
            {card.language === 'JP' && <> <span className="pill jp" title="Japanese card">JP</span></>}
          </div>
          <div className="sources">
            {sources.map((s) =>
              s.url ? <a key={s.source} href={s.url} target="_blank" rel="noreferrer">{s.source} {money(s.price)}</a> : <span key={s.source}>{s.source} {money(s.price)}</span>
            )}
            {checkLinks(card).map(([label, url]) => (
              <a key={label} href={url} target="_blank" rel="noreferrer">{label} ↗</a>
            ))}
          </div>
        </div>
        <div className="col-hide">
          {money(card.cost)}
          <div className="faint">{card.tradeIn ? 'traded in ' : ''}{fmtDate(card.boughtDate)} · {card.pctOfMarket}% of mkt</div>
        </div>
        <div className="col-hide">
          {sold ? (
            <>
              {money(card.sale.price)}
              <div className="faint">{cleansed ? `taken by ${card.sale.cleansedBy} (debt)` : tradedAway ? 'traded' : 'sold'} {fmtDate(card.sale.date)}{cleansed ? '' : ` · ${card.sale.payments?.length ? card.sale.payments.map((p) => `${money(p.amount)} ${p.method}`).join(' + ') : card.sale.method || 'Trade'}`}</div>
            </>
          ) : (
            <>
              {money(market)}
              <div className="faint">{card.market?.manualOverride ? 'manual price' : sources[0]?.source === 'At purchase' ? 'price at purchase' : `updated ${fmtTime(card.market?.updatedAt)}`}</div>
              {!sold && !graded && card.condition !== 'NM' && card.market?.nmPrice ? (
                <div className="faint" title="TCGplayer's Near Mint market price, for reference">NM ref {money(card.market.nmPrice)}</div>
              ) : null}
              {card.market?.change30d !== null && card.market?.change30d !== undefined && (
                <div className={`trend ${card.market.change30d > 0 ? 'pos' : card.market.change30d < 0 ? 'neg' : ''}`}
                  title="Change in market price over the last 30 days">
                  {card.market.change30d > 0 ? '▲' : card.market.change30d < 0 ? '▼' : '■'} {Math.abs(card.market.change30d).toFixed(1)}% <span className="faint">30d</span>
                </div>
              )}
            </>
          )}
        </div>
        <div>
          <span className={`pill ${tone(roi)}`}>{pct(roi)}</span>
          <div className={`faint ${tone(value - card.cost)}`}>{money(value - card.cost)}</div>
        </div>
        <div className="row-actions">
          {cleansed ? (
            <span className="faint" title="Undo it on the Debt page">debt cleanse</span>
          ) : tradedAway ? (
            <span className="faint" title="Undo it from Trade → History">in a trade</span>
          ) : sold ? (
            <button className="small" disabled={busy} onClick={() => act(() => api.unsellCard(card._id), `Undo the sale of ${card.name}? The money comes back out of ${card.sale.payments?.length ? card.sale.payments.map((p) => p.method).join(' and ') : card.sale.method}.`)}>Undo sale</button>
          ) : (
            <>
              <button className="small primary" onClick={() => setMode(mode === 'sell' ? null : 'sell')}>Sell</button>
              <button className="small" title="Owen or Ben takes this card to cleanse debt" onClick={() => setMode(mode === 'cleanse' ? null : 'cleanse')}>Cleanse</button>
              <button className="small" title="Move this card into the binder pool" onClick={() => setMode(mode === 'binder' ? null : 'binder')}>To binder</button>
              <button className="small ghost" title="Refresh this card's price and image" disabled={busy} onClick={() => act(() => api.refreshCard(card._id))}>{busy ? '…' : '↻'}</button>
              <button className="small ghost" title="Search and pick the exact printing for this card" onClick={() => setMode(mode === 'match' ? null : 'match')}>Find match</button>
              <button className="small ghost" title="Set price manually" onClick={() => { setPriceInput(market || ''); setMode(mode === 'price' ? null : 'price'); }}>$</button>
            </>
          )}
          <button className="small ghost" title="Edit card details, grading, or what you paid" onClick={() => setMode(mode === 'edit' ? null : 'edit')}>Edit</button>
          {!inTrade && <button className="small ghost danger" title="Delete card" disabled={busy}
            onClick={() => act(() => api.deleteCard(card._id), `Delete ${card.name}? This removes it from inventory${sold ? ' and removes its sale money' : ''}. The purchase payment stays recorded.`)}>✕</button>}
        </div>
        {msg && <div className="error" style={{ gridColumn: '1 / -1', marginTop: 0 }}>{msg}</div>}
        {mode === 'sell' && <SellForm card={card} onCancel={() => setMode(null)} onDone={() => { setMode(null); onChange?.(); }} />}
        {mode === 'match' && <FindMatchForm card={card} onCancel={() => setMode(null)} onDone={() => { setMode(null); onChange?.(); }} />}
        {mode === 'edit' && <EditCardForm card={card} onCancel={() => setMode(null)} onDone={() => { setMode(null); onChange?.(); }} />}
        {mode === 'binder' && <ToBinderForm card={card} onCancel={() => setMode(null)} onDone={() => { setMode(null); onChange?.(); }} />}
        {mode === 'cleanse' && <CleanseForm card={card} onCancel={() => setMode(null)} onDone={() => { setMode(null); onChange?.(); }} />}
        {mode === 'price' && (
          <form className="inline-form" onSubmit={savePrice}>
            <div className="form-row" style={{ gridTemplateColumns: '1fr auto auto auto' }}>
              <label className="field">Market price (overrides auto updates)
                <input type="number" min="0" step="0.01" autoFocus value={priceInput} onChange={(e) => setPriceInput(e.target.value)} />
              </label>
              <button className="primary">Save</button>
              {card.market?.manualOverride && (
                <button type="button" onClick={() => act(() => api.updateCard(card._id, { marketPrice: null })).then(() => setMode(null))}>Back to auto</button>
              )}
              <button type="button" onClick={() => setMode(null)}>Cancel</button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
