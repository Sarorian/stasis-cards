import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { WALLETS, CONDITIONS, GRADERS, money, today, fmtDate } from '../format.js';
import CardImage from '../components/CardImage.jsx';
import CardFinder from '../components/CardFinder.jsx';
import PaymentSplit, { singlePayment, resolvePayments, splitError } from '../components/PaymentSplit.jsx';

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = (v) => (v === '' || v === null || v === undefined ? 0 : Number(v) || 0);

// Same rounding spread the server uses: keeps cents exact, biggest line takes the leftover
function spread(values, diff) {
  if (!values.length || !diff) return values.map(r2);
  const total = values.reduce((a, b) => a + b, 0);
  const out = values.map((v) => r2(v + (total > 0 ? (diff * v) / total : diff / values.length)));
  const biggest = out.indexOf(Math.max(...out));
  out[biggest] = r2(out[biggest] + (r2(total + diff) - out.reduce((a, b) => a + b, 0)));
  return out;
}

const blankIn = (game = 'Riftbound') => ({
  key: Math.random().toString(36).slice(2),
  game, name: '', number: '', setName: '', imageUrl: '', external: {}, sources: [], pick: null,
  condition: 'NM', graded: false, company: 'PSA', grade: '',
  market: '', value: '', valueTouched: false, msg: '',
});

export default function Trade() {
  const [tab, setTab] = useState('new');
  return (
    <>
      <div className="page-head">
        <h1>Trade</h1>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className={`tab${tab === 'new' ? ' on' : ''}`} onClick={() => setTab('new')}>New trade</button>
          <button className={`tab${tab === 'history' ? ' on' : ''}`} onClick={() => setTab('history')}>History</button>
        </div>
      </div>
      {tab === 'new' ? <NewTrade onDone={() => setTab('history')} /> : <TradeHistory />}
    </>
  );
}

/* ------------------------------------------------------------------ */

function NewTrade({ onDone }) {
  const [date, setDate] = useState(today());
  const [pct, setPct] = useState('80');
  const [notes, setNotes] = useState('');

  const [stock, setStock] = useState([]);
  const [pool, setPool] = useState(null);
  const [ours, setOurs] = useState([]); // { id, name, number, game, setName, imageUrl, market, cost, value }
  const [ourBinder, setOurBinder] = useState({ count: '', value: '' });
  const [theirs, setTheirs] = useState([]);
  const [theirBinder, setTheirBinder] = useState({ count: '', value: '' });

  const [cashText, setCashText] = useState(''); // blank = exact difference
  const [direction, setDirection] = useState(null); // null = follow the math; 'in' | 'out' when overridden
  const [pay, setPay] = useState(singlePayment()); // wallet(s) for the cash, can be split
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastGame, setLastGame] = useState('Riftbound');

  const loadStock = () => Promise.all([api.cards({ status: 'in_stock' }), api.binder()])
    .then(([cards, b]) => { setStock(cards); setPool(b.pool); })
    .catch((e) => setError(e.message));
  useEffect(() => { loadStock(); }, []);

  const pctNum = num(pct);

  // Their card values follow the trade-in % until you type your own
  useEffect(() => {
    setTheirs((ts) => ts.map((t) => (t.valueTouched || !num(t.market) ? t : { ...t, value: String(r2((num(t.market) * pctNum) / 100)) })));
  }, [pctNum]);

  /* ---------- the math ---------- */
  const outValues = ours.map((o) => num(o.value));
  const outBinderValue = num(ourBinder.count) > 0 ? num(ourBinder.value) : 0;
  const inValues = theirs.map((t) => num(t.value));
  const inBinderValue = num(theirBinder.count) > 0 ? num(theirBinder.value) : 0;
  const outTotal = r2(outValues.reduce((a, b) => a + b, 0) + outBinderValue);
  const inTotal = r2(inValues.reduce((a, b) => a + b, 0) + inBinderValue);
  const calc = r2(outTotal - inTotal); // + they owe us, - we owe them
  const calcDir = calc > 0 ? 'in' : calc < 0 ? 'out' : 'none';
  const dir = direction || calcDir;
  const cashTyped = cashText.trim() !== '';
  const cashAbs = cashTyped ? r2(num(cashText)) : Math.abs(calc);
  const cash = dir === 'out' ? -cashAbs : dir === 'in' ? cashAbs : 0; // signed, + = to us
  const diff = r2(calc - cash); // absorbed into their side (or ours if nothing comes in)
  const hasIn = theirs.length > 0 || inBinderValue > 0;
  const hasAnything = ours.length || theirs.length || num(ourBinder.count) > 0 || num(theirBinder.count) > 0;

  const preview = useMemo(() => {
    if (!diff) return null;
    if (hasIn) {
      const lines = [...inValues, ...(inBinderValue > 0 ? [inBinderValue] : [])];
      const adj = spread(lines, diff);
      const names = [...theirs.map((t) => t.name || 'their card'), ...(inBinderValue > 0 ? ['their binder cards'] : [])];
      return { side: 'theirs', rows: names.map((n, i) => ({ name: n, from: lines[i], to: adj[i] })) };
    }
    const lines = [...outValues, ...(outBinderValue > 0 ? [outBinderValue] : [])];
    const adj = spread(lines, -diff);
    const names = [...ours.map((o) => o.name), ...(outBinderValue > 0 ? ['our binder cards'] : [])];
    return { side: 'ours', rows: names.map((n, i) => ({ name: n, from: lines[i], to: adj[i] })) };
  }, [diff, hasIn, JSON.stringify(inValues), JSON.stringify(outValues), inBinderValue, outBinderValue]);
  const negative = preview?.rows.some((r) => r.to < 0);

  /* ---------- our cards ---------- */
  const [ourQuery, setOurQuery] = useState('');
  const ourIds = new Set(ours.map((o) => o.id));
  const ourMatches = ourQuery.trim().length >= 1
    ? stock.filter((c) => !ourIds.has(c._id) && `${c.name} ${c.number} ${c.setName} ${c.game}`.toLowerCase().includes(ourQuery.trim().toLowerCase())).slice(0, 8)
    : [];
  const addOurs = (c) => {
    setOurs((os) => [...os, {
      id: c._id, name: c.name, number: c.number, game: c.game, setName: c.setName, imageUrl: c.imageUrl,
      graded: c.graded, condition: c.condition, market: c.market?.price || 0, cost: c.cost, value: String(c.market?.price || ''),
    }]);
    setOurQuery('');
  };
  const patchOurs = (i, p) => setOurs((os) => os.map((o, j) => (j === i ? { ...o, ...p } : o)));

  /* ---------- their cards ---------- */
  const patchTheirs = (i, p) => setTheirs((ts) => ts.map((t, j) => (j === i ? { ...t, ...p } : t)));
  const autoValue = (market) => (num(market) > 0 ? String(r2((num(market) * pctNum) / 100)) : '');

  function pickTheirs(i, r) {
    const t = theirs[i];
    const market = r.price ? String(r.price) : '';
    patchTheirs(i, {
      pick: r, name: r.name, number: r.number, setName: r.setName, imageUrl: r.imageUrl || '', external: r.external || {},
      sources: r.price ? [{ source: r.source, price: r.price, url: r.url }] : [],
      market, ...(t.valueTouched ? {} : { value: autoValue(market) }),
      msg: [r.source, r.setName, r.printing].filter(Boolean).join(' · ') + (r.price ? '' : ' · no market price, enter it'),
    });
    if (t.graded && String(t.grade).trim()) gradedLookup(i, { ...t, pick: r });
  }

  async function gradedLookup(i, t) {
    const pick = t.pick;
    if (!pick) return;
    const raw = { source: pick.source, price: pick.price, url: pick.url };
    const setMarket = (m, extra) => patchTheirs(i, { market: m ? String(m) : '', ...(t.valueTouched ? {} : { value: autoValue(m) }), ...extra });
    if (!t.graded || !String(t.grade).trim()) {
      return setMarket(pick.price, { sources: pick.price ? [raw] : [], msg: [pick.source, pick.setName, pick.printing].filter(Boolean).join(' · ') });
    }
    patchTheirs(i, { msg: 'Finding graded price…' });
    try {
      const g = await api.gradedPrice({ name: pick.name, number: pick.number, gradedCompany: t.company, gradedGrade: String(t.grade).trim() });
      if (g.hit?.price) {
        return setMarket(g.hit.price, { sources: [{ source: g.hit.source, price: g.hit.price, url: g.hit.url }, ...(pick.price ? [raw] : [])], msg: `${g.hit.source} · raw ${money(pick.price)}` });
      }
      setMarket(pick.price, {
        sources: pick.price ? [{ ...raw, source: `${raw.source} (raw)` }] : [],
        msg: g.configured ? `No ${t.company} ${t.grade} price found. Showing raw.` : 'Graded prices need a PriceCharting token. Showing raw price.',
      });
    } catch (err) {
      patchTheirs(i, { msg: err.message });
    }
  }

  /* ---------- submit ---------- */
  function reset() {
    setOurs([]); setTheirs([]); setOurBinder({ count: '', value: '' }); setTheirBinder({ count: '', value: '' });
    setCashText(''); setDirection(null); setNotes(''); setError(''); setPay(singlePayment(pay[0].method));
  }

  async function complete() {
    setError('');
    if (!hasAnything) return setError('Add at least one card to either side.');
    for (const [i, o] of ours.entries()) if (!(num(o.value) >= 0) || o.value === '') return setError(`Give ${o.name} a trade value.`);
    for (const [i, t] of theirs.entries()) {
      if (!t.name.trim()) return setError(`Their card ${i + 1} needs a name. Use Find card or type it in.`);
      if (!(num(t.market) > 0)) return setError(`${t.name}: enter its market value.`);
      if (t.value === '') return setError(`${t.name}: enter what we're taking it in at.`);
      if (t.graded && !String(t.grade).trim()) return setError(`${t.name} needs a grade.`);
    }
    if (num(ourBinder.count) > 0 && pool && num(ourBinder.count) > pool.count) return setError(`Only ${pool.count} binder cards in stock.`);
    if (negative) return setError('That cash amount would make a card worth less than $0.');
    if (cash !== 0 && splitError(pay, cashAbs)) return setError(splitError(pay, cashAbs));
    const payments = cash !== 0 ? resolvePayments(pay, cashAbs) : [];
    const payText = payments.map((p) => (payments.length > 1 ? `${money(p.amount)} ${p.method}` : p.method)).join(' + ');

    // Values after cash rounding, in the same order the preview lists them
    const finalOf = (side, values) => (preview?.side === side ? preview.rows.map((r) => r.to) : values);
    const outFinal = finalOf('ours', [...outValues, ...(outBinderValue > 0 ? [outBinderValue] : [])]);
    const inFinal = finalOf('theirs', [...inValues, ...(inBinderValue > 0 ? [inBinderValue] : [])]);
    const summary = [
      ours.length || outBinderValue ? `Out: ${[...ours.map((o, i) => `${o.name} (${money(outFinal[i])})`), ...(num(ourBinder.count) > 0 ? [`${ourBinder.count} binder cards (${money(outFinal[outFinal.length - 1])})`] : [])].join(', ')}` : '',
      hasIn ? `In: ${[...theirs.map((t, i) => `${t.name} (${money(inFinal[i])})`), ...(num(theirBinder.count) > 0 ? [`${theirBinder.count} binder cards (${money(inFinal[inFinal.length - 1])})`] : [])].join(', ')}` : '',
      cash > 0 ? `They pay us ${money(cash)} (${payText})` : cash < 0 ? `We pay them ${money(-cash)} (${payText})` : 'No cash',
    ].filter(Boolean).join('\n');
    if (!window.confirm(`Complete this trade?\n\n${summary}`)) return;

    setBusy(true);
    try {
      await api.createTrade({
        date, tradeInPct: pctNum, notes,
        outCards: ours.map((o) => ({ id: o.id, value: num(o.value) })),
        outBinder: num(ourBinder.count) > 0 ? { count: num(ourBinder.count), value: outBinderValue } : null,
        inCards: theirs.map((t) => ({
          name: t.name.trim(), number: t.number.trim(), game: t.game, setName: t.setName, imageUrl: t.imageUrl,
          external: t.external, sources: t.sources, condition: t.condition,
          graded: t.graded ? { company: t.company, grade: String(t.grade).trim() } : null,
          market: num(t.market), value: num(t.value),
        })),
        inBinder: num(theirBinder.count) > 0 ? { count: num(theirBinder.count), value: inBinderValue } : null,
        cash,
        ...(payments.length > 1 ? { payments } : { method: payments[0]?.method }),
      });
      reset();
      await loadStock();
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  /* ---------- render ---------- */
  return (
    <>
      <div className="panel">
        <div className="form-row" style={{ gridTemplateColumns: '1fr 0.7fr 2fr' }}>
          <label className="field">Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="field">Trade-in % (their cards)
            <input type="number" min="0" max="200" step="1" value={pct} onChange={(e) => setPct(e.target.value)} />
          </label>
          <label className="field">Notes (optional)
            <input value={notes} placeholder="Who, where…" onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>
      </div>

      <div className="grid two-col trade-cols">
        {/* ---------------- OUR SIDE ---------------- */}
        <div className="panel">
          <div className="panel-head"><h2>Our side <span className="faint">leaving</span></h2><span className="trade-total">{money(outTotal)}</span></div>

          <label className="field">Add a card from inventory
            <input value={ourQuery} placeholder="Type a name from your inventory…" onChange={(e) => setOurQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && ourMatches[0]) { e.preventDefault(); addOurs(ourMatches[0]); } if (e.key === 'Escape') setOurQuery(''); }} />
          </label>
          {ourQuery.trim() && (
            <div className="results">
              <div className="results-list">
                {ourMatches.map((c) => (
                  <button type="button" key={c._id} className="result" onClick={() => addOurs(c)}>
                    <CardImage src={c.imageUrl} game={c.game} alt="" className="result-img" />
                    <span className="result-main">
                      <span className="result-name">{c.name}</span>
                      <span className="faint">{[c.number, c.setName, c.graded?.company ? `${c.graded.company} ${c.graded.grade}` : c.condition, `cost ${money(c.cost)}`].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="result-price">{money(c.market?.price)}</span>
                  </button>
                ))}
                {!ourMatches.length && <div className="hint" style={{ padding: '10px' }}>No in-stock cards match.</div>}
              </div>
            </div>
          )}

          {ours.map((o, i) => {
            const profit = r2(num(o.value) - o.cost);
            return (
              <div className="trade-line" key={o.id}>
                <CardImage src={o.imageUrl} game={o.game} alt="" className="result-img" />
                <div className="trade-line-main">
                  <div className="result-name">{o.name}</div>
                  <div className="faint">{[o.number, o.setName, o.graded?.company ? `${o.graded.company} ${o.graded.grade}` : o.condition].filter(Boolean).join(' · ')}</div>
                  <div className="faint">market {money(o.market)} · cost {money(o.cost)} · <span className={profit >= 0 ? 'pos' : 'neg'}>{profit >= 0 ? '+' : ''}{money(profit)}</span></div>
                </div>
                <label className="field trade-value">Trade value
                  <input type="number" min="0" step="0.01" value={o.value} onChange={(e) => patchOurs(i, { value: e.target.value })} />
                  <span className="faint">{o.market > 0 && o.value !== '' ? `${Math.round((num(o.value) / o.market) * 100)}% of market` : ''}</span>
                </label>
                <button type="button" className="small ghost danger" aria-label={`Remove ${o.name}`} onClick={() => setOurs((os) => os.filter((_, j) => j !== i))}>✕</button>
              </div>
            );
          })}

          <div className="binder-line">
            <span className="hint">Binder cards {pool && <span className="faint">({pool.count} in stock · avg cost {money(pool.avgCost)})</span>}</span>
            <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <label className="field">How many<input type="number" min="0" step="1" placeholder="0" value={ourBinder.count} onChange={(e) => setOurBinder({ ...ourBinder, count: e.target.value })} /></label>
              <label className="field">Total value<input type="number" min="0" step="0.01" placeholder="0.00" value={ourBinder.value} onChange={(e) => setOurBinder({ ...ourBinder, value: e.target.value })} /></label>
            </div>
          </div>
        </div>

        {/* ---------------- THEIR SIDE ---------------- */}
        <div className="panel">
          <div className="panel-head"><h2>Their side <span className="faint">coming in</span></h2><span className="trade-total">{money(inTotal)}</span></div>

          {theirs.map((t, i) => (
            <div className="their-card" key={t.key}>
              <div className="their-card-head">
                <CardImage src={t.imageUrl} game={t.game} alt="" className="result-img" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <CardFinder game={t.game} onGameChange={(g) => { setLastGame(g); patchTheirs(i, { game: g }); }} onPick={(r) => pickTheirs(i, r)} picked={Boolean(t.pick)} autoFocus={!t.pick && !t.name} />
                </div>
                <button type="button" className="small ghost danger" aria-label="Remove card" onClick={() => setTheirs((ts) => ts.filter((_, j) => j !== i))}>✕</button>
              </div>
              <div className="form-row" style={{ gridTemplateColumns: '2fr 1fr', marginTop: 8 }}>
                <label className="field">Card name<input value={t.name} placeholder="Filled in when you pick a card" onChange={(e) => patchTheirs(i, { name: e.target.value })} /></label>
                <label className="field">Number<input value={t.number} onChange={(e) => patchTheirs(i, { number: e.target.value })} /></label>
              </div>
              <div className="form-row" style={{ gridTemplateColumns: 'auto 1fr 1fr', marginTop: 8 }}>
                <label className="check" style={{ paddingBottom: 8 }}>
                  <input type="checkbox" checked={t.graded} onChange={(e) => {
                    patchTheirs(i, { graded: e.target.checked });
                    if (t.pick && (!e.target.checked || String(t.grade).trim())) gradedLookup(i, { ...t, graded: e.target.checked });
                  }} /> Graded
                </label>
                {t.graded ? (
                  <>
                    <label className="field">Company
                      <select value={t.company} onChange={(e) => { patchTheirs(i, { company: e.target.value }); if (t.pick && String(t.grade).trim()) gradedLookup(i, { ...t, company: e.target.value }); }}>
                        {GRADERS.map((g) => <option key={g}>{g}</option>)}
                      </select>
                    </label>
                    <label className="field">Grade<input value={t.grade} placeholder="10" onChange={(e) => patchTheirs(i, { grade: e.target.value })} onBlur={() => gradedLookup(i, t)} /></label>
                  </>
                ) : (
                  <label className="field" style={{ gridColumn: 'span 2' }}>Condition
                    <select value={t.condition} onChange={(e) => patchTheirs(i, { condition: e.target.value })}>{CONDITIONS.map((c) => <option key={c}>{c}</option>)}</select>
                  </label>
                )}
              </div>
              <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 8 }}>
                <label className="field">Market value
                  <input type="number" min="0" step="0.01" value={t.market} onChange={(e) => patchTheirs(i, { market: e.target.value, ...(t.valueTouched ? {} : { value: autoValue(e.target.value) }) })} />
                </label>
                <label className="field">We take it in at
                  <input type="number" min="0" step="0.01" value={t.value} onChange={(e) => patchTheirs(i, { value: e.target.value, valueTouched: true })} />
                  <span className="faint">
                    {num(t.market) > 0 && t.value !== '' ? `${Math.round((num(t.value) / num(t.market)) * 1000) / 10}% of market` : ''}
                    {t.valueTouched && num(t.market) > 0 && (
                      <> · <button type="button" className="linkish" onClick={() => patchTheirs(i, { value: autoValue(t.market), valueTouched: false })}>back to {pctNum}%</button></>
                    )}
                  </span>
                </label>
              </div>
              {t.msg && <div className="lookup-status" style={{ marginTop: 4 }}>{t.msg}</div>}
            </div>
          ))}
          <button type="button" onClick={() => setTheirs((ts) => [...ts, blankIn(ts[ts.length - 1]?.game || lastGame)])}>+ Add their card</button>

          <div className="binder-line">
            <span className="hint">Binder cards</span>
            <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <label className="field">How many<input type="number" min="0" step="1" placeholder="0" value={theirBinder.count} onChange={(e) => setTheirBinder({ ...theirBinder, count: e.target.value })} /></label>
              <label className="field">We take them in at<input type="number" min="0" step="0.01" placeholder="0.00" value={theirBinder.value} onChange={(e) => setTheirBinder({ ...theirBinder, value: e.target.value })} /></label>
            </div>
          </div>
        </div>
      </div>

      {/* ---------------- SETTLEMENT ---------------- */}
      <div className="panel settle">
        <div className="settle-math">
          <span>Our side <b>{money(outTotal)}</b></span>
          <span className="faint">−</span>
          <span>Their side <b>{money(inTotal)}</b></span>
          <span className="faint">=</span>
          <span className={`settle-result ${calcDir}`}>
            {calcDir === 'in' ? `They owe us ${money(calc)}` : calcDir === 'out' ? `We owe them ${money(-calc)}` : 'Even trade'}
          </span>
        </div>

        <div className="form-row" style={{ gridTemplateColumns: '1.2fr 1fr minmax(220px, 1.3fr)', marginTop: 12 }}>
          <label className="field">Cash
            <select value={dir} onChange={(e) => setDirection(e.target.value === calcDir ? null : e.target.value)}>
              <option value="in">They pay us</option>
              <option value="out">We pay them</option>
              <option value="none">No cash</option>
            </select>
          </label>
          <label className="field">Amount
            <input type="number" min="0" step="0.01" disabled={dir === 'none'} placeholder={Math.abs(calc).toFixed(2)}
              value={dir === 'none' ? '' : cashTyped ? cashText : ''} onChange={(e) => setCashText(e.target.value)} />
          </label>
          <PaymentSplit label={dir === 'out' ? 'Paid from' : 'Paid into'} rows={pay} onChange={(r) => { setPay(r); setError(''); }}
            total={cashAbs} disabled={dir === 'none' || cashAbs === 0} />
        </div>

        {cashTyped && dir !== 'none' && (
          <div className="hint settle-note">
            Rounded from {money(Math.abs(calc))}. <button type="button" className="linkish" onClick={() => setCashText('')}>Use the exact amount</button>
          </div>
        )}
        {preview && (
          <div className={`hint settle-note${negative ? ' neg' : ''}`}>
            {(() => {
              const payer = (dir === 'none' ? calcDir : dir) === 'out' ? 'We pay' : 'They pay';
              const moreLess = payer === 'We pay' ? (diff > 0 ? 'more' : 'less') : (diff > 0 ? 'less' : 'more');
              return `${payer} ${money(Math.abs(diff))} ${moreLess} than the math`;
            })()}
            {preview.side === 'theirs' ? ', so their side counts as worth that much more: ' : ', so our cards count as traded for that much less: '}
            {preview.rows.map((r) => `${r.name} ${money(r.from)} → ${money(r.to)}`).join(', ')}
          </div>
        )}

        {error && <div className="toast" style={{ marginTop: 12, marginBottom: 0 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="primary" onClick={complete} disabled={busy || !hasAnything}>{busy ? 'Saving…' : 'Complete trade'}</button>
          <button className="ghost" onClick={reset} disabled={busy}>Clear</button>
          <span className="hint" style={{ marginLeft: 'auto' }}>
            {cash === 0 ? 'No wallet change' : resolvePayments(pay, cashAbs).map((p) => `${cash > 0 ? '+' : '−'}${money(p.amount)} ${cash > 0 ? 'into' : 'from'} ${p.method}`).join(' · ')}
          </span>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */

function TradeHistory() {
  const [trades, setTrades] = useState(null);
  const [error, setError] = useState('');
  const load = () => api.trades().then(setTrades).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function undo(t) {
    if (!window.confirm('Undo this trade? Our cards go back in stock, their cards are removed, and the cash is reversed.')) return;
    try {
      await api.deleteTrade(t._id);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!trades) return <div className="panel hint">{error || 'Loading…'}</div>;
  if (!trades.length) return <div className="panel hint">No trades yet.</div>;

  return (
    <>
      {error && <div className="toast">{error}</div>}
      {trades.map((t) => {
        const profit = r2(t.outCards.reduce((a, c) => a + (c.value - (c.cost || 0)), 0));
        // Final totals after any cash rounding
        const outFinal = r2(t.outCards.reduce((a, c) => a + c.value, 0) + (t.outBinder?.value || 0));
        const inFinal = r2(t.inCards.reduce((a, c) => a + c.value, 0) + (t.inBinder?.value || 0));
        return (
          <div className="panel" key={t._id}>
            <div className="panel-head">
              <h3>{fmtDate(t.date)} {t.notes && <span className="faint">· {t.notes}</span>}</h3>
              <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span className={t.cash > 0 ? 'pos' : t.cash < 0 ? 'neg' : 'hint'}>
                  {t.cash === 0 ? 'No cash' : `${t.cash > 0 ? 'They paid' : 'We paid'} ${money(Math.abs(t.cash))} · ${t.payments?.length ? t.payments.map((p) => `${money(p.amount)} ${p.method}`).join(' + ') : t.method}`}
                </span>
                <button className="small" onClick={() => undo(t)}>Undo</button>
              </span>
            </div>
            <div className="grid two-col">
              <div>
                <div className="hint">Out · {money(outFinal)}{t.outCards.length > 0 && <> · <span className={profit >= 0 ? 'pos' : 'neg'}>{profit >= 0 ? '+' : ''}{money(profit)} profit on singles</span></>}</div>
                {t.outCards.map((c) => <div className="list-row" key={c.card}><span>{c.name} <span className="faint">{c.number}</span></span><span>{money(c.value)}</span></div>)}
                {t.outBinder?.count > 0 && <div className="list-row"><span>{t.outBinder.count} binder cards</span><span>{money(t.outBinder.value)}</span></div>}
                {!t.outCards.length && !t.outBinder?.count && <div className="faint">Nothing</div>}
              </div>
              <div>
                <div className="hint">In · {money(inFinal)}{t.roundingAdjustment ? ` · ${money(Math.abs(t.roundingAdjustment))} cash rounding applied` : ''}</div>
                {t.inCards.map((c) => <div className="list-row" key={c.card}><span>{c.name} <span className="faint">{c.number} · {c.market ? `${Math.round((c.value / c.market) * 100)}% of ${money(c.market)}` : ''}</span></span><span>{money(c.value)}</span></div>)}
                {t.inBinder?.count > 0 && <div className="list-row"><span>{t.inBinder.count} binder cards</span><span>{money(t.inBinder.value)}</span></div>}
                {!t.inCards.length && !t.inBinder?.count && <div className="faint">Nothing</div>}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
