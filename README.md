# Stasis Cards

This app tracks your TCG inventory, sales, binder cards, and wallets: Cash, Venmowen, Benmo, and Zelle.

- **`server/`** is a Node and Express API backed by MongoDB. It deploys to **Heroku**.
- **`client/`** is a React app built with Vite. It deploys to **GitHub Pages**.

## 1. Run it on your computer

You need Node 20 or newer and a MongoDB database. The free tier of [MongoDB Atlas](https://www.mongodb.com/atlas) works.

### Start the API

```bash
cd server
npm install
copy .env.example .env      # macOS/Linux: cp .env.example .env
```

Edit `server/.env` with these values:

| Variable | What it is |
|---|---|
| `MONGODB_URI` | Your Atlas connection string. In Atlas, go to Database → Connect → Drivers. Add `/stasis-cards` before the `?`. |
| `APP_PASSWORD` | The shared password you and your partner use to log in. |
| `JWT_SECRET` | Any long random string. |
| `CLIENT_ORIGIN` | `http://localhost:5173` while developing. Add your GitHub Pages URL later. |
| `TCGAPI_KEY` | A free key from [tcgapi.dev](https://tcgapi.dev). It provides market prices and images for Pokémon, One Piece, and Riftbound. |
| `POKEMONTCG_API_KEY` | Optional. A free key from [dev.pokemontcg.io](https://dev.pokemontcg.io) that raises Pokémon limits. |
| `PRICECHARTING_TOKEN` | Optional and paid. Adds real graded prices for PSA, CGC, and BGS cards. |

Then run:

```bash
npm run dev                 # API on http://localhost:4000
```

In Atlas, under Network Access, allow your IP address. Allow `0.0.0.0/0` as well for Heroku.

### Start the site

```bash
cd client
npm install
copy .env.example .env.local
npm run dev                 # open http://localhost:5173
```

Log in with your `APP_PASSWORD`. Then open **Admin** and set your starting capital. The first time, choose which wallet holds that money so your balances start out correct.

## 2. Deploy the API to Heroku

Run these from the repo root after installing the [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli):

```bash
heroku create stasis-cards-api
heroku config:set MONGODB_URI="..." APP_PASSWORD="..." JWT_SECRET="..." TCGAPI_KEY="..." CLIENT_ORIGIN="https://YOUR-USER.github.io"
git subtree push --prefix server heroku main
```

Check that it's running at `https://stasis-cards-api-xxxx.herokuapp.com/api/health`.

## 3. Deploy the site to GitHub Pages

1. Push this repo to GitHub.
2. Create `client/.env.production` containing `VITE_API_URL=https://YOUR-HEROKU-APP.herokuapp.com`.
3. Run `cd client && npm run deploy`. This builds the site and publishes it to the `gh-pages` branch.
4. In your GitHub repo, go to Settings → Pages and set the source to the **`gh-pages`** branch.

The site will be live at `https://YOUR-USER.github.io/stasis-cards/`. Make sure that origin is listed in the API's `CLIENT_ORIGIN`.

## How the numbers work

- **ROI** is (liquid + inventory at market + binder cost basis − starting capital) ÷ starting capital.
- **Wallet balances** are calculated from a ledger of every money movement: purchases, sales, binder deals, transfers, and Admin corrections. Nothing is stored as a loose number that can drift.
- **% of market paid** is cost ÷ market value at the time of purchase. It's saved on each card and never changes.
- **Bulk purchases:** when you fill in **Total purchase cost**, each card's cost is total × (card market ÷ total market). Leave it blank to enter each card's price yourself.
- **Binder cards** are tracked as one pool. A binder sale removes cards at the pool's average cost, and the profit is calculated from that.
- **Dates** default to today at UTC-7.

## Market prices and images

- On **Add purchase**, typing a card name and number looks up its market price and image automatically. You can also click **Find price**.
- **Update market prices** on the Dashboard refreshes every in-stock card in the background. It updates the oldest prices first.
  - The free TCG API plan allows 100 lookups a day. If you have more cards than that, the job stops at the limit and tells you. Run it again the next day, or upgrade the plan.
- Pokémon cards check the free pokemontcg.io database first, which saves TCG API lookups.
- **Graded cards** use PriceCharting when `PRICECHARTING_TOKEN` is set. Otherwise they show the raw price, labeled "(raw)".
- **Manual override:** the **$** button on a card sets its price by hand. "Back to auto" turns automatic updates back on.
- **Quick-check links** to TCGplayer, eBay sold listings, and 130point appear on every card.

### Card images

- Card images come from the price APIs.
- When no image is found, the card shows its game's logo from `client/public/logos/` (`pokemon.svg`, `one-piece.svg`, `riftbound.svg`, `misc.svg`). Those files are neutral placeholders for now. Replace them with the real logos under the same file names. PNG files work too if you update the extension in `client/src/format.js`.

## API reference

All routes except `/api/health` and `/api/auth/login` require `Authorization: Bearer <token>`.

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/auth/login` | `{ password }` returns `{ token }` |
| GET | `/api/stats` | All dashboard numbers |
| GET | `/api/cards?status=in_stock\|sold\|all&game=&q=` | List cards |
| GET, PATCH, DELETE | `/api/cards/:id` | Read, edit, or delete a card. `marketPrice` in a PATCH sets a manual price; `null` clears it. |
| POST | `/api/cards` | Create a card without a purchase |
| POST | `/api/cards/:id/sell` | `{ price, method, date?, fees? }` |
| POST | `/api/cards/:id/unsell` | Undo a sale |
| POST | `/api/cards/:id/refresh` | Re-fetch one card's price and image |
| GET, POST | `/api/purchases` | List purchases, or create one: `{ date?, paidFrom, totalCost?, cards: [...] }` |
| GET, PATCH, DELETE | `/api/purchases/:id` | Read, edit date or wallet, or delete (with its cards and money) |
| GET | `/api/binder` | Pool summary and history |
| POST | `/api/binder/buy`, `/api/binder/sell` | `{ count, amount, method, date? }` |
| DELETE | `/api/binder/:id` | Remove a binder entry |
| GET | `/api/wallets` | Balances |
| GET | `/api/wallets/transactions` | Ledger |
| POST | `/api/wallets/transfer` | `{ from, to='Cash', amount, date? }` |
| GET | `/api/prices/lookup?name=&number=&game=` | Price and image lookup |
| POST | `/api/prices/update` | Start a full price update. Check progress with `GET /api/prices/status`. |
| GET | `/api/admin` | Settings, log, and wallets |
| PUT | `/api/admin/capital` | `{ amount, note?, depositTo? }` |
| PUT | `/api/admin/wallets` | `{ balances: { Cash: 100, ... }, note? }` |
