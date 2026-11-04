import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { money, pct, tone, fmtDate } from '../format.js';
import StatCard from '../components/StatCard.jsx';
import PriceUpdateButton from '../components/PriceUpdateButton.jsx';
import MonthlyChart from '../components/MonthlyChart.jsx';
import WalletsPanel from '../components/WalletsPanel.jsx';
import GamePerformance from '../components/GamePerformance.jsx';
import { YearOneFigures } from './Setup.jsx';
import RevenueProfitChart from '../components/RevenueProfitChart.jsx';
import ManualPrices from '../components/ManualPrices.jsx';
import InventoryValueChart from '../components/InventoryValueChart.jsx';
import { GAMES } from '../format.js';

export default function Dashboard() {
  const [s, setS] = useState(null);
  const [error, setError] = useState('');
  const [chartCat, setChartCat] = useState('All');
  const [showManual, setShowManual] = useState(false);
  const [manualWaiting, setManualWaiting] = useState(0);
  const loadManualCount = useCallback(() => {
    api.manualPrices().then((l) => setManualWaiting(l.filter((c) => c.needed).length)).catch(() => {});
  }, []);
  useEffect(loadManualCount, [loadManualCount]);

  const load = useCallback(() => {
    api.stats().then(setS).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  if (error) return <div className="toast">{error}</div>;
  if (!s) return <p className="hint">Loading…</p>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          {s.startDate
            ? <span className="hint">Tracking since {fmtDate(s.startDate)}{s.openingCards ? ` · ${s.openingCards} starting-inventory cards` : ''}</span>
            : <Link to="/setup" className="hint">Moving from the old system? Do the starting setup</Link>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <PriceUpdateButton lastUpdated={s.pricesUpdatedAt} onDone={() => { load(); loadManualCount(); setShowManual(true); }} />
          <button className="small" onClick={() => setShowManual(!showManual)} aria-expanded={showManual}>
            Prices to enter{manualWaiting ? ` (${manualWaiting})` : ''}
          </button>
        </div>
      </div>

      <div className="grid stats">
        <StatCard hero label="ROI" value={pct(s.roiPct)} tone={tone(s.roiPct)} sub={s.totalSpent > 0 ? `made vs ${money(s.totalSpent)} spent` : 'buy something to see ROI'} />
        <StatCard hero label="Liquid total" value={money(s.liquid)} sub={`${money(s.cash)} cash · ${money(s.digital)} digital`} />
        <StatCard hero label="Net profit" value={money(s.profit)} tone={tone(s.profit)} sub={s.expenses > 0 ? `after ${money(s.expenses)} expenses · ${pct(s.marginPct)} margin` : `${pct(s.marginPct)} margin on cost`} />
        <StatCard hero label="Net worth" value={money(s.netWorth)} sub={s.debt.total > 0 ? `liquid + stock − ${money(s.debt.total)} debt` : 'liquid + inventory + binder + sealed'} />
        <Link to="/debt" className="stat-link">
          <StatCard label="Debt owed" value={money(s.debt.total)} tone={s.debt.total > 0 ? 'neg' : ''} sub={s.debt.people.map((p) => `${p.person} ${money(p.owed)}`).join(' · ')} />
        </Link>
        <StatCard label="Expenses" value={money(s.expenses)} sub="paid by Owen/Ben (shows, gas, food)" />
        <StatCard label="Revenue" value={money(s.revenue)} sub={`${s.soldCount} sales${s.fees ? ` · ${money(s.fees)} fees` : ''}`} />
        <StatCard label="Inventory at market" value={money(s.inventory.market)} sub={`${s.inventory.count} cards · cost ${money(s.inventory.cost)}`} />
        <StatCard label="Unrealized gain" value={money(s.inventory.unrealized)} tone={tone(s.inventory.unrealized)} sub={pct(s.inventory.unrealizedPct)} />
        <StatCard label="Binder cards" value={s.binder.count} sub={`cost ${money(s.binder.cost)} · ${money(s.binder.avgCost)} each`} />
        <StatCard label="Avg days to sell" value={s.avgDaysToSell ?? '—'} />
        <StatCard label="Avg % of market paid" value={s.avgPctOfMarketPaid !== null ? `${s.avgPctOfMarketPaid}%` : '—'} sub="cards in stock" />
        <StatCard label="Best flip" value={s.bestFlip ? money(s.bestFlip.profit) : '—'} tone={tone(s.bestFlip?.profit)} sub={s.bestFlip?.name} />
        <StatCard label="Worst flip" value={s.worstFlip ? money(s.worstFlip.profit) : '—'} tone={tone(s.worstFlip?.profit)} sub={s.worstFlip?.name} />
      </div>

      {showManual && <ManualPrices onSaved={() => { load(); loadManualCount(); }} onClose={() => setShowManual(false)} />}

      <WalletsPanel wallets={s.wallets} onChange={load} />

      {s.inventoryHistory?.length > 0 && (() => {
        const first = s.inventoryHistory[0];
        const lastSnap = s.inventoryHistory[s.inventoryHistory.length - 1];
        const change = Math.round((lastSnap.market - first.market) * 100) / 100;
        return (
          <div className="panel">
            <div className="panel-head">
              <h2>Inventory value</h2>
              <span className="hint">
                {money(lastSnap.market)} market · {money(lastSnap.cost)} cost
                {s.inventoryHistory.length > 1 && <> · <span className={tone(change)}>{change >= 0 ? '+' : ''}{money(change)}</span> since {fmtDate(first.date)}</>}
              </span>
            </div>
            <InventoryValueChart history={s.inventoryHistory} />
          </div>
        );
      })()}

      {s.sinceStart && (
        <div className="panel">
          <div className="panel-head">
            <h2>Year 2 so far</h2>
            <span className="hint">
              {money(s.sinceStart.days.reduce((a, d) => a + d.revenue, 0))} revenue · {money(s.sinceStart.days.reduce((a, d) => a + d.profit, 0))} profit (after expenses)
            </span>
          </div>
          <RevenueProfitChart days={s.sinceStart.days} />
        </div>
      )}

      <div className="panel">
        <div className="panel-head"><h2>Performance by game</h2><span className="hint">trades count at their trade value</span></div>
        <GamePerformance games={s.games} binder={s.binderStats} misc={s.miscStats} />
      </div>

      <div className="grid two-col">
        <div className="panel">
          <div className="panel-head"><h2>Profit by month</h2><span className="hint">by sale date</span></div>
          <div className="chips" role="group" aria-label="Show profit for">
            {['All', ...GAMES, 'Binder', 'Sealed & misc'].map((c) => (
              <button key={c} type="button" className={`chip${chartCat === c ? ' on' : ''}`} aria-pressed={chartCat === c} onClick={() => setChartCat(c)}>{c}</button>
            ))}
          </div>
          <MonthlyChart months={s.monthly} category={chartCat} />
        </div>
        <div className="panel">
          <div className="panel-head"><h2>Recent sales</h2><Link to="/inventory?view=sold" className="hint">See all</Link></div>
          {s.recentSales.length === 0 && <p className="hint">Sales show up here once you sell something.</p>}
          {s.recentSales.map((x) => (
            <div className="list-row" key={x.kind + x.id}>
              <span>
                {x.name} <span className="faint">· {x.method} · {fmtDate(x.date)}</span>
              </span>
              <span className={tone(x.profit)}>{money(x.revenue)} ({money(x.profit)})</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid two-col">
        <div className="panel">
          <div className="panel-head"><h2>Movers in inventory</h2></div>
          {s.topGainers.length === 0 && <p className="hint">Add cards to see which are up or down.</p>}
          {[...s.topGainers, ...s.topLosers.filter((l) => !s.topGainers.some((g) => g.id === l.id))].map((m) => (
            <div className="list-row" key={m.id}>
              <span>{m.name} <span className="faint">· {money(m.cost)} → {money(m.market)}</span></span>
              <span className={tone(m.roiPct)}>{pct(m.roiPct)}</span>
            </div>
          ))}
        </div>
        <div className="panel">
          <div className="panel-head"><h2>Revenue by payment method</h2><span className="hint">Trade = value of cards traded away</span></div>
          {s.byMethod.map((m) => (
            <div className="list-row" key={m.method}><span>{m.method}</span><span>{money(m.revenue)}</span></div>
          ))}
        </div>
      </div>

      {s.yearOne && (
        <div className="panel year-one">
          <div className="panel-head">
            <h2>{s.yearOne.label}</h2>
            <span className="hint">kept separate · not part of the numbers above</span>
          </div>
          <YearOneFigures y={s.yearOne} />
          <div className="grid two-col" style={{ marginTop: 14 }}>
            <div>
              <div className="panel-head"><h3>Card profit by game</h3></div>
              {s.yearOne.byGame.map((g) => (
                <div className="list-row" key={g.game}><span>{g.game} <span className="faint">· {g.sold} sold · {money(g.revenue)}</span></span><span className={tone(g.profit)}>{money(g.profit)}</span></div>
              ))}
            </div>
            <div>
              <div className="panel-head"><h3>Net by month</h3><span className="hint">cards, binder, sealed, expenses</span></div>
              <MonthlyChart months={s.yearOne.monthly.map((m) => ({ ...m, count: 1, revenue: 0 }))} />
            </div>
          </div>
          <div className="faint" style={{ marginTop: 8 }}>{s.yearOne.note}</div>
        </div>
      )}
    </>
  );
}
