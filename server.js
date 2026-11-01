// Navi Beauty — zero-dependency Node.js server (static files + JSON API).
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, 'public');
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data', 'db.json');
const SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const PRODUCTS = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'products.json'), 'utf8'));
const FREE_SHIPPING_OVER = 150, SHIPPING = 8;

/* ---------- tiny JSON "database" ---------- */
let db = { users: [], orders: [] };
try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch {}
const save = () => {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  fs.writeFileSync(DB_FILE + '.tmp', JSON.stringify(db, null, 2));
  fs.renameSync(DB_FILE + '.tmp', DB_FILE);
};

/* ---------- auth helpers ---------- */
const b64 = b => Buffer.from(b).toString('base64url');
const sign = s => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');
const makeToken = uid => { const p = b64(JSON.stringify({ uid, exp: Date.now() + 7 * 864e5 })); return p + '.' + sign(p); };
function readToken(req) {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  const [p, s] = t.split('.');
  if (!p || !s || sign(p) !== s) return null;
  try { const d = JSON.parse(Buffer.from(p, 'base64url')); return d.exp > Date.now() ? db.users.find(u => u.id === d.uid) : null; } catch { return null; }
}
const hash = (pw, salt = crypto.randomBytes(16).toString('hex')) => salt + ':' + crypto.scryptSync(pw, salt, 64).toString('hex');
const verify = (pw, h) => { const [salt, k] = h.split(':'); return crypto.timingSafeEqual(Buffer.from(hash(pw, salt).split(':')[1], 'hex'), Buffer.from(k, 'hex')); };
const publicUser = u => ({ id: u.id, name: u.name, email: u.email });

/* ---------- http helpers ---------- */
const send = (res, code, data) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
const readBody = req => new Promise((ok, no) => {
  let b = ''; req.on('data', c => { b += c; if (b.length > 1e5) { no(new Error('Body too large')); req.destroy(); } });
  req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch { no(new Error('Invalid JSON')); } });
});
const clean = (v, n = 120) => String(v || '').trim().slice(0, n);

/* ---------- API ---------- */
async function api(req, res, url) {
  const p = url.pathname.replace(/^\/api/, ''), m = req.method;

  if (m === 'GET' && p === '/products') {
    const q = clean(url.searchParams.get('q')).toLowerCase(), cat = url.searchParams.get('category'), sort = url.searchParams.get('sort');
    let list = PRODUCTS.filter(x => (!cat || cat === 'all' || x.category === cat) && (!q || (x.name + x.desc + x.category + x.notes.join(' ')).toLowerCase().includes(q)));
    if (sort === 'price-asc') list.sort((a, b) => a.price - b.price);
    else if (sort === 'price-desc') list.sort((a, b) => b.price - a.price);
    else if (sort === 'rating') list.sort((a, b) => b.rating - a.rating);
    else list.sort((a, b) => b.featured - a.featured);
    return send(res, 200, { products: list, freeShippingOver: FREE_SHIPPING_OVER, shipping: SHIPPING });
  }
  if (m === 'GET' && p.startsWith('/products/')) {
    const x = PRODUCTS.find(i => i.id === p.split('/')[2]);
    return x ? send(res, 200, x) : send(res, 404, { error: 'Product not found' });
  }
  if (m === 'POST' && p === '/auth/register') {
    const b = await readBody(req), email = clean(b.email).toLowerCase(), name = clean(b.name, 60);
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || String(b.password || '').length < 6) return send(res, 400, { error: 'Enter your name, a valid email and a password of 6+ characters.' });
    if (db.users.some(u => u.email === email)) return send(res, 409, { error: 'An account with this email already exists. Sign in instead.' });
    const u = { id: crypto.randomUUID(), name, email, pw: hash(b.password) };
    db.users.push(u); save();
    return send(res, 201, { token: makeToken(u.id), user: publicUser(u) });
  }
  if (m === 'POST' && p === '/auth/login') {
    const b = await readBody(req), u = db.users.find(x => x.email === clean(b.email).toLowerCase());
    if (!u || !verify(String(b.password || ''), u.pw)) return send(res, 401, { error: 'Email or password is incorrect.' });
    return send(res, 200, { token: makeToken(u.id), user: publicUser(u) });
  }
  if (m === 'GET' && p === '/auth/me') {
    const u = readToken(req); return u ? send(res, 200, { user: publicUser(u) }) : send(res, 401, { error: 'Please sign in.' });
  }
  if (m === 'POST' && p === '/orders') {
    const b = await readBody(req), u = readToken(req), c = b.customer || {};
    const items = (Array.isArray(b.items) ? b.items : []).slice(0, 50).map(i => {
      const pr = PRODUCTS.find(x => x.id === i.id), qty = Math.min(Math.max(parseInt(i.qty) || 0, 0), 20);
      return pr && qty ? { id: pr.id, name: pr.name, price: pr.price, qty } : null; // price always comes from the server
    }).filter(Boolean);
    if (!items.length) return send(res, 400, { error: 'Your bag is empty.' });
    const cust = { name: clean(c.name, 60), email: clean(c.email).toLowerCase(), address: clean(c.address, 200), city: clean(c.city, 60), postcode: clean(c.postcode, 12) };
    if (!cust.name || !/^\S+@\S+\.\S+$/.test(cust.email) || !cust.address || !cust.city || !cust.postcode) return send(res, 400, { error: 'Please complete all delivery details.' });
    const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0), shipping = subtotal >= FREE_SHIPPING_OVER ? 0 : SHIPPING;
    const order = { id: 'LB-' + crypto.randomBytes(3).toString('hex').toUpperCase(), userId: u ? u.id : null, items, customer: cust, subtotal, shipping, total: subtotal + shipping, status: 'Confirmed', createdAt: new Date().toISOString() };
    db.orders.push(order); save();
    return send(res, 201, order);
  }
  if (m === 'GET' && p === '/orders') {
    const u = readToken(req); if (!u) return send(res, 401, { error: 'Please sign in.' });
    return send(res, 200, { orders: db.orders.filter(o => o.userId === u.id).reverse() });
  }
  send(res, 404, { error: 'Not found' });
}

/* ---------- static files ---------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' };
function serveStatic(req, res, url) {
  let f = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
  if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) f = path.join(ROOT, 'index.html'); // SPA fallback
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': f.endsWith('.html') ? 'no-cache' : 'public, max-age=3600' });
  fs.createReadStream(f).pipe(res);
}

http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  const url = new URL(req.url, 'http://localhost');
  try { url.pathname.startsWith('/api/') ? await api(req, res, url) : serveStatic(req, res, url); }
  catch (e) { send(res, 400, { error: e.message || 'Bad request' }); }
}).listen(PORT, () => console.log(`Navi Beauty running → http://localhost:${PORT}`));
