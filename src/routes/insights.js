import { Router } from 'express';
import { getCorrelations } from '../controllers/insights.js';

const router = Router();
router.get('/correlations', getCorrelations);

export default router;
