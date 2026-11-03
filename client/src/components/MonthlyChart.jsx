import { fmtMonth, money } from '../format.js';

// category: 'All' or a game name / 'Binder' (uses month.byCat)
export default function MonthlyChart({ months: raw, category = 'All' }) {
  const all = raw.map((m) => (category === 'All' || !m.byCat ? m : { month: m.month, ...m.byCat[category] }));
  // Skip empty months before the first sale, but always show the last 6
  const first = all.findIndex((m) => m.count > 0);
  const months = all.slice(Math.min(first === -1 ? all.length : first, all.length - 6));
  const max = Math.max(1, ...months.map((m) => Math.abs(m.profit)));
  // Add the year to labels when the chart spans more than one year ("Jun '25" vs "Jun '26")
  const multiYear = new Set(months.map((m) => m.month.slice(0, 4))).size > 1;
  return (
    <div>
      {months.map((m) => (
        <div className="bar-row" key={m.month} title={`${m.count} sale(s), revenue ${money(m.revenue)}`}
          style={multiYear ? { gridTemplateColumns: '58px 1fr 84px' } : undefined}>
          <span className="hint">{fmtMonth(m.month)}{multiYear && ` '${m.month.slice(2, 4)}`}</span>
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
