import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { fmtTime } from '../format.js';

// Starts the server's background price update and polls until it finishes
export default function PriceUpdateButton({ lastUpdated, onDone }) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const timer = useRef(null);

  const poll = async () => {
    try {
      const s = await api.priceStatus();
      setStatus(s);
      if (s.running) timer.current = setTimeout(poll, 1500);
      else if (s.finishedAt) onDone?.();
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    // Pick up a job that was already running (e.g. after a page refresh)
    api.priceStatus().then((s) => { if (s.running) { setStatus(s); poll(); } }).catch(() => {});
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    setError('');
    try {
      setStatus(await api.startPriceUpdate());
      timer.current = setTimeout(poll, 800);
    } catch (err) {
      setError(err.message);
    }
  }

  const running = status?.running;
  const pctDone = status?.total ? Math.round((status.done / status.total) * 100) : 0;

  return (
    <div style={{ minWidth: 260, textAlign: 'right' }}>
      <button className="primary" onClick={start} disabled={running}>
        {running ? `Updating… ${status.done}/${status.total || '?'}` : 'Update market prices'}
      </button>
      <div className="faint" style={{ marginTop: 4 }}>Prices last updated {fmtTime(lastUpdated)}</div>
      {running && <div className="progress"><div style={{ width: `${pctDone}%` }} /></div>}
      {!running && status?.finishedAt && (
        <div className="faint" style={{ marginTop: 4 }}>
          Updated {status.updated} of {status.total}
          {status.notFound.length > 0 && ` · ${status.notFound.length} not found`}
          {status.skippedForManual > 0 && ` · ${status.skippedForManual} priced by hand`}
          {status.failed.length > 0 && ` · ${status.failed.length} failed`}
          {status.quotaRemaining !== null && status.quotaRemaining !== undefined && ` · ${status.quotaRemaining} lookups left today`}
        </div>
      )}
      {status?.stoppedReason && <div className="error">{status.stoppedReason}</div>}
      {error && <div className="error">{error}</div>}
    </div>
  );
}
