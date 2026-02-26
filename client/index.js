#!/usr/bin/env node
/**
 * Rootlink Client
 * Usage: node index.js <localUrl> <tunnelId> [serverUrl]
 * Example: node index.js http://localhost:3000 abc12345 wss://rootlink.up.railway.app
 */

const { WebSocket } = require('ws');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const args = process.argv.slice(2);
if (args.length < 2) {
    console.error('\n  Usage: node index.js <localUrl> <tunnelId> [serverUrl]\n');
    console.error('  Example: node index.js http://localhost:3000 abc12345\n');
    process.exit(1);
}

const localUrl = args[0].replace(/\/$/, ''); // strip trailing slash
const tunnelId = args[1];
const serverUrl = args[2] || process.env.ROOTLINK_SERVER || 'ws://localhost:3001';
// Note: when connecting to Render, use wss:// (e.g. wss://rootlink.onrender.com)

// Convert http(s) to ws(s) if needed
const wsBase = serverUrl.replace(/^http/, 'ws').replace(/\/$/, '');
const wsUrl = `${wsBase}/ws/client?tunnelId=${tunnelId}`;

// ---- Colour helpers (no dependencies) ----
const c = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    cyan: '\x1b[36m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    grey: '\x1b[90m',
    bold: '\x1b[1m',
};
const fmt = (color, str) => `${color}${str}${c.reset}`;

function log(type, msg) {
    const ts = new Date().toISOString().slice(11, 19);
    const prefix = {
        info: fmt(c.cyan, '  info'),
        ok: fmt(c.green, '    ok'),
        req: fmt(c.yellow, '   req'),
        err: fmt(c.red, ' error'),
        grey: fmt(c.grey, '      '),
    }[type] || '      ';
    console.log(`${fmt(c.grey, ts)} ${prefix}  ${msg}`);
}

// ---- Forward a request to the local server ----
async function forwardToLocal(reqData) {
    return new Promise((resolve) => {
        const { method, path, headers, body } = reqData;
        const targetUrl = `${localUrl}${path || '/'}`;

        let parsedUrl;
        try {
            parsedUrl = new URL(targetUrl);
        } catch {
            return resolve({ status: 400, headers: {}, body: null });
        }

        const isHttps = parsedUrl.protocol === 'https:';
        const lib = isHttps ? https : http;

        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (isHttps ? 443 : 80),
            path: parsedUrl.pathname + (parsedUrl.search || ''),
            method: method || 'GET',
            headers: {
                ...headers,
                host: parsedUrl.host,
            },
        };

        // Remove hop-by-hop headers
        ['connection', 'transfer-encoding', 'upgrade', 'keep-alive'].forEach(
            (h) => delete options.headers[h]
        );

        const proxyReq = lib.request(options, (proxyRes) => {
            const chunks = [];
            proxyRes.on('data', (chunk) => chunks.push(chunk));
            proxyRes.on('end', () => {
                const bodyBuffer = chunks.length ? Buffer.concat(chunks) : null;
                resolve({
                    status: proxyRes.statusCode,
                    headers: proxyRes.headers,
                    body: bodyBuffer ? bodyBuffer.toString('base64') : null,
                });
            });
            proxyRes.on('error', () => resolve({ status: 502, headers: {}, body: null }));
        });

        proxyReq.on('error', (err) => {
            log('err', `Local server error: ${err.message}`);
            resolve({
                status: 502,
                headers: { 'content-type': 'text/plain' },
                body: Buffer.from(`Local server error: ${err.message}`).toString('base64'),
            });
        });

        if (body) {
            proxyReq.write(Buffer.from(body, 'base64'));
        }
        proxyReq.end();
    });
}

// ---- WebSocket connection ----
let ws;
let reconnectDelay = 2000;
let shouldReconnect = true;

function connect() {
    log('info', `Connecting to Rootlink server...`);
    ws = new WebSocket(wsUrl);

    ws.on('open', () => {
        reconnectDelay = 2000;
        log('info', `WebSocket connected. Waiting for tunnel confirmation...`);
    });

    ws.on('message', async (data) => {
        let msg;
        try {
            msg = JSON.parse(data.toString());
        } catch {
            return;
        }

        if (msg.type === 'connected') {
            const httpBase = wsBase.replace(/^ws/, 'http');
            console.log('');
            console.log(fmt(c.bold, '  ✅ Tunnel Active!'));
            console.log('');
            console.log(`  ${fmt(c.grey, 'Local:')}   ${fmt(c.cyan, localUrl)}`);
            console.log(`  ${fmt(c.grey, 'Public:')}  ${fmt(c.green + c.bold, `${httpBase}/t/${tunnelId}/`)}`);
            console.log('');
            console.log(fmt(c.grey, '  Press Ctrl+C to stop the tunnel.\n'));
            return;
        }

        if (msg.type === 'request') {
            const { reqId, method, path } = msg;
            log('req', `${fmt(c.yellow, method)} ${path}`);

            const response = await forwardToLocal(msg);

            log('ok', `${fmt(c.green, String(response.status))} ${path}`);

            ws.send(
                JSON.stringify({
                    type: 'response',
                    reqId,
                    status: response.status,
                    headers: response.headers,
                    body: response.body,
                })
            );
        }
    });

    ws.on('close', (code, reason) => {
        log('err', `Disconnected (${code}${reason ? ': ' + reason : ''})`);
        if (shouldReconnect) {
            log('info', `Reconnecting in ${reconnectDelay / 1000}s...`);
            setTimeout(connect, reconnectDelay);
            reconnectDelay = Math.min(reconnectDelay * 1.5, 15000);
        }
    });

    // Respond to server pings so Render doesn't close the connection
    ws.on('ping', () => {
        ws.pong();
    });

    ws.on('error', (err) => {
        log('err', `WebSocket error: ${err.message}`);
    });
}

process.on('SIGINT', () => {
    shouldReconnect = false;
    log('info', 'Closing tunnel...');
    if (ws) ws.close();
    process.exit(0);
});

// ---- Banner ----
console.log('');
console.log(fmt(c.bold + c.cyan, '  ╔═══════════════════════════╗'));
console.log(fmt(c.bold + c.cyan, '  ║   🔗  Rootlink Client     ║'));
console.log(fmt(c.bold + c.cyan, '  ╚═══════════════════════════╝'));
console.log('');

connect();
