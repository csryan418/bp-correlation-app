import { Router } from 'express';
import {
  list, create, search, logFood, listLog, deleteFood,
  getPortions, updateFoodLog,
} from '../controllers/food.js';

const router = Router();

// Specific sub-paths first to avoid collision with the base POST /
router.post('/search',          search);
router.get('/portions/:fdcId',  getPortions);
router.post('/log',             logFood);
router.get('/log',              listLog);
router.patch('/log/:id',        updateFoodLog);
router.delete('/log/:id',       deleteFood);

// Existing routes — do not modify
router.get('/',  list);
router.post('/', create);

export default router;
