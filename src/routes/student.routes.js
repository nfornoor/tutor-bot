import { Router } from 'express';
import {
  listStudents,
  createStudent,
  getStudentById,
  updateStudent,
  deleteStudent,
  patchMessaging,
  getStudentHistory
} from '../controllers/student.controller.js';
import { createOrUpdateForStudent } from '../controllers/record.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { studentSchema, studentMessagingSchema, dailyRecordSchema } from '../schemas/validation.js';

const router = Router();

router.use(authenticate);

router.get('/', listStudents);
router.post('/', validate(studentSchema), createStudent);
router.get('/:id', getStudentById);
router.put('/:id', validate(studentSchema.partial()), updateStudent);
router.delete('/:id', deleteStudent);
router.patch('/:id/messaging', validate(studentMessagingSchema), patchMessaging);
router.get('/:id/history', getStudentHistory);
router.post('/:id/records', validate(dailyRecordSchema), createOrUpdateForStudent);

export default router;
