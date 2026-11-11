import { cardImageBlob } from './api.js';
import { logoFor, fmtDate, today } from './format.js';

/*
  Draws shareable pictures of one game's inventory: a header, then a grid of cards
  (picture, name, set · number, condition or grade, market price rounded to the dollar).
  Copies of the same card in the same condition/grade stack into one tile (×4).
  12 tiles per picture; more than that makes several pictures ("Page 1 of 3").
  Returns PNG Blobs, one per page.
*/

export const PER_PAGE = 12;
const COLS = 4;
const PAD = 48;
const GAP = 24;
const CELL_W = 216;
const IMG_H = Math.round(CELL_W * 88 / 63); // trading card shape
const TEXT_H = 104;
const HEADER_H = 132;
const FOOTER_H = 56;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const C = {
  bg: '#f6f5f1', surface: '#ffffff', slot: '#efede7', text: '#1d1c1a', muted: '#6b6963', faint: '#9a978f',
  border: 'rgba(0,0,0,0.1)', accent: '#1e6b5c', pillBg: '#efede7', gradedBg: '#ece9fb', graded: '#4a40a8',
};

const GAME_LABEL = { Pokemon: 'Pokémon' };
export const gameLabel = (g) => GAME_LABEL[g] || g;
export const dollars = (n) => (n > 0 ? `$${Math.round(n).toLocaleString('en-US')}` : '—');

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Load pictures a few at a time; a card whose picture fails shows the game logo instead
async function loadPictures(cards, onProgress) {
  const out = new Array(cards.length).fill(null);
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < cards.length) {
      const i = next++;
      const url = cards[i].imageUrl;
      if (url) {
        try {
          const blob = await cardImageBlob(url);
          const objUrl = URL.createObjectURL(blob);
          out[i] = await loadImage(objUrl);
        } catch {
          out[i] = null;
        }
      }
      onProgress?.(++done, cards.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, cards.length) }, worker));
  return out;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Cut text to fit `max` px, adding … when it doesn't
function fit(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

// Draw `img` to cover the box (cropping the overflow), like CSS object-fit: cover
function drawCover(ctx, img, x, y, w, h) {
  const s = Math.max(w / img.width, h / img.height);
  const sw = w / s;
  const sh = h / s;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

function drawContain(ctx, img, x, y, w, h) {
  const s = Math.min(w / img.width, h / img.height);
  const dw = img.width * s;
  const dh = img.height * s;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function pill(ctx, text, x, y, bg, color) {
  ctx.font = `600 12px ${FONT}`;
  const w = ctx.measureText(text).width + 14;
  roundRect(ctx, x, y, w, 20, 10);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + 7, y + 10.5);
  ctx.textBaseline = 'alphabetic';
  return w;
}

// Same printing + same condition (or grade) = one stack
const stackKey = (c) => [
  c.game, (c.name || '').trim().toLowerCase(), (c.number || '').trim().toLowerCase(), (c.setName || '').trim().toLowerCase(),
  c.language || 'EN', c.graded?.company ? `${c.graded.company} ${c.graded.grade}` : (c.condition || 'NM'),
].join('|');

export function stackCards(cards) {
  const map = new Map();
  for (const c of cards) {
    const k = stackKey(c);
    if (!map.has(k)) map.set(k, { ...c, copies: [] });
    map.get(k).copies.push(c);
  }
  return [...map.values()].map((s) => {
    const priced = s.copies.map((c) => c.market?.price || 0).filter((p) => p > 0);
    return {
      ...s, qty: s.copies.length,
      price: priced.length ? priced.reduce((a, p) => a + p, 0) / priced.length : 0,
      imageUrl: s.copies.find((c) => c.imageUrl)?.imageUrl || '',
    };
  }).sort((a, b) => b.price - a.price || a.name.localeCompare(b.name));
}

// All pages for a game. onProgress(done, total) while pictures load.
export async function buildInventoryImages(game, cardsIn, onProgress) {
  const stacks = stackCards(cardsIn);
  const [pictures, logo] = await Promise.all([loadPictures(stacks, onProgress), loadImage(logoFor(game)).catch(() => null)]);
  if (document.fonts?.ready) await document.fonts.ready;
  const pages = Math.ceil(stacks.length / PER_PAGE);
  const blobs = [];
  for (let i = 0; i < pages; i++) {
    const from = i * PER_PAGE;
    blobs.push(await drawPage({
      game, logo, page: i + 1, pages, totalCards: cardsIn.length,
      stacks: stacks.slice(from, from + PER_PAGE), pictures: pictures.slice(from, from + PER_PAGE),
    }));
  }
  return blobs;
}

function drawPage({ game, logo, page, pages, stacks: cards, pictures }) {
  const cols = pages > 1 ? COLS : Math.min(COLS, Math.max(cards.length, 3));
  const rows = Math.ceil(cards.length / cols);
  const W = PAD * 2 + cols * CELL_W + (cols - 1) * GAP;
  const H = HEADER_H + rows * (IMG_H + TEXT_H) + Math.max(rows - 1, 0) * GAP + FOOTER_H + PAD;
  // Draw at 2x for a sharp picture, unless that would be too big for the browser
  const scale = W * H * 4 < 120e6 ? 2 : 1;

  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // Header: logo, "Stasis Cards", game + date
  let hx = PAD;
  if (logo) {
    drawContain(ctx, logo, PAD, 40, 56, 56);
    hx += 72;
  }
  ctx.fillStyle = C.text;
  ctx.font = `700 34px ${FONT}`;
  ctx.fillText('Stasis Cards', hx, 72);
  ctx.fillStyle = C.muted;
  ctx.font = `400 18px ${FONT}`;
  ctx.fillText(`${gameLabel(game)} inventory · ${fmtDate(today())}`, hx, 100);
  if (pages > 1) {
    ctx.textAlign = 'right';
    ctx.fillStyle = C.muted;
    ctx.font = `600 18px ${FONT}`;
    ctx.fillText(`Page ${page} of ${pages}`, W - PAD, 72);
    ctx.textAlign = 'left';
  }

  // Cards
  cards.forEach((c, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = PAD + col * (CELL_W + GAP);
    const y = HEADER_H + row * (IMG_H + TEXT_H + GAP);

    // A stack: two cards peeking out behind
    if (c.qty > 1) {
      for (const d of [8, 4]) {
        roundRect(ctx, x + d, y - d, CELL_W - d, IMG_H, 10);
        ctx.fillStyle = d === 8 ? '#dcd9d1' : '#e6e3dc';
        ctx.fill();
        ctx.strokeStyle = C.border;
        ctx.stroke();
      }
    }
    ctx.save();
    roundRect(ctx, x, y, CELL_W - (c.qty > 1 ? 8 : 0), IMG_H, 10);
    ctx.clip();
    ctx.fillStyle = C.slot;
    ctx.fillRect(x, y, CELL_W, IMG_H);
    const cw = CELL_W - (c.qty > 1 ? 8 : 0);
    if (pictures[i]) drawCover(ctx, pictures[i], x, y, cw, IMG_H);
    else if (logo) drawContain(ctx, logo, x + cw * 0.3, y + IMG_H * 0.35, cw * 0.4, IMG_H * 0.3);
    ctx.restore();
    roundRect(ctx, x + 0.5, y + 0.5, cw - 1, IMG_H - 1, 10);
    ctx.strokeStyle = C.border;
    ctx.stroke();
    if (c.qty > 1) {
      ctx.font = `700 20px ${FONT}`;
      const label = `×${c.qty}`;
      const bw = ctx.measureText(label).width + 20;
      roundRect(ctx, x + cw - bw - 8, y + 8, bw, 32, 16);
      ctx.fillStyle = C.text;
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + cw - bw + 2, y + 25);
      ctx.textBaseline = 'alphabetic';
    }

    const ty = y + IMG_H;
    ctx.fillStyle = C.text;
    ctx.font = `600 16px ${FONT}`;
    ctx.fillText(fit(ctx, c.name, CELL_W), x, ty + 24);
    ctx.fillStyle = C.muted;
    ctx.font = `400 13px ${FONT}`;
    ctx.fillText(fit(ctx, [c.setName, c.number].filter(Boolean).join(' · ') || ' ', CELL_W), x, ty + 44);

    // Condition or grade (+ JP), then the price on the right
    let px = x;
    if (c.graded?.company) px += pill(ctx, `${c.graded.company} ${c.graded.grade}`, px, ty + 58, C.gradedBg, C.graded) + 6;
    else px += pill(ctx, c.condition || 'NM', px, ty + 58, C.pillBg, C.muted) + 6;
    if (c.language === 'JP') pill(ctx, 'JP', px, ty + 58, C.pillBg, C.muted);
    ctx.fillStyle = C.accent;
    ctx.font = `700 22px ${FONT}`;
    ctx.textAlign = 'right';
    if (c.qty > 1 && c.price > 0) {
      ctx.fillText(dollars(c.price), x + CELL_W - 40, ty + 76);
      ctx.fillStyle = C.muted;
      ctx.font = `400 13px ${FONT}`;
      ctx.fillText('each', x + CELL_W, ty + 76);
    } else {
      ctx.fillText(dollars(c.price), x + CELL_W, ty + 76);
    }
    ctx.textAlign = 'left';
  });

  ctx.fillStyle = C.faint;
  ctx.font = `400 13px ${FONT}`;
  ctx.fillText('Market prices, rounded to the nearest dollar.', PAD, H - PAD - 18);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Couldn\'t make the picture.'))), 'image/png'));
}
