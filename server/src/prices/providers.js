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

// Letters and digits only, so "Jinx, Loose Cannon" ~ "Jinx - Loose Cannon (Overnumbered)"
const nameKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
// Text the search APIs can use: punctuation becomes spaces
export const cleanQuery = (s) => String(s || '').replace(/[^\p{L}\p{N}'*]+/gu, ' ').replace(/\s+/g, ' ').trim();

const nameScore = (want, got) => {
  const w = nameKey(want);
  const g = nameKey(got);
  if (!w) return 0;
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

/*
  Which tcgapi.dev catalog to use. Japanese Pokemon has its own ("pokemon-japan");
  other Japanese cards have no catalog, so null = can't be priced automatically.
*/
export function tcgapiSlug(game, language = 'EN') {
  if (language === 'JP') return game === 'Pokemon' ? 'pokemon-japan' : null;
  return TCGAPI_SLUGS[game] || '';
}
export const canAutoPrice = (game, language = 'EN') => language !== 'JP' || game === 'Pokemon';

function tcgapiHeaders() {
  return { 'X-API-Key': process.env.TCGAPI_KEY, Accept: 'application/json' };
}

function trackQuota(json) {
  const left = json?.rate_limit?.daily_remaining;
  if (typeof left === 'number') tcgapiState.remaining = left;
}

// slug: a catalog slug, or '' to search every game
async function tcgapiSearch(q, slug, perPage = 50) {
  const params = new URLSearchParams({ q: cleanQuery(q), type: 'Cards', per_page: String(perPage) });
  if (slug) params.set('game', slug);
  const json = await getJson(`${TCGAPI}/search?${params}`, tcgapiHeaders());
  trackQuota(json);
  return json.data || [];
}

export async function tcgapi({ name, number, game, language = 'EN', external = {} }) {
  if (!process.env.TCGAPI_KEY) return null;
  const slug = tcgapiSlug(game, language);
  if (slug === null) return null; // Japanese One Piece / Riftbound: no catalog
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

  let results = await tcgapiSearch(name, slug);
  let hit = pickBest(results, { name, number }, (r) => r.name, (r) => r.number);
  // Nothing matched: retry with just the first word ("Jinx"), which pulls in every version
  const firstWord = cleanQuery(name).split(' ')[0];
  if (!hit && firstWord.length >= 2 && firstWord.toLowerCase() !== cleanQuery(name).toLowerCase()) {
    results = await tcgapiSearch(firstWord, slug, 100);
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

const pokeHeaders = () => (process.env.POKEMONTCG_API_KEY ? { 'X-Api-Key': process.env.POKEMONTCG_API_KEY } : {});

export async function pokemontcg({ name, number, game, language = 'EN', external = {} }) {
  if (game !== 'Pokemon' || language === 'JP') return null; // pokemontcg.io is English only
  const headers = pokeHeaders();

  // Picked from search before: go straight to that card and printing
  if (external.pokemontcgId) {
    const json = await getJson(`https://api.pokemontcg.io/v2/cards/${encodeURIComponent(external.pokemontcgId)}`, headers);
    const c = json.data;
    const prices = c?.tcgplayer?.prices || {};
    const variant = prices[external.pokemontcgVariant]?.market
      ? external.pokemontcgVariant
      : POKE_VARIANTS.find((v) => prices[v]?.market) || Object.keys(prices).find((v) => prices[v]?.market);
    if (c && variant) {
      return {
        source: 'TCGplayer (pokemontcg.io)',
        price: round2(prices[variant].market),
        imageUrl: c.images?.large || c.images?.small || '',
        setName: c.set?.name || '',
        url: c.tcgplayer?.url,
        external: { pokemontcgId: c.id, pokemontcgVariant: variant },
      };
    }
  }

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
    external: { pokemontcgId: hit.id, ...(variant ? { pokemontcgVariant: variant } : {}) },
  };
}

/* ---------------- Card search for the "Find card" picker ---------------- */

const SEARCH_TTL = 6 * 3600e3; // repeat searches within 6 hours are free
const searchCache = new Map();

const hasDigit = (t) => /\d/.test(t);
const words = (s) => cleanQuery(s).toLowerCase().split(' ').filter(Boolean);
const POKE_VARIANT_LABEL = {
  normal: 'Normal', holofoil: 'Holofoil', reverseHolofoil: 'Reverse Holofoil',
  '1stEditionHolofoil': '1st Edition Holofoil', '1stEditionNormal': '1st Edition', unlimitedHolofoil: 'Unlimited Holofoil',
};

// "jinx lc 301" -> { words: ['jinx', 'lc'], numbers: ['301'] }
export function parseShorthand(text) {
  const tokens = String(text || '').trim().split(/\s+/).filter(Boolean);
  return {
    words: tokens.filter((t) => !hasDigit(t)).flatMap(words),
    numbers: tokens.filter(hasDigit).map((t) => t.replace(/^#/, '')),
  };
}

// Does a number the user typed fit this card's number? "301" fits "301/298"; "119" and "op05" fit "OP05-119"
function numberFits(cardNumber, typed) {
  if (!cardNumber || !typed) return false;
  if (numbersMatch(cardNumber, typed)) return true;
  const parts = norm(cardNumber).split('/')[0].split('-').map((p) => p.replace(/^0+(?=\d)/, ''));
  return norm(typed).split('/')[0].split('-').every((p) => parts.includes(p.replace(/^0+(?=\d)/, '')));
}

// Higher = better fit for the shorthand. Results are sorted, never hidden.
function fitScore(card, { words: ws, numbers }) {
  let score = 0;
  for (const n of numbers) if (numberFits(card.number, n)) score += norm(card.number) === norm(n) ? 120 : 100;
  const nameWords = words(card.name);
  const initials = nameWords.map((w) => w[0]).join('');
  const setWords = words(card.setName);
  for (const w of ws) {
    if (nameWords.some((nw) => nw.startsWith(w))) score += 10;
    else if (w.length >= 2 && initials.includes(w)) score += 6; // "lc" = Loose Cannon
    else if (setWords.some((sw) => sw.startsWith(w))) score += 4;
  }
  return score;
}

function fromTcgapi(r) {
  return {
    id: `tcgapi:${r.id}:${r.printing || ''}`,
    name: r.name,
    number: r.number || '',
    setName: r.set_name || '',
    printing: r.printing || '',
    rarity: r.rarity || '',
    price: r.market_price ? round2(r.market_price) : null,
    imageUrl: r.image_url || '',
    source: 'TCGplayer',
    url: r.tcgplayer_id ? `https://www.tcgplayer.com/product/${r.tcgplayer_id}` : undefined,
    external: { tcgapiId: String(r.id), tcgapiPrinting: r.printing || '' },
  };
}

// One row per printing that has a price (Holofoil, Reverse Holofoil, ...)
function fromPokemontcg(c) {
  const prices = c.tcgplayer?.prices || {};
  const variants = Object.keys(prices).filter((v) => prices[v]?.market);
  const base = {
    name: c.name,
    number: c.number && c.set?.printedTotal ? `${c.number}/${c.set.printedTotal}` : c.number || '',
    setName: c.set?.name || '',
    rarity: c.rarity || '',
    imageUrl: c.images?.small || c.images?.large || '',
    source: 'TCGplayer (pokemontcg.io)',
    url: c.tcgplayer?.url,
  };
  if (!variants.length) return [{ ...base, id: `ptcg:${c.id}`, printing: '', price: null, external: { pokemontcgId: c.id } }];
  return variants.map((v) => ({
    ...base,
    id: `ptcg:${c.id}:${v}`,
    printing: POKE_VARIANT_LABEL[v] || v,
    price: round2(prices[v].market),
    external: { pokemontcgId: c.id, pokemontcgVariant: v },
  }));
}

async function pokemontcgSearch(ws, numbers) {
  if (!ws.length) return [];
  const nameParts = ws.map((w) => `name:*${w.replace(/[^a-z0-9]/g, '')}*`).filter((p) => p !== 'name:**');
  const run = async (parts) => {
    const q = encodeURIComponent(parts.join(' '));
    const json = await getJson(`https://api.pokemontcg.io/v2/cards?pageSize=100&orderBy=-set.releaseDate&q=${q}`, pokeHeaders());
    return json.data || [];
  };
  let cards = [];
  const num = numbers.map((n) => numKey(n)).find((n) => /^[a-z0-9]+$/i.test(n));
  if (num) cards = await run([...nameParts, `number:${num}`]);
  if (!cards.length) cards = await run(nameParts);
  return cards.flatMap(fromPokemontcg);
}

/*
  Search for the picker. Returns every candidate, best fits first.
  broad = search only the first word (for when shorthand like "lc" confuses the search)
*/
export async function searchCards({ text, game, broad = false, language = 'EN' }) {
  if (!canAutoPrice(game, language)) {
    throw Object.assign(new Error(`There's no price source for Japanese ${game} cards. Type the card in by hand and set its price with the $ button.`), { status: 400 });
  }
  const parsed = parseShorthand(text);
  const first = parsed.words[0] || '';
  const queryWords = broad ? (first ? [first] : []) : parsed.words;
  // No words at all ("op05-119"): search the text as typed
  const q = queryWords.length ? queryWords.join(' ') : cleanQuery(text);
  if (q.length < 2) throw Object.assign(new Error('Type at least 2 letters of the card name.'), { status: 400 });

  let results = [];
  let source = '';
  let broadened = broad;
  let cached = true; // stays true only if every API call came from the cache
  const errors = [];

  // Each underlying API call is cached, so retries and repeat searches cost nothing
  const cachedCall = async (key, fn) => {
    const hit = searchCache.get(key);
    if (hit && Date.now() - hit.at < SEARCH_TTL) return hit.results;
    cached = false;
    const out = await fn();
    searchCache.set(key, { at: Date.now(), results: out });
    if (searchCache.size > 300) searchCache.delete(searchCache.keys().next().value);
    return out;
  };

  if (game === 'Pokemon' && language !== 'JP' && queryWords.length) {
    const poke = (ws) => cachedCall(`ptcg|${ws.join(' ')}|${parsed.numbers.join(',')}`, () => pokemontcgSearch(ws, parsed.numbers));
    try {
      results = await poke(queryWords);
      source = 'pokemontcg.io';
      // Shorthand like "char ex" may miss; try the first word alone (free)
      if (!results.length && queryWords.length > 1) {
        results = await poke([first]);
        broadened = true;
      }
    } catch (err) {
      errors.push(err.message);
    }
  }
  if (!results.length) {
    const slug = tcgapiSlug(game, language);
    const tcg = (query) => cachedCall(`tcg|${slug}|${query.toLowerCase()}`, async () => {
      if (!process.env.TCGAPI_KEY) throw new Error(errors[0] || 'TCGAPI_KEY is not set in server/.env.');
      if (tcgapiState.remaining === 0) throw new QuotaError('Daily price lookup limit reached.');
      return (await tcgapiSearch(query, slug, 100)).map(fromTcgapi);
    });
    results = await tcg(q);
    source = 'tcgapi.dev';
    // Zero results usually means a shorthand word the search didn't understand: one retry with the first word
    if (!results.length && !broadened && queryWords.length > 1) {
      results = await tcg(first);
      broadened = true;
    }
  }

  const ranked = results
    .map((r, i) => ({ ...r, fit: fitScore(r, parsed), order: i }))
    .sort((a, b) => b.fit - a.fit || a.order - b.order)
    .map(({ order, ...r }) => r);

  return { results: ranked, query: q, source, cached, broadened, numbers: parsed.numbers, quotaRemaining: tcgapiState.remaining };
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

export function checkLinks({ name, number, game, graded, language = 'EN' }) {
  const jp = language === 'JP';
  const q = [name, number, jp ? 'Japanese' : '', graded?.company ? `${graded.company} ${graded.grade}` : ''].filter(Boolean).join(' ');
  const e = encodeURIComponent(q);
  const tcgCat = jp
    ? (game === 'Pokemon' ? 'pokemon-japan' : null)
    : { Pokemon: 'pokemon', 'One Piece': 'one-piece-card-game', Riftbound: 'riftbound-league-of-legends-trading-card-game' }[game];
  return {
    tcgplayer: `https://www.tcgplayer.com/search/${tcgCat || 'all'}/product?q=${encodeURIComponent([name, number].filter(Boolean).join(' '))}`,
    ebaySold: `https://www.ebay.com/sch/i.html?_nkw=${e}&LH_Sold=1&LH_Complete=1`,
    point130: `https://130point.com/sales/?q=${e}`,
  };
}
