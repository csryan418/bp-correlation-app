import { Router } from 'express';
import { syncWorkouts, getWorkouts, getWorkoutYesterday } from '../controllers/workouts.js';

const router = Router();
router.post('/sync', syncWorkouts);
router.get('/yesterday', getWorkoutYesterday);
router.get('/', getWorkouts);

export default router;
