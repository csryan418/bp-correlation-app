import { Router } from 'express';
import { getYesterdayActivity } from '../controllers/oura.js';

const router = Router();
router.get('/yesterday', getYesterdayActivity);

export default router;
