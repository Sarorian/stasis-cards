import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { GAMES } from '../format.js';
import { buildInventoryImages, stackCards, gameLabel, PER_PAGE } from '../inventoryImage.js';

// Build a PNG of one game's in-stock cards to share (download, copy, or the phone's share sheet)
export default function ShareInventory({ defaultGame, onClose }) {
  const [game, setGame] = useState(defaultGame || 'Pokemon');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // { pages: [{ blob, url }], count, tiles }
  const [msg, setMsg] = useState('');

  useEffect(() => () => result?.pages.forEach((p) => URL.revokeObjectURL(p.url)), [result]);

  async function build() {
    setBusy(true);
    setError('');
    setMsg('');
    setResult(null);
    try {
      const cards = (await api.cards({ status: 'in_stock', game })).filter((c) => c.game === game);
      if (!cards.length) throw new Error(`No ${gameLabel(game)} cards in stock.`);
      const tiles = stackCards(cards).length;
      setProgress(`Loading pictures 0 / ${tiles}…`);
      const blobs = await buildInventoryImages(game, cards, (d, n) => setProgress(`Loading pictures ${d} / ${n}…`));
      setResult({ pages: blobs.map((blob) => ({ blob, url: URL.createObjectURL(blob) })), count: cards.length, tiles });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  const slug = game.toLowerCase().replace(/\s+/g, '-');
  const many = result && result.pages.length > 1;
  const fileName = (i) => `stasis-${slug}-inventory${many ? `-${i + 1}` : ''}.png`;
  const files = result ? result.pages.map((p, i) => new File([p.blob], fileName(i), { type: 'image/png' })) : [];
  const canShareAll = files.length > 0 && Boolean(navigator.canShare?.({ files }));
  const canCopy = Boolean(result && navigator.clipboard?.write && window.ClipboardItem);

  function downloadAll() {
    result.pages.forEach((p, i) => {
      setTimeout(() => {
        const a = document.createElement('a');
        a.href = p.url;
        a.download = fileName(i);
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, i * 300);
    });
  }

  async function copy(i) {
    try {
      await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': result.pages[i].blob })]);
      setMsg(`Copied${many ? ` page ${i + 1}` : ''}. Paste it into a message.`);
    } catch {
      setMsg('Your browser blocked copying. Use Download instead.');
    }
  }

  return (
    <div className="panel share-panel">
      <div className="panel-head">
        <h2>Share inventory image</h2>
        <button className="small ghost" onClick={onClose}>Close</button>
      </div>
      <div className="form-row" style={{ gridTemplateColumns: 'minmax(140px, 220px) auto 1fr' }}>
        <label className="field">Game
          <select value={game} onChange={(e) => { setGame(e.target.value); setResult(null); }}>
            {GAMES.map((g) => <option key={g} value={g}>{gameLabel(g)}</option>)}
          </select>
        </label>
        <button className="primary" onClick={build} disabled={busy}>{busy ? 'Building…' : 'Build PNG'}</button>
        <span className="hint">{progress || `All in-stock cards, priciest first, ${PER_PAGE} per image, duplicates stacked (×4). Market prices rounded to the dollar.`}</span>
      </div>
      {error && <div className="error">{error}</div>}
      {result && (
        <>
          <div className="share-actions">
            {many
              ? <button className="primary" onClick={downloadAll}>Download all {result.pages.length}</button>
              : <a href={result.pages[0].url} download={fileName(0)}><button className="primary">Download PNG</button></a>}
            {canShareAll && <button onClick={() => navigator.share({ files, title: `${gameLabel(game)} inventory` }).catch(() => {})}>Share{many ? ' all' : ''}…</button>}
            {!many && canCopy && <button onClick={() => copy(0)}>Copy image</button>}
            <span className="hint">
              {msg || `${result.count} card${result.count === 1 ? '' : 's'}${result.tiles !== result.count ? ` in ${result.tiles} stacks` : ''}${many ? ` · ${result.pages.length} images` : ''}`}
            </span>
          </div>
          <div className="share-pages">
            {result.pages.map((p, i) => (
              <figure key={p.url} className="share-page">
                {many && (
                  <figcaption>
                    <b>Page {i + 1} of {result.pages.length}</b>
                    <a href={p.url} download={fileName(i)}><button className="small">Download</button></a>
                    {canCopy && <button className="small" onClick={() => copy(i)}>Copy</button>}
                  </figcaption>
                )}
                <img className="share-preview" src={p.url} alt={`${gameLabel(game)} inventory${many ? `, page ${i + 1}` : ''}`} />
              </figure>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
