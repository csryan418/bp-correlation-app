import { Router } from 'express';
import { getTodayCheckin, saveCheckin } from '../controllers/checkin.js';

const router = Router();
router.get('/today', getTodayCheckin);
router.post('/', saveCheckin);

export default router;
