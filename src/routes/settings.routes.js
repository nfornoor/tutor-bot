import { Router } from 'express';
import { getSettings, updateSettings } from '../controllers/settings.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { settingsSchema } from '../schemas/validation.js';

const router = Router();

router.use(authenticate);

router.get('/', getSettings);
router.put('/', validate(settingsSchema), updateSettings);

export default router;
