// Reads the old app's MongoDB exports (items, expenses, others) in the browser.
// Nothing here talks to the server; the Setup page sends only what you choose to keep.

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const day = (v) => {
  const raw = v && typeof v === 'object' && '$date' in v ? v.$date : v;
  if (!raw) return null;
  const d = new Date(typeof raw === 'object' && raw.$numberLong ? Number(raw.$numberLong) : raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};
const oid = (v) => (v && typeof v === 'object' && v.$oid ? v.$oid : String(v || ''));

// Which file is which, by what its records look like
export function identify(records) {
  const first = Array.isArray(records) ? records.find(Boolean) : null;
  if (!first) return null;
  if ('itemType' in first || 'purchasePrice' in first) return 'items';
  if ('category' in first) return 'expenses';
  if ('amount' in first) return 'others';
  return null;
}

// The old app didn't store the game; guess it from the set name
const RIFT = /^(origins?|ogn|ogs|spirit\s?forged|spirit|sfd|unleashed|vendetta|rift(bound)?)\b/i;
const OP = /^(op|st|eb|prb)[\s-]?\d+|one\s?piece/i;
export function inferGame(set) {
  const s = String(set || '').trim();
  if (RIFT.test(s)) return 'Riftbound';
  if (OP.test(s)) return 'One Piece';
  return 'Pokemon';
}

const CONDITION = { NM: 'NM', LP: 'LP', MP: 'MP', HP: 'HP', D: 'DMG', DMG: 'DMG' };
const PAYMENT = { Cash: 'Cash', 'Digital - Owen': 'Venmowen', 'Digital - Ben': 'Benmo' };
const isBox = (name) => /box|bundle|booster|\betb\b/i.test(name || '');

// Cards and slabs the old system still has in stock -> rows for the checklist
export function unsoldCards(items) {
  return items
    .filter((i) => i.itemType !== 'Sealed' && (i.soldPrice === null || i.soldPrice === undefined))
    .map((i) => {
      const slab = i.itemType === 'Slab';
      return {
        oldId: oid(i._id),
        name: String(i.name || '').trim(),
        number: String(i.number || '').trim(),
        setName: String(i.set || '').trim(),
        game: inferGame(i.set),
        condition: CONDITION[i.condition] || 'NM',
        graded: slab ? { company: String(i.company || '').trim().toUpperCase(), grade: String(i.grade || '').trim() } : null,
        cost: r2(i.purchasePrice || 0),
        boughtDate: day(i.purchaseDate),
        notes: i.notes || '',
      };
    })
    .sort((a, b) => (a.boughtDate || '').localeCompare(b.boughtDate || ''));
}

// Everything the old system recorded, summarized for the "Year 1" section
export function yearOneSummary({ items = [], expenses = [], others = [] }, startDate) {
  const monthly = new Map();
  const bump = (date, amount) => {
    if (!date || !amount) return;
    const m = date.slice(0, 7);
    monthly.set(m, r2((monthly.get(m) || 0) + amount));
  };
  const dates = [];

  // Singles and slabs
  const cardsSold = items.filter((i) => i.itemType !== 'Sealed' && i.soldPrice !== null && i.soldPrice !== undefined);
  const flips = cardsSold.map((i) => ({ name: String(i.name || '').trim(), profit: r2(i.soldPrice - (i.purchasePrice || 0)) }));
  const byGame = {};
  const payments = { Cash: 0, Venmowen: 0, Benmo: 0 };
  for (const i of cardsSold) {
    const g = inferGame(i.set);
    byGame[g] = byGame[g] || { game: g, sold: 0, revenue: 0, profit: 0 };
    byGame[g].sold += 1;
    byGame[g].revenue = r2(byGame[g].revenue + i.soldPrice);
    byGame[g].profit = r2(byGame[g].profit + i.soldPrice - (i.purchasePrice || 0));
    const w = PAYMENT[i.paymentMethod] || 'Cash';
    payments[w] = r2(payments[w] + i.soldPrice);
    bump(day(i.soldDate), i.soldPrice - (i.purchasePrice || 0));
    dates.push(day(i.soldDate), day(i.purchaseDate));
  }
  const cards = {
    sold: cardsSold.length,
    revenue: r2(cardsSold.reduce((a, i) => a + i.soldPrice, 0)),
    cost: r2(cardsSold.reduce((a, i) => a + (i.purchasePrice || 0), 0)),
  };
  cards.profit = r2(cards.revenue - cards.cost);
  flips.sort((a, b) => b.profit - a.profit);
  cards.best = flips[0] || null;
  cards.worst = flips.length > 1 ? flips[flips.length - 1] : null;

  // Binder: buys were logged as "Binder" expenses, sales as "[Binder Sale]" other income
  const binderBuys = expenses.filter((e) => e.category === 'Binder');
  const binderSales = others.filter((o) => String(o.name || '').startsWith('[Binder Sale]'));
  const binder = {
    spent: r2(binderBuys.reduce((a, e) => a + e.amount, 0)),
    revenue: r2(binderSales.reduce((a, o) => a + o.amount, 0)),
    sales: binderSales.length,
  };
  binder.net = r2(binder.revenue - binder.spent);
  binderBuys.forEach((e) => { bump(day(e.date), -e.amount); dates.push(day(e.date)); });
  binderSales.forEach((o) => { bump(day(o.date), o.amount); dates.push(day(o.date)); });

  // Sealed: boxes/bundles (as items or as expenses) and pack sales (other income that isn't binder)
  const sealedItems = items.filter((i) => i.itemType === 'Sealed');
  const boxExpenses = expenses.filter((e) => e.category !== 'Binder' && isBox(e.name));
  const packSales = others.filter((o) => !String(o.name || '').startsWith('[Binder Sale]'));
  const sealed = {
    spent: r2(sealedItems.reduce((a, i) => a + (i.purchasePrice || 0), 0) + boxExpenses.reduce((a, e) => a + e.amount, 0)),
    revenue: r2(sealedItems.reduce((a, i) => a + (i.soldPrice || 0), 0) + packSales.reduce((a, o) => a + o.amount, 0)),
    boxes: sealedItems.length + boxExpenses.length,
  };
  sealed.net = r2(sealed.revenue - sealed.spent);
  sealedItems.forEach((i) => { bump(day(i.purchaseDate), -(i.purchasePrice || 0)); bump(day(i.soldDate), i.soldPrice || 0); });
  boxExpenses.forEach((e) => { bump(day(e.date), -e.amount); dates.push(day(e.date)); });
  packSales.forEach((o) => { bump(day(o.date), o.amount); dates.push(day(o.date)); });

  // Everything else that was an expense (tables, supplies, one-offs)
  const otherExpenses = expenses.filter((e) => e.category !== 'Binder' && !isBox(e.name));
  const groups = {};
  otherExpenses.forEach((e) => {
    const k = /table|ccs|ccf|lone\s?tree/i.test(e.name) ? 'Show tables' : /top\s?loader|bin|sleeve/i.test(e.name) ? 'Supplies' : 'Other';
    groups[k] = r2((groups[k] || 0) + e.amount);
    bump(day(e.date), -e.amount);
    dates.push(day(e.date));
  });
  const expenseTotal = r2(otherExpenses.reduce((a, e) => a + e.amount, 0));

  const stillInStock = items.filter((i) => i.itemType !== 'Sealed' && (i.soldPrice === null || i.soldPrice === undefined));
  const known = dates.filter(Boolean).sort();

  return {
    label: 'Year 1 (old system)',
    from: known[0] || null,
    to: startDate || known[known.length - 1] || null,
    lastRecord: known[known.length - 1] || null,
    totals: {
      revenue: r2(cards.revenue + binder.revenue + sealed.revenue),
      profit: r2(cards.profit + binder.net + sealed.net - expenseTotal),
    },
    cards,
    binder,
    sealed,
    expenses: { total: expenseTotal, groups },
    byGame: Object.values(byGame).sort((a, b) => b.profit - a.profit),
    payments,
    monthly: [...monthly].sort(([a], [b]) => a.localeCompare(b)).map(([month, profit]) => ({ month, profit })),
    stockAtEnd: { count: stillInStock.length, cost: r2(stillInStock.reduce((a, i) => a + (i.purchasePrice || 0), 0)) },
    note: 'As recorded in the old system. Binder card counts and some payment methods were not tracked; blank methods count as Cash.',
  };
}
