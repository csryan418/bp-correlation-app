import { Router } from 'express';
import multer from 'multer';
import { transcribe } from '../controllers/voice.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const router = Router();

router.post('/transcribe', upload.single('audio'), transcribe);

export default router;
