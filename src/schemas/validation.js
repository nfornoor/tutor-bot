import { z } from 'zod';

const bangladeshiPhoneRegex = /^01[3-9]\d{8}$/;
const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

// Auth schemas
export const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  displayName: z.string().optional()
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required')
});

// Student schemas
export const studentSchema = z.object({
  name: z.string().min(2, 'Student name is required'),
  studentPhone: z.string().regex(bangladeshiPhoneRegex, 'Student phone must be a valid 11-digit Bangladeshi number (e.g., 017XXXXXXXX)'),
  parentPhone: z.string().regex(bangladeshiPhoneRegex, 'Parent phone must be a valid 11-digit Bangladeshi number (e.g., 018XXXXXXXX)'),
  sendToStudent: z.boolean().optional().default(true),
  sendToParent: z.boolean().optional().default(true),
  active: z.boolean().optional().default(true)
});

export const studentMessagingSchema = z.object({
  sendToStudent: z.boolean().optional(),
  sendToParent: z.boolean().optional()
});

// Daily Record schemas
export const dailyRecordSchema = z.object({
  date: z.string().regex(dateRegex, 'Date must be in YYYY-MM-DD format').optional(),
  homework: z.string().optional().default(''),
  homeworkStatus: z.enum(['complete', 'partial', 'incomplete']).optional().default('complete'),
  examTopic: z.string().optional().default(''),
  marksObtained: z.number().nullable().optional(),
  marksTotal: z.number().nullable().optional()
});

export const batchRecordItemSchema = z.object({
  studentId: z.string().min(1, 'studentId is required'),
  homework: z.string().optional().default(''),
  homeworkStatus: z.enum(['complete', 'partial', 'incomplete']).optional().default('complete'),
  examTopic: z.string().optional().default(''),
  marksObtained: z.number().nullable().optional(),
  marksTotal: z.number().nullable().optional()
});

export const batchRecordSchema = z.object({
  date: z.string().regex(dateRegex, 'Date must be in YYYY-MM-DD format'),
  records: z.array(batchRecordItemSchema)
});

// Settings schema
export const settingsSchema = z.object({
  displayName: z.string().min(1, 'Display name cannot be empty').optional(),
  sendTime: z.string().regex(timeRegex, 'Send time must be in HH:mm 24-hr format (e.g., 18:00)').optional(),
  timezone: z.string().optional(),
  dailyLimit: z.number().min(1).max(500).optional()
});

// Template schema
export const updateTemplatesSchema = z.object({
  studentTemplate: z.string().min(5, 'Student template cannot be empty').optional(),
  parentTemplate: z.string().min(5, 'Parent template cannot be empty').optional()
});
