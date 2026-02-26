const express = require('express');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

// ---------- Middleware ----------
app.use(cors({ origin: '*' }));
app.use(express.json());

// ---------- Tunnel Registry ----------
const tunnels = new Map();

// ---------- HTML Path Rewriter ----------
// Rewrites absolute asset paths in HTML so JS/CSS load through the tunnel
function rewriteHtml(html, tunnelId) {
  const base = `/t/${tunnelId}`;
  html = html.replace(/((?:src|href|action|content|data-[\w-]+)=["'])\/(?!\/)/g, `$1${base}/`);
  html = html.replace(/url\(["']?\/(?!\/)/g, `url(${base}/`);
  html = html.replace(/(<head[^>]*>)/i, `$1\n  <base href="${base}/">`);
  return html;
}

// ---------- REST API ----------
app.get('/health', (req, res) => {
  res.json({ status: 'ok', tunnels: tunnels.size });
});

app.get('/api/new', (req, res) => {
  const tunnelId = uuidv4().slice(0, 8);
  res.json({ tunnelId });
});

app.get('/api/status/:tunnelId', (req, res) => {
  const { tunnelId } = req.params;
  res.json({ tunnelId, connected: !!tunnels.get(tunnelId) });
});

// ---------- Tunnel Request Handler ----------
app.all('/t/:tunnelId*', async (req, res) => {
  const { tunnelId } = req.params;
  const tunnel = tunnels.get(tunnelId);

  if (!tunnel || tunnel.ws.readyState !== WebSocket.OPEN) {
    return res.status(503).send(`<!DOCTYPE html>
<html>
  <head><title>Rootlink — Tunnel Offline</title></head>
  <body style="background:#0c0c0c;color:#f0f0f0;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:8px">
    <h2 style="margin:0;font-size:18px;font-weight:600">Tunnel Offline</h2>
    <p style="color:#888;margin:0;font-size:14px">Tunnel <code style="color:#4ade80">${tunnelId}</code> is not connected.<br>Run the CLI client to activate it.</p>
  </body>
</html>`);
  }

  const reqId = uuidv4();

  const body = await new Promise((resolve) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(chunks.length ? Buffer.concat(chunks).toString('base64') : null));
  });

  const rawPath = req.originalUrl.replace(`/t/${tunnelId}`, '') || '/';

  const message = JSON.stringify({
    type: 'request',
    reqId,
    method: req.method,
    path: rawPath,
    headers: { ...req.headers, host: undefined },
    body,
  });

  tunnel.pendingRequests.set(reqId, { res, tunnelId });

  const timeout = setTimeout(() => {
    if (tunnel.pendingRequests.has(reqId)) {
      tunnel.pendingRequests.delete(reqId);
      res.status(504).send('Gateway Timeout');
    }
  }, 30000);

  tunnel.pendingRequests.get(reqId).timeout = timeout;

  try {
    tunnel.ws.send(message);
  } catch (err) {
    clearTimeout(timeout);
    tunnel.pendingRequests.delete(reqId);
    res.status(502).send('Failed to forward request to tunnel client.');
  }
});

// ---------- WebSocket Server ----------
const wss = new WebSocketServer({ server, path: '/ws/client' });

// Ping all connected clients every 25 seconds to keep connections alive on Render
const PING_INTERVAL = 25000;
const pingTimer = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  });
}, PING_INTERVAL);

wss.on('close', () => clearInterval(pingTimer));

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const tunnelId = url.searchParams.get('tunnelId');

  if (!tunnelId) {
    ws.close(4000, 'Missing tunnelId');
    return;
  }

  console.log(`[+] Tunnel connected: ${tunnelId}`);
  tunnels.set(tunnelId, { ws, pendingRequests: new Map() });
  ws.send(JSON.stringify({ type: 'connected', tunnelId }));

  // Track pong responses — if client stops responding, clean up
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'response') {
        const { reqId, status, headers, body } = msg;
        const tunnel = tunnels.get(tunnelId);
        if (!tunnel) return;

        const pending = tunnel.pendingRequests.get(reqId);
        if (!pending) return;

        clearTimeout(pending.timeout);
        tunnel.pendingRequests.delete(reqId);

        const { res } = pending;

        const skipHeaders = new Set(['transfer-encoding', 'connection', 'keep-alive', 'content-length']);
        Object.entries(headers || {}).forEach(([key, value]) => {
          if (!skipHeaders.has(key.toLowerCase())) {
            try { res.setHeader(key, value); } catch (_) { }
          }
        });

        const contentType = (headers?.['content-type'] || '').toLowerCase();
        const isHtml = contentType.includes('text/html');

        res.status(status || 200);

        if (body) {
          let buf = Buffer.from(body, 'base64');
          if (isHtml) {
            const rewritten = rewriteHtml(buf.toString('utf8'), tunnelId);
            res.setHeader('content-length', Buffer.byteLength(rewritten));
            res.send(rewritten);
          } else {
            res.send(buf);
          }
        } else {
          res.end();
        }
      }
    } catch (err) {
      console.error('WS message error:', err.message);
    }
  });

  ws.on('close', () => {
    console.log(`[-] Tunnel disconnected: ${tunnelId}`);
    const tunnel = tunnels.get(tunnelId);
    if (tunnel) {
      tunnel.pendingRequests.forEach(({ res, timeout }) => {
        clearTimeout(timeout);
        try { res.status(503).send('Tunnel disconnected.'); } catch (_) { }
      });
      tunnels.delete(tunnelId);
    }
  });

  ws.on('error', (err) => {
    console.error(`WS error [${tunnelId}]:`, err.message);
  });
});

// ---------- Start ----------
server.listen(PORT, () => {
  console.log(`Rootlink server running on port ${PORT}`);
});
