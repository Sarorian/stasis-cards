import { Router } from 'express';
import Card from '../models/Card.js';
import BinderEntry from '../models/BinderEntry.js';
import Settings from '../models/Settings.js';
import MiscItem from '../models/MiscItem.js';
import DebtEntry from '../models/DebtEntry.js';
import { balances as debtBalances } from './debt.js';
import MiscEntry from '../models/MiscEntry.js';
import { summarize as summarizeMisc } from './misc.js';
import { recordSnapshot, snapshotHistory } from '../snapshots.js';
import { ah, walletBalances, binderPool, paymentLabel } from '../util.js';
import { GAMES, WALLETS, PARTNERS, round2, today } from '../constants.js';

const r = Router();

// Dashboard category for sealed product and other misc items
const MISC_CAT = 'Sealed & misc';

const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);

function lastMonths(n) {
  const [y, m] = today().split('-').map(Number);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

r.get('/', ah(async (req, res) => {
  const [cards, binderEntries, settings, wallets, pool, miscItemsRaw, miscEntries, debtEntries] = await Promise.all([
    // Cards moved into the binder count as binder cards (their cost is in the binder pool)
    Card.find({ status: { $ne: 'binder' } }).select('-priceHistory').lean(),
    BinderEntry.find().lean(),
    Settings.get(),
    walletBalances(),
    binderPool(),
    MiscItem.find().lean(),
    MiscEntry.find().lean(),
    DebtEntry.find().lean(),
  ]);
  const miscById = new Map(miscItemsRaw.map((i) => [String(i._id), i]));
  const miscItems = miscItemsRaw.map((i) => summarizeMisc(i, miscEntries.filter((e) => String(e.item) === String(i._id))));

  const inStock = cards.filter((c) => c.status === 'in_stock');
  const sold = cards.filter((c) => c.status === 'sold');
  const binderSales = binderEntries.filter((e) => e.type === 'sell');

  // Unified list of realized sales (singles + binder lots)
  const sales = [
    ...sold.map((c) => ({
      kind: 'card', id: c._id, name: c.name, game: c.game, date: c.sale.date, boughtDate: c.boughtDate,
      revenue: c.sale.price, fees: c.sale.fees || 0, cost: c.cost, method: c.sale.method || (c.sale.trade ? 'Trade' : c.sale.debt ? 'Debt cleanse' : null),
      payments: c.sale.payments?.length ? c.sale.payments : null,
    })),
    ...binderSales.map((e) => ({
      kind: 'binder', id: e._id, name: `Binder x${e.count}`, game: 'Binder', date: e.date,
      revenue: e.amount, fees: 0, cost: e.costBasis, method: e.method,
    })),
    // Sealed/misc: sales, and packs opened ourselves (written off: no revenue, cost = loss)
    ...miscEntries.map((e) => {
      const item = miscById.get(String(e.item)) || { name: 'Misc item', unitLabel: 'units' };
      return {
        kind: 'misc', id: e._id, game: MISC_CAT, date: e.date,
        name: e.type === 'open' ? `Opened ${e.units} ${item.unitLabel} · ${item.name}` : `${item.name} ×${e.units}`,
        revenue: e.type === 'sell' ? e.amount : 0, fees: e.fees || 0, cost: e.costBasis,
        method: e.type === 'sell' ? e.method : 'Opened',
      };
    }),
  ].map((s) => ({ ...s, profit: round2(s.revenue - s.fees - s.cost) }));

  const revenue = round2(sales.reduce((a, s) => a + s.revenue, 0));
  const fees = round2(sales.reduce((a, s) => a + s.fees, 0));
  const cogs = round2(sales.reduce((a, s) => a + s.cost, 0));
  const salesProfit = round2(revenue - fees - cogs);
  // Business costs Owen/Ben paid personally (shows, gas, food) are expenses
  const expenseEntries = debtEntries.filter((e) => e.type === 'add' && e.how === 'expense');
  const expenses = round2(expenseEntries.reduce((a, e) => a + e.amount, 0));
  const profit = round2(salesProfit - expenses);
  // Money the business owes its partners is a liability
  const debtByPerson = debtBalances(debtEntries);
  const debtTotal = round2(PARTNERS.reduce((a, p) => a + debtByPerson[p].owed, 0));

  const inventoryCost = round2(inStock.reduce((a, c) => a + c.cost, 0));
  const inventoryMarket = round2(inStock.reduce((a, c) => a + (c.market?.price || 0), 0));
  const liquid = round2(WALLETS.reduce((a, w) => a + wallets[w], 0));
  const digital = round2(liquid - wallets.Cash);
  const miscLeftCost = round2(miscItems.reduce((a, i) => a + i.remainingCost, 0));
  // Binder cards count at their estimated market value (entered with each buy / re-estimate)
  const binderValue = pool.value;
  const netWorth = round2(liquid + inventoryMarket + binderValue + miscLeftCost - debtTotal);
  const capital = settings.startingCapital;
  const totalSpent = round2(
    cards.reduce((a, c) => a + (c.cost || 0), 0) +
    binderEntries.filter((e) => e.type === 'buy').reduce((a, e) => a + e.amount, 0) +
    miscItems.reduce((a, i) => a + i.cost, 0) +
    expenses
  );

  const holdDays = sold.map((c) => daysBetween(c.boughtDate, c.sale.date));
  const cardSales = sales.filter((s) => s.kind === 'card');
  const flipsByProfit = [...cardSales].sort((a, b) => b.profit - a.profit);

  const months = lastMonths(12);
  const sum = (list, f) => round2(list.reduce((a, x) => a + f(x), 0));
  const monthly = months.map((m) => {
    const inMonth = sales.filter((s) => s.date?.startsWith(m));
    const monthExpenses = sum(expenseEntries.filter((e) => e.date?.startsWith(m)), (e) => e.amount);
    // Same numbers split by game, with binder lots under "Binder"
    const byCat = Object.fromEntries([...GAMES, 'Binder', MISC_CAT].map((g) => {
      const list = inMonth.filter((s) => s.game === g);
      return [g, { revenue: sum(list, (s) => s.revenue), profit: sum(list, (s) => s.profit), count: list.length }];
    }));
    return {
      month: m,
      revenue: sum(inMonth, (s) => s.revenue),
      profit: round2(sum(inMonth, (s) => s.profit) - monthExpenses), // after expenses
      expenses: monthExpenses,
      count: inMonth.length,
      byCat,
    };
  });

  // ---- Year 2: day by day since the start date (sales + binder + sealed, minus expenses) ----
  const sinceStart = (() => {
    const start = settings.startDate;
    if (!start) return null;
    const end = today();
    const byDay = new Map();
    const add = (date, revenue, profit) => {
      if (!date || date < start || date > end) return;
      const d = byDay.get(date) || { revenue: 0, profit: 0 };
      d.revenue += revenue;
      d.profit += profit;
      byDay.set(date, d);
    };
    sales.forEach((s) => add(s.date, s.revenue, s.profit));
    expenseEntries.forEach((e) => add(e.date, 0, -e.amount));
    const days = [];
    for (let t = new Date(`${start}T12:00:00Z`); t.toISOString().slice(0, 10) <= end; t = new Date(t.getTime() + 864e5)) {
      const date = t.toISOString().slice(0, 10);
      const d = byDay.get(date) || { revenue: 0, profit: 0 };
      days.push({ date, revenue: round2(d.revenue), profit: round2(d.profit) });
    }
    return { start, days };
  })();

  // ---- Performance per game ----
  const games = GAMES.map((g) => {
    const all = cards.filter((c) => c.game === g);
    const stock = inStock.filter((c) => c.game === g);
    const soldCards = sold.filter((c) => c.game === g);
    const gs = cardSales.filter((s) => s.game === g);
    const gRevenue = sum(gs, (s) => s.revenue);
    const gFees = sum(gs, (s) => s.fees);
    const gCogs = sum(gs, (s) => s.cost);
    const gProfit = round2(gRevenue - gFees - gCogs);
    const stockCost = sum(stock, (c) => c.cost);
    const stockMarket = sum(stock, (c) => c.market?.price || 0);
    const unrealized = round2(stockMarket - stockCost);
    const spent = sum(all, (c) => c.cost);
    const days = soldCards.map((c) => daysBetween(c.boughtDate, c.sale.date));
    const flips = [...gs].sort((a, b) => b.profit - a.profit);
    const pctPaid = all.filter((c) => c.pctOfMarket > 0 && !c.opening);
    return {
      game: g,
      cardsEver: all.length,
      spent,
      revenue: gRevenue,
      fees: gFees,
      cogs: gCogs,
      profit: gProfit,
      marginPct: pct(gProfit, gCogs),
      soldCount: gs.length,
      tradedAway: soldCards.filter((c) => c.sale?.trade).length,
      tradedIn: all.filter((c) => c.tradeIn).length,
      inStock: { count: stock.length, cost: stockCost, market: stockMarket, unrealized, unrealizedPct: pct(unrealized, stockCost) },
      // Realized + unrealized, against everything ever spent on this game
      roiPct: pct(gProfit + unrealized, spent),
      avgDaysToSell: days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null,
      avgPctOfMarketPaid: pctPaid.length ? Math.round((pctPaid.reduce((a, c) => a + c.pctOfMarket, 0) / pctPaid.length) * 10) / 10 : null,
      bestFlip: flips[0] ? { name: flips[0].name, profit: flips[0].profit } : null,
      worstFlip: flips.length > 1 ? { name: flips[flips.length - 1].name, profit: flips[flips.length - 1].profit } : null,
    };
  });

  // ---- Binder performance ----
  const bBuys = binderEntries.filter((e) => e.type === 'buy');
  const bSells = binderSales;
  const bBoughtCount = bBuys.reduce((a, e) => a + e.count, 0);
  const bSoldCount = bSells.reduce((a, e) => a + e.count, 0);
  const bBoughtCost = sum(bBuys, (e) => e.amount);
  const bRevenue = sum(bSells, (e) => e.amount);
  const bCogs = sum(bSells, (e) => e.costBasis || 0);
  const bProfit = round2(bRevenue - bCogs);
  const binderStats = {
    boughtCount: bBoughtCount,
    boughtCost: bBoughtCost,
    soldCount: bSoldCount,
    revenue: bRevenue,
    cogs: bCogs,
    profit: bProfit,
    marginPct: pct(bProfit, bCogs),
    avgSellPrice: bSoldCount ? round2(bRevenue / bSoldCount) : null,
    avgCost: bBoughtCount ? round2(bBoughtCost / bBoughtCount) : null,
    // Profit per binder card sold
    profitPerCard: bSoldCount ? round2(bProfit / bSoldCount) : null,
    sellThroughPct: pct(bSoldCount, bBoughtCount),
    lots: { buys: bBuys.length, sells: bSells.length },
    tradedIn: bBuys.filter((e) => e.method === 'Trade').reduce((a, e) => a + e.count, 0),
    tradedOut: bSells.filter((e) => e.method === 'Trade').reduce((a, e) => a + e.count, 0),
    pool,
    value: pool.value,
    valuedAt: pool.valuedAt,
  };

  // ---- Sealed & misc performance ----
  const mSum = (f) => round2(miscItems.reduce((a, i) => a + f(i), 0));
  const mProfit = mSum((i) => i.profit);
  const mCostOut = mSum((i) => i.cogs + i.writtenOff);
  const miscStats = {
    category: MISC_CAT,
    items: miscItems.length,
    spent: mSum((i) => i.cost),
    revenue: mSum((i) => i.revenue),
    fees: mSum((i) => i.fees),
    cogs: mSum((i) => i.cogs),
    writtenOff: mSum((i) => i.writtenOff),
    profit: mProfit,
    marginPct: pct(mProfit, mCostOut),
    unitsBought: miscItems.reduce((a, i) => a + i.units, 0),
    unitsSold: miscItems.reduce((a, i) => a + i.sold, 0),
    unitsOpened: miscItems.reduce((a, i) => a + i.opened, 0),
    inStock: {
      items: miscItems.filter((i) => i.remaining > 0).length,
      units: miscItems.reduce((a, i) => a + i.remaining, 0),
      cost: miscLeftCost,
    },
    topItems: [...miscItems].filter((i) => i.sold + i.opened > 0).sort((a, b) => b.profit - a.profit).slice(0, 3)
      .map((i) => ({ name: i.name, profit: i.profit, remaining: i.remaining, unitLabel: i.unitLabel })),
  };

  const byGame = GAMES.map((g) => {
    const stock = inStock.filter((c) => c.game === g);
    const gs = sales.filter((s) => s.game === g);
    return {
      game: g,
      inStock: stock.length,
      cost: round2(stock.reduce((a, c) => a + c.cost, 0)),
      market: round2(stock.reduce((a, c) => a + (c.market?.price || 0), 0)),
      soldCount: gs.length,
      profit: round2(gs.reduce((a, s) => a + s.profit, 0)),
    };
  });

  // "Trade" = value of cards that left in trades (the cash part of a trade is in the wallets)
  const byMethod = [...WALLETS, 'Trade', 'Debt cleanse'].map((w) => ({
    method: w,
    // Split sales count each wallet's share
    revenue: round2(sales.reduce((a, s) => a + (s.payments
      ? s.payments.filter((p) => p.method === w).reduce((x, p) => x + p.amount, 0)
      : s.method === w ? s.revenue : 0), 0)),
  }));

  const movers = inStock
    .filter((c) => c.cost > 0)
    .map((c) => ({ id: c._id, name: c.name, game: c.game, cost: c.cost, market: c.market?.price || 0, roiPct: pct((c.market?.price || 0) - c.cost, c.cost) }))
    .sort((a, b) => b.roiPct - a.roiPct);

  // Keep today's inventory value saved, then send the history for the chart
  await recordSnapshot({ count: inStock.length, market: inventoryMarket, cost: inventoryCost, binderCost: pool.cost, binderValue, sealedCost: miscLeftCost }).catch(() => {});
  const inventoryHistory = await snapshotHistory();

  res.json({
    inventoryHistory,
    startingCapital: capital,
    startDate: settings.startDate,
    sinceStart,
    yearOne: settings.yearOne,
    openingCards: inStock.filter((c) => c.opening).length,
    // ROI = what we've made (realized + unrealized) vs everything we've spent on cards and binder lots
    // realized profit + unrealized gain (cards, plus the binder's estimated gain) vs everything spent
    roiPct: pct(profit + (inventoryMarket - inventoryCost) + (binderValue - pool.cost), totalSpent),
    binderValue,
    // Inventory including the binder at its estimated value
    inventoryTotal: {
      market: round2(inventoryMarket + binderValue),
      cost: round2(inventoryCost + pool.cost),
      unrealized: round2(inventoryMarket - inventoryCost + binderValue - pool.cost),
      unrealizedPct: pct(inventoryMarket - inventoryCost + binderValue - pool.cost, inventoryCost + pool.cost),
    },
    totalSpent,
    netWorth,
    liquid,
    cash: wallets.Cash,
    digital,
    wallets,
    revenue,
    fees,
    cogs,
    profit,
    salesProfit,
    expenses,
    marginPct: pct(profit, cogs),
    debt: {
      total: debtTotal,
      people: PARTNERS.map((p) => ({ person: p, owed: debtByPerson[p].owed })),
    },
    inventory: {
      count: inStock.length,
      cost: inventoryCost,
      market: inventoryMarket,
      unrealized: round2(inventoryMarket - inventoryCost),
      unrealizedPct: pct(inventoryMarket - inventoryCost, inventoryCost),
    },
    binder: pool,
    soldCount: sales.length,
    avgDaysToSell: holdDays.length ? Math.round(holdDays.reduce((a, b) => a + b, 0) / holdDays.length) : null,
    // Starting inventory has guessed or unknown market-at-purchase, so it's left out
    avgPctOfMarketPaid: (() => {
      const list = inStock.filter((c) => c.pctOfMarket > 0 && !c.opening);
      return list.length ? Math.round((list.reduce((a, c) => a + c.pctOfMarket, 0) / list.length) * 10) / 10 : null;
    })(),
    bestFlip: flipsByProfit[0] || null,
    worstFlip: flipsByProfit.length > 1 ? flipsByProfit[flipsByProfit.length - 1] : null,
    topGainers: movers.slice(0, 3),
    topLosers: movers.slice(-3).reverse().filter((m) => m.roiPct < 0),
    monthly,
    byGame,
    games,
    binderStats,
    miscStats,
    byMethod,
    recentSales: [...sales].map((s) => (s.payments ? { ...s, method: paymentLabel(s.payments) } : s)).sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 8),
    pricesUpdatedAt: settings.pricesUpdatedAt,
  });
}));

export default r;
