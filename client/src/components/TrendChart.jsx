import { useEffect, useRef, useState } from 'react';
import { money, fmtDate } from '../format.js';

const H = 240;
const M = { top: 12, right: 132, bottom: 26, left: 58 };
const short = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const compact = (n) => (Math.abs(n) >= 1000 ? `$${(n / 1000).toFixed(Math.abs(n) >= 10000 ? 0 : 1)}k` : `$${Math.round(n)}`);

function niceStep(range, count = 4) {
  const raw = range / count;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}

/*
  Money-over-time line chart (one $ axis), with hover crosshair, line-end labels and a table view.
    points: [{ date, [series.key]: number, ... }] in date order
    series: [{ key, label, color, tipLabel? }] (2 recommended)
    note: small text next to the legend
    tipExtra(point): optional extra line in the tooltip
    tableRows: optional rows for the table view (defaults to points, newest first)
    tableColumns: [{ key, label }] (defaults to the series)
*/
export default function TrendChart({ points, series, note, tipExtra, tableRows, tableColumns, emptyText, isEmpty }) {
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

  const narrow = width < 520;
  const m = { ...M, right: narrow ? 16 : M.right };
  const iw = width - m.left - m.right;
  const ih = H - m.top - m.bottom;
  const vals = points.flatMap((d) => series.map((s) => d[s.key] || 0));
  const lo = Math.min(0, ...vals);
  const hiRaw = Math.max(1, ...vals);
  const step = niceStep(hiRaw - lo);
  const yMin = Math.floor(lo / step) * step;
  const yMax = Math.ceil((hiRaw * 1.05) / step) * step;
  const ticks = [];
  for (let v = yMin; v <= yMax + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  const x = (i) => m.left + (points.length > 1 ? (i / (points.length - 1)) * iw : iw / 2);
  const y = (v) => m.top + ih - ((v - yMin) / (yMax - yMin || 1)) * ih;
  const path = (key) => points.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[key] || 0).toFixed(1)}`).join('');
  const xTicks = points.length <= 1 ? [0] : [...new Set([0, ...[1, 2, 3].map((k) => Math.round(((points.length - 1) * k) / 4)), points.length - 1])];

  // Line-end labels, nudged apart if they'd overlap
  const last = points[points.length - 1];
  let ends = series.map((s) => ({ ...s, y: y(last?.[s.key] || 0), value: last?.[s.key] || 0 }));
  if (ends.length === 2 && Math.abs(ends[0].y - ends[1].y) < 16) {
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
  const cols = tableColumns || series.map((s) => ({ key: s.key, label: s.label }));
  const rows = tableRows || [...points].reverse();

  return (
    <div className="rp-chart">
      <div className="rp-head">
        <div className="rp-legend">
          {series.map((s) => (
            <span key={s.key} className="rp-key"><span className="rp-swatch" style={{ background: s.color }} />{s.label}</span>
          ))}
          {note && <span className="faint">{note}</span>}
        </div>
        <button type="button" className="small ghost" aria-pressed={table} onClick={() => setTable(!table)}>{table ? 'Show chart' : 'Show table'}</button>
      </div>

      {table ? (
        <div className="rp-table">
          {rows.length === 0 ? <p className="hint">{emptyText}</p> : (
            <table className="simple">
              <thead><tr><th>Date</th>{cols.map((c) => <th key={c.key} className="num">{c.label}</th>)}</tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.date}><td>{fmtDate(r.date)}</td>{cols.map((c) => <td key={c.key} className="num">{money(r[c.key])}</td>)}</tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div ref={wrap} className="rp-plot" style={{ height: H }}>
          <svg width={width} height={H} role="img"
            aria-label={`${series.map((s) => `${s.label} ${money(last?.[s.key])}`).join(', ')} on ${fmtDate(last?.date)}`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={m.left} x2={m.left + iw} y1={y(t)} y2={y(t)} className={t === 0 ? 'rp-zero' : 'rp-grid'} />
                <text x={m.left - 8} y={y(t)} className="rp-axis" textAnchor="end" dominantBaseline="middle">{compact(t)}</text>
              </g>
            ))}
            {points.length > 0 && xTicks.map((i) => (
              <text key={i} x={x(i)} y={H - 6} className="rp-axis" textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}>{short(points[i].date)}</text>
            ))}
            {series.map((s) => (
              <path key={s.key} d={path(s.key)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {!narrow && last && ends.map((e) => (
              <g key={e.key}>
                <circle cx={x(points.length - 1)} cy={y(last[e.key] || 0)} r="3.5" fill={e.color} className="rp-ring" />
                <text x={m.left + iw + 10} y={e.y} className="rp-endlabel" dominantBaseline="middle">
                  <tspan className="rp-endname">{e.label}</tspan> {money(e.value)}
                </text>
              </g>
            ))}
            {h && (
              <g pointerEvents="none">
                <line x1={x(hover)} x2={x(hover)} y1={m.top} y2={m.top + ih} className="rp-cross" />
                {series.map((s) => <circle key={s.key} cx={x(hover)} cy={y(h[s.key] || 0)} r="4.5" fill={s.color} className="rp-ring" />)}
              </g>
            )}
            <rect x={m.left} y={m.top} width={Math.max(iw, 1)} height={ih} fill="transparent"
              onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
          </svg>
          {h && (
            <div className="rp-tip" style={{ left: Math.min(Math.max(x(hover) + 12, 0), width - 200), top: m.top }}>
              <div className="rp-tip-date">{fmtDate(h.date)}</div>
              {series.map((s) => (
                <div key={s.key} className="rp-tip-row">
                  <span className="rp-swatch" style={{ background: s.color }} />
                  <span>{s.tipLabel || s.label}</span><b>{money(h[s.key])}</b>
                </div>
              ))}
              {tipExtra?.(h)}
            </div>
          )}
          {isEmpty && <div className="rp-empty hint">{emptyText}</div>}
        </div>
      )}
    </div>
  );
}
