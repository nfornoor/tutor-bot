import { z } from 'zod';
import mongoose from 'mongoose';

const objectIdSchema = z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
  message: 'Invalid ObjectId'
});

export const getTutorsQuerySchema = z.object({
  q: z.string().trim().optional(),
  status: z.enum(['all', 'active', 'suspended']).default('all'),
  whatsappStatus: z.enum(['all', 'connected', 'connecting', 'disconnected']).default('all'),
  sort: z.enum(['name', 'email', 'createdAt', 'status', 'dailyLimit']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10)
});

export const tutorIdParamSchema = z.object({
  id: objectIdSchema
});

export const updateTutorSchema = z.object({
  status: z.enum(['active', 'suspended']).optional(),
  dailyLimit: z.coerce.number().int().min(1).max(10000).optional(),
  sendTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'sendTime must be in HH:mm 24-hour format')
    .optional()
}).refine(
  (data) => data.status !== undefined || data.dailyLimit !== undefined || data.sendTime !== undefined,
  { message: 'At least one field (status, dailyLimit, sendTime) must be provided' }
);

export const getMessagesQuerySchema = z.object({
  tutorId: objectIdSchema.optional(),
  status: z.enum(['all', 'sent', 'failed', 'skipped', 'queued']).default('all'),
  error: z.string().trim().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD').optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be YYYY-MM-DD').optional(),
  sort: z.enum(['createdAt', 'date', 'status', 'attempts']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

export const messageIdParamSchema = z.object({
  id: objectIdSchema
});

export const updateSettingsSchema = z.object({
  defaultDailyLimit: z.coerce.number().int().min(1).max(5000).optional(),
  sendDelayMinSec: z.coerce.number().int().min(1).max(120).optional(),
  sendDelayMaxSec: z.coerce.number().int().min(1).max(120).optional(),
  registrationOpen: z.boolean().optional(),
  maintenanceMode: z.boolean().optional(),
  defaultStudentTemplate: z.string().min(5).optional(),
  defaultParentTemplate: z.string().min(5).optional(),
  defaultStatusSentences: z
    .object({
      complete: z.string().min(1),
      partial: z.string().min(1),
      incomplete: z.string().min(1)
    })
    .optional()
}).refine(
  (data) => {
    if (data.sendDelayMinSec !== undefined && data.sendDelayMaxSec !== undefined) {
      return data.sendDelayMinSec <= data.sendDelayMaxSec;
    }
    return true;
  },
  { message: 'sendDelayMinSec cannot be greater than sendDelayMaxSec' }
);

export const getAuditLogsQuerySchema = z.object({
  adminId: objectIdSchema.optional(),
  action: z.string().trim().optional(),
  targetType: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['createdAt']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc')
});
