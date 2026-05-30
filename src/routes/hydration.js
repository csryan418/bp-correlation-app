import { Router } from 'express';
import { list, create, update, remove, replaceTotal } from '../controllers/hydration.js';

const router = Router();
router.get('/', list);
router.post('/', create);
router.put('/', replaceTotal);
router.patch('/:id', update);
router.delete('/:id', remove);

export default router;
