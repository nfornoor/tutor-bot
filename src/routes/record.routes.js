import { Router } from 'express';
import {
  updateRecord,
  deleteRecord,
  getTodayRecords,
  batchUpdateRecords
} from '../controllers/record.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { dailyRecordSchema, batchRecordSchema } from '../schemas/validation.js';

const router = Router();

router.use(authenticate);

router.get('/today', getTodayRecords);
router.post('/batch', validate(batchRecordSchema), batchUpdateRecords);
router.put('/:id', validate(dailyRecordSchema.partial()), updateRecord);
router.delete('/:id', deleteRecord);

export default router;
