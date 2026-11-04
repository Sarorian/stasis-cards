import { useMemo } from 'react';
import { money, fmtDate } from '../format.js';
import TrendChart from './TrendChart.jsx';

const SERIES = [
  { key: 'market', label: 'Market value', color: 'var(--series-revenue)' },
  { key: 'cost', label: 'Cost', tipLabel: 'What it cost', color: 'var(--series-profit)' },
];

/*
  Market value vs cost of the cards in stock, one point per day.
  history: [{ date, market, cost, count }] saved snapshots (days the app wasn't opened are filled
  with the last known value, so the line stays flat there instead of jumping).
*/
export default function InventoryValueChart({ history }) {
  const points = useMemo(() => {
    if (!history.length) return [];
    const byDate = new Map(history.map((h) => [h.date, h]));
    const out = [];
    let prev = history[0];
    const end = history[history.length - 1].date;
    for (let t = new Date(`${history[0].date}T12:00:00Z`); t.toISOString().slice(0, 10) <= end; t = new Date(t.getTime() + 864e5)) {
      const date = t.toISOString().slice(0, 10);
      const snap = byDate.get(date);
      if (snap) prev = snap;
      out.push({ date, market: prev.market, cost: prev.cost, count: prev.count, gain: Math.round((prev.market - prev.cost) * 100) / 100, saved: Boolean(snap) });
    }
    return out.length <= 120 ? out : out.filter((_, i) => i % 7 === 0 || i === out.length - 1);
  }, [history]);

  const rows = [...history].reverse().map((h) => ({ ...h, gain: Math.round((h.market - h.cost) * 100) / 100 }));

  return (
    <TrendChart
      points={points}
      series={SERIES}
      note={`cards in stock · saved daily since ${fmtDate(history[0]?.date)}`}
      isEmpty={points.length < 2}
      emptyText="The line starts filling in from tomorrow. Today's value is saved."
      tableRows={rows}
      tableColumns={[{ key: 'market', label: 'Market value' }, { key: 'cost', label: 'Cost' }, { key: 'gain', label: 'Unrealized gain' }]}
      tipExtra={(h) => (
        <div className="faint">
          {h.count} card{h.count === 1 ? '' : 's'} · gain <span className={h.gain >= 0 ? 'pos' : 'neg'}>{money(h.gain)}</span>{!h.saved && ' · not opened that day'}
        </div>
      )}
    />
  );
}
