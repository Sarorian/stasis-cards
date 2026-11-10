import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { GAMES } from '../format.js';
import { buildInventoryImage, gameLabel } from '../inventoryImage.js';

// Build a PNG of one game's in-stock cards to share (download, copy, or the phone's share sheet)
export default function ShareInventory({ defaultGame, onClose }) {
  const [game, setGame] = useState(defaultGame || 'Pokemon');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // { blob, url, count }
  const [copied, setCopied] = useState('');

  useEffect(() => () => result && URL.revokeObjectURL(result.url), [result]);

  async function build() {
    setBusy(true);
    setError('');
    setCopied('');
    setResult(null);
    try {
      const cards = (await api.cards({ status: 'in_stock', game })).filter((c) => c.game === game);
      if (!cards.length) throw new Error(`No ${gameLabel(game)} cards in stock.`);
      setProgress(`Loading pictures 0 / ${cards.length}…`);
      const blob = await buildInventoryImage(game, cards, (d, n) => setProgress(`Loading pictures ${d} / ${n}…`));
      setResult({ blob, url: URL.createObjectURL(blob), count: cards.length });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  const fileName = `stasis-${game.toLowerCase().replace(/\s+/g, '-')}-inventory.png`;
  const file = result ? new File([result.blob], fileName, { type: 'image/png' }) : null;
  const canShare = Boolean(file && navigator.canShare?.({ files: [file] }));
  const canCopy = Boolean(result && navigator.clipboard?.write && window.ClipboardItem);

  async function copy() {
    try {
      await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': result.blob })]);
      setCopied('Copied. Paste it into a message.');
    } catch {
      setCopied('Your browser blocked copying. Use Download instead.');
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
        <span className="hint">{progress || 'All in-stock cards, priciest first, with market prices rounded to the dollar.'}</span>
      </div>
      {error && <div className="error">{error}</div>}
      {result && (
        <>
          <div className="share-actions">
            <a href={result.url} download={fileName}><button className="primary">Download PNG</button></a>
            {canCopy && <button onClick={copy}>Copy image</button>}
            {canShare && <button onClick={() => navigator.share({ files: [file], title: `${gameLabel(game)} inventory` }).catch(() => {})}>Share…</button>}
            <span className="hint">{copied || `${result.count} card${result.count === 1 ? '' : 's'}`}</span>
          </div>
          <img className="share-preview" src={result.url} alt={`${gameLabel(game)} inventory`} />
        </>
      )}
    </div>
  );
}
