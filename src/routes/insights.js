import { Router } from 'express';
import { getCorrelations, getFullInsights } from '../controllers/insights.js';

const router = Router();
router.get('/correlations', getCorrelations);
router.get('/full', getFullInsights);

export default router;
