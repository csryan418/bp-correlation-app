import { Router } from 'express';
import { triggerSync, storeDeviceToken, getDeviceToken } from '../controllers/sync.js';

const router = Router();
router.post('/request', triggerSync);
router.post('/device-token', storeDeviceToken);
router.get('/device-token', (req, res) => res.json({ token: getDeviceToken() }));

export default router;
