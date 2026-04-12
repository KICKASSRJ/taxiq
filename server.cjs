/**
 * Production server for CAMS FBAR Tracker.
 * Serves the built app and proxies API requests to bypass CORS.
 * 
 * Usage: node server.js
 * Then open http://localhost:3000
 */
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

const PORT = process.env.PORT || 3000;
const app = express();

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

// SPA fallback: serve index.html for all non-API, non-file routes
app.get('/{*path}', (req, res) => {
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
