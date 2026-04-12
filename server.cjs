/**
 * Production server for CAMS FBAR Tracker.
 * Serves the built app, proxies API requests, and handles auth.
 * 
 * Usage: node server.cjs
 * Then open http://localhost:3000
 */
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Simple JSON file store
function readUsers() {
  if (!fs.existsSync(USERS_FILE)) return {};
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}
function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

const app = express();
app.use(express.json());

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

app.post('/api/register', async (req, res) => {
  const { username, password, displayName } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  if (username.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const users = readUsers();
  const key = username.toLowerCase();
  if (users[key]) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  const hash = await bcrypt.hash(password, 10);
  users[key] = {
    username,
    displayName: displayName || username,
    passwordHash: hash,
    createdAt: new Date().toISOString(),
    activity: [],
  };
  writeUsers(users);

  const token = jwt.sign({ username: key }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { username, displayName: users[key].displayName } });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
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
  const users = readUsers();
  const user = users[req.user.username];
  if (!user) return res.status(404).json({ error: 'User not found' });

  const entry = {
    id: crypto.randomUUID(),
    type: type || 'fbar_report',
    summary: summary || '',
    details: details || {},
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

app.use('/proxy/amfi', createProxyMiddleware({
  target: 'https://www.amfiindia.com',
  changeOrigin: true,
  pathRewrite: { '^/proxy/amfi': '' },
  timeout: 20000,
}));

app.use('/proxy/mfapi', createProxyMiddleware({
  target: 'https://api.mfapi.in',
  changeOrigin: true,
  pathRewrite: { '^/proxy/mfapi': '' },
  timeout: 20000,
}));

app.use('/proxy/treasury', createProxyMiddleware({
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
  console.log(`\n  CAMS FBAR Tracker is running!\n`);
  console.log(`  Open in your browser:  http://localhost:${PORT}\n`);
  console.log(`  Press Ctrl+C to stop.\n`);
});
