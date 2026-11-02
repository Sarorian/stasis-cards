import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { GAMES, money, roiPct } from '../format.js';
import BinderSaleForm from '../components/BinderSaleForm.jsx';
import CardRow from '../components/CardRow.jsx';

const SORTS = {
  newest: (a, b) => (b.boughtDate || '').localeCompare(a.boughtDate || ''),
  roi: (a, b) => (roiPct(b.cost, b.market?.price) ?? -1e9) - (roiPct(a.cost, a.market?.price) ?? -1e9),
  market: (a, b) => (b.market?.price || 0) - (a.market?.price || 0),
  name: (a, b) => a.name.localeCompare(b.name),
  soldDate: (a, b) => (b.sale?.date || '').localeCompare(a.sale?.date || ''),
};

export default function Inventory() {
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'sold' ? 'sold' : 'in_stock';
  const [cards, setCards] = useState(null);
  const [pool, setPool] = useState({ count: 0, avgCost: 0, cost: 0 });
  const [game, setGame] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('newest');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    Promise.all([api.cards({ status: view }), api.binder()])
      .then(([c, b]) => { setCards(c); setPool(b.pool); })
      .catch((e) => setError(e.message));
  }, [view]);
  useEffect(load, [load]);

  const shown = useMemo(() => {
    if (!cards) return [];
    const needle = q.trim().toLowerCase();
    return cards
      .filter((c) => !game || c.game === game)
      .filter((c) => !needle || `${c.name} ${c.number} ${c.setName}`.toLowerCase().includes(needle))
      .sort(SORTS[view === 'sold' && sort === 'newest' ? 'soldDate' : sort]);
  }, [cards, game, q, sort, view]);

  const totals = shown.reduce((a, c) => ({ cost: a.cost + c.cost, market: a.market + (c.market?.price || 0) }), { cost: 0, market: 0 });

  return (
    <>
      <div className="page-head">
        <h1>Inventory</h1>
        <Link to="/add"><button className="primary">Add purchase</button></Link>
      </div>

      <BinderSaleForm pool={pool} onSaved={load} />

      <div className="panel">
        <div className="filters">
          <button className={`tab small${view === 'in_stock' ? ' on' : ''}`} onClick={() => setParams({})}>In stock</button>
          <button className={`tab small${view === 'sold' ? ' on' : ''}`} onClick={() => setParams({ view: 'sold' })}>Sold</button>
          <input placeholder="Search name, number, set" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={game} onChange={(e) => setGame(e.target.value)}>
            <option value="">All games</option>
            {GAMES.map((g) => <option key={g}>{g}</option>)}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="newest">{view === 'sold' ? 'Recently sold' : 'Recently bought'}</option>
            <option value="roi">Highest ROI</option>
            <option value="market">Highest market</option>
            <option value="name">Name</option>
          </select>
          {view === 'in_stock' && cards && (
            <span className="hint" style={{ marginLeft: 'auto' }}>
              {shown.length} cards · cost {money(totals.cost)} · market {money(totals.market)}
            </span>
          )}
        </div>

        {error && <div className="toast">{error}</div>}
        {!cards && !error && <p className="hint">Loading…</p>}
        {cards && shown.length === 0 && (
          <p className="hint">{view === 'sold' ? 'Sold cards show up here.' : 'No cards yet. Add a purchase to start your inventory.'}</p>
        )}
        {shown.length > 0 && (
          <div className="inv-row head">
            <span /><span>Card</span><span>Bought</span><span>{view === 'sold' ? 'Sold' : 'Market'}</span><span>ROI</span><span />
          </div>
        )}
        {shown.map((c) => <CardRow key={c._id} card={c} onChange={load} />)}
      </div>
    </>
  );
}
