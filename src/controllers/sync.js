import { getDb } from '../db/index.js';
import { sendSyncPush } from '../services/apns.js';

export async function triggerSync(req, res) {
  const token = getDeviceToken();
  if (!token) {
    return res.status(409).json({ error: 'No APNs device token stored — open BPHealthSync on the device first' });
  }

  const result = await sendSyncPush(token);

  if (result.failed.length > 0) {
    const failure = result.failed[0];
    const reason = failure.response?.reason ?? 'unknown';
    const status = failure.status ?? 'unknown';
    return res.status(502).json({ success: false, apns: { status, reason } });
  }

  res.json({ success: true, sent: result.sent.length });
}

export function storeDeviceToken(req, res) {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'token is required' });
  getDb()
    .prepare(`INSERT INTO metadata (key, value) VALUES ('apns_device_token', ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .run(token);
  console.log(`[sync] Device token stored: ${token.slice(0, 8)}...`);
  res.json({ ok: true });
}

export function getDeviceToken() {
  const row = getDb()
    .prepare(`SELECT value FROM metadata WHERE key = 'apns_device_token'`)
    .get();
  return row?.value ?? null;
}
