import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { money, pct, tone, fmtDate } from '../format.js';
import StatCard from '../components/StatCard.jsx';
import PriceUpdateButton from '../components/PriceUpdateButton.jsx';
import MonthlyChart from '../components/MonthlyChart.jsx';
import WalletsPanel from '../components/WalletsPanel.jsx';

export default function Dashboard() {
  const [s, setS] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.stats().then(setS).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  if (error) return <div className="toast">{error}</div>;
  if (!s) return <p className="hint">Loading…</p>;

  return (
    <>
      <div className="page-head">
        <h1>Dashboard</h1>
        <PriceUpdateButton lastUpdated={s.pricesUpdatedAt} onDone={load} />
      </div>

      {s.startingCapital === 0 && (
        <div className="toast">
          Set your starting capital on the <Link to="/admin">Admin page</Link> so ROI can be calculated.
        </div>
      )}

      <div className="grid stats">
        <StatCard hero label="ROI" value={pct(s.roiPct)} tone={tone(s.roiPct)} sub={`vs ${money(s.startingCapital)} starting capital`} />
        <StatCard hero label="Liquid total" value={money(s.liquid)} sub={`${money(s.cash)} cash · ${money(s.digital)} digital`} />
        <StatCard hero label="Net profit" value={money(s.profit)} tone={tone(s.profit)} sub={`${pct(s.marginPct)} margin on cost`} />
        <StatCard hero label="Net worth" value={money(s.netWorth)} sub="liquid + inventory + binder" />
        <StatCard label="Revenue" value={money(s.revenue)} sub={`${s.soldCount} sales${s.fees ? ` · ${money(s.fees)} fees` : ''}`} />
        <StatCard label="Inventory at market" value={money(s.inventory.market)} sub={`${s.inventory.count} cards · cost ${money(s.inventory.cost)}`} />
        <StatCard label="Unrealized gain" value={money(s.inventory.unrealized)} tone={tone(s.inventory.unrealized)} sub={pct(s.inventory.unrealizedPct)} />
        <StatCard label="Binder cards" value={s.binder.count} sub={`cost ${money(s.binder.cost)} · ${money(s.binder.avgCost)} each`} />
        <StatCard label="Avg days to sell" value={s.avgDaysToSell ?? '—'} />
        <StatCard label="Avg % of market paid" value={s.avgPctOfMarketPaid !== null ? `${s.avgPctOfMarketPaid}%` : '—'} sub="cards in stock" />
        <StatCard label="Best flip" value={s.bestFlip ? money(s.bestFlip.profit) : '—'} tone={tone(s.bestFlip?.profit)} sub={s.bestFlip?.name} />
        <StatCard label="Worst flip" value={s.worstFlip ? money(s.worstFlip.profit) : '—'} tone={tone(s.worstFlip?.profit)} sub={s.worstFlip?.name} />
      </div>

      <WalletsPanel wallets={s.wallets} onChange={load} />

      <div className="grid two-col">
        <div className="panel">
          <div className="panel-head"><h2>Profit by month</h2><span className="hint">by sale date</span></div>
          <MonthlyChart months={s.monthly} />
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
          <div className="panel-head"><h2>By game</h2></div>
          <table className="simple">
            <thead>
              <tr><th>Game</th><th className="num">In stock</th><th className="num">Cost</th><th className="num">Market</th><th className="num">Realized</th></tr>
            </thead>
            <tbody>
              {s.byGame.map((g) => (
                <tr key={g.game}>
                  <td>{g.game}</td>
                  <td className="num">{g.inStock}</td>
                  <td className="num">{money(g.cost)}</td>
                  <td className="num">{money(g.market)}</td>
                  <td className={`num ${tone(g.profit)}`}>{money(g.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
          <div className="panel-head" style={{ marginTop: 14 }}><h3>Revenue by payment method</h3></div>
          {s.byMethod.map((m) => (
            <div className="list-row" key={m.method}><span>{m.method}</span><span>{money(m.revenue)}</span></div>
          ))}
        </div>
      </div>
    </>
  );
}
