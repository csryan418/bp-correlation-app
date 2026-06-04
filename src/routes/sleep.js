import { Router } from 'express';
import { getSleepTrends, getHrvInsights } from '../controllers/sleep.js';

const router = Router();

router.get('/trends', getSleepTrends);
router.get('/hrv-insights', getHrvInsights);

export default router;
