import { MessageLog } from '../models/MessageLog.js';
import { Student } from '../models/Student.js';
import { queueMessagesForTutor } from '../jobs/scheduler.js';

export async function getMessageLogs(req, res) {
  try {
    const { date, status, studentId, page = 1, limit = 50 } = req.query;
    const filter = { tutorId: req.tutor._id };

    if (date) filter.date = date;
    if (status) filter.status = status;
    if (studentId) filter.studentId = studentId;

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const [logs, total] = await Promise.all([
      MessageLog.find(filter)
        .populate('studentId', 'name studentPhone parentPhone')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10)),
      MessageLog.countDocuments(filter)
    ]);

    return res.json({
      success: true,
      total,
      page: parseInt(page, 10),
      totalPages: Math.ceil(total / parseInt(limit, 10)),
      logs
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function sendNow(req, res) {
  try {
    const { studentId } = req.params;

    // Verify student belongs to this tutor
    const student = await Student.findOne({
      _id: studentId,
      tutorId: req.tutor._id
    });

    if (!student) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }

    const result = await queueMessagesForTutor(req.tutor._id, student._id);

    return res.json({
      success: true,
      message: `Enqueued messages for ${student.name}`,
      result
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function sendAllNow(req, res) {
  try {
    const result = await queueMessagesForTutor(req.tutor._id, null);

    return res.json({
      success: true,
      message: 'Enqueued messages for today',
      result
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
