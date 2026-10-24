import { Student } from '../models/Student.js';
import { DailyRecord } from '../models/DailyRecord.js';
import { MessageLog } from '../models/MessageLog.js';
import { waProvider } from '../whatsapp/provider.js';
import { getDhakaNow } from '../jobs/scheduler.js';

export async function getDashboardStats(req, res) {
  try {
    const { dateStr, timeStr } = getDhakaNow(req.tutor.timezone || 'Asia/Dhaka');
    const tutorId = req.tutor._id;

    // 1. Get active students
    const activeStudents = await Student.find({ tutorId, active: true }).sort({ name: 1 });
    const totalActiveStudents = activeStudents.length;

    // 2. Get today's recorded entries
    const todayRecords = await DailyRecord.find({ tutorId, date: dateStr });
    const recordedStudentIds = new Set(todayRecords.map((r) => r.studentId.toString()));

    // 3. Find students missing today's entry
    const missingStudents = activeStudents.filter(
      (s) => !recordedStudentIds.has(s._id.toString())
    );

    // 4. Message logs for today
    const [sentCount, queuedCount, failedCount, skippedCount, recentFailures] = await Promise.all([
      MessageLog.countDocuments({ tutorId, date: dateStr, status: 'sent' }),
      MessageLog.countDocuments({ tutorId, date: dateStr, status: 'queued' }),
      MessageLog.countDocuments({ tutorId, date: dateStr, status: 'failed' }),
      MessageLog.countDocuments({ tutorId, date: dateStr, status: 'skipped' }),
      MessageLog.find({ tutorId, date: dateStr, status: 'failed' })
        .populate('studentId', 'name')
        .sort({ updatedAt: -1 })
        .limit(5)
    ]);

    // 5. WhatsApp session status
    const sessionStatus = await waProvider.getStatus(tutorId);

    return res.json({
      success: true,
      currentDate: dateStr,
      currentTime: timeStr,
      sendTime: req.tutor.sendTime,
      stats: {
        totalStudents: totalActiveStudents,
        recordedToday: todayRecords.length,
        missingEntriesCount: missingStudents.length,
        sentMessages: sentCount,
        queuedMessages: queuedCount,
        failedMessages: failedCount,
        skippedMessages: skippedCount
      },
      missingStudents: missingStudents.map((s) => ({
        id: s._id,
        name: s.name,
        studentPhone: s.studentPhone,
        parentPhone: s.parentPhone
      })),
      recentFailures,
      whatsapp: sessionStatus
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
