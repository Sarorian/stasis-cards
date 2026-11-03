import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';

import { login, requireAuth } from './auth.js';
import cards from './routes/cards.js';
import purchases from './routes/purchases.js';
import binder from './routes/binder.js';
import wallets from './routes/wallets.js';
import stats from './routes/stats.js';
import prices from './routes/prices.js';
import admin from './routes/admin.js';
import trades from './routes/trades.js';
import misc from './routes/misc.js';
import debt from './routes/debt.js';
import setup from './routes/setup.js';
import { GAMES, WALLETS, CONDITIONS, GRADERS, PARTNERS } from './constants.js';

for (const key of ['MONGODB_URI', 'APP_PASSWORD', 'JWT_SECRET']) {
  if (!process.env[key]) {
    console.error(`Missing ${key}. Copy server/.env.example to server/.env and fill it in.`);
    process.exit(1);
  }
}

const app = express();

const origins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);
app.use(cors({ origin: origins }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.post('/api/auth/login', login);

app.use('/api', requireAuth);
app.get('/api/meta', (req, res) => res.json({ games: GAMES, wallets: WALLETS, conditions: CONDITIONS, graders: GRADERS, partners: PARTNERS }));
app.use('/api/cards', cards);
app.use('/api/purchases', purchases);
app.use('/api/binder', binder);
app.use('/api/wallets', wallets);
app.use('/api/stats', stats);
app.use('/api/prices', prices);
app.use('/api/admin', admin);
app.use('/api/trades', trades);
app.use('/api/misc', misc);
app.use('/api/debt', debt);
app.use('/api/setup', setup);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.name === 'ValidationError' || err.name === 'CastError') {
    return res.status(400).json({ error: err.message });
  }
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

const port = process.env.PORT || 4000;
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    app.listen(port, () => console.log(`API listening on port ${port}`));
  })
  .catch((err) => {
    console.error('Could not connect to MongoDB:', err.message);
    process.exit(1);
  });
