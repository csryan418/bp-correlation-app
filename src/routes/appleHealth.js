import { Router } from 'express';
import { receiveAppleHealth } from '../controllers/appleHealth.js';

const router = Router();
router.post('/', receiveAppleHealth);

export default router;
