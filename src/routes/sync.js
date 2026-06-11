import { Router } from 'express';
import { triggerSync, storeDeviceToken, getDeviceToken, getSyncStatus } from '../controllers/sync.js';

const router = Router();
router.post('/request', triggerSync);
router.get('/status', getSyncStatus);
router.post('/device-token', storeDeviceToken);
router.get('/device-token', (req, res) => res.json({ token: getDeviceToken() }));

export default router;
