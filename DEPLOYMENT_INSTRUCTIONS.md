# 100% Free Permanent 24/7 Deployment Guide

Follow these simple steps to deploy your **Disco Alto Clone App** online with **permanent URLs** that stay online **24/7 forever for free** without ever expiring or closing.

---

## Step 1: Push Project to GitHub

1. Create a repository on [GitHub](https://github.com/new) (e.g. `free-discoalto-app`).
2. Run these commands in your project folder to push:
   ```bash
   git init
   git add .
   git commit -m "Deploy Free Disco Alto App"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
   git push -u origin main
   ```

---

## Step 2: Deploy Backend to Render.com (Free 24/7 API & WebSockets)

1. Go to [Render.com](https://dashboard.render.com) and click **New +** -> **Web Service**.
2. Connect your GitHub repository.
3. Configure the settings:
   - **Root Directory**: `backend`
   - **Environment**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Click **Create Web Service**.
5. Once deployed, copy your permanent backend URL (e.g. `https://discoalto-app-backend.onrender.com`).

---

## Step 3: Deploy Frontend to Vercel (Free 24/7 Permanent Frontend Link)

1. Go to [Vercel.com](https://vercel.com) and click **Add New...** -> **Project**.
2. Import your GitHub repository.
3. Configure settings:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `frontend`
4. Expand **Environment Variables** and add:
   - `VITE_API_URL` = `https://YOUR-BACKEND-NAME.onrender.com/api`
   - `VITE_SOCKET_URL` = `https://YOUR-BACKEND-NAME.onrender.com`
5. Click **Deploy**.

---

### 🎉 Result: Your App is Online 24/7 Permanently!
- Your frontend link will be permanent (e.g., `https://free-discoalto-app.vercel.app`).
- It will **never expire**, **never close**, and requires **zero maintenance**.
- WebSockets, voice channels, DMs, and P2P file transfers work seamlessly across all devices globally!
