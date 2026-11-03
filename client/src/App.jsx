import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { getToken, setToken } from './api.js';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Inventory from './pages/Inventory.jsx';
import AddPurchase from './pages/AddPurchase.jsx';
import Admin from './pages/Admin.jsx';
import Trade from './pages/Trade.jsx';
import Misc from './pages/Misc.jsx';
import Debt from './pages/Debt.jsx';
import Setup from './pages/Setup.jsx';

export default function App() {
  const [authed, setAuthed] = useState(Boolean(getToken()));

  useEffect(() => {
    const onLogout = () => setAuthed(false);
    window.addEventListener('stasis-logout', onLogout);
    return () => window.removeEventListener('stasis-logout', onLogout);
  }, []);

  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  const logout = () => {
    setToken(null);
    setAuthed(false);
  };

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">SC</span>
          Stasis Cards
        </div>
        <NavLink to="/" end className="navlink">Dashboard</NavLink>
        <NavLink to="/inventory" className="navlink">Inventory</NavLink>
        <NavLink to="/add" className="navlink">Add purchase</NavLink>
        <NavLink to="/trade" className="navlink">Trade</NavLink>
        <NavLink to="/misc" className="navlink">Misc</NavLink>
        <NavLink to="/debt" className="navlink">Debt</NavLink>
        <NavLink to="/admin" className="navlink">Admin</NavLink>
        <button className="ghost small" onClick={logout}>Log out</button>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/add" element={<AddPurchase />} />
          <Route path="/trade" element={<Trade />} />
          <Route path="/misc" element={<Misc />} />
          <Route path="/debt" element={<Debt />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}
