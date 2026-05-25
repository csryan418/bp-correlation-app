import { ping } from '../services/wearables.js';

export async function getStatus(req, res) {
  try {
    const wearables = await ping();
    res.json({ status: 'ok', wearables: { reachable: true, response: wearables } });
  } catch (err) {
    res.status(502).json({ status: 'degraded', wearables: { reachable: false, error: err.message } });
  }
}
