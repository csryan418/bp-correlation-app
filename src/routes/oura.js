import { Router } from 'express';
import { syncOura, getTodaySleep, getYesterdaySleep, manualSync } from '../controllers/oura.js';

const router = Router();
router.get('/today', getTodaySleep);
router.get('/yesterday', getYesterdaySleep);
router.get('/sync', syncOura);
router.post('/sync/manual', manualSync);

export default router;
