import { AuditLog } from '../models/AuditLog.js';

/**
 * Writes an immutable AuditLog entry for an administrative action
 * @param {object} param
 * @param {string|import('mongoose').Types.ObjectId} param.adminId
 * @param {string} param.action
 * @param {string} param.targetType
 * @param {string} [param.targetId]
 * @param {any} [param.details]
 * @param {string} [param.ip]
 */
export async function logAdminAction({
  adminId,
  action,
  targetType,
  targetId = null,
  details = {},
  ip = ''
}) {
  try {
    return await AuditLog.create({
      adminId,
      action,
      targetType,
      targetId: targetId ? String(targetId) : null,
      details,
      ip: String(ip || '')
    });
  } catch (err) {
    console.error('[AuditLog] Failed to record audit log:', err.message);
    return null;
  }
}
