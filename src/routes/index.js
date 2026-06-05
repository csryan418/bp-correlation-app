import { Router } from 'express';
import { getStatus } from '../controllers/status.js';
import bloodPressureRoutes from './bloodPressure.js';
import foodRoutes from './food.js';
import hydrationRoutes from './hydration.js';
import ouraRoutes from './oura.js';
import insightsRoutes from './insights.js';
import appleHealthRoutes from './appleHealth.js';
import healthRoutes from './health.js';
import supplementsRoutes from './supplements.js';
import savedMealsRoutes from './savedMeals.js';
import mealsRoutes from './meals.js';
import sleepRoutes from './sleep.js';
import activityRoutes from './activity.js';
import checkinRoutes from './checkin.js';
import workoutsRoutes from './workouts.js';

const router = Router();

router.get('/status', getStatus);
router.use('/health', healthRoutes);
router.use('/supplements', supplementsRoutes);
router.use('/blood-pressure', bloodPressureRoutes);
router.use('/food', foodRoutes);
router.use('/hydration', hydrationRoutes);
router.use('/oura', ouraRoutes);
router.use('/insights', insightsRoutes);
router.use('/apple-health', appleHealthRoutes);
router.use('/saved-meals', savedMealsRoutes);
router.use('/meals', mealsRoutes);
router.use('/sleep', sleepRoutes);
router.use('/activity', activityRoutes);
router.use('/checkin', checkinRoutes);
router.use('/workouts', workoutsRoutes);

export default router;
