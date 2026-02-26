# Rootlink 🔗
> Instant public HTTPS URLs for your local server — like ngrok, self-hosted.

## How It Works

```
Your Browser (UI) → Rootlink Server → WebSocket Tunnel → Your Machine → localhost:PORT
```

1. Open the Rootlink UI, enter your local URL (e.g. `http://localhost:3000`)
2. Click **Share** — a tunnel ID is created and a public URL is shown
3. Run the CLI client command shown in the UI
4. Anyone visiting the public URL gets your local server's responses in real time

---

## Project Structure

```
Rootlink/
├── server/          ← Backend (Node.js + Express + WebSocket)
│   ├── index.js
│   ├── package.json
│   └── .env.example
├── client/          ← CLI client (runs on your machine)
│   ├── index.js
│   └── package.json
├── frontend/        ← Web UI (Vite + React)
│   ├── src/App.jsx
│   ├── src/index.css
│   └── .env
└── README.md
```

---

## Quick Start (Local Development)

### 1. Start the Server

```bash
cd server
npm install
node index.js
# Server running at http://localhost:3001
```

### 2. Start the Frontend

```bash
cd frontend
npm install
npm run dev
# UI at http://localhost:5173
```

### 3. Start a Local Test Server (optional)

```bash
node -e "require('http').createServer((req,res)=>res.end('hello from local!')).listen(4444)"
```

### 4. Use the UI

- Open `http://localhost:5173`
- Enter `http://localhost:4444`
- Click **Share**
- Copy the CLI command shown and run it:

```bash
cd client
npm install
node index.js http://localhost:4444 <tunnelId> ws://localhost:3001
```

- Visit the public URL shown (e.g. `http://localhost:3001/t/<tunnelId>/`)
- You should see **hello from local!**

---

## Deployment

### Server → Railway (Free Tier)

1. Push `server/` to a GitHub repo
2. Create a new Railway project → Deploy from GitHub
3. Railway will auto-detect Node.js and run `npm start`
4. Your server URL will be something like `https://rootlink-production.up.railway.app`

### Server → Render (Free Tier)

1. Push `server/` to GitHub
2. Create a new **Web Service** on Render
3. Build command: `npm install` · Start command: `node index.js`
4. Set environment variable: `PORT=10000` (Render uses 10000)

### Frontend → Vercel / Netlify

1. Update `frontend/.env.production`:
   ```
   VITE_SERVER_URL=https://your-server.up.railway.app
   ```
2. Push `frontend/` and deploy to Vercel or Netlify
3. Build command: `npm run build` · Output: `dist/`

---

## CLI Client Usage

```bash
node client/index.js <localUrl> <tunnelId> [serverWsUrl]

# Examples:
node client/index.js http://localhost:3000 abc12345
node client/index.js http://localhost:3000 abc12345 wss://rootlink.up.railway.app
```

---

## Notes

- The tunnel is **path-based**: `https://server-url/t/<tunnelId>/`
- Keep the CLI client running while you want the tunnel active
- The server holds tunnels in memory — restarting the server disconnects all tunnels
- Supports all HTTP methods (GET, POST, PUT, DELETE, etc.)
- Request body, headers, and binary responses are all forwarded correctly

---

## Tech Stack

| Component | Tech |
|-----------|------|
| Server | Node.js, Express, ws (WebSocket) |
| Client | Node.js (zero extra dependencies for forwarding) |
| Frontend | Vite + React |
| Hosting | Railway / Render (server) + Vercel / Netlify (UI) |
