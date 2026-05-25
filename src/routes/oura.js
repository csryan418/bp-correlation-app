import { Router } from 'express';
import { syncOura, getTodaySleep, getYesterdaySleep } from '../controllers/oura.js';

const router = Router();
router.get('/today', getTodaySleep);
router.get('/yesterday', getYesterdaySleep);
router.get('/sync', syncOura);

export default router;
