const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '') + '/api';
const TOKEN_KEY = 'stasis-token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Couldn't reach the server. Check that the API is running.");
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/auth/login') {
    setToken(null);
    window.dispatchEvent(new Event('stasis-logout'));
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const qs = (params) => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v !== undefined && v !== null && v !== '' && p.set(k, v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const api = {
  login: (password) => request('POST', '/auth/login', { password }),

  stats: () => request('GET', '/stats'),

  cards: (params = {}) => request('GET', '/cards' + qs(params)),
  updateCard: (id, body) => request('PATCH', `/cards/${id}`, body),
  deleteCard: (id) => request('DELETE', `/cards/${id}`),
  sellCard: (id, body) => request('POST', `/cards/${id}/sell`, body),
  unsellCard: (id) => request('POST', `/cards/${id}/unsell`),
  refreshCard: (id) => request('POST', `/cards/${id}/refresh`),

  purchases: () => request('GET', '/purchases'),
  createPurchase: (body) => request('POST', '/purchases', body),
  deletePurchase: (id, force) => request('DELETE', `/purchases/${id}${force ? '?force=true' : ''}`),

  binder: () => request('GET', '/binder'),
  binderBuy: (body) => request('POST', '/binder/buy', body),
  binderSell: (body) => request('POST', '/binder/sell', body),
  deleteBinderEntry: (id) => request('DELETE', `/binder/${id}`),

  wallets: () => request('GET', '/wallets'),
  transactions: (params = {}) => request('GET', '/wallets/transactions' + qs(params)),
  transfer: (body) => request('POST', '/wallets/transfer', body),

  lookup: (params) => request('GET', '/prices/lookup' + qs(params)),
  searchCards: (params) => request('GET', '/prices/search' + qs(params)),
  gradedPrice: (params) => request('GET', '/prices/graded' + qs(params)),
  startPriceUpdate: () => request('POST', '/prices/update'),
  priceStatus: () => request('GET', '/prices/status'),

  trades: () => request('GET', '/trades'),
  createTrade: (body) => request('POST', '/trades', body),
  deleteTrade: (id) => request('DELETE', `/trades/${id}`),

  miscItems: () => request('GET', '/misc'),
  createMiscItem: (body) => request('POST', '/misc', body),
  updateMiscItem: (id, body) => request('PATCH', `/misc/${id}`, body),
  deleteMiscItem: (id) => request('DELETE', `/misc/${id}`),
  sellMisc: (id, body) => request('POST', `/misc/${id}/sell`, body),
  openMisc: (id, body) => request('POST', `/misc/${id}/open`, body),
  deleteMiscEntry: (entryId) => request('DELETE', `/misc/entries/${entryId}`),

  debt: () => request('GET', '/debt'),
  addDebt: (body) => request('POST', '/debt', body),
  deleteDebt: (id) => request('DELETE', `/debt/${id}`),

  admin: () => request('GET', '/admin'),
  setCapital: (body) => request('PUT', '/admin/capital', body),
  setWallets: (body) => request('PUT', '/admin/wallets', body),
};
