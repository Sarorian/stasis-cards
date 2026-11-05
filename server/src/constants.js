export const GAMES = ['Pokemon', 'One Piece', 'Riftbound', 'Misc'];
export const WALLETS = ['Cash', 'Venmowen', 'Benmo', 'Zelle'];
export const CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DMG'];
export const GRADERS = ['PSA', 'CGC', 'BGS', 'TAG'];
// The two partners the business can owe money to
export const PARTNERS = ['Owen', 'Ben'];
// Paying for a purchase with a partner's own money (adds to what the business owes them)
export const DEBT_METHODS = PARTNERS.map((p) => `${p} (debt)`);
export const debtPerson = (method) => PARTNERS.find((p) => method === `${p} (debt)`) || null;
// Card language. Japanese Pokemon has its own price catalog; other Japanese cards are priced by hand.
export const LANGUAGES = ['EN', 'JP'];

// Business dates are recorded at a fixed UTC-7 offset.
export const TZ_OFFSET_HOURS = -7;

export function today() {
  return new Date(Date.now() + TZ_OFFSET_HOURS * 3600e3).toISOString().slice(0, 10);
}

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Binder buys saved before market values were entered count as bought at 80% of market
export const binderMarketOf = (entry) => (entry.market != null ? entry.market : round2(entry.amount / 0.8));
