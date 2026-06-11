import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';
import { getDb } from './src/db/index.js';
import { ping } from './src/services/wearables.js';
import { runOuraSync } from './src/controllers/oura.js';
import routes from './src/routes/index.js';
import { deduplicateSupplements } from './src/controllers/supplements.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Ensure data directory exists for SQLite
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: '50mb' }));
app.use('/api', routes);

// Serve React build in production
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, 'client', 'dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

// Daily Oura sync at 8:30am
cron.schedule('0 12 * * *', async () => {
  try {
    const result = await runOuraSync();
    console.log(`[cron] Oura daily sync complete — ${result.sleep.synced} sleep days, ${result.activity.synced} activity days synced`);
  } catch (err) {
    console.error(`[cron] Oura daily sync failed: ${err.message}`);
  }
});

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);

  getDb();
  console.log('SQLite database ready');
  deduplicateSupplements();

  try {
    await ping();
    console.log(`Open Wearables API reachable at ${process.env.OPEN_WEARABLES_BASE_URL}`);
  } catch (err) {
    console.warn(`Open Wearables API not reachable: ${err.message}`);
    console.warn('Server started in degraded mode — wearable data unavailable until Open Wearables is up');
  }
});
