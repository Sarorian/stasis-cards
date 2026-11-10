import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { today, fmtDate } from '../format.js';

/*
  "Where" for a buy or sale: one of our shows, Private sale, or eBay.
  value undefined = not chosen yet: it fills in the show nearest today (or Private sale if there are none).
*/
let cache = null; // shows, loaded once per page visit; cleared when shows change
export const clearShowsCache = () => { cache = null; };
export function loadShows() {
  if (!cache) cache = api.shows().catch((e) => { cache = null; throw e; });
  return cache;
}

const dayNum = (d) => Math.round(new Date(`${d}T12:00:00Z`).getTime() / 864e5);

// Days from today to the show (0 while it's on); upcoming wins a tie
export function nearestShow(shows, on = today()) {
  const t = dayNum(on);
  let best = null;
  for (const s of shows) {
    const a = dayNum(s.date);
    const b = dayNum(s.endDate || s.date);
    const dist = t < a ? a - t : t > b ? t - b : 0;
    const key = dist * 2 + (t > b ? 1 : 0);
    if (!best || key < best.key) best = { key, show: s };
  }
  return best?.show || null;
}

export function whereLabel(at, shows = []) {
  if (!at) return 'Not set';
  if (at === 'private') return 'Private sale';
  if (at === 'ebay') return 'eBay';
  return shows.find((s) => s._id === at)?.name || 'A show';
}

const showLabel = (s) => `${s.name} · ${fmtDate(s.date)}`;

// date: the buy/sale date. Until the picker is changed by hand, it follows the show nearest that date.
export default function WherePicker({ value, onChange, date, label = 'Where', allowUnset = false, className = 'field' }) {
  const [shows, setShows] = useState(null);
  const touched = useRef(false);
  useEffect(() => {
    let live = true;
    loadShows().then((list) => live && setShows(list)).catch(() => live && setShows([]));
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (value === undefined) touched.current = false;
    if (!shows || touched.current || allowUnset) return;
    const pick = nearestShow(shows, date || today())?._id || 'private';
    if (pick !== value) onChange(pick);
  }, [value, shows, date]); // eslint-disable-line react-hooks/exhaustive-deps

  const sorted = [...(shows || [])].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <label className={className}>{label}
      <select value={value ?? ''} onChange={(e) => { touched.current = true; onChange(e.target.value || null); }}>
        {(allowUnset || !value) && <option value="">Not set</option>}
        {sorted.length > 0 && (
          <optgroup label="Shows">
            {sorted.map((s) => <option key={s._id} value={s._id}>{showLabel(s)}</option>)}
          </optgroup>
        )}
        <option value="private">Private sale</option>
        <option value="ebay">eBay</option>
      </select>
    </label>
  );
}
