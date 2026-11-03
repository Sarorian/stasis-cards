import { useState } from 'react';
import { api } from '../api.js';
import { money } from '../format.js';
import CardFinder from './CardFinder.jsx';
import CardImage from './CardImage.jsx';

// Re-search a card and pick the exact printing; updates price, picture and what future updates follow
export default function FindMatchForm({ card, onDone, onCancel }) {
  const [game, setGame] = useState(card.game);
  const [language, setLanguage] = useState(card.language || 'EN');
  const [pick, setPick] = useState(null);
  const [rename, setRename] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const graded = Boolean(card.graded?.company);

  async function save() {
    setBusy(true);
    setError('');
    try {
      await api.linkCard(card._id, {
        external: pick.external, imageUrl: pick.imageUrl, setName: pick.setName, name: pick.name, number: pick.number,
        price: pick.price, source: pick.source, url: pick.url, rename, language,
      });
      onDone?.();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="inline-form">
      <CardFinder game={game} onGameChange={setGame} onPick={(r) => { setPick(r); setError(''); }} picked={Boolean(pick)} autoFocus
        language={language} onLanguageChange={(l) => { setLanguage(l); setPick(null); }}
        initialText={[card.name, card.number].filter(Boolean).join(' ')} />
      {game !== card.game && <div className="hint" style={{ marginTop: 4 }}>Searching in {game}. To change the card's game, use Edit.</div>}

      {pick && (
        <div className="match-pick">
          <CardImage src={pick.imageUrl} game={game} alt="" className="result-img" />
          <div style={{ minWidth: 0 }}>
            <div className="result-name">{pick.name}</div>
            <div className="faint">{[pick.number, pick.setName, pick.printing].filter(Boolean).join(' · ')}</div>
            <div className="hint">
              Market {money(card.market?.price)} → <b>{pick.price ? money(pick.price) : 'no price'}</b>
              {graded && pick.price ? ' (raw price; set the graded price with $ if needed)' : ''}
            </div>
          </div>
          <label className="check" style={{ fontSize: 13 }}>
            <input type="checkbox" checked={rename} onChange={(e) => setRename(e.target.checked)} />
            Use this name, number and set
          </label>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="primary" disabled={!pick || busy} onClick={save}>{busy ? 'Saving…' : 'Use this match'}</button>
        <button type="button" onClick={onCancel}>Cancel</button>
        <span className="hint">Cost and sales don't change. Future price updates follow the printing you pick.</span>
      </div>
      {error && <div className="error">{error}</div>}
    </div>
  );
}
