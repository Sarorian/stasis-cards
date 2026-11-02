import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

const TOKEN_TTL = '30d';

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function login(req, res) {
  const { password } = req.body || {};
  if (!process.env.APP_PASSWORD) {
    return res.status(500).json({ error: 'APP_PASSWORD is not set on the server.' });
  }
  if (!password || !safeEqual(password, process.env.APP_PASSWORD)) {
    return res.status(401).json({ error: 'Wrong password.' });
  }
  const token = jwt.sign({ role: 'owner' }, process.env.JWT_SECRET, { expiresIn: TOKEN_TTL });
  res.json({ token });
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Log in first.' });
  try {
    jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Your session expired. Log in again.' });
  }
}
