/**
 * Production server for TaxIQ.
 * Serves the built app, proxies API requests, and handles auth.
 * 
 * Usage: node server.cjs
 * Then open http://localhost:3000
 */
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

if (!process.env.JWT_SECRET) {
  console.warn('  ⚠  JWT_SECRET not set — sessions will not survive server restarts.');
}

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// In-memory user cache with disk persistence
let usersCache = null;
function readUsers() {
  if (usersCache) return usersCache;
  if (!fs.existsSync(USERS_FILE)) { usersCache = {}; return usersCache; }
  usersCache = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  return usersCache;
}
function writeUsers(users) {
  usersCache = users;
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// Input validation helpers
function isValidUsername(v) {
  return typeof v === 'string' && v.length >= 3 && v.length <= 50 && /^[a-zA-Z0-9_.-]+$/.test(v);
}
function isValidPassword(v) {
  return typeof v === 'string' && v.length >= 6 && v.length <= 128;
}

const app = express();

// Gzip compression for all responses
app.use(compression());

// Rate limiting — auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

// Rate limiting — proxy endpoints
const proxyLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200, // 200 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

app.use(express.json({ limit: '1mb' }));

// ── Auth middleware ──

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ── Auth API routes ──

app.post('/api/register', authLimiter, async (req, res) => {
  const { username, password, displayName } = req.body;
  if (!isValidUsername(username)) {
    return res.status(400).json({ error: 'Username must be 3-50 alphanumeric characters (a-z, 0-9, _, ., -)' });
  }
  if (!isValidPassword(password)) {
    return res.status(400).json({ error: 'Password must be 6-128 characters' });
  }
  const safeDisplayName = typeof displayName === 'string' ? displayName.slice(0, 100).trim() : '';

  const users = readUsers();
  const key = username.toLowerCase();
  if (users[key]) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  const hash = await bcrypt.hash(password, 10);
  users[key] = {
    username,
    displayName: safeDisplayName || username,
    passwordHash: hash,
    createdAt: new Date().toISOString(),
    activity: [],
  };
  writeUsers(users);

  const token = jwt.sign({ username: key }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { username, displayName: users[key].displayName } });
});

app.post('/api/login', authLimiter, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const users = readUsers();
  const key = username.toLowerCase();
  const user = users[key];
  if (!user) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = jwt.sign({ username: key }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { username: user.username, displayName: user.displayName } });
});

app.get('/api/profile', authMiddleware, (req, res) => {
  const users = readUsers();
  const user = users[req.user.username];
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({
    username: user.username,
    displayName: user.displayName,
    createdAt: user.createdAt,
    activity: user.activity || [],
  });
});

app.post('/api/activity', authMiddleware, (req, res) => {
  const { type, summary, details } = req.body;
  if (typeof type !== 'string' || typeof summary !== 'string') {
    return res.status(400).json({ error: 'Activity type and summary are required strings' });
  }
  const users = readUsers();
  const user = users[req.user.username];
  if (!user) return res.status(404).json({ error: 'User not found' });

  const entry = {
    id: crypto.randomUUID(),
    type: type.slice(0, 50),
    summary: summary.slice(0, 200),
    details: typeof details === 'object' && details !== null ? details : {},
    timestamp: new Date().toISOString(),
  };
  if (!user.activity) user.activity = [];
  user.activity.unshift(entry);
  // Keep last 50 activities
  if (user.activity.length > 50) user.activity = user.activity.slice(0, 50);
  writeUsers(users);

  res.json({ activity: entry });
});

// ── API Proxies (bypass CORS for browser requests) ──

app.use('/proxy/amfi', proxyLimiter, createProxyMiddleware({
  target: 'https://www.amfiindia.com',
  changeOrigin: true,
  pathRewrite: { '^/proxy/amfi': '' },
  timeout: 20000,
}));

app.use('/proxy/mfapi', proxyLimiter, createProxyMiddleware({
  target: 'https://api.mfapi.in',
  changeOrigin: true,
  pathRewrite: { '^/proxy/mfapi': '' },
  timeout: 20000,
}));

app.use('/proxy/treasury', proxyLimiter, createProxyMiddleware({
  target: 'https://api.fiscaldata.treasury.gov',
  changeOrigin: true,
  pathRewrite: { '^/proxy/treasury': '' },
  timeout: 20000,
}));

// ── Serve the built React app ──

app.use(express.static(path.join(__dirname, 'dist')));

// SPA fallback: serve index.html for all non-API, non-proxy, non-file routes
app.get('/{*path}', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/proxy/')) return next();
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// ── Start ──

const http = require('http');
const server = http.createServer(app);

server.listen(PORT, () => {
  console.log(`\n  TaxIQ is running!\n`);
  console.log(`  Open in your browser:  http://localhost:${PORT}\n`);
  console.log(`  Press Ctrl+C to stop.\n`);
});
