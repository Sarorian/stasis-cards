import { api } from '../api.js';
import { CONDITIONS, GRADERS, money } from '../format.js';
import CardImage from './CardImage.jsx';
import CardFinder from './CardFinder.jsx';

export const blankCard = (game = 'Pokemon') => ({
  name: '', number: '', game, language: 'EN', condition: 'NM', graded: false, company: 'PSA', grade: '',
  marketValue: '', cost: '', imageUrl: '', setName: '', external: {}, sources: [],
  pick: null, lookup: 'idle', lookupMsg: '',
});

// One card in the Add purchase form: type shorthand, "Find card", pick the exact printing
export default function CardEntry({ index, card, onPatch, onRemove, useTotal, allocated }) {
  const set = (patch) => onPatch(patch);
  const field = (k) => (e) => set({ [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  // Graded price (PriceCharting) for the picked card; falls back to its raw price
  async function applyGraded(pick, g = card) {
    if (!pick) return;
    const raw = { source: pick.source, price: pick.price, url: pick.url };
    if (!g.graded || !String(g.grade).trim()) {
      return onPatch({
        ...(pick.price ? { marketValue: String(pick.price) } : {}),
        sources: pick.price ? [raw] : [],
        lookup: 'found',
        lookupMsg: pickMsg(pick),
      });
    }
    onPatch({ lookup: 'loading', lookupMsg: '' });
    try {
      const r = await api.gradedPrice({ name: pick.name, number: pick.number, gradedCompany: g.company, gradedGrade: String(g.grade).trim() });
      if (r.hit?.price) {
        return onPatch({
          marketValue: String(r.hit.price),
          sources: [{ source: r.hit.source, price: r.hit.price, url: r.hit.url }, ...(pick.price ? [raw] : [])],
          lookup: 'found',
          lookupMsg: `${r.hit.source} · raw ${money(pick.price)}`,
        });
      }
      onPatch({
        ...(pick.price ? { marketValue: String(pick.price) } : {}),
        sources: pick.price ? [{ ...raw, source: `${raw.source} (raw)` }] : [],
        lookup: 'found',
        lookupMsg: r.configured
          ? `No ${g.company} ${g.grade} price found. Showing the raw price; adjust the market value if needed.`
          : 'Graded prices need a PriceCharting token. Showing the raw price (labeled "raw").',
      });
    } catch (err) {
      onPatch({ lookup: 'found', lookupMsg: err.message });
    }
  }

  function pickMsg(pick) {
    return [pick.source, pick.setName, pick.printing].filter(Boolean).join(' · ') + (pick.price ? '' : ' · no market price, enter it below');
  }

  function choose(pick) {
    onPatch({
      pick,
      name: pick.name,
      number: pick.number,
      setName: pick.setName,
      imageUrl: pick.imageUrl || card.imageUrl,
      external: pick.external || {},
      marketValue: pick.price ? String(pick.price) : '',
      sources: pick.price ? [{ source: pick.source, price: pick.price, url: pick.url }] : [],
      lookup: 'found',
      lookupMsg: pickMsg(pick),
    });
    if (card.graded && String(card.grade).trim()) applyGraded(pick);
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
          <CardFinder game={card.game} onGameChange={(g) => set({ game: g })} onPick={choose} picked={Boolean(card.pick)}
            language={card.language} onLanguageChange={(l) => set({ language: l })} />

          <div className="form-row" style={{ gridTemplateColumns: '2fr 1fr 1.2fr', marginTop: 10 }}>
            <label className="field">Card name
              <input value={card.name} placeholder="Filled in when you pick a card" onChange={field('name')} />
            </label>
            <label className="field">Card number
              <input value={card.number} placeholder="301/298" onChange={field('number')} />
            </label>
            <label className="field">Set
              <input value={card.setName} placeholder="Origins" onChange={field('setName')} />
            </label>
          </div>
          <div className="form-row" style={{ gridTemplateColumns: 'auto 1fr 1fr 1fr 1fr', marginTop: 10 }}>
            <label className="check" style={{ paddingBottom: 8 }}>
              <input type="checkbox" checked={card.graded} onChange={(e) => {
                set({ graded: e.target.checked });
                if (card.pick && (!e.target.checked || String(card.grade).trim())) applyGraded(card.pick, { ...card, graded: e.target.checked });
              }} /> Graded
            </label>
            {card.graded ? (
              <>
                <label className="field">Company
                  <select value={card.company} onChange={(e) => {
                    set({ company: e.target.value });
                    if (card.pick && String(card.grade).trim()) applyGraded(card.pick, { ...card, company: e.target.value });
                  }}>{GRADERS.map((g) => <option key={g}>{g}</option>)}</select>
                </label>
                <label className="field">Grade
                  <input value={card.grade} placeholder="10" onChange={field('grade')} onBlur={() => card.pick && applyGraded(card.pick)} />
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
              <input type="number" min="0" step="0.01" placeholder="0.00" value={card.marketValue} onChange={field('marketValue')} />
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
              {card.lookup === 'loading' ? 'Finding graded price…' : card.lookupMsg}
            </span>
            <span className="faint">{ownPct || allocPct}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
