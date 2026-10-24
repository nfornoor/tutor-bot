import { Router } from 'express';
import { getPublicStudentReport } from '../controllers/public.controller.js';

const router = Router();

// Public endpoints - NO authentication required so parents can view with the secret shareToken
router.get('/student/:token', getPublicStudentReport);
router.get('/report/:token', getPublicStudentReport);
router.get('/:token', getPublicStudentReport);

export default router;
