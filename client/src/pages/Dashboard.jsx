import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { money, pct, tone, fmtDate } from '../format.js';
import StatCard from '../components/StatCard.jsx';
import PriceUpdateButton from '../components/PriceUpdateButton.jsx';
import WalletsPanel from '../components/WalletsPanel.jsx';
import ManualPrices from '../components/ManualPrices.jsx';
import QuickAddCard from '../components/QuickAddCard.jsx';

// The essentials. Charts and deeper numbers live on Insights.
export default function Dashboard() {
  const [s, setS] = useState(null);
  const [error, setError] = useState('');
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
            ? <span className="hint">Tracking since {fmtDate(s.startDate)} · <Link to="/insights">Charts &amp; details →</Link></span>
            : <Link to="/setup" className="hint">Moving from the old system? Do the starting setup</Link>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <PriceUpdateButton lastUpdated={s.pricesUpdatedAt} onDone={() => { load(); loadManualCount(); setShowManual(true); }} />
          <button className={`small${manualWaiting ? ' attention' : ''}`} onClick={() => setShowManual(!showManual)} aria-expanded={showManual}>
            Prices to enter{manualWaiting ? ` (${manualWaiting})` : ''}
          </button>
        </div>
      </div>

      <div className="grid stats">
        <StatCard hero label="ROI" value={pct(s.roiPct)} tone={tone(s.roiPct)} sub={s.totalSpent > 0 ? `made vs ${money(s.totalSpent)} spent` : 'buy something to see ROI'} />
        <StatCard hero label="Net profit" value={money(s.profit)} tone={tone(s.profit)} sub={s.expenses > 0 ? `after ${money(s.expenses)} expenses` : `${pct(s.marginPct)} margin on cost`} />
        <StatCard hero label="Net worth" value={money(s.netWorth)}
          sub={`${money(s.liquid)} wallets + ${money(s.inventory.market)} cards + ${money((s.binder?.cost || 0) + (s.miscStats?.inStock?.cost || 0))} binder/sealed${s.debt.total > 0 ? ` − ${money(s.debt.total)} debt` : ''}`} />
        <StatCard label="Liquid" value={money(s.liquid)} sub={`${money(s.cash)} cash · ${money(s.digital)} digital`} />
        <StatCard label="Inventory at market" value={money(s.inventory.market)} sub={`${s.inventory.count} cards · cost ${money(s.inventory.cost)}`} />
        <Link to="/debt" className="stat-link">
          <StatCard label="Debt owed" value={money(s.debt.total)} tone={s.debt.total > 0 ? 'neg' : ''} sub={s.debt.people.map((p) => `${p.person} ${money(p.owed)}`).join(' · ')} />
        </Link>
      </div>

      {showManual && <ManualPrices onSaved={() => { load(); loadManualCount(); }} onClose={() => setShowManual(false)} />}

      <div className="grid two-col dash-main">
        <QuickAddCard onAdded={load} />
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

      <WalletsPanel wallets={s.wallets} onChange={load} />
    </>
  );
}
