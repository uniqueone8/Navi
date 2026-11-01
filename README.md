# Navi — 3D glossy beauty storefront

A full-stack e-commerce demo for skincare, makeup and fragrance, featuring Estée Lauder products.

- **Frontend:** vanilla JS, a Three.js 3D pearl-and-ring background, tilting 3D product cards, iOS-style glossy buttons with spring transitions.
- **Backend:** Node.js (no dependencies). REST API for products, accounts (scrypt-hashed passwords, signed tokens) and orders. Prices are always recalculated on the server.
- **Storage:** JSON file at `data/db.json` (created automatically).

## Run locally
```bash
node server.js          # needs Node 18+
# open http://localhost:3000
```

## Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit: Navi beauty store"
git branch -M main
git remote add origin https://github.com/<your-username>/navi.git
git push -u origin main
```

## Publish as a website
**Render (easiest, free tier):** New → Web Service → connect your GitHub repo. Render reads `render.yaml`; build command is empty, start command is `node server.js`.

**Railway / Fly.io / any VPS:** deploy the repo as a Node app, or use the included `Dockerfile`.

Set `JWT_SECRET` as an environment variable in production (Render generates one for you).
Note: free hosts often reset the disk on redeploy, so `data/db.json` may be wiped. For real use, swap it for Postgres or MongoDB.

## API
| Method | Path | Notes |
|---|---|---|
| GET | `/api/products?category=&q=&sort=` | sort: featured, price-asc, price-desc, rating |
| GET | `/api/products/:id` | |
| POST | `/api/auth/register`, `/api/auth/login` | returns `{token,user}` |
| GET | `/api/auth/me` | Bearer token |
| POST | `/api/orders` | guest or signed in |
| GET | `/api/orders` | your orders |

## Customising
- **Products and prices:** edit `data/products.json`. Prices are indicative USD; check them against the official store before launch.
- **Real product photos:** add `"image": "/img/serum.jpg"` to a product and place the file in `public/img/`. Only use images you are licensed to use. Official Estée Lauder imagery is copyrighted, so get permission or use a retailer/affiliate feed. Without an `image`, a generated SVG bottle is shown.
- **Payments:** the checkout is a demo. Add Stripe Checkout or Razorpay in `POST /api/orders` before taking real money.

## Disclaimer
Demo project, not affiliated with or endorsed by The Estée Lauder Companies.
