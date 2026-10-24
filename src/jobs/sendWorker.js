import { MessageLog } from '../models/MessageLog.js';
import { Tutor } from '../models/Tutor.js';
import { waProvider } from '../whatsapp/provider.js';
import { getSetting } from '../services/settingsService.js';

let isWorkerRunning = false;

/**
 * Returns a promise that resolves after a random delay between min and max milliseconds
 * @param {number} minMs
 * @param {number} maxMs
 */
function randomDelay(minMs = 5000, maxMs = 10000) {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Processes all queued messages one by one with safe delays and retry logic
 */
export async function processQueue() {
  if (isWorkerRunning) {
    return;
  }
  isWorkerRunning = true;

  try {
    // Process while there are queued messages
    while (true) {
      const message = await MessageLog.findOne({
        status: 'queued',
        attempts: { $lt: 3 }
      }).sort({ createdAt: 1 });

      if (!message) {
        break; // Queue is empty
      }

      // Check tutor and status
      const tutor = await Tutor.findById(message.tutorId);
      if (!tutor) {
        message.status = 'failed';
        message.error = 'Tutor not found';
        await message.save();
        continue;
      }

      // Check if tutor is suspended
      if (tutor.status === 'suspended') {
        message.status = 'failed';
        message.error = 'TUTOR_SUSPENDED';
        await message.save();
        continue;
      }

      const defaultDailyLimit = await getSetting('defaultDailyLimit', 100);
      const effectiveDailyLimit = tutor.dailyLimit || defaultDailyLimit;

      const todaySentCount = await MessageLog.countDocuments({
        tutorId: tutor._id,
        date: message.date,
        status: 'sent'
      });

      if (todaySentCount >= effectiveDailyLimit) {
        message.status = 'failed';
        message.error = 'DAILY_LIMIT_EXCEEDED';
        await message.save();
        continue;
      }

      // Check WhatsApp session status
      const sessionStatus = await waProvider.getStatus(tutor._id);
      if (sessionStatus.status !== 'connected') {
        message.status = 'failed';
        message.error = 'NOT_CONNECTED';
        message.attempts += 1;
        await message.save();
        continue;
      }

      // Send the message immediately
      try {
        await waProvider.sendMessage(tutor._id, message.recipientPhone, message.body);
        message.status = 'sent';
        message.sentAt = new Date();
        message.error = null;
        message.attempts += 1;
        await message.save();
        console.log(`[SendWorker] Successfully sent message ${message._id} to ${message.recipientPhone}`);
      } catch (err) {
        console.error(`[SendWorker] Failed to send message ${message._id}:`, err.message);
        message.attempts += 1;
        if (message.attempts >= 3) {
          message.status = 'failed';
          message.error = err.message || 'Send failed after 3 attempts';
        } else {
          message.error = `Attempt ${message.attempts} failed: ${err.message}`;
        }
        await message.save();
      }

      // If there are more messages waiting in the queue, wait configured delay between messages
      const hasMore = await MessageLog.exists({ status: 'queued', attempts: { $lt: 3 } });
      if (hasMore) {
        const minSec = await getSetting('sendDelayMinSec', 5);
        const maxSec = await getSetting('sendDelayMaxSec', 15);
        const effectiveMinMs = Math.max(1, minSec) * 1000;
        const effectiveMaxMs = Math.max(effectiveMinMs, maxSec * 1000);
        await randomDelay(effectiveMinMs, effectiveMaxMs);
      }
    }
  } catch (err) {
    console.error('[SendWorker] Error running message queue worker:', err);
  } finally {
    isWorkerRunning = false;
  }
}
