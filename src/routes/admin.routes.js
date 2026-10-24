import express from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { adminLimiter } from '../middleware/rateLimit.js';
import {
  getStats,
  getTutors,
  getTutorById,
  updateTutor,
  disconnectTutorWhatsApp,
  resetTutorPassword,
  getMessages,
  revealMessage,
  getSettings,
  updateSettings,
  getAuditLogs
} from '../controllers/admin.controller.js';

const router = express.Router();

// Apply auth, requireAdmin, and admin rate limiter to all admin routes
router.use(authenticate, requireAdmin, adminLimiter);

// Dashboard stats
router.get('/stats', getStats);

// Tutor management
router.get('/tutors', getTutors);
router.get('/tutors/:id', getTutorById);
router.patch('/tutors/:id', updateTutor);
router.post('/tutors/:id/disconnect-whatsapp', disconnectTutorWhatsApp);
router.post('/tutors/:id/reset-password', resetTutorPassword);

// Global message logs & reveal
router.get('/messages', getMessages);
router.post('/messages/:id/reveal', revealMessage);

// System settings
router.get('/settings', getSettings);
router.put('/settings', updateSettings);

// Audit logs
router.get('/audit-logs', getAuditLogs);

export default router;
