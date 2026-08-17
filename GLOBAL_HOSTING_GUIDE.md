# Complete Non-Cloudflare Global Hosting & Tunneling Guide

This guide provides reliable, high-performance alternatives to Cloudflare for hosting and exposing your **Disco Alto Clone App** globally. All Cloudflare components (Cloudflare Tunnels and Cloudflare STUN) have been completely removed from this repository.

---

## 🚀 Instant Global Tunneling (Zero Cloudflare Setup)

If you want to quickly share your locally running app with users anywhere in the world:

### Method 1: Pinggy (Recommended - Zero Installation)
Pinggy uses standard SSH (available on Windows, Mac, Linux) with no additional software downloads or account setups required. It provides full WebSocket and HTTP/2 support without Cloudflare's WebSocket drop issues.

1. **Start your local app**:
   - Backend: `python run.py` (running on `http://localhost:8000`)
   - Frontend: `npm run dev` (running on `http://localhost:5173`)

2. **Open a new terminal and run**:
   ```bash
   ssh -R 80:localhost:5173 a.pinggy.io
   ```
3. Copy the generated `https://....pinggy.link` public URL and share it!

---

### Method 2: Localtunnel (Free npm package)
Expose your local Vite dev server using `npx`:

```bash
npx localtunnel --port 5173
```
*Note: Localtunnel provides a free public URL with full WebSocket forwarding.*

---

### Method 3: ngrok (Industry Standard)
If you have `ngrok` installed:

```bash
ngrok http 5173
```

---

## 🌐 24/7 Production Deployment (Free Cloud Hosting)

For permanent global hosting without needing your local computer turned on:

### 1. Deploying the Backend (FastAPI + Socket.IO WebSockets)
- **Recommended Host**: [Render.com](https://render.com) or [Railway.app](https://railway.app)
- **Service Type**: Web Service (Python 3.10+)
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- **Environment Variables**:
  - `SECRET_KEY`: (Generate any random secure string)

### 2. Deploying the Frontend (React + Vite)
- **Recommended Host**: [Vercel](https://vercel.com) or [Netlify](https://netlify.com)
- **Framework Preset**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Environment Variables**:
  - `VITE_API_URL`: `https://your-backend-app.onrender.com/api`
  - `VITE_SOCKET_URL`: `https://your-backend-app.onrender.com`

---

## 🎙️ Global WebRTC Voice & P2P File Transfer (STUN/TURN)

Cloudflare's STUN server (`stun.cloudflare.com`) has been replaced with multi-region high-availability STUN and TURN relays:

- **Google STUN**: `stun:stun.l.google.com:19302`
- **Twilio STUN**: `stun:global.stun.twilio.com:3478`
- **Mozilla STUN**: `stun:stun.services.mozilla.com`
- **OpenRelay TURN**: `turn:openrelay.metered.ca:443` (Supports UDP & TCP fallback for WebRTC behind restrictive firewalls/NATs)

This guarantees reliable peer-to-peer audio, video, screen sharing, and unlimited P2P file transfers across all global networks.
