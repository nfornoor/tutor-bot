import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
  initAuthCreds
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { useMongoAuthState, hasRegisteredCreds } from './mongoAuthState.js';
import { WaSession } from '../models/WaSession.js';

// Map of active Baileys sockets: tutorId string -> WASocket
const sockets = new Map();

// Map of active reconnect timers: tutorId string -> NodeJS.Timeout
const reconnectTimers = new Map();

// Map of reconnect attempts count: tutorId string -> number
const reconnectAttempts = new Map();

// Pino logger: use 'warn' to catch connection warnings without flood
const logger = pino({ level: 'warn' });

/**
 * Normalizes a Bangladeshi phone number to WhatsApp JID
 * E.g., '01712345678' -> '8801712345678@s.whatsapp.net'
 * @param {string} phone
 * @returns {string}
 */
export function formatToJid(phone) {
  let cleaned = String(phone).replace(/\D/g, '');
  if (cleaned.startsWith('8801') && cleaned.length === 13) {
    return `${cleaned}@s.whatsapp.net`;
  }
  if (cleaned.startsWith('01') && cleaned.length === 11) {
    return `88${cleaned}@s.whatsapp.net`;
  }
  if (cleaned.startsWith('1') && cleaned.length === 10) {
    return `880${cleaned}@s.whatsapp.net`;
  }
  return `${cleaned}@s.whatsapp.net`;
}

/**
 * Normalizes phone number into digits-only with country code for pairing code
 * E.g., '01712345678' -> '8801712345678'
 * @param {string} phone
 * @returns {string}
 */
export function cleanPhoneNumberForPairing(phone) {
  let cleaned = String(phone).replace(/\D/g, '');
  if (cleaned.startsWith('8801') && cleaned.length === 13) {
    return cleaned;
  }
  if (cleaned.startsWith('01') && cleaned.length === 11) {
    return `88${cleaned}`;
  }
  if (cleaned.startsWith('1') && cleaned.length === 10) {
    return `880${cleaned}`;
  }
  return cleaned;
}

/**
 * Starts or restarts a Baileys session for a given tutor
 * @param {string|import('mongoose').Types.ObjectId} tutorId
 * @param {object} options
 * @param {'qr'|'code'} [options.method='qr']
 * @param {string} [options.phoneNumber]
 * @param {boolean} [options.isReconnect=false]
 */
export async function startSession(tutorId, options = {}) {
  const tutorIdStr = tutorId.toString();
  const method = options.method || 'qr';

  // Clear any existing reconnect timer for this tutor
  if (reconnectTimers.has(tutorIdStr)) {
    clearTimeout(reconnectTimers.get(tutorIdStr));
    reconnectTimers.delete(tutorIdStr);
  }

  // If already connected, return existing socket info
  if (sockets.has(tutorIdStr)) {
    const existingSock = sockets.get(tutorIdStr);
    if (existingSock?.user?.id) {
      const phone = existingSock.user.id.split(':')[0];
      return { status: 'connected', phone };
    }
    // Clean up unconnected socket to start a fresh pairing attempt
    try {
      existingSock.end?.(new Error('RESTARTING_SESSION'));
    } catch (e) {}
    sockets.delete(tutorIdStr);
  }

  const { state, saveCreds, clearAll } = await useMongoAuthState(tutorIdStr);

  // If this is a fresh user request (not an automatic reconnect)
  // and credentials are not registered, start with fresh creds
  if (!options.isReconnect && !state.creds?.registered && !state.creds?.account) {
    await clearAll();
    state.creds = initAuthCreds();
    await saveCreds();
  }

  // Update DB status to connecting
  await WaSession.findOneAndUpdate(
    { tutorId: tutorIdStr },
    { status: 'connecting', qr: null, pairingCode: null },
    { upsert: true, new: true }
  );

  const { version } = await fetchLatestBaileysVersion().catch(() => ({
    version: [2, 3000, 1015901307],
    isLatest: false
  }));

  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    auth: state,
    browser: Browsers.ubuntu('Chrome'),
    syncFullHistory: false, // Prevents memory bloat & Bad MAC disconnects
    getMessage: async () => undefined, // Prevents crash on background notification decryption
    defaultQueryTimeoutMs: undefined, // Prevents timeout cancellation on slow init queries
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 25000,
    generateHighQualityLinkPreview: false,
    markOnlineOnConnect: false,
    fireInitQueries: false
  });

  sockets.set(tutorIdStr, sock);

  sock.ev.on('creds.update', saveCreds);

  let pairingCodeRequested = false;

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // QR Mode: Save QR to database when received
    if (qr && method === 'qr') {
      await WaSession.findOneAndUpdate(
        { tutorId: tutorIdStr },
        { status: 'qr_ready', qr, pairingCode: null },
        { upsert: true }
      );
      console.log(`[Baileys] QR code ready for tutor ${tutorIdStr}`);
    }

    // Pairing Code Mode: Request pairing code when ready
    if (method === 'code' && options.phoneNumber && !pairingCodeRequested && (qr || connection === 'open')) {
      pairingCodeRequested = true;
      const cleanPhone = cleanPhoneNumberForPairing(options.phoneNumber);

      try {
        console.log(`[Baileys] Requesting pairing code for ${cleanPhone}...`);
        const rawCode = await sock.requestPairingCode(cleanPhone);
        const formattedCode = rawCode?.match(/.{1,4}/g)?.join('-') || rawCode;
        console.log(`[Baileys] Pairing code ready for tutor ${tutorIdStr}: ${formattedCode}`);

        await WaSession.findOneAndUpdate(
          { tutorId: tutorIdStr },
          {
            status: 'code_ready',
            pairingCode: formattedCode,
            phone: cleanPhone,
            qr: null
          },
          { upsert: true }
        );
      } catch (err) {
        console.error(`[Baileys] requestPairingCode error for tutor ${tutorIdStr}:`, err.message);
        await WaSession.findOneAndUpdate(
          { tutorId: tutorIdStr },
          { status: 'disconnected', pairingCode: null, qr: null }
        );
      }
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut; // 401
      const isRestartRequired = statusCode === DisconnectReason.restartRequired; // 515
      const shouldReconnect = !isLoggedOut;

      console.log(`[Baileys] Connection closed for tutor ${tutorIdStr}, code: ${statusCode}, shouldReconnect: ${shouldReconnect}`);

      sockets.delete(tutorIdStr);

      if (!shouldReconnect) {
        // Disconnected permanently / logged out from phone
        reconnectAttempts.delete(tutorIdStr);
        await clearAll();
        await WaSession.findOneAndUpdate(
          { tutorId: tutorIdStr },
          { status: 'disconnected', qr: null, pairingCode: null, phone: null }
        );
        console.log(`[Baileys] Tutor ${tutorIdStr} was logged out permanently.`);
      } else {
        // Automatic reconnection with exponential backoff
        await WaSession.findOneAndUpdate(
          { tutorId: tutorIdStr },
          { status: 'connecting' }
        );

        const currentAttempts = reconnectAttempts.get(tutorIdStr) || 0;
        reconnectAttempts.set(tutorIdStr, currentAttempts + 1);

        // Code 515 (restartRequired) is sent right after scanning: reconnect immediately in 500ms
        // Other disconnects (network drops): backoff 1.5s, 3s, 5s, 10s... up to 30s
        const delay = isRestartRequired
          ? 500
          : Math.min(30000, Math.floor(1000 * Math.pow(1.5, Math.min(currentAttempts, 8))));

        console.log(`[Baileys] Scheduling auto-reconnect (attempt ${currentAttempts + 1}) in ${delay}ms for tutor ${tutorIdStr}...`);

        const timer = setTimeout(() => {
          startSession(tutorIdStr, {
            method,
            phoneNumber: options.phoneNumber,
            isReconnect: true
          }).catch((err) => {
            console.error(`[Baileys] Reconnect failed for tutor ${tutorIdStr}:`, err.message);
          });
        }, delay);

        reconnectTimers.set(tutorIdStr, timer);
      }
    } else if (connection === 'open') {
      // Successfully connected!
      reconnectAttempts.delete(tutorIdStr);
      if (reconnectTimers.has(tutorIdStr)) {
        clearTimeout(reconnectTimers.get(tutorIdStr));
        reconnectTimers.delete(tutorIdStr);
      }

      const fullJid = sock.user?.id || '';
      const rawPhone = fullJid.split(':')[0] || fullJid.split('@')[0];

      await WaSession.findOneAndUpdate(
        { tutorId: tutorIdStr },
        {
          status: 'connected',
          phone: rawPhone,
          qr: null,
          pairingCode: null,
          lastConnectedAt: new Date()
        },
        { upsert: true }
      );
      console.log(`[Baileys] Connected successfully for tutor ${tutorIdStr} (${rawPhone})`);
    }
  });

  return { status: 'connecting', method };
}

/**
 * Disconnects and logs out a tutor's session
 * @param {string|import('mongoose').Types.ObjectId} tutorId
 */
export async function disconnectSession(tutorId) {
  const tutorIdStr = tutorId.toString();

  // Clear reconnect timers & attempts
  if (reconnectTimers.has(tutorIdStr)) {
    clearTimeout(reconnectTimers.get(tutorIdStr));
    reconnectTimers.delete(tutorIdStr);
  }
  reconnectAttempts.delete(tutorIdStr);

  const sock = sockets.get(tutorIdStr);
  if (sock) {
    try {
      await sock.logout();
    } catch (err) {
      console.warn(`[Baileys] Error during logout for tutor ${tutorIdStr}:`, err.message);
    }
    sockets.delete(tutorIdStr);
  }

  const { clearAll } = await useMongoAuthState(tutorIdStr);
  await clearAll();

  await WaSession.findOneAndUpdate(
    { tutorId: tutorIdStr },
    { status: 'disconnected', qr: null, pairingCode: null, phone: null }
  );

  return { success: true };
}

/**
 * Closes in-memory socket for a tutor without wiping session credentials
 * Used when a tutor is suspended by an admin
 * @param {string|import('mongoose').Types.ObjectId} tutorId
 */
export function closeSocketOnly(tutorId) {
  const tutorIdStr = tutorId.toString();
  if (reconnectTimers.has(tutorIdStr)) {
    clearTimeout(reconnectTimers.get(tutorIdStr));
    reconnectTimers.delete(tutorIdStr);
  }
  reconnectAttempts.delete(tutorIdStr);

  const sock = sockets.get(tutorIdStr);
  if (sock) {
    try {
      sock.end?.(new Error('TUTOR_SUSPENDED'));
    } catch (e) {}
    sockets.delete(tutorIdStr);
  }
}

/**
 * Sends a text message to a phone number using the tutor's session
 * @param {string|import('mongoose').Types.ObjectId} tutorId
 * @param {string} toPhone
 * @param {string} text
 */
export async function sendBaileysMessage(tutorId, toPhone, text) {
  const tutorIdStr = tutorId.toString();
  const sock = sockets.get(tutorIdStr);

  if (!sock) {
    throw new Error('NOT_CONNECTED');
  }

  const jid = formatToJid(toPhone);
  return await sock.sendMessage(jid, { text });
}

/**
 * Checks in-memory and database status of tutor's session
 * @param {string|import('mongoose').Types.ObjectId} tutorId
 */
export async function getSessionStatus(tutorId) {
  const tutorIdStr = tutorId.toString();
  const dbSession = await WaSession.findOne({ tutorId: tutorIdStr });
  const inMemorySock = sockets.get(tutorIdStr);

  const isActuallyConnected = Boolean(inMemorySock?.user?.id && dbSession?.status === 'connected');

  let status = 'disconnected';
  if (isActuallyConnected) {
    status = 'connected';
  } else if (inMemorySock) {
    status = dbSession?.status || 'connecting';
  } else {
    // No active socket in memory: check if tutor has registered credentials in MongoDB
    const hasCreds = await hasRegisteredCreds(tutorIdStr);

    if (hasCreds) {
      // Registered session exists in DB! Trigger background reconnect if not already scheduled
      if (!reconnectTimers.has(tutorIdStr)) {
        console.log(`[Baileys] Auto-reconnecting registered session for tutor ${tutorIdStr}...`);
        startSession(tutorIdStr, { isReconnect: true }).catch((err) => {
          console.error(`[Baileys] Background reconnect error for tutor ${tutorIdStr}:`, err.message);
        });
      }
      status = 'connecting';
    } else {
      // Truly disconnected with no auth credentials
      if (dbSession && ['connecting', 'qr_ready', 'code_ready'].includes(dbSession.status)) {
        await WaSession.updateOne(
          { tutorId: tutorIdStr },
          { status: 'disconnected', qr: null, pairingCode: null }
        );
      }
      status = 'disconnected';
    }
  }

  return {
    status,
    qr: status === 'qr_ready' ? (dbSession?.qr || null) : null,
    pairingCode: status === 'code_ready' ? (dbSession?.pairingCode || null) : null,
    phone: dbSession?.phone || (inMemorySock?.user?.id ? inMemorySock.user.id.split(':')[0] : null),
    lastConnectedAt: dbSession?.lastConnectedAt || null
  };
}

/**
 * Restores all previously connected sessions on server boot
 */
export async function initAllSessions() {
  try {
    // Reset any stale in-progress pairing sessions on boot
    await WaSession.updateMany(
      { status: { $in: ['qr_ready', 'code_ready'] } },
      { status: 'disconnected', qr: null, pairingCode: null }
    );

    // Find all sessions marked connected OR tutors with registered credentials
    const sessions = await WaSession.find({});
    console.log(`[Baileys] Checking ${sessions.length} sessions for boot reconnection...`);

    for (const session of sessions) {
      const hasCreds = await hasRegisteredCreds(session.tutorId);
      if (session.status === 'connected' || hasCreds) {
        console.log(`[Baileys] Reconnecting registered session for tutor ${session.tutorId}...`);
        try {
          await startSession(session.tutorId, { isReconnect: true });
        } catch (err) {
          console.error(`[Baileys] Boot reconnect failed for tutor ${session.tutorId}:`, err.message);
        }
      }
    }
  } catch (err) {
    console.error('[Baileys] Error querying sessions during boot:', err.message);
  }
}
