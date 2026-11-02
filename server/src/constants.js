export const GAMES = ['Pokemon', 'One Piece', 'Riftbound', 'Misc'];
export const WALLETS = ['Cash', 'Venmowen', 'Benmo', 'Zelle'];
export const CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DMG'];
export const GRADERS = ['PSA', 'CGC', 'BGS', 'TAG'];

// Business dates are recorded at a fixed UTC-7 offset.
export const TZ_OFFSET_HOURS = -7;

export function today() {
  return new Date(Date.now() + TZ_OFFSET_HOURS * 3600e3).toISOString().slice(0, 10);
}

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
