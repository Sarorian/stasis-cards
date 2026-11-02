import { fmtMonth, money } from '../format.js';

export default function MonthlyChart({ months: all }) {
  // Skip empty months before the first sale, but always show the last 6
  const first = all.findIndex((m) => m.count > 0);
  const months = all.slice(Math.min(first === -1 ? all.length : first, all.length - 6));
  const max = Math.max(1, ...months.map((m) => Math.abs(m.profit)));
  return (
    <div>
      {months.map((m) => (
        <div className="bar-row" key={m.month} title={`${m.count} sale(s), revenue ${money(m.revenue)}`}>
          <span className="hint">{fmtMonth(m.month)}</span>
          <div className="bar-track">
            <div className={`bar ${m.profit >= 0 ? 'pos' : 'neg'}`} style={{ width: `${(Math.abs(m.profit) / max) * 100}%` }} />
          </div>
          <span className={m.profit > 0 ? 'pos' : m.profit < 0 ? 'neg' : 'hint'} style={{ textAlign: 'right' }}>
            {money(m.profit)}
          </span>
        </div>
      ))}
    </div>
  );
}
