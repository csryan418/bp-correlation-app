# BP Correlation App

A personal health dashboard that correlates blood pressure with sleep, activity, food, and hydration data.

## Stack
- **Backend**: Node.js / Express on port 3001
- **Frontend**: React / Vite on port 5173
- **Database**: SQLite (better-sqlite3) at `./data/health.db`
- **Data sources**: Oura Ring API, Apple Health (via iOS app), USDA food database

## Local development

### Frontend (dev server)
```bash
cd ~/bp-correlation/client && npm run dev
```
Then open http://localhost:5173 (the Vite dev server proxies `/api` to the
backend on port 3001).

### Backend
The backend runs automatically via launchd on login, so it's normally already
running. Don't start a second copy with `node server.js` while the service is
up — both bind port 3001 and the second will fail with `EADDRINUSE`.

- **To watch logs:** `tail -f logs/server.log` (or `logs/server-error.log`)
- **To run it in the foreground yourself:** stop the launchd service first
  (see Operations), then `cd ~/bp-correlation && node server.js`

### Health / data checks
```bash
# Is the backend up?
curl http://localhost:3001/api/health

# Manually trigger an Oura sync
curl http://localhost:3001/api/oura/sync
```

## Operations (remote / production)

The frontend and API are reached over zrok tunnels.

### Start the zrok tunnels (frontend + API)
```bash
bash ~/bp-correlation/start-tunnels.sh
```

> **Gotcha:** on the free zrok tier the tunnel URLs rotate on every tunnel
> restart. After re-tunneling, update the BPHealthSync backend URL by hand to
> point at the new API tunnel URL — nothing does this automatically.

### Restart the backend service
```bash
launchctl stop com.bpcorrelation.server && launchctl start com.bpcorrelation.server
```

## Project structure
