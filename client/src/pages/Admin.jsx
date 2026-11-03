import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { WALLETS, money, fmtDate } from '../format.js';

const KIND_LABEL = {
  capital: 'Capital', purchase: 'Purchase', sale: 'Sale', binder_buy: 'Binder buy',
  binder_sell: 'Binder sale', transfer: 'Transfer', adjustment: 'Correction', trade: 'Trade', misc_buy: 'Misc buy', misc_sell: 'Misc sale', debt_loan: 'Debt (loan in)', debt_clean: 'Debt cleanse', grading: 'Grading fee',
};

export default function Admin() {
  const [data, setData] = useState(null);
  const [txns, setTxns] = useState([]);
  const [error, setError] = useState('');

  const load = () =>
    Promise.all([api.admin(), api.transactions({ limit: 50 })])
      .then(([a, t]) => { setData(a); setTxns(t); })
      .catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  if (error && !data) return <div className="toast">{error}</div>;
  if (!data) return <p className="hint">Loading…</p>;

  return (
    <>
      <div className="page-head"><h1>Admin</h1><Link to="/setup" className="btn">Starting setup (old system, starting inventory)</Link></div>
      <CapitalForm data={data} onSaved={load} />
      <WalletForm data={data} onSaved={load} />

      <div className="panel">
        <div className="panel-head"><h2>Change log</h2></div>
        {data.log.length === 0 && <p className="hint">Capital and balance changes are recorded here.</p>}
        {data.log.map((l, i) => (
          <div className="list-row" key={i}><span>{l.text}</span><span className="faint">{fmtDate(l.date)}</span></div>
        ))}
      </div>

      <div className="panel">
        <div className="panel-head"><h2>Money ledger</h2><span className="hint">last 50 entries</span></div>
        <table className="simple">
          <thead><tr><th>Date</th><th>Type</th><th>Details</th><th>Wallet</th><th className="num">Amount</th></tr></thead>
          <tbody>
            {txns.map((t) => (
              <tr key={t._id}>
                <td>{fmtDate(t.date)}</td>
                <td>{KIND_LABEL[t.kind] || t.kind}</td>
                <td className="hint">{t.note}</td>
                <td>{t.wallet}</td>
                <td className={`num ${t.amount >= 0 ? 'pos' : 'neg'}`}>{money(t.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function CapitalForm({ data, onSaved }) {
  const first = data.startingCapital === 0;
  const [amount, setAmount] = useState(first ? '' : String(data.startingCapital));
  const [note, setNote] = useState('');
  const [depositTo, setDepositTo] = useState(first ? 'Cash' : '');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (amount === '' || !(Number(amount) >= 0)) return setError('Enter an amount of 0 or more.');
    try {
      await api.setCapital({ amount: Number(amount), note, depositTo: depositTo || undefined });
      setOk('Starting capital saved.');
      setNote('');
      setDepositTo('');
      onSaved();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="panel" onSubmit={submit}>
      <div className="panel-head">
        <h2>Starting capital</h2>
        <span className="hint">The money you started with · currently {money(data.startingCapital)}</span>
      </div>
      <div className="form-row" style={{ gridTemplateColumns: '1fr 1.2fr 2fr auto' }}>
        <label className="field">Amount
          <input type="number" min="0" step="0.01" placeholder="1500.00" value={amount} onChange={(e) => { setAmount(e.target.value); setError(''); setOk(''); }} />
        </label>
        <label className="field">Also change a wallet by the difference
          <select value={depositTo} onChange={(e) => setDepositTo(e.target.value)}>
            <option value="">No, wallets stay the same</option>
            {WALLETS.map((w) => <option key={w} value={w}>Yes, {w}</option>)}
          </select>
        </label>
        <label className="field">Reason (optional)
          <input placeholder="Added $500 from tax refund" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <button className="primary">Save</button>
      </div>
      <div className="faint" style={{ marginTop: 6 }}>
        First time? Pick the wallet the starting money is in so your balances start correct. To fix a wrong number later, leave wallets unchanged.
      </div>
      {error && <div className="error">{error}</div>}
      {ok && <div className="faint pos" style={{ marginTop: 6 }}>{ok}</div>}
    </form>
  );
}

function WalletForm({ data, onSaved }) {
  const [vals, setVals] = useState(Object.fromEntries(WALLETS.map((w) => [w, String(data.wallets[w])])));
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => {
    setVals(Object.fromEntries(WALLETS.map((w) => [w, String(data.wallets[w])])));
  }, [data.wallets]);

  async function submit(e) {
    e.preventDefault();
    const balances = {};
    for (const w of WALLETS) {
      if (vals[w] === '' || Number.isNaN(Number(vals[w]))) return setError(`${w} needs a number.`);
      if (Number(vals[w]) !== data.wallets[w]) balances[w] = Number(vals[w]);
    }
    if (!Object.keys(balances).length) return setError('No balances changed.');
    try {
      await api.setWallets({ balances, note });
      setOk('Balances corrected.');
      setNote('');
      onSaved();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="panel" onSubmit={submit}>
      <div className="panel-head">
        <h2>Correct wallet balances</h2>
        <span className="hint">Match these to your real accounts; each change is logged</span>
      </div>
      <div className="form-row" style={{ gridTemplateColumns: `repeat(${WALLETS.length}, 1fr) 1.6fr auto` }}>
        {WALLETS.map((w) => (
          <label className="field" key={w}>{w}
            <input type="number" step="0.01" value={vals[w]} onChange={(e) => { setVals({ ...vals, [w]: e.target.value }); setError(''); setOk(''); }} />
          </label>
        ))}
        <label className="field">Reason (optional)<input placeholder="Venmo fee" value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <button className="primary">Save</button>
      </div>
      {error && <div className="error">{error}</div>}
      {ok && <div className="faint pos" style={{ marginTop: 6 }}>{ok}</div>}
    </form>
  );
}
