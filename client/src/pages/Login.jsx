import { useState } from 'react';
import { api, setToken } from '../api.js';

export default function Login({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!password) return setError('Enter the password.');
    setBusy(true);
    setError('');
    try {
      const { token } = await api.login(password);
      setToken(token);
      onLogin();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel login" onSubmit={submit}>
      <div className="brand" style={{ marginBottom: 16 }}>
        <span className="brand-mark" aria-hidden="true">SC</span>
        Stasis Cards
      </div>
      <label className="field">
        Password
        <input type="password" autoFocus value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} />
      </label>
      {error && <div className="error">{error}</div>}
      <button className="primary" style={{ marginTop: 14, width: '100%', justifyContent: 'center' }} disabled={busy}>
        {busy ? 'Logging in…' : 'Log in'}
      </button>
    </form>
  );
}
