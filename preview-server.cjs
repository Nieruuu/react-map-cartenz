const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 4174;

// Serve static files from dist
app.use(express.static('dist'));

// API proxy middleware
const apiProxy = createProxyMiddleware('/api', {
  target: 'https://retfw.smartgov.id',
  changeOrigin: true,
  secure: true,
  pathRewrite: {
    '^/api': '/framework',
  },
  onProxyReq: (proxyReq, req, res) => {
    // Add headers to match the original Vite proxy
    proxyReq.setHeader('Accept', '*/*');
    proxyReq.setHeader('Origin', 'https://retfw.smartgov.id');
    proxyReq.setHeader('Referer', 'https://retfw.smartgov.id/');
  },
  onProxyRes: (proxyRes, req, res) => {
    // Add CORS headers
    proxyRes.headers['Access-Control-Allow-Origin'] = req.headers.origin || '*';
    proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
    proxyRes.headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type, Accept, Origin, User-Agent, DNT, Cache-Control, X-Mx-ReqToken, Keep-Alive, X-Requested-With, If-Modified-Since';
    proxyRes.headers['Access-Control-Allow-Credentials'] = 'true';
  },
});

// Handle preflight requests
app.options('/api/*', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, Origin, User-Agent, DNT, Cache-Control, X-Mx-ReqToken, Keep-Alive, X-Requested-With, If-Modified-Since');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.send(200);
});

// Use API proxy
app.use('/api', apiProxy);

// Handle SPA routing - serve index.html for all non-file requests
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Preview server running at http://localhost:${PORT}`);
  console.log(`API proxy: /api/* -> https://retfw.smartgov.id/framework/*`);
});