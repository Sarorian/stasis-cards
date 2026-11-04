import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { money, pct, tone, fmtDate, GAMES } from '../format.js';
import StatCard from '../components/StatCard.jsx';
import MonthlyChart from '../components/MonthlyChart.jsx';
import GamePerformance from '../components/GamePerformance.jsx';
import RevenueProfitChart from '../components/RevenueProfitChart.jsx';
import InventoryValueChart from '../components/InventoryValueChart.jsx';
import { YearOneFigures } from './Setup.jsx';

// Charts and deeper numbers (the Dashboard keeps just the essentials)
export default function Insights() {
  const [s, setS] = useState(null);
  const [error, setError] = useState('');
  const [chartCat, setChartCat] = useState('All');
  const load = useCallback(() => { api.stats().then(setS).catch((e) => setError(e.message)); }, []);
  useEffect(load, [load]);

  if (error) return <div className="toast">{error}</div>;
  if (!s) return <p className="hint">Loading…</p>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Insights</h1>
          {s.startDate && <span className="hint">Tracking since {fmtDate(s.startDate)}</span>}
        </div>
      </div>

      <div className="grid stats">
        <StatCard label="Revenue" value={money(s.revenue)} sub={`${s.soldCount} sales${s.fees ? ` · ${money(s.fees)} fees` : ''}`} />
        <StatCard label="Unrealized gain" value={money(s.inventory.unrealized)} tone={tone(s.inventory.unrealized)} sub={pct(s.inventory.unrealizedPct)} />
        <StatCard label="Expenses" value={money(s.expenses)} sub="paid by Owen/Ben (shows, gas, food)" />
        <StatCard label="Binder cards" value={s.binder.count} sub={`cost ${money(s.binder.cost)} · ${money(s.binder.avgCost)} each`} />
        <StatCard label="Avg days to sell" value={s.avgDaysToSell ?? '—'} />
        <StatCard label="Avg % of market paid" value={s.avgPctOfMarketPaid !== null ? `${s.avgPctOfMarketPaid}%` : '—'} sub="cards in stock" />
        <StatCard label="Best flip" value={s.bestFlip ? money(s.bestFlip.profit) : '—'} tone={tone(s.bestFlip?.profit)} sub={s.bestFlip?.name} />
        <StatCard label="Worst flip" value={s.worstFlip ? money(s.worstFlip.profit) : '—'} tone={tone(s.worstFlip?.profit)} sub={s.worstFlip?.name} />
      </div>

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
          <div className="panel-head"><h2>Movers in inventory</h2></div>
          {s.topGainers.length === 0 && <p className="hint">Add cards to see which are up or down.</p>}
          {[...s.topGainers, ...s.topLosers.filter((l) => !s.topGainers.some((g) => g.id === l.id))].map((m) => (
            <div className="list-row" key={m.id}>
              <span>{m.name} <span className="faint">· {money(m.cost)} → {money(m.market)}</span></span>
              <span className={tone(m.roiPct)}>{pct(m.roiPct)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
          <div className="panel-head"><h2>Revenue by payment method</h2><span className="hint">Trade = value of cards traded away</span></div>
          {s.byMethod.map((m) => (
            <div className="list-row" key={m.method}><span>{m.method}</span><span>{money(m.revenue)}</span></div>
          ))}
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
