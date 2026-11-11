import { Link } from 'react-router-dom';
import { money, pct } from '../format.js';

// How long in-stock cards have been sitting, and the money tied up in the slow ones
export default function AgingInventory({ a }) {
  const total = a.buckets.reduce((n, b) => n + b.count, 0);
  const slow = a.buckets.filter((b) => b.min >= 60);
  const slowCost = slow.reduce((n, b) => n + b.cost, 0);
  const slowCount = slow.reduce((n, b) => n + b.count, 0);
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Aging inventory</h2>
        <span className="hint">{a.avgDays !== null ? `cards sit ${a.avgDays} days on average` : ''}</span>
      </div>
      {total === 0 ? <p className="hint">Nothing in stock.</p> : (
        <>
          <div className="aging-bar" role="img" aria-label={a.buckets.map((b) => `${b.label}: ${b.count}`).join(', ')}>
            {a.buckets.map((b, i) => b.count > 0 && (
              <div key={b.label} className={`aging-seg s${i}`} style={{ flexGrow: b.count }} title={`${b.label}: ${b.count} cards · cost ${money(b.cost)}`} />
            ))}
          </div>
          <div className="aging-legend">
            {a.buckets.map((b, i) => (
              <div key={b.label} className="aging-key">
                <span className={`aging-dot s${i}`} />
                <span>{b.label}</span>
                <b>{b.count}</b>
                <span className="faint">{money(b.cost)} cost · {money(b.market)} mkt</span>
              </div>
            ))}
          </div>
          {slowCount > 0 ? (
            <>
              <p className="hint" style={{ margin: '10px 0 6px' }}>
                <b>{money(slowCost)}</b> is tied up in {slowCount} card{slowCount === 1 ? '' : 's'} that have sat 60+ days. Good candidates for a discount, the binder, or trade bait.
              </p>
              {a.oldest.map((c) => (
                <div className="list-row" key={c.id}>
                  <span>
                    {c.name}{c.number ? ` ${c.number}` : ''} <span className="faint">· {c.game}{c.graded?.company ? ` · ${c.graded.company} ${c.graded.grade}` : c.condition && c.condition !== 'NM' ? ` · ${c.condition}` : ''}</span>
                  </span>
                  <span>
                    <b className={c.days >= 90 ? 'neg' : ''}>{c.days} days</b>
                    <span className="faint"> · {money(c.cost)} → {money(c.market)}{c.change30d !== null ? ` · 30d ${pct(c.change30d)}` : ''}</span>
                  </span>
                </div>
              ))}
              <Link to="/inventory" className="hint">Go to inventory</Link>
            </>
          ) : <p className="hint" style={{ marginTop: 10 }}>Nothing has sat longer than 60 days. 👍</p>}
        </>
      )}
    </div>
  );
}
