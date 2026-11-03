import Card from '../models/Card.js';
import Settings from '../models/Settings.js';
import { today, round2 } from '../constants.js';
import { tcgapi, pokemontcg, pricecharting, QuotaError, tcgapiState } from './providers.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/*
  Look a card up across providers.
  Raw cards: TCGplayer market (pokemontcg.io first for Pokemon, then TCG API).
  Graded cards: PriceCharting graded price when configured, otherwise the raw price as a reference.
*/
export async function lookup({ name, number, game, graded, language = 'EN', external = {} }) {
  const input = { name, number, game, graded, language, external };
  const sources = [];
  const found = { imageUrl: '', setName: '', external: { ...external } };
  const errors = [];
  let quotaHit = false;

  const order = game === 'Pokemon' ? [pokemontcg, tcgapi] : [tcgapi];
  for (const provider of order) {
    try {
      const hit = await provider({ ...input, external: found.external });
      if (!hit) continue;
      Object.assign(found.external, hit.external);
      if (!found.imageUrl && hit.imageUrl) found.imageUrl = hit.imageUrl;
      if (!found.setName && hit.setName) found.setName = hit.setName;
      if (hit.price) {
        sources.push({ source: hit.source, price: hit.price, url: hit.url });
        break; // one raw market price is enough; saves daily lookups
      }
    } catch (err) {
      if (err instanceof QuotaError) quotaHit = true;
      errors.push(err.message);
    }
  }

  let price = sources[0]?.price ?? null;
  if (graded?.company) {
    try {
      const g = await pricecharting({ ...input, external: found.external });
      if (g) {
        Object.assign(found.external, g.external);
        sources.unshift({ source: g.source, price: g.price, url: g.url });
        price = g.price;
      } else if (sources[0]) {
        sources[0].source += ' (raw)';
      }
    } catch (err) {
      errors.push(err.message);
    }
  }

  return { price, sources, ...found, errors, quotaHit, quotaRemaining: tcgapiState.remaining };
}

// Update one card document in place. Returns a short result summary.
export async function refreshCard(card, { force = false } = {}) {
  if (card.market?.manualOverride && !force) return { skipped: 'manual price' };
  const res = await lookup({
    name: card.name,
    number: card.number,
    game: card.game,
    language: card.language || 'EN',
    graded: card.graded?.company ? card.graded : null,
    external: card.external?.toObject ? card.external.toObject() : card.external || {},
  });
  if (res.imageUrl && !card.imageUrl) card.imageUrl = res.imageUrl;
  if (res.setName && !card.setName) card.setName = res.setName;
  card.external = { ...(card.external?.toObject ? card.external.toObject() : card.external), ...res.external };
  card.market.lookupFailed = !res.price;
  if (res.price) {
    card.market.price = round2(res.price);
    card.market.sources = res.sources;
    card.market.updatedAt = new Date();
    card.market.manualOverride = false;
    const d = today();
    const last = card.priceHistory[card.priceHistory.length - 1];
    if (last?.date === d) last.price = card.market.price;
    else card.priceHistory.push({ date: d, price: card.market.price });
  }
  await card.save();
  return { price: res.price, errors: res.errors, quotaHit: res.quotaHit };
}

/* ---------------- Background "update all prices" job ---------------- */

const job = {
  running: false,
  startedAt: null,
  finishedAt: null,
  total: 0,
  done: 0,
  updated: 0,
  notFound: [],
  failed: [],
  stoppedReason: null,
};

export function jobStatus() {
  return { ...job, quotaRemaining: tcgapiState.remaining };
}

export function startUpdateAll() {
  if (job.running) return jobStatus();
  Object.assign(job, {
    running: true, startedAt: new Date(), finishedAt: null, total: 0, done: 0, updated: 0,
    notFound: [], failed: [], stoppedReason: null, skippedForManual: 0,
  });
  tcgapiState.remaining = null; // re-read from the next response
  run().catch((err) => {
    job.stoppedReason = err.message;
    job.running = false;
    job.finishedAt = new Date();
  });
  return jobStatus();
}

/*
  Cards whose price has to be typed in by hand:
    graded   - graded cards (unless PriceCharting is set up, which prices them automatically)
    japanese - Japanese cards other than Pokemon (no price source)
    notFound - the last automatic lookup found nothing
*/
export function manualReason(card) {
  if (card.graded?.company && !process.env.PRICECHARTING_TOKEN) return 'graded';
  if (card.language === 'JP' && card.game !== 'Pokemon') return 'japanese';
  if (card.market?.lookupFailed && !card.market?.manualOverride) return 'notFound';
  return null;
}

async function run() {
  // Oldest prices first so a quota stop still refreshes the stalest cards.
  // Graded and Japanese non-Pokemon cards are skipped: they go to "Prices to enter" instead.
  const all = await Card.find({ status: 'in_stock', 'market.manualOverride': { $ne: true } }).sort({ 'market.updatedAt': 1 });
  const cards = all.filter((c) => {
    const why = manualReason(c);
    return why !== 'graded' && why !== 'japanese';
  });
  job.skippedForManual = all.length - cards.length;
  job.total = cards.length;
  for (const card of cards) {
    try {
      const r = await refreshCard(card);
      if (r.price) job.updated++;
      else job.notFound.push({ id: String(card._id), name: `${card.name} ${card.number}`.trim() });
      if (r.quotaHit) {
        job.stoppedReason = 'Daily price lookup limit reached. The rest will update tomorrow; run it again then.';
        job.done++;
        break;
      }
    } catch (err) {
      job.failed.push(`${card.name}: ${err.message}`);
    }
    job.done++;
    await sleep(250);
  }
  const s = await Settings.get();
  s.pricesUpdatedAt = new Date();
  await s.save();
  job.running = false;
  job.finishedAt = new Date();
}
