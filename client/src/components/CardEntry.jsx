import { useRef } from 'react';
import { api } from '../api.js';
import { GAMES, CONDITIONS, GRADERS, money } from '../format.js';
import CardImage from './CardImage.jsx';

export const blankCard = (game = 'Pokemon') => ({
  name: '', number: '', game, condition: 'NM', graded: false, company: 'PSA', grade: '',
  marketValue: '', cost: '', imageUrl: '', setName: '', external: {}, sources: [],
  lookup: 'idle', lookupMsg: '',
});

// One card row in the Add purchase form, with automatic price + image lookup
export default function CardEntry({ index, card, onPatch, onRemove, useTotal, allocated }) {
  const lastKey = useRef('');
  const set = (patch) => onPatch(patch);
  const field = (k) => (e) => set({ [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function findPrice(force = false) {
    if (card.name.trim().length < 2) return;
    const key = [card.name, card.number, card.game, card.graded && card.company, card.graded && card.grade].join('|');
    if (!force && key === lastKey.current) return;
    lastKey.current = key;
    set({ lookup: 'loading', lookupMsg: '' });
    try {
      const r = await api.lookup({
        name: card.name.trim(), number: card.number.trim(), game: card.game,
        gradedCompany: card.graded ? card.company : undefined, gradedGrade: card.graded ? card.grade : undefined,
      });
      onPatch({
        ...(r.price ? { marketValue: String(r.price) } : {}),
        ...(r.imageUrl ? { imageUrl: r.imageUrl } : {}),
        ...(r.setName ? { setName: r.setName } : {}),
        external: r.external || {},
        sources: r.sources || [],
        lookup: r.price ? 'found' : 'notfound',
        lookupMsg: r.price
          ? `${r.sources[0]?.source}${r.quotaRemaining != null ? ` · ${r.quotaRemaining} lookups left today` : ''}`
          : r.quotaHit ? 'Daily lookup limit reached. Enter the market value for now.' : 'No match found. Check the name and number, or enter the market value.',
      });
    } catch (err) {
      onPatch({ lookup: 'notfound', lookupMsg: err.message });
    }
  }

  const ownPct = !useTotal && Number(card.cost) > 0 && Number(card.marketValue) > 0
    ? `${((Number(card.cost) / Number(card.marketValue)) * 100).toFixed(1)}% of market` : '';
  const allocPct = useTotal && allocated != null && Number(card.marketValue) > 0
    ? `${((allocated / Number(card.marketValue)) * 100).toFixed(1)}% of market` : '';

  return (
    <div className="panel card-entry">
      <div className="panel-head">
        <h3>Card {index + 1}</h3>
        {onRemove && <button type="button" className="small ghost" onClick={onRemove} aria-label={`Remove card ${index + 1}`}>Remove</button>}
      </div>
      <div style={{ display: 'flex', gap: 14 }}>
        <CardImage src={card.imageUrl} game={card.game} alt={card.name || 'Card'} className="thumb" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="form-row" style={{ gridTemplateColumns: '2fr 1fr 1fr' }}>
            <label className="field">Card name
              <input value={card.name} placeholder="Charizard ex" onChange={field('name')} onBlur={() => findPrice()} />
            </label>
            <label className="field">Card number
              <input value={card.number} placeholder="199/165" onChange={field('number')} onBlur={() => findPrice()} />
            </label>
            <label className="field">Game
              <select value={card.game} onChange={(e) => { lastKey.current = ''; set({ game: e.target.value }); }}>
                {GAMES.map((g) => <option key={g}>{g}</option>)}
              </select>
            </label>
          </div>
          <div className="form-row" style={{ gridTemplateColumns: 'auto 1fr 1fr 1fr 1fr', marginTop: 10 }}>
            <label className="check" style={{ paddingBottom: 8 }}>
              <input type="checkbox" checked={card.graded} onChange={field('graded')} /> Graded
            </label>
            {card.graded ? (
              <>
                <label className="field">Company
                  <select value={card.company} onChange={field('company')}>{GRADERS.map((g) => <option key={g}>{g}</option>)}</select>
                </label>
                <label className="field">Grade
                  <input value={card.grade} placeholder="10" onChange={field('grade')} onBlur={() => findPrice()} />
                </label>
              </>
            ) : (
              <>
                <label className="field">Condition
                  <select value={card.condition} onChange={field('condition')}>{CONDITIONS.map((c) => <option key={c}>{c}</option>)}</select>
                </label>
                <span />
              </>
            )}
            <label className="field">Market value
              <input type="number" min="0" step="0.01" placeholder="Auto" value={card.marketValue} onChange={field('marketValue')} />
            </label>
            {useTotal ? (
              <div className="field">
                <span>Allocated cost</span>
                <div style={{ fontWeight: 600, color: 'var(--text)', padding: '7px 0' }}>{allocated != null ? money(allocated) : '—'}</div>
              </div>
            ) : (
              <label className="field">Bought for
                <input type="number" min="0" step="0.01" placeholder="60.00" value={card.cost} onChange={field('cost')} />
              </label>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 6, alignItems: 'center' }}>
            <span className="lookup-status">
              {card.lookup === 'loading' && 'Finding market price…'}
              {card.lookup !== 'loading' && card.lookupMsg}
              {card.setName && card.lookup === 'found' && ` · ${card.setName}`}
            </span>
            <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span className="faint">{ownPct || allocPct}</span>
              <button type="button" className="small" onClick={() => findPrice(true)} disabled={card.name.trim().length < 2 || card.lookup === 'loading'}>
                Find price
              </button>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
