// Market price + image providers. Each returns null when it has nothing,
// or { price, imageUrl, setName, url, source, external } on a match.
import { round2 } from '../constants.js';

const TIMEOUT = 15000;

export class QuotaError extends Error {}

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, '').replace(/^#/, '');
// "199/165" -> "199", "OP05-119" -> "op05-119", "007" -> "7"
const numKey = (s) => norm(s).split('/')[0].replace(/^0+(?=\d)/, '');

export function numbersMatch(a, b) {
  if (!a || !b) return false;
  return norm(a) === norm(b) || numKey(a) === numKey(b);
}

const nameScore = (want, got) => {
  const w = norm(want);
  const g = norm(got);
  if (g === w) return 3;
  if (g.startsWith(w)) return 2;
  if (g.includes(w)) return 1;
  return 0;
};

function pickBest(items, { name, number }, getName, getNumber) {
  if (!items?.length) return null;
  if (number) {
    const byNum = items.filter((it) => numbersMatch(getNumber(it), number));
    if (byNum.length) return byNum.sort((a, b) => nameScore(name, getName(b)) - nameScore(name, getName(a)))[0];
    return null; // a number was given and nothing matched it: don't guess
  }
  const scored = items.filter((it) => nameScore(name, getName(it)) > 0);
  return scored.sort((a, b) => nameScore(name, getName(b)) - nameScore(name, getName(a)))[0] || null;
}

async function getJson(url, headers = {}) {
  let res;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT) });
  } catch {
    throw new Error(`Couldn't reach ${new URL(url).host}.`);
  }
  if (res.status === 429) throw new QuotaError('Daily price lookup limit reached.');
  if (!res.ok) throw new Error(`${new URL(url).host} responded ${res.status}`);
  return res.json();
}

/* ---------------- TCG API (tcgapi.dev) - TCGplayer market prices ---------------- */

const TCGAPI = 'https://api.tcgapi.dev/v1';
const TCGAPI_SLUGS = {
  Pokemon: 'pokemon',
  'One Piece': 'one-piece-card-game',
  Riftbound: 'riftbound-league-of-legends-trading-card-game',
};
export const tcgapiState = { remaining: null };

function tcgapiHeaders() {
  return { 'X-API-Key': process.env.TCGAPI_KEY, Accept: 'application/json' };
}

function trackQuota(json) {
  const left = json?.rate_limit?.daily_remaining;
  if (typeof left === 'number') tcgapiState.remaining = left;
}

async function tcgapiSearch(q, game) {
  const params = new URLSearchParams({ q, type: 'Cards', per_page: '50' });
  if (TCGAPI_SLUGS[game]) params.set('game', TCGAPI_SLUGS[game]);
  const json = await getJson(`${TCGAPI}/search?${params}`, tcgapiHeaders());
  trackQuota(json);
  return json.data || [];
}

export async function tcgapi({ name, number, game, external = {} }) {
  if (!process.env.TCGAPI_KEY) return null;
  if (tcgapiState.remaining === 0) throw new QuotaError('Daily price lookup limit reached.');

  // Already matched before: one cheap request for fresh prices
  if (external.tcgapiId) {
    const json = await getJson(`${TCGAPI}/cards/${encodeURIComponent(external.tcgapiId)}/prices`, tcgapiHeaders());
    trackQuota(json);
    const rows = Array.isArray(json.data) ? json.data : json.data ? [json.data] : [];
    const row = rows.find((p) => p.printing === external.tcgapiPrinting && p.market_price) || rows.find((p) => p.market_price);
    if (row) {
      return { source: 'TCGplayer', price: round2(row.market_price), external: { tcgapiId: external.tcgapiId, tcgapiPrinting: row.printing } };
    }
  }

  let results = await tcgapiSearch(name, game);
  let hit = pickBest(results, { name, number }, (r) => r.name, (r) => r.number);
  if (!hit && number && name.length >= 2) {
    results = await tcgapiSearch(`${name} ${number}`, game);
    hit = pickBest(results, { name, number }, (r) => r.name, (r) => r.number);
  }
  if (!hit) return null;
  return {
    source: 'TCGplayer',
    price: hit.market_price ? round2(hit.market_price) : null,
    imageUrl: hit.image_url || '',
    setName: hit.set_name || '',
    url: hit.tcgplayer_id ? `https://www.tcgplayer.com/product/${hit.tcgplayer_id}` : undefined,
    external: { tcgapiId: String(hit.id), tcgapiPrinting: hit.printing },
  };
}

/* ---------------- Pokemon TCG API (pokemontcg.io) - free, Pokemon only ---------------- */

const POKE_VARIANTS = ['holofoil', 'normal', 'reverseHolofoil', '1stEditionHolofoil', '1stEditionNormal', 'unlimitedHolofoil'];

export async function pokemontcg({ name, number, game }) {
  if (game !== 'Pokemon') return null;
  const headers = process.env.POKEMONTCG_API_KEY ? { 'X-Api-Key': process.env.POKEMONTCG_API_KEY } : {};
  const clean = name.replace(/"/g, '');
  const parts = [`name:"${clean}"`];
  if (number) parts.push(`number:${numKey(number)}`);
  const json = await getJson(`https://api.pokemontcg.io/v2/cards?pageSize=20&q=${encodeURIComponent(parts.join(' '))}`, headers);
  const hit = pickBest(json.data, { name, number }, (c) => c.name, (c) => c.number);
  if (!hit) return null;
  const prices = hit.tcgplayer?.prices || {};
  const variant = POKE_VARIANTS.find((v) => prices[v]?.market) || Object.keys(prices).find((v) => prices[v]?.market);
  return {
    source: 'TCGplayer (pokemontcg.io)',
    price: variant ? round2(prices[variant].market) : null,
    imageUrl: hit.images?.large || hit.images?.small || '',
    setName: hit.set?.name || '',
    url: hit.tcgplayer?.url,
    external: { pokemontcgId: hit.id },
  };
}

/* ---------------- PriceCharting - graded prices (paid token, optional) ---------------- */

// PriceCharting reports trading-card grades in fixed fields, in pennies
function gradedField(company, grade) {
  const g = parseFloat(grade);
  if (g === 10) {
    if (company === 'BGS') return 'bgs-10-price';
    if (company === 'CGC') return 'condition-17-price';
    return 'manual-only-price'; // PSA 10 (also used as the closest match for TAG 10)
  }
  if (g >= 9.5) return 'box-only-price';
  if (g >= 9) return 'graded-price';
  if (g >= 8) return 'new-price';
  if (g >= 7) return 'cib-price';
  return 'loose-price';
}

export async function pricecharting({ name, number, graded, external = {} }) {
  const token = process.env.PRICECHARTING_TOKEN;
  if (!token || !graded?.company) return null;
  let id = external.pricechartingId;
  if (!id) {
    const q = encodeURIComponent([name, number].filter(Boolean).join(' '));
    const list = await getJson(`https://www.pricecharting.com/api/products?t=${token}&q=${q}`);
    id = list.products?.[0]?.id;
    if (!id) return null;
  }
  const p = await getJson(`https://www.pricecharting.com/api/product?t=${token}&id=${id}`);
  const cents = p[gradedField(graded.company, graded.grade)];
  if (!cents) return null;
  return {
    source: `PriceCharting (${graded.company} ${graded.grade})`,
    price: round2(cents / 100),
    url: `https://www.pricecharting.com/offers?product=${id}`,
    external: { pricechartingId: String(id) },
  };
}

/* ---------------- Quick-check links (no API needed) ---------------- */

export function checkLinks({ name, number, game, graded }) {
  const q = [name, number, graded?.company ? `${graded.company} ${graded.grade}` : ''].filter(Boolean).join(' ');
  const e = encodeURIComponent(q);
  const tcgCat = { Pokemon: 'pokemon', 'One Piece': 'one-piece-card-game', Riftbound: 'riftbound-league-of-legends-trading-card-game' }[game];
  return {
    tcgplayer: `https://www.tcgplayer.com/search/${tcgCat || 'all'}/product?q=${encodeURIComponent([name, number].filter(Boolean).join(' '))}`,
    ebaySold: `https://www.ebay.com/sch/i.html?_nkw=${e}&LH_Sold=1&LH_Complete=1`,
    point130: `https://130point.com/sales/?q=${e}`,
  };
}
