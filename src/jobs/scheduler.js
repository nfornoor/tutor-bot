import cron from 'node-cron';
import { Tutor } from '../models/Tutor.js';
import { Student } from '../models/Student.js';
import { DailyRecord } from '../models/DailyRecord.js';
import { Template, DEFAULT_STUDENT_TEMPLATE, DEFAULT_PARENT_TEMPLATE } from '../models/Template.js';
import { MessageLog } from '../models/MessageLog.js';
import { waProvider } from '../whatsapp/provider.js';
import { buildMessage } from '../services/messageBuilder.js';
import { processQueue } from './sendWorker.js';
import { getSetting } from '../services/settingsService.js';

/**
 * Returns current date (YYYY-MM-DD) and time (HH:mm) in Asia/Dhaka
 */
export function getDhakaNow(timeZone = 'Asia/Dhaka') {
  const now = new Date();
  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  return {
    timeStr: timeFormatter.format(now),
    dateStr: dateFormatter.format(now)
  };
}

/**
 * Helper to queue or update a message log row without creating duplicates
 */
async function upsertQueueMessage({
  tutorId,
  studentId,
  date,
  recipient,
  recipientPhone,
  body,
  sessionStatus,
  forceResend = false
}) {
  const targetStatus = sessionStatus.status === 'connected' ? 'queued' : 'failed';
  const targetError = sessionStatus.status === 'connected' ? null : 'NOT_CONNECTED';

  const existing = await MessageLog.findOne({ studentId, date, recipient });
  if (existing) {
    if (!forceResend) {
      if (
        existing.status === 'sent' ||
        existing.status === 'queued' ||
        (existing.status === 'failed' && existing.error === targetError)
      ) {
        return false; // Already sent, queued, or already marked with this failure
      }
    }
    // If forceResend is true (e.g. manual Send Now) OR if it was skipped/failed before, re-queue now
    existing.tutorId = tutorId;
    existing.recipientPhone = recipientPhone;
    existing.body = body;
    existing.status = targetStatus;
    existing.error = targetError;
    existing.attempts = 0;
    existing.sentAt = null;
    await existing.save();
    return true;
  }

  await MessageLog.create({
    tutorId,
    studentId,
    date,
    recipient,
    recipientPhone,
    body,
    status: targetStatus,
    error: targetError
  });
  return true;
}

/**
 * Enqueues messages for a specific tutor (and optionally for a single student)
 * @param {string|import('mongoose').Types.ObjectId} tutorId
 * @param {string|import('mongoose').Types.ObjectId} [specificStudentId=null]
 * @param {boolean} [forceResend=false]
 * @returns {Promise<{ queued: number, skipped: number, errors: string[] }>}
 */
export async function queueMessagesForTutor(tutorId, specificStudentId = null, forceResend = false) {
  const tutor = await Tutor.findById(tutorId);
  if (!tutor) {
    throw new Error('Tutor not found');
  }

  if (tutor.status === 'suspended') {
    throw new Error('Tutor account is suspended');
  }

  const { dateStr } = getDhakaNow(tutor.timezone || 'Asia/Dhaka');
  const sessionStatus = await waProvider.getStatus(tutor._id);

  // Fetch templates or fall back to system settings / defaults
  const defaultStudentTpl = await getSetting('defaultStudentTemplate', DEFAULT_STUDENT_TEMPLATE);
  const defaultParentTpl = await getSetting('defaultParentTemplate', DEFAULT_PARENT_TEMPLATE);
  const defaultStatusSentences = await getSetting('defaultStatusSentences', null);

  const templates = await Template.find({ tutorId: tutor._id });
  const studentTemplateBody =
    templates.find((t) => t.type === 'student')?.body || defaultStudentTpl;
  const parentTemplateBody =
    templates.find((t) => t.type === 'parent')?.body || defaultParentTpl;

  // Query active students
  const studentQuery = { tutorId: tutor._id, active: true };
  if (specificStudentId) {
    studentQuery._id = specificStudentId;
  }
  const students = await Student.find(studentQuery);

  let queuedCount = 0;
  let skippedCount = 0;
  const errors = [];

  for (const student of students) {
    // 1. Fetch today's record
    let todayRecord = await DailyRecord.findOne({
      tutorId: tutor._id,
      studentId: student._id,
      date: dateStr
    });

    // Fallback: If not found for exact dateStr, check if tutor entered a record recently (within 24h)
    // or if this is an explicit "Send Now" button click, pick the latest record
    if (!todayRecord) {
      const recentRecord = await DailyRecord.findOne({
        tutorId: tutor._id,
        studentId: student._id
      }).sort({ date: -1, createdAt: -1 });

      if (recentRecord) {
        const recordAgeMs = Date.now() - new Date(recentRecord.createdAt).getTime();
        // Allow if created within last 24h or if manual "Send Now"
        if (recordAgeMs < 24 * 60 * 60 * 1000 || specificStudentId) {
          todayRecord = recentRecord;
        }
      }
    }

    if (!todayRecord) {
      // Missing daily entry: log as skipped (if not already logged)
      try {
        const existingSkip = await MessageLog.findOne({
          studentId: student._id,
          date: dateStr,
          recipient: 'student'
        });

        if (!existingSkip) {
          await MessageLog.create({
            tutorId: tutor._id,
            studentId: student._id,
            date: dateStr,
            recipient: 'student',
            recipientPhone: student.studentPhone,
            body: 'N/A',
            status: 'skipped',
            error: 'No daily record entered for today'
          });
        }
      } catch (err) {
        // Unique index will ignore duplicate skip logs
      }
      skippedCount++;
      continue;
    }

    // 2. Fetch last exam record for fallback if today has no exam
    const lastExamRecord = await DailyRecord.findOne({
      tutorId: tutor._id,
      studentId: student._id,
      marksTotal: { $gt: 0 }
    }).sort({ date: -1 });

    // 3. Queue for student if toggle enabled
    if (student.sendToStudent) {
      const studentMsg = buildMessage({
        tutor,
        student,
        todayRecord,
        lastExamRecord,
        recipientType: 'student',
        templateBody: studentTemplateBody,
        statusSentences: defaultStatusSentences
      });

      try {
        const queued = await upsertQueueMessage({
          tutorId: tutor._id,
          studentId: student._id,
          date: dateStr,
          recipient: 'student',
          recipientPhone: student.studentPhone,
          body: studentMsg,
          sessionStatus,
          forceResend: Boolean(forceResend || specificStudentId)
        });
        if (queued) queuedCount++;
      } catch (err) {
        errors.push(`Student ${student.name}: ${err.message}`);
      }
    }

    // 4. Queue for parent if toggle enabled
    if (student.sendToParent) {
      const parentMsg = buildMessage({
        tutor,
        student,
        todayRecord,
        lastExamRecord,
        recipientType: 'parent',
        templateBody: parentTemplateBody,
        statusSentences: defaultStatusSentences
      });

      try {
        const queued = await upsertQueueMessage({
          tutorId: tutor._id,
          studentId: student._id,
          date: dateStr,
          recipient: 'parent',
          recipientPhone: student.parentPhone,
          body: parentMsg,
          sessionStatus,
          forceResend: Boolean(forceResend || specificStudentId)
        });
        if (queued) queuedCount++;
      } catch (err) {
        errors.push(`Parent of ${student.name}: ${err.message}`);
      }
    }
  }

  // Trigger send worker to start sending
  if (sessionStatus.status === 'connected') {
    processQueue().catch((err) => {
      console.error('[Scheduler] Error triggering processQueue:', err);
    });
  }

  return { queued: queuedCount, skipped: skippedCount, errors };
}

/**
 * Initializes the minute-by-minute scheduler
 */
export function initScheduler() {
  // Runs every minute
  cron.schedule('* * * * *', async () => {
    try {
      const { timeStr, dateStr } = getDhakaNow('Asia/Dhaka');

      // Find active tutors whose scheduled sendTime matches current minute AND has autoSendEnabled = true
      const matchingTutors = await Tutor.find({
        sendTime: timeStr,
        autoSendEnabled: true,
        status: 'active'
      });
      if (matchingTutors.length === 0) return;

      console.log(`[Scheduler] ${dateStr} ${timeStr} - Found ${matchingTutors.length} tutors matching sendTime`);

      for (const tutor of matchingTutors) {
        try {
          const res = await queueMessagesForTutor(tutor._id);
          console.log(`[Scheduler] Tutor ${tutor.name} (${tutor._id}): Queued ${res.queued}, Skipped ${res.skipped}`);
        } catch (err) {
          console.error(`[Scheduler] Error queueing for tutor ${tutor.name}:`, err.message);
        }
      }
    } catch (err) {
      console.error('[Scheduler] Cron execution error:', err.message);
    }
  });

  console.log('[Scheduler] Daily automated send cron registered (running every minute)');
}
