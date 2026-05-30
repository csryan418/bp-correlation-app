import { Router } from 'express';
import { listMeals, createMeal, renameMeal, deleteMeal, loadMeal, updateMealItem, addMealItem, deleteMealItem } from '../controllers/meals.js';

const router = Router();
router.get('/', listMeals);
router.post('/', createMeal);
router.put('/:id', renameMeal);
router.delete('/:id', deleteMeal);
router.post('/:id/load', loadMeal);
router.put('/:id/items/:itemId', updateMealItem);
router.post('/:id/items', addMealItem);
router.delete('/:id/items/:itemId', deleteMealItem);

export default router;
