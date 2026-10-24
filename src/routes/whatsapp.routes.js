import { Router } from 'express';
import {
  connectWhatsApp,
  getWhatsAppStatus,
  disconnectWhatsApp
} from '../controllers/whatsapp.controller.js';
import { authenticate } from '../middleware/auth.js';
import { waConnectLimiter } from '../middleware/rateLimit.js';

const router = Router();

router.use(authenticate);

router.post('/connect', waConnectLimiter, connectWhatsApp);
router.get('/status', getWhatsAppStatus);
router.post('/disconnect', disconnectWhatsApp);

export default router;
