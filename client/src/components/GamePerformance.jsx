import { money, pct, tone, logoFor } from '../format.js';

// One row inside a performance card
const Row = ({ label, children }) => (
  <div className="perf-row"><span>{label}</span><span>{children}</span></div>
);

function GameCard({ g }) {
  const empty = g.cardsEver === 0;
  return (
    <div className="perf-card">
      <div className="perf-head">
        <img src={logoFor(g.game)} alt="" className="perf-logo" />
        <h3>{g.game}</h3>
        {!empty && g.roiPct !== null && <span className={`pill ${tone(g.roiPct)}`} title="(realized profit + unrealized gain) ÷ everything spent on this game">ROI {pct(g.roiPct)}</span>}
      </div>
      {empty ? (
        <p className="hint">No activity yet.</p>
      ) : (
        <>
          <div className="perf-big">
            <span className={`value ${tone(g.profit)}`}>{money(g.profit)}</span>
            <span className="faint">realized profit{g.marginPct !== null ? ` · ${pct(g.marginPct)} margin` : ''}</span>
          </div>
          <Row label="Revenue">{money(g.revenue)} <span className="faint">· {g.soldCount} sold{g.tradedAway ? ` (${g.tradedAway} traded)` : ''}</span></Row>
          <Row label="In stock">{g.inStock.count} <span className="faint">· cost {money(g.inStock.cost)} · mkt {money(g.inStock.market)}</span></Row>
          <Row label="Unrealized"><span className={tone(g.inStock.unrealized)}>{money(g.inStock.unrealized)}</span>{g.inStock.unrealizedPct !== null && <span className="faint"> · {pct(g.inStock.unrealizedPct)}</span>}</Row>
          <Row label="Total spent">{money(g.spent)} <span className="faint">· {g.cardsEver} card{g.cardsEver === 1 ? '' : 's'}{g.tradedIn ? ` (${g.tradedIn} traded in)` : ''}</span></Row>
          <Row label="Avg days to sell">{g.avgDaysToSell ?? '—'}</Row>
          <Row label="Avg % of market paid">{g.avgPctOfMarketPaid !== null ? `${g.avgPctOfMarketPaid}%` : '—'}</Row>
          {g.bestFlip && <Row label="Best flip"><span className="perf-flip">{g.bestFlip.name}</span> <span className={tone(g.bestFlip.profit)}>{money(g.bestFlip.profit)}</span></Row>}
          {g.worstFlip && <Row label="Worst flip"><span className="perf-flip">{g.worstFlip.name}</span> <span className={tone(g.worstFlip.profit)}>{money(g.worstFlip.profit)}</span></Row>}
        </>
      )}
    </div>
  );
}

function BinderCard({ b }) {
  const empty = b.boughtCount === 0 && b.soldCount === 0;
  const maxPrice = Math.max(b.avgSellPrice || 0, b.avgCost || 0, 0.01);
  return (
    <div className="perf-card binder">
      <div className="perf-head">
        <span className="perf-logo binder-mark" aria-hidden="true">B</span>
        <h3>Binder</h3>
        {b.marginPct !== null && <span className={`pill ${tone(b.marginPct)}`} title="profit ÷ cost of binder cards sold">{pct(b.marginPct)} margin</span>}
      </div>
      {empty ? (
        <p className="hint">No binder buys or sales yet.</p>
      ) : (
        <>
          <div className="perf-big">
            <span className={`value ${tone(b.profit)}`}>{money(b.profit)}</span>
            <span className="faint">realized profit{b.profitPerCard !== null ? ` · ${money(b.profitPerCard)} per card sold` : ''}</span>
          </div>

          {b.avgSellPrice !== null && (
            <div className="perf-compare" aria-label="Average sell price vs average cost per binder card">
              <div className="perf-compare-row">
                <span>Sells at</span>
                <div className="bar-track"><div className="bar pos" style={{ width: `${((b.avgSellPrice || 0) / maxPrice) * 100}%` }} /></div>
                <b>{money(b.avgSellPrice)}</b>
              </div>
              <div className="perf-compare-row">
                <span>Costs</span>
                <div className="bar-track"><div className="bar neutral" style={{ width: `${((b.avgCost || 0) / maxPrice) * 100}%` }} /></div>
                <b>{money(b.avgCost)}</b>
              </div>
              <div className="faint">average per card</div>
            </div>
          )}

          <Row label="Bought">{b.boughtCount} cards <span className="faint">· {money(b.boughtCost)}</span></Row>
          <Row label="Sold">{b.soldCount} cards <span className="faint">· {money(b.revenue)}</span></Row>
          <Row label="Sell-through">{b.sellThroughPct !== null ? `${b.sellThroughPct}%` : '—'}</Row>
          {b.sellThroughPct !== null && <div className="progress" style={{ marginTop: -2, marginBottom: 6 }}><div style={{ width: `${Math.min(b.sellThroughPct, 100)}%` }} /></div>}
          <Row label="In the pool">{b.pool.count} <span className="faint">· cost {money(b.pool.cost)} · {money(b.pool.avgCost)} each</span></Row>
          {b.value !== undefined && <Row label="Estimated value">{money(b.value)} <span className="faint">· bought at {b.pct}% of market</span></Row>}
          {(b.tradedIn > 0 || b.tradedOut > 0) && <Row label="Via trades">{b.tradedIn} in · {b.tradedOut} out</Row>}
        </>
      )}
    </div>
  );
}

function MiscCard({ m }) {
  if (!m) return null;
  const empty = m.items === 0;
  return (
    <div className="perf-card">
      <div className="perf-head">
        <span className="perf-logo binder-mark misc-mark" aria-hidden="true">S</span>
        <h3>Sealed &amp; misc</h3>
        {m.marginPct !== null && <span className={`pill ${tone(m.marginPct)}`} title="profit ÷ cost of what's been sold or opened">{pct(m.marginPct)} margin</span>}
      </div>
      {empty ? (
        <p className="hint">Nothing logged yet. Use the Misc page.</p>
      ) : (
        <>
          <div className="perf-big">
            <span className={`value ${tone(m.profit)}`}>{money(m.profit)}</span>
            <span className="faint">realized profit</span>
          </div>
          <Row label="Revenue">{money(m.revenue)} <span className="faint">· {m.unitsSold} sold</span></Row>
          <Row label="Spent">{money(m.spent)} <span className="faint">· {m.items} item{m.items === 1 ? '' : 's'}</span></Row>
          <Row label="Left in stock">{m.inStock.units} <span className="faint">· cost {money(m.inStock.cost)}</span></Row>
          {m.unitsOpened > 0 && <Row label="Opened (written off)">{m.unitsOpened} <span className="faint">· <span className="neg">−{money(m.writtenOff)}</span></span></Row>}
          {m.topItems.map((t, k) => (
            <Row key={t.name + k} label={k === 0 ? 'Top items' : ''}><span className="perf-flip">{t.name}</span> <span className={tone(t.profit)}>{money(t.profit)}</span></Row>
          ))}
        </>
      )}
    </div>
  );
}

export default function GamePerformance({ games, binder, misc }) {
  return (
    <div className="perf-grid">
      {games.map((g) => <GameCard key={g.game} g={g} />)}
      <BinderCard b={binder} />
      <MiscCard m={misc} />
    </div>
  );
}
