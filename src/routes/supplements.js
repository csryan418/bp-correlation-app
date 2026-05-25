import { Router } from 'express';
import { listActive, createSupplement, updateSupplement, deleteSupplement, getLog, logDose } from '../controllers/supplements.js';

const router = Router();

// Static routes before dynamic /:id
router.get('/log', getLog);
router.post('/log', logDose);
router.get('/', listActive);
router.post('/', createSupplement);
router.patch('/:id', updateSupplement);
router.delete('/:id', deleteSupplement);

export default router;
