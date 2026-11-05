export const GAMES = ['Pokemon', 'One Piece', 'Riftbound', 'Misc'];
export const WALLETS = ['Cash', 'Venmowen', 'Benmo', 'Zelle'];
export const CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DMG'];
export const GRADERS = ['PSA', 'CGC', 'BGS', 'TAG'];
export const PARTNERS = ['Owen', 'Ben'];
// Paying for cards with a partner's own money (the business then owes them)
export const DEBT_METHODS = PARTNERS.map((p) => `${p} (debt)`);
// Each partner's own Venmo wallet (default when they keep Venmo to cleanse debt)
export const partnerWallet = (person) => ({ Owen: 'Venmowen', Ben: 'Benmo' }[person] || 'Cash');

// All business dates use a fixed UTC-7 offset
export const today = () => new Date(Date.now() - 7 * 3600e3).toISOString().slice(0, 10);

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export const money = (n) => (n === null || n === undefined || Number.isNaN(Number(n)) ? '—' : usd.format(n));
export const pct = (n, signed = true) =>
  n === null || n === undefined || Number.isNaN(Number(n)) ? '—' : `${signed && n > 0 ? '+' : ''}${Number(n).toFixed(1)}%`;
export const tone = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');

export const fmtDate = (d) =>
  d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
export const fmtMonth = (m) => new Date(`${m}-15T12:00:00`).toLocaleDateString('en-US', { month: 'short' });
export const fmtTime = (iso) =>
  iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'never';

export const roiPct = (cost, market) => (cost > 0 ? ((market - cost) / cost) * 100 : null);

const slug = (g) => ({ Pokemon: 'pokemon', 'One Piece': 'one-piece', Riftbound: 'riftbound' }[g] || 'misc');
export const logoFor = (game) => `${import.meta.env.BASE_URL}logos/${slug(game)}.svg`;

// Japanese Pokemon has its own price catalog; other Japanese cards are priced by hand
export const canAutoPrice = (game, language) => language !== 'JP' || game === 'Pokemon';

export function checkLinks({ name, number, game, graded, language }) {
  const jp = language === 'JP';
  const gradeTxt = graded?.company ? `${graded.company} ${graded.grade}` : '';
  const q = encodeURIComponent([name, number, jp ? 'Japanese' : '', gradeTxt].filter(Boolean).join(' '));
  const cat = (jp
    ? (game === 'Pokemon' ? 'pokemon-japan' : null)
    : { Pokemon: 'pokemon', 'One Piece': 'one-piece-card-game', Riftbound: 'riftbound-league-of-legends-trading-card-game' }[game]) || 'all';
  return [
    ['TCGplayer', `https://www.tcgplayer.com/search/${cat}/product?q=${encodeURIComponent([name, number].filter(Boolean).join(' '))}`],
    ['eBay sold', `https://www.ebay.com/sch/i.html?_nkw=${q}&LH_Sold=1&LH_Complete=1`],
    ['130point', `https://130point.com/sales/?q=${q}`],
  ];
}
