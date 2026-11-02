import { Router } from 'express';
import Card from '../models/Card.js';
import BinderEntry from '../models/BinderEntry.js';
import Settings from '../models/Settings.js';
import { ah, walletBalances, binderPool } from '../util.js';
import { GAMES, WALLETS, round2, today } from '../constants.js';

const r = Router();

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
  const [cards, binderEntries, settings, wallets, pool] = await Promise.all([
    Card.find().select('-priceHistory').lean(),
    BinderEntry.find().lean(),
    Settings.get(),
    walletBalances(),
    binderPool(),
  ]);

  const inStock = cards.filter((c) => c.status === 'in_stock');
  const sold = cards.filter((c) => c.status === 'sold');
  const binderSales = binderEntries.filter((e) => e.type === 'sell');

  // Unified list of realized sales (singles + binder lots)
  const sales = [
    ...sold.map((c) => ({
      kind: 'card', id: c._id, name: c.name, game: c.game, date: c.sale.date, boughtDate: c.boughtDate,
      revenue: c.sale.price, fees: c.sale.fees || 0, cost: c.cost, method: c.sale.method,
    })),
    ...binderSales.map((e) => ({
      kind: 'binder', id: e._id, name: `Binder x${e.count}`, game: 'Binder', date: e.date,
      revenue: e.amount, fees: 0, cost: e.costBasis, method: e.method,
    })),
  ].map((s) => ({ ...s, profit: round2(s.revenue - s.fees - s.cost) }));

  const revenue = round2(sales.reduce((a, s) => a + s.revenue, 0));
  const fees = round2(sales.reduce((a, s) => a + s.fees, 0));
  const cogs = round2(sales.reduce((a, s) => a + s.cost, 0));
  const profit = round2(revenue - fees - cogs);

  const inventoryCost = round2(inStock.reduce((a, c) => a + c.cost, 0));
  const inventoryMarket = round2(inStock.reduce((a, c) => a + (c.market?.price || 0), 0));
  const liquid = round2(WALLETS.reduce((a, w) => a + wallets[w], 0));
  const digital = round2(liquid - wallets.Cash);
  const netWorth = round2(liquid + inventoryMarket + pool.cost);
  const capital = settings.startingCapital;

  const holdDays = sold.map((c) => daysBetween(c.boughtDate, c.sale.date));
  const cardSales = sales.filter((s) => s.kind === 'card');
  const flipsByProfit = [...cardSales].sort((a, b) => b.profit - a.profit);

  const months = lastMonths(12);
  const monthly = months.map((m) => {
    const inMonth = sales.filter((s) => s.date?.startsWith(m));
    return {
      month: m,
      revenue: round2(inMonth.reduce((a, s) => a + s.revenue, 0)),
      profit: round2(inMonth.reduce((a, s) => a + s.profit, 0)),
      count: inMonth.length,
    };
  });

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

  const byMethod = WALLETS.map((w) => ({
    method: w,
    revenue: round2(sales.filter((s) => s.method === w).reduce((a, s) => a + s.revenue, 0)),
  }));

  const movers = inStock
    .filter((c) => c.cost > 0)
    .map((c) => ({ id: c._id, name: c.name, game: c.game, cost: c.cost, market: c.market?.price || 0, roiPct: pct((c.market?.price || 0) - c.cost, c.cost) }))
    .sort((a, b) => b.roiPct - a.roiPct);

  res.json({
    startingCapital: capital,
    roiPct: capital > 0 ? pct(netWorth - capital, capital) : null,
    netWorth,
    liquid,
    cash: wallets.Cash,
    digital,
    wallets,
    revenue,
    fees,
    cogs,
    profit,
    marginPct: pct(profit, cogs),
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
    avgPctOfMarketPaid: inStock.length
      ? Math.round((inStock.reduce((a, c) => a + (c.pctOfMarket || 0), 0) / inStock.length) * 10) / 10
      : null,
    bestFlip: flipsByProfit[0] || null,
    worstFlip: flipsByProfit.length > 1 ? flipsByProfit[flipsByProfit.length - 1] : null,
    topGainers: movers.slice(0, 3),
    topLosers: movers.slice(-3).reverse().filter((m) => m.roiPct < 0),
    monthly,
    byGame,
    byMethod,
    recentSales: [...sales].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 8),
    pricesUpdatedAt: settings.pricesUpdatedAt,
  });
}));

export default r;
