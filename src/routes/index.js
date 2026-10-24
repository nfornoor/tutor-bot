import { Router } from 'express';
import authRoutes from './auth.routes.js';
import studentRoutes from './student.routes.js';
import recordRoutes from './record.routes.js';
import settingsRoutes from './settings.routes.js';
import templateRoutes from './template.routes.js';
import whatsappRoutes from './whatsapp.routes.js';
import messageRoutes from './message.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import publicRoutes from './public.routes.js';
import adminRoutes from './admin.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/students', studentRoutes);
router.use('/records', recordRoutes);
router.use('/settings', settingsRoutes);
router.use('/templates', templateRoutes);
router.use('/whatsapp', whatsappRoutes);
router.use('/messages', messageRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/public', publicRoutes);
router.use('/admin', adminRoutes);

export default router;
