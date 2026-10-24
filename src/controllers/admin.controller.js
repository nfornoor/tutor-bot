import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { Tutor } from '../models/Tutor.js';
import { Student } from '../models/Student.js';
import { MessageLog } from '../models/MessageLog.js';
import { AuditLog } from '../models/AuditLog.js';
import { WaSession } from '../models/WaSession.js';
import { waProvider } from '../whatsapp/provider.js';
import { getDhakaNow } from '../jobs/scheduler.js';
import { getAllSettings, updateMultipleSettings } from '../services/settingsService.js';
import { logAdminAction } from '../services/auditService.js';
import { maskPhone } from '../utils/mask.js';
import {
  getTutorsQuerySchema,
  tutorIdParamSchema,
  updateTutorSchema,
  getMessagesQuerySchema,
  messageIdParamSchema,
  updateSettingsSchema,
  getAuditLogsQuerySchema
} from '../schemas/adminValidation.js';

function getAdminUser(req) {
  return req.user || req.tutor;
}

function getClientIp(req) {
  return req.ip || req.connection?.remoteAddress || '';
}

/**
 * GET /api/admin/stats
 * Platform overview statistics
 */
export async function getStats(req, res, next) {
  try {
    const { dateStr: todayDate } = getDhakaNow('Asia/Dhaka');

    // 1. Totals
    const [totalTutors, activeTutors, suspendedTutors, totalStudents, connectedWhatsapp] =
      await Promise.all([
        Tutor.countDocuments({}),
        Tutor.countDocuments({ status: 'active' }),
        Tutor.countDocuments({ status: 'suspended' }),
        Student.countDocuments({}),
        WaSession.countDocuments({ status: 'connected' })
      ]);

    // 2. Today's message counts
    const todayCountsAgg = await MessageLog.aggregate([
      { $match: { date: todayDate } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const messagesToday = { sent: 0, failed: 0, skipped: 0, queued: 0, total: 0 };
    for (const item of todayCountsAgg) {
      if (item._id in messagesToday) {
        messagesToday[item._id] = item.count;
      }
      messagesToday.total += item.count;
    }

    // 3. Last 14 days messages per day (sent vs failed vs total)
    const dateList = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const str = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Dhaka',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(d);
      dateList.push(str);
    }

    const fourteenDaysAgg = await MessageLog.aggregate([
      { $match: { date: { $in: dateList } } },
      {
        $group: {
          _id: { date: '$date', status: '$status' },
          count: { $sum: 1 }
        }
      }
    ]);

    const historyMap = {};
    for (const date of dateList) {
      historyMap[date] = { date, sent: 0, failed: 0, skipped: 0, queued: 0, total: 0 };
    }

    for (const item of fourteenDaysAgg) {
      const d = item._id.date;
      const s = item._id.status;
      if (historyMap[d]) {
        if (s in historyMap[d]) {
          historyMap[d][s] = item.count;
        }
        historyMap[d].total += item.count;
      }
    }

    const messagesPerDay = dateList.map((d) => historyMap[d]);

    // 4. Top 5 error reasons in the last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const topErrors = await MessageLog.aggregate([
      {
        $match: {
          status: 'failed',
          createdAt: { $gte: sevenDaysAgo },
          error: { $ne: null, $exists: true }
        }
      },
      {
        $group: {
          _id: '$error',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 5 },
      {
        $project: {
          _id: 0,
          error: '$_id',
          count: 1
        }
      }
    ]);

    return res.json({
      data: {
        totals: {
          tutors: totalTutors,
          active: activeTutors,
          suspended: suspendedTutors,
          students: totalStudents
        },
        whatsappConnectedCount: connectedWhatsapp,
        messagesToday,
        messagesPerDay,
        topErrors
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/tutors
 * Search, filter, and paginate tutors list
 */
export async function getTutors(req, res, next) {
  try {
    const query = getTutorsQuerySchema.parse(req.query);
    const { q, status, whatsappStatus, sort, order, page, limit } = query;
    const skip = (page - 1) * limit;

    const mongoQuery = {};

    // Search query on name or email
    if (q) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      mongoQuery.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } }
      ];
    }

    // Status filter
    if (status !== 'all') {
      mongoQuery.status = status;
    }

    // WhatsApp filter
    if (whatsappStatus !== 'all') {
      if (whatsappStatus === 'connected') {
        const connectedTutorIds = await WaSession.find({ status: 'connected' }).distinct('tutorId');
        mongoQuery._id = { $in: connectedTutorIds.filter(Boolean) };
      } else if (whatsappStatus === 'connecting') {
        const connectingTutorIds = await WaSession.find({
          status: { $in: ['connecting', 'qr_ready', 'code_ready'] }
        }).distinct('tutorId');
        mongoQuery._id = { $in: connectingTutorIds.filter(Boolean) };
      } else if (whatsappStatus === 'disconnected') {
        const activeTutorIds = await WaSession.find({
          status: { $in: ['connected', 'connecting', 'qr_ready', 'code_ready'] }
        }).distinct('tutorId');
        mongoQuery._id = { $nin: activeTutorIds.filter(Boolean) };
      }
    }

    // Execute count and query in parallel
    const [total, tutors] = await Promise.all([
      Tutor.countDocuments(mongoQuery),
      Tutor.find(mongoQuery)
        .select('-passwordHash -__v')
        .sort({ [sort]: order === 'asc' ? 1 : -1 })
        .skip(skip)
        .limit(limit)
        .lean()
    ]);

    const tutorIds = tutors.map((t) => t._id);

    // Fetch student counts and whatsapp sessions in parallel
    const [studentCountsAgg, sessions] = await Promise.all([
      Student.aggregate([
        { $match: { tutorId: { $in: tutorIds } } },
        { $group: { _id: '$tutorId', count: { $sum: 1 } } }
      ]),
      WaSession.find({ tutorId: { $in: tutorIds.map((id) => id.toString()) } }).lean()
    ]);

    const studentCountMap = new Map();
    for (const item of studentCountsAgg) {
      studentCountMap.set(item._id.toString(), item.count);
    }

    const sessionMap = new Map();
    for (const session of sessions) {
      sessionMap.set(session.tutorId.toString(), session);
    }

    // Format output with privacy rules
    const data = tutors.map((tutor) => {
      const tid = tutor._id.toString();
      const sess = sessionMap.get(tid);

      return {
        _id: tutor._id,
        name: tutor.name,
        email: tutor.email,
        phone: maskPhone(tutor.phone),
        role: tutor.role || 'tutor',
        status: tutor.status || 'active',
        dailyLimit: tutor.dailyLimit || 100,
        sendTime: tutor.sendTime || '21:00',
        autoSendEnabled: tutor.autoSendEnabled ?? false,
        studentCount: studentCountMap.get(tid) || 0,
        whatsappStatus: sess?.status || 'disconnected',
        whatsappPhone: sess?.phone ? maskPhone(sess.phone) : null,
        lastConnectedAt: sess?.lastConnectedAt || null,
        createdAt: tutor.createdAt,
        updatedAt: tutor.updatedAt
      };
    });

    return res.json({
      data,
      meta: {
        page,
        limit,
        total
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/tutors/:id
 * Retrieve tutor details, WhatsApp status, and recent message logs (no body)
 */
export async function getTutorById(req, res, next) {
  try {
    const { id } = tutorIdParamSchema.parse(req.params);

    const tutor = await Tutor.findById(id).select('-passwordHash -__v').lean();
    if (!tutor) {
      return res.status(404).json({ success: false, error: 'Tutor not found' });
    }

    const [studentCount, sessionStatus, recentLogs] = await Promise.all([
      Student.countDocuments({ tutorId: tutor._id }),
      waProvider.getStatus(tutor._id),
      MessageLog.find({ tutorId: tutor._id })
        .select('-body -__v')
        .sort({ createdAt: -1 })
        .limit(20)
        .lean()
    ]);

    const formattedLogs = recentLogs.map((log) => ({
      _id: log._id,
      studentId: log.studentId,
      date: log.date,
      recipient: log.recipient,
      recipientPhone: maskPhone(log.recipientPhone),
      status: log.status,
      error: log.error,
      attempts: log.attempts,
      sentAt: log.sentAt,
      createdAt: log.createdAt
    }));

    return res.json({
      data: {
        profile: {
          _id: tutor._id,
          name: tutor.name,
          email: tutor.email,
          phone: maskPhone(tutor.phone),
          role: tutor.role || 'tutor',
          status: tutor.status || 'active',
          dailyLimit: tutor.dailyLimit || 100,
          sendTime: tutor.sendTime || '21:00',
          autoSendEnabled: tutor.autoSendEnabled ?? false,
          timezone: tutor.timezone || 'Asia/Dhaka',
          createdAt: tutor.createdAt,
          updatedAt: tutor.updatedAt
        },
        studentCount,
        whatsapp: {
          status: sessionStatus.status,
          phone: sessionStatus.phone ? maskPhone(sessionStatus.phone) : null,
          lastConnectedAt: sessionStatus.lastConnectedAt || null
        },
        recentLogs: formattedLogs
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/admin/tutors/:id
 * Update tutor status, daily limit, or scheduled send time
 */
export async function updateTutor(req, res, next) {
  try {
    const { id } = tutorIdParamSchema.parse(req.params);
    const updates = updateTutorSchema.parse(req.body);

    const tutor = await Tutor.findById(id);
    if (!tutor) {
      return res.status(404).json({ success: false, error: 'Tutor not found' });
    }

    const previous = {
      status: tutor.status,
      dailyLimit: tutor.dailyLimit,
      sendTime: tutor.sendTime
    };

    if (updates.status !== undefined) {
      tutor.status = updates.status;
    }
    if (updates.dailyLimit !== undefined) {
      tutor.dailyLimit = updates.dailyLimit;
    }
    if (updates.sendTime !== undefined) {
      tutor.sendTime = updates.sendTime;
    }

    await tutor.save();

    // If tutor was suspended, close WhatsApp socket immediately (without deleting session auth data)
    if (updates.status === 'suspended') {
      try {
        await waProvider.closeSocketOnly(tutor._id);
      } catch (err) {
        console.error(`[Admin] Error closing socket for suspended tutor ${tutor._id}:`, err.message);
      }
    }

    const admin = getAdminUser(req);
    await logAdminAction({
      adminId: admin._id,
      action: 'TUTOR_UPDATE',
      targetType: 'Tutor',
      targetId: tutor._id,
      details: { updates, previous },
      ip: getClientIp(req)
    });

    return res.json({
      data: {
        _id: tutor._id,
        name: tutor.name,
        email: tutor.email,
        phone: maskPhone(tutor.phone),
        role: tutor.role,
        status: tutor.status,
        dailyLimit: tutor.dailyLimit,
        sendTime: tutor.sendTime,
        updatedAt: tutor.updatedAt
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/tutors/:id/disconnect-whatsapp
 * Force logout WhatsApp and clear stored auth
 */
export async function disconnectTutorWhatsApp(req, res, next) {
  try {
    const { id } = tutorIdParamSchema.parse(req.params);

    const tutor = await Tutor.findById(id);
    if (!tutor) {
      return res.status(404).json({ success: false, error: 'Tutor not found' });
    }

    await waProvider.disconnect(tutor._id);

    const admin = getAdminUser(req);
    await logAdminAction({
      adminId: admin._id,
      action: 'WHATSAPP_DISCONNECT',
      targetType: 'Tutor',
      targetId: tutor._id,
      details: { message: 'WhatsApp session force disconnected and auth wiped' },
      ip: getClientIp(req)
    });

    return res.json({
      data: {
        message: 'WhatsApp session successfully disconnected and credentials cleared.'
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/tutors/:id/reset-password
 * Generates a temporary one-time password for the tutor
 */
export async function resetTutorPassword(req, res, next) {
  try {
    const { id } = tutorIdParamSchema.parse(req.params);

    const tutor = await Tutor.findById(id);
    if (!tutor) {
      return res.status(404).json({ success: false, error: 'Tutor not found' });
    }

    // Generate readable random password (e.g. 10 chars, uppercase, lowercase, numbers)
    const randomChars = crypto.randomBytes(8).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 7);
    const temporaryPassword = `Tb#${randomChars}9`;

    const salt = await bcrypt.genSalt(10);
    tutor.passwordHash = await bcrypt.hash(temporaryPassword, salt);
    await tutor.save();

    const admin = getAdminUser(req);
    await logAdminAction({
      adminId: admin._id,
      action: 'TUTOR_PASSWORD_RESET',
      targetType: 'Tutor',
      targetId: tutor._id,
      details: { message: 'Temporary password generated' },
      ip: getClientIp(req)
    });

    return res.json({
      data: {
        temporaryPassword,
        message: 'Password reset successfully. Please share this temporary password with the tutor.'
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/messages
 * Global message logs with filters (never returns message body)
 */
export async function getMessages(req, res, next) {
  try {
    const query = getMessagesQuerySchema.parse(req.query);
    const { tutorId, status, error, startDate, endDate, sort, order, page, limit } = query;
    const skip = (page - 1) * limit;

    const mongoQuery = {};

    if (tutorId) {
      mongoQuery.tutorId = tutorId;
    }

    if (status !== 'all') {
      mongoQuery.status = status;
    }

    if (error) {
      const escaped = error.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      mongoQuery.error = { $regex: escaped, $options: 'i' };
    }

    if (startDate || endDate) {
      mongoQuery.date = {};
      if (startDate) mongoQuery.date.$gte = startDate;
      if (endDate) mongoQuery.date.$lte = endDate;
    }

    const [total, messages] = await Promise.all([
      MessageLog.countDocuments(mongoQuery),
      MessageLog.find(mongoQuery)
        .populate('tutorId', 'name email')
        .populate('studentId', 'name')
        .sort({ [sort]: order === 'asc' ? 1 : -1 })
        .skip(skip)
        .limit(limit)
        .lean()
    ]);

    // Format response: privacy rules require masking phone and omitting message body
    const data = messages.map((msg) => ({
      _id: msg._id,
      tutor: msg.tutorId
        ? { _id: msg.tutorId._id, name: msg.tutorId.name, email: msg.tutorId.email }
        : null,
      student: msg.studentId ? { _id: msg.studentId._id, name: msg.studentId.name } : null,
      date: msg.date,
      recipient: msg.recipient,
      recipientPhone: maskPhone(msg.recipientPhone),
      status: msg.status,
      error: msg.error,
      attempts: msg.attempts,
      sentAt: msg.sentAt,
      createdAt: msg.createdAt,
      bodyLength: msg.body ? msg.body.length : 0
    }));

    return res.json({
      data,
      meta: {
        page,
        limit,
        total
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/messages/:id/reveal
 * Reveal message body for a specific log and write an AuditLog entry
 */
export async function revealMessage(req, res, next) {
  try {
    const { id } = messageIdParamSchema.parse(req.params);

    const message = await MessageLog.findById(id).lean();
    if (!message) {
      return res.status(404).json({ success: false, error: 'Message log not found' });
    }

    const admin = getAdminUser(req);
    await logAdminAction({
      adminId: admin._id,
      action: 'MESSAGE_REVEAL',
      targetType: 'MessageLog',
      targetId: message._id,
      details: {
        recipient: message.recipient,
        recipientPhone: maskPhone(message.recipientPhone),
        tutorId: message.tutorId
      },
      ip: getClientIp(req)
    });

    return res.json({
      data: {
        _id: message._id,
        recipient: message.recipient,
        recipientPhone: maskPhone(message.recipientPhone),
        body: message.body,
        status: message.status,
        error: message.error
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/settings
 * Retrieve all platform settings (cached)
 */
export async function getSettings(req, res, next) {
  try {
    const settings = await getAllSettings();
    return res.json({ data: settings });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/admin/settings
 * Update platform settings with Zod validation and cache invalidation
 */
export async function updateSettings(req, res, next) {
  try {
    const updates = updateSettingsSchema.parse(req.body);
    const previous = await getAllSettings();

    const admin = getAdminUser(req);
    const updated = await updateMultipleSettings(updates, admin._id);

    await logAdminAction({
      adminId: admin._id,
      action: 'SETTINGS_UPDATE',
      targetType: 'Setting',
      targetId: null,
      details: { updates, previous },
      ip: getClientIp(req)
    });

    return res.json({
      data: updated,
      message: 'Settings updated successfully'
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/audit-logs
 * Paginated audit log history
 */
export async function getAuditLogs(req, res, next) {
  try {
    const query = getAuditLogsQuerySchema.parse(req.query);
    const { adminId, action, targetType, page, limit, sort, order } = query;
    const skip = (page - 1) * limit;

    const mongoQuery = {};
    if (adminId) mongoQuery.adminId = adminId;
    if (action) mongoQuery.action = action;
    if (targetType) mongoQuery.targetType = targetType;

    const [total, logs] = await Promise.all([
      AuditLog.countDocuments(mongoQuery),
      AuditLog.find(mongoQuery)
        .populate('adminId', 'name email')
        .sort({ [sort]: order === 'asc' ? 1 : -1 })
        .skip(skip)
        .limit(limit)
        .lean()
    ]);

    return res.json({
      data: logs,
      meta: {
        page,
        limit,
        total
      }
    });
  } catch (err) {
    next(err);
  }
}
