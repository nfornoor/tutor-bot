import { Router } from 'express';
import { getTemplates, updateTemplates, previewTemplate } from '../controllers/template.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { updateTemplatesSchema } from '../schemas/validation.js';

const router = Router();

router.use(authenticate);

router.get('/', getTemplates);
router.put('/', validate(updateTemplatesSchema), updateTemplates);
router.post('/preview', previewTemplate);

export default router;
