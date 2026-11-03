import { useEffect, useMemo, useRef, useState } from 'react';
import { money, fmtDate } from '../format.js';

const H = 240;
const M = { top: 12, right: 112, bottom: 26, left: 58 };
const SERIES = [
  { key: 'revenue', label: 'Revenue', color: 'var(--series-revenue)' },
  { key: 'profit', label: 'Profit', color: 'var(--series-profit)' },
];
const short = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const compact = (n) => (Math.abs(n) >= 1000 ? `$${(n / 1000).toFixed(Math.abs(n) >= 10000 ? 0 : 1)}k` : `$${Math.round(n)}`);

function niceStep(range, count = 4) {
  const raw = range / count;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}

/*
  Running totals of revenue and profit since the start date.
  days: [{ date, revenue, profit }] one per day (profit already has expenses taken out).
*/
export default function RevenueProfitChart({ days }) {
  const wrap = useRef(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState(null);
  const [table, setTable] = useState(false);

  useEffect(() => {
    if (!wrap.current) return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, [table]); // re-attach when switching back from the table

  // Running totals; long ranges are drawn weekly so the line stays readable
  const points = useMemo(() => {
    let r = 0;
    let p = 0;
    const all = days.map((d) => {
      r += d.revenue;
      p += d.profit;
      return { date: d.date, revenue: Math.round(r * 100) / 100, profit: Math.round(p * 100) / 100, dayRevenue: d.revenue, dayProfit: d.profit };
    });
    if (all.length <= 120) return all;
    return all.filter((_, i) => i % 7 === 0 || i === all.length - 1);
  }, [days]);

  const narrow = width < 520;
  const m = { ...M, right: narrow ? 16 : M.right };
  const iw = width - m.left - m.right;
  const ih = H - m.top - m.bottom;
  const vals = points.flatMap((d) => [d.revenue, d.profit]);
  const lo = Math.min(0, ...vals);
  const hiRaw = Math.max(1, ...vals);
  const step = niceStep(hiRaw - lo);
  const yMin = Math.floor(lo / step) * step;
  const yMax = Math.ceil((hiRaw * 1.05) / step) * step;
  const ticks = [];
  for (let v = yMin; v <= yMax + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  const x = (i) => m.left + (points.length > 1 ? (i / (points.length - 1)) * iw : iw / 2);
  const y = (v) => m.top + ih - ((v - yMin) / (yMax - yMin || 1)) * ih;
  const path = (key) => points.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join('');

  // ~5 date labels along the bottom
  const xTicks = points.length <= 1 ? [0] : [...new Set([0, ...[1, 2, 3].map((k) => Math.round(((points.length - 1) * k) / 4)), points.length - 1])];

  // Line-end labels, nudged apart if they'd overlap
  const last = points[points.length - 1];
  let ends = SERIES.map((s) => ({ ...s, y: y(last?.[s.key] || 0), value: last?.[s.key] || 0 }));
  if (Math.abs(ends[0].y - ends[1].y) < 16) {
    const mid = (ends[0].y + ends[1].y) / 2;
    const up = ends[0].value >= ends[1].value ? 0 : 1;
    ends = ends.map((e, i) => ({ ...e, y: mid + (i === up ? -8 : 8) }));
  }

  function onMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = points.length > 1 ? Math.round(((px - m.left) / iw) * (points.length - 1)) : 0;
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  }

  const h = hover !== null ? points[hover] : null;
  const activeDays = days.filter((d) => d.revenue || d.profit);
  const empty = activeDays.length === 0;

  return (
    <div className="rp-chart">
      <div className="rp-head">
        <div className="rp-legend" aria-hidden={table}>
          {SERIES.map((s) => (
            <span key={s.key} className="rp-key"><span className="rp-swatch" style={{ background: s.color }} />{s.label}</span>
          ))}
          <span className="faint">running total since {fmtDate(days[0]?.date)}</span>
        </div>
        <button type="button" className="small ghost" aria-pressed={table} onClick={() => setTable(!table)}>{table ? 'Show chart' : 'Show table'}</button>
      </div>

      {table ? (
        <div className="rp-table">
          {empty ? <p className="hint">No sales yet since {fmtDate(days[0]?.date)}.</p> : (
            <table className="simple">
              <thead><tr><th>Date</th><th className="num">Revenue</th><th className="num">Profit</th><th className="num">Revenue to date</th><th className="num">Profit to date</th></tr></thead>
              <tbody>
                {(() => {
                  let r = 0; let p = 0;
                  return days.map((d) => { r += d.revenue; p += d.profit; return { ...d, r, p }; })
                    .filter((d) => d.revenue || d.profit).reverse()
                    .map((d) => (
                      <tr key={d.date}>
                        <td>{fmtDate(d.date)}</td><td className="num">{money(d.revenue)}</td><td className="num">{money(d.profit)}</td>
                        <td className="num">{money(d.r)}</td><td className="num">{money(d.p)}</td>
                      </tr>
                    ));
                })()}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div ref={wrap} className="rp-plot" style={{ height: H }}>
          <svg width={width} height={H} role="img"
            aria-label={`Running totals since ${fmtDate(days[0]?.date)}: revenue ${money(last?.revenue)}, profit ${money(last?.profit)}`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={m.left} x2={m.left + iw} y1={y(t)} y2={y(t)} className={t === 0 ? 'rp-zero' : 'rp-grid'} />
                <text x={m.left - 8} y={y(t)} className="rp-axis" textAnchor="end" dominantBaseline="middle">{compact(t)}</text>
              </g>
            ))}
            {xTicks.map((i) => (
              <text key={i} x={x(i)} y={H - 6} className="rp-axis" textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}>{short(points[i].date)}</text>
            ))}
            {SERIES.map((s) => (
              <path key={s.key} d={path(s.key)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {!narrow && last && ends.map((e) => (
              <g key={e.key}>
                <circle cx={x(points.length - 1)} cy={y(last[e.key])} r="3.5" fill={e.color} className="rp-ring" />
                <text x={m.left + iw + 10} y={e.y} className="rp-endlabel" dominantBaseline="middle">
                  <tspan className="rp-endname">{e.label}</tspan> {money(e.value)}
                </text>
              </g>
            ))}
            {h && (
              <g pointerEvents="none">
                <line x1={x(hover)} x2={x(hover)} y1={m.top} y2={m.top + ih} className="rp-cross" />
                {SERIES.map((s) => <circle key={s.key} cx={x(hover)} cy={y(h[s.key])} r="4.5" fill={s.color} className="rp-ring" />)}
              </g>
            )}
            <rect x={m.left} y={m.top} width={iw} height={ih} fill="transparent"
              onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
          </svg>
          {h && (
            <div className="rp-tip" style={{ left: Math.min(Math.max(x(hover) + 12, 0), width - 190), top: m.top }}>
              <div className="rp-tip-date">{fmtDate(h.date)}</div>
              {SERIES.map((s) => (
                <div key={s.key} className="rp-tip-row">
                  <span className="rp-swatch" style={{ background: s.color }} />
                  <span>{s.label} to date</span><b>{money(h[s.key])}</b>
                </div>
              ))}
              {(h.dayRevenue !== 0 || h.dayProfit !== 0) && points.length === days.length && (
                <div className="faint">That day: {money(h.dayRevenue)} revenue · {money(h.dayProfit)} profit</div>
              )}
            </div>
          )}
          {empty && <div className="rp-empty hint">Sales and expenses will draw here as they happen.</div>}
        </div>
      )}
    </div>
  );
}
