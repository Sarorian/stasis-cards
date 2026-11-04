import { useMemo } from 'react';
import { money, fmtDate } from '../format.js';
import TrendChart from './TrendChart.jsx';

const SERIES = [
  { key: 'revenue', label: 'Revenue', tipLabel: 'Revenue to date', color: 'var(--series-revenue)' },
  { key: 'profit', label: 'Profit', tipLabel: 'Profit to date', color: 'var(--series-profit)' },
];

/*
  Running totals of revenue and profit since the start date.
  days: [{ date, revenue, profit }] one per day (profit already has expenses taken out).
*/
export default function RevenueProfitChart({ days }) {
  const { points, rows } = useMemo(() => {
    let r = 0;
    let p = 0;
    const all = days.map((d) => {
      r += d.revenue;
      p += d.profit;
      return { date: d.date, revenue: Math.round(r * 100) / 100, profit: Math.round(p * 100) / 100, dayRevenue: d.revenue, dayProfit: d.profit };
    });
    const table = all.filter((d) => d.dayRevenue || d.dayProfit).reverse()
      .map((d) => ({ date: d.date, dayRevenue: d.dayRevenue, dayProfit: d.dayProfit, revenue: d.revenue, profit: d.profit }));
    // Long ranges are drawn weekly so the line stays readable
    const drawn = all.length <= 120 ? all : all.filter((_, i) => i % 7 === 0 || i === all.length - 1);
    return { points: drawn, rows: table };
  }, [days]);

  return (
    <TrendChart
      points={points}
      series={SERIES}
      note={`running total since ${fmtDate(days[0]?.date)}`}
      isEmpty={rows.length === 0}
      emptyText="Sales and expenses will draw here as they happen."
      tableRows={rows}
      tableColumns={[
        { key: 'dayRevenue', label: 'Revenue' }, { key: 'dayProfit', label: 'Profit' },
        { key: 'revenue', label: 'Revenue to date' }, { key: 'profit', label: 'Profit to date' },
      ]}
      tipExtra={(h) => (h.dayRevenue || h.dayProfit) && points.length === days.length
        ? <div className="faint">That day: {money(h.dayRevenue)} revenue · {money(h.dayProfit)} profit</div> : null}
    />
  );
}
