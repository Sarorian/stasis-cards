import { money, fmtDate } from '../format.js';

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// Fun records from everything sold so far
export default function HallOfFame({ h }) {
  const items = [
    h.bestFlip && { icon: '🏆', label: 'Best flip', title: h.bestFlip.name, value: `+${money(h.bestFlip.profit)}`, sub: `${money(h.bestFlip.cost)} → ${money(h.bestFlip.revenue)}${h.bestFlip.trade ? ' (trade)' : ''}` },
    h.bestReturn && { icon: '🚀', label: 'Best return', title: h.bestReturn.name, value: `${Math.round((h.bestReturn.profit / h.bestReturn.cost) * 100)}%`, sub: `${money(h.bestReturn.cost)} → ${money(h.bestReturn.revenue)}` },
    h.biggestSale && { icon: '💰', label: 'Biggest sale', title: h.biggestSale.name, value: money(h.biggestSale.revenue), sub: fmtDate(h.biggestSale.date) },
    h.fastestFlip && { icon: '⚡', label: 'Fastest flip', title: h.fastestFlip.name, value: h.fastestFlip.days === 0 ? 'Same day' : plural(h.fastestFlip.days, 'day'), sub: `+${money(h.fastestFlip.profit)}` },
    h.bestDay && { icon: '📅', label: 'Best day', title: fmtDate(h.bestDay.date), value: `+${money(h.bestDay.profit)}`, sub: plural(h.bestDay.count, 'sale') },
    h.bestShow && { icon: '🎪', label: 'Best show', title: h.bestShow.name, value: `${h.bestShow.net >= 0 ? '+' : ''}${money(h.bestShow.net)}`, sub: `net · ${fmtDate(h.bestShow.date)}` },
    h.slowestSale && h.slowestSale.days > 0 && { icon: '🐢', label: 'Slowest sale', title: h.slowestSale.name, value: plural(h.slowestSale.days, 'day'), sub: 'finally sold' },
    h.longestHeld && { icon: '🕸️', label: 'Longest in stock', title: h.longestHeld.name, value: plural(h.longestHeld.days, 'day'), sub: `still waiting · ${money(h.longestHeld.market)}` },
  ].filter(Boolean);

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Hall of fame</h2>
        <span className="hint">{plural(h.totals.cardsSold, 'card')} sold · {money(h.totals.lifetimeRevenue)} revenue · {money(h.totals.lifetimeProfit)} profit, all time</span>
      </div>
      {items.length === 0 ? <p className="hint">Sell a few cards and the records start filling in.</p> : (
        <div className="hof-grid">
          {items.map((it) => (
            <div className="hof" key={it.label}>
              <div className="hof-label"><span aria-hidden="true">{it.icon}</span> {it.label}</div>
              <div className="hof-value">{it.value}</div>
              <div className="hof-title" title={it.title}>{it.title}</div>
              <div className="faint">{it.sub}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
