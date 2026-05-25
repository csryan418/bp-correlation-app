import { Router } from 'express';
import { listSavedMeals, createSavedMeal, deleteSavedMeal } from '../controllers/savedMeals.js';

const router = Router();
router.get('/',    listSavedMeals);
router.post('/',   createSavedMeal);
router.delete('/:id', deleteSavedMeal);

export default router;
