import { useState } from 'react';
import { api } from '../api.js';
import { GAMES, money } from '../format.js';
import CardImage from './CardImage.jsx';

const quotaText = (n) => (n != null ? `${n} lookups left today` : '');

/*
  Game picker + "Find card" shorthand search + results list.
  Used by Add purchase and the Trade page. Calls onPick(result) with
  { name, number, setName, printing, price, imageUrl, source, url, external }.
*/
export default function CardFinder({ game, onGameChange, onPick, picked = false, autoFocus = false }) {
  const [text, setText] = useState('');
  const [list, setList] = useState(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');

  async function find(broad = false) {
    const t = text.trim();
    if (t.length < 2) return setError('Type part of the card name, like "jinx 301".');
    setSearching(true);
    setError('');
    setFilter('');
    try {
      setList(await api.searchCards({ q: t, game, broad: broad ? '1' : undefined }));
    } catch (err) {
      setList(null);
      setError(err.message);
    } finally {
      setSearching(false);
    }
  }

  const close = () => { setList(null); setFilter(''); };

  const shown = list
    ? list.results.filter((r) => {
        const f = filter.trim().toLowerCase();
        return !f || `${r.name} ${r.number} ${r.setName} ${r.printing} ${r.rarity}`.toLowerCase().includes(f);
      })
    : [];

  return (
    <>
      <div className="form-row find-row">
        <label className="field">Game
          <select value={game} onChange={(e) => { close(); onGameChange(e.target.value); }}>
            {GAMES.map((g) => <option key={g}>{g}</option>)}
          </select>
        </label>
        <label className="field">Find card
          <input
            value={text}
            autoFocus={autoFocus}
            placeholder="jinx 301 · charizard ex 199 · luffy op05-119"
            onChange={(e) => { setText(e.target.value); setError(''); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); find(); }
              if (e.key === 'Escape') close();
            }}
          />
        </label>
        <button type="button" className="primary" onClick={() => find()} disabled={searching || text.trim().length < 2}>
          {searching ? 'Searching…' : picked ? 'Change' : 'Find card'}
        </button>
      </div>
      {error && <div className="error">{error}</div>}

      {list && (
        <div className="results" role="listbox" aria-label="Matching cards">
          <div className="results-head">
            <span>
              {list.results.length} result{list.results.length === 1 ? '' : 's'} for “{list.query}”
              {list.broadened && ' (broadened to the first word)'}
              {list.numbers?.length > 0 && list.results[0]?.fit >= 100 && ' · number matches first'}
            </span>
            <span className="faint">
              {list.cached ? 'from cache, no lookup used' : list.source === 'pokemontcg.io' ? 'pokemontcg.io, no lookup used' : quotaText(list.quotaRemaining)}
            </span>
          </div>
          {list.results.length > 8 && (
            <input className="results-filter" value={filter} placeholder="Filter these results (free)…" onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && close()} />
          )}
          <div className="results-list">
            {shown.map((r) => (
              <button type="button" key={r.id} className="result" role="option" aria-selected="false" onClick={() => { close(); onPick(r); }}>
                <CardImage src={r.imageUrl} game={game} alt="" className="result-img" />
                <span className="result-main">
                  <span className="result-name">{r.name}</span>
                  <span className="faint">{[r.number, r.setName, r.printing, r.rarity].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="result-price">{r.price ? money(r.price) : <span className="faint">no price</span>}</span>
              </button>
            ))}
            {shown.length === 0 && (
              <div className="hint" style={{ padding: '10px 4px' }}>
                {list.results.length ? 'Nothing matches that filter.' : 'No cards found.'}
              </div>
            )}
          </div>
          <div className="results-foot">
            {!list.broadened && text.trim().split(/\s+/).length > 1 && (
              <button type="button" className="small" onClick={() => find(true)} disabled={searching}>Try a broader search</button>
            )}
            <button type="button" className="small ghost" onClick={close}>Close and enter by hand</button>
          </div>
        </div>
      )}
    </>
  );
}
