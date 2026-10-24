import {
  startSession,
  disconnectSession,
  closeSocketOnly,
  sendBaileysMessage,
  getSessionStatus
} from './sessionManager.js';

/**
 * WhatsApp Provider Interface
 * Allows swapping between Baileys and Official WhatsApp Cloud API
 */
class WhatsAppProvider {
  /**
   * Connect or initiate QR / Pairing code generation
   * @param {string|import('mongoose').Types.ObjectId} tutorId
   * @param {object} [options]
   */
  async connect(tutorId, options = {}) {
    return await startSession(tutorId, options);
  }

  /**
   * Disconnect WhatsApp session
   * @param {string|import('mongoose').Types.ObjectId} tutorId
   */
  async disconnect(tutorId) {
    return await disconnectSession(tutorId);
  }

  /**
   * Close active socket without clearing session data
   * @param {string|import('mongoose').Types.ObjectId} tutorId
   */
  closeSocket(tutorId) {
    return closeSocketOnly(tutorId);
  }

  /**
   * Get current session status and QR code
   * @param {string|import('mongoose').Types.ObjectId} tutorId
   */
  async getStatus(tutorId) {
    return await getSessionStatus(tutorId);
  }

  /**
   * Send a text message
   * @param {string|import('mongoose').Types.ObjectId} tutorId
   * @param {string} toPhone
   * @param {string} text
   */
  async sendMessage(tutorId, toPhone, text) {
    return await sendBaileysMessage(tutorId, toPhone, text);
  }
}

export const waProvider = new WhatsAppProvider();
