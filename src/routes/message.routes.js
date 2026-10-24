import { Router } from 'express';
import { getMessageLogs, sendNow, sendAllNow } from '../controllers/message.controller.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/logs', getMessageLogs);
router.post('/send-now/:studentId', sendNow);
router.post('/send-all', sendAllNow);

export default router;
