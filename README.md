# BP Correlation App

A personal health dashboard that correlates blood pressure with sleep, activity, food, and hydration data.

## Stack
- **Backend**: Node.js / Express on port 3001
- **Frontend**: React / Vite on port 5174
- **Database**: SQLite (better-sqlite3) at `./data/health.db`
- **Data sources**: Oura Ring API, Apple Health (via iOS app), USDA food database

## Starting the app

### Backend (runs automatically via launchd)
The backend starts automatically on login. To check if it's running:
```bash
curl http://localhost:3001/api/health
```

To restart manually:
```bash
cd ~/bp-correlation && node server.js
```

### Frontend (dev server)
```bash
cd ~/bp-correlation/client && npm run dev
```
Then open http://localhost:5174

## Key commands
```bash
# Manually trigger Oura sync
curl http://localhost:3001/api/oura/sync

# Check today's data
curl http://localhost:3001/api/health

# Restart launchd backend service
launchctl unload ~/Library/LaunchAgents/com.bpcorrelation.server.plist
launchctl load ~/Library/LaunchAgents/com.bpcorrelation.server.plist
```

## Project structure
