import { Router } from 'express';
import { getSleepTrends } from '../controllers/sleep.js';

const router = Router();

router.get('/trends', getSleepTrends);

export default router;
