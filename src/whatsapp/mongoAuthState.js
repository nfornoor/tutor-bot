import { initAuthCreds, BufferJSON, proto } from '@whiskeysockets/baileys';
import { WaAuth } from '../models/WaAuth.js';
import { encrypt, decrypt } from '../utils/crypto.js';

// In-memory write-through cache: tutorId -> Map<key, parsedValue>
// Ensures fast synchronous reads during Baileys handshakes and prevents race conditions across reconnects
const authCaches = new Map();

/**
 * Checks whether MongoDB holds registered auth credentials for a tutor
 * @param {string|import('mongoose').Types.ObjectId} tutorId
 * @returns {Promise<boolean>}
 */
export async function hasRegisteredCreds(tutorId) {
  try {
    const tutorIdStr = tutorId.toString();
    const cache = authCaches.get(tutorIdStr);
    if (cache?.has('creds')) {
      const c = cache.get('creds');
      return Boolean(c?.registered || c?.account || c?.me);
    }

    const doc = await WaAuth.findOne({ tutorId: tutorIdStr, key: 'creds' });
    if (!doc || !doc.value) return false;
    const decrypted = decrypt(doc.value);
    const creds = JSON.parse(decrypted, BufferJSON.reviver);
    return Boolean(creds?.registered || creds?.account || creds?.me);
  } catch (err) {
    return false;
  }
}

/**
 * Creates MongoDB-backed authentication state for Baileys, encrypted at rest
 * with an in-memory cache to guarantee zero-latency key retrieval during 515 reconnect handshakes
 * @param {string|import('mongoose').Types.ObjectId} tutorId
 */
export async function useMongoAuthState(tutorId) {
  const tutorIdStr = tutorId.toString();

  let cache = authCaches.get(tutorIdStr);
  if (!cache) {
    cache = new Map();
    authCaches.set(tutorIdStr, cache);
  }

  // Helper to read data from cache or WaAuth
  const readData = async (key) => {
    if (cache.has(key)) {
      return cache.get(key);
    }
    try {
      const doc = await WaAuth.findOne({ tutorId: tutorIdStr, key });
      if (!doc || !doc.value) return null;
      const decrypted = decrypt(doc.value);
      const parsed = JSON.parse(decrypted, BufferJSON.reviver);
      cache.set(key, parsed);
      return parsed;
    } catch (err) {
      console.error(`[MongoAuthState] Error reading key "${key}" for tutor ${tutorIdStr}:`, err.message);
      return null;
    }
  };

  // Helper to write data to cache and WaAuth
  const writeData = async (key, value) => {
    cache.set(key, value);
    try {
      const serialized = JSON.stringify(value, BufferJSON.replacer);
      const encrypted = encrypt(serialized);
      await WaAuth.findOneAndUpdate(
        { tutorId: tutorIdStr, key },
        { value: encrypted },
        { upsert: true, new: true }
      );
    } catch (err) {
      console.error(`[MongoAuthState] Error writing key "${key}" for tutor ${tutorIdStr}:`, err.message);
    }
  };

  // Helper to remove data from cache and WaAuth
  const removeData = async (key) => {
    cache.delete(key);
    try {
      await WaAuth.deleteOne({ tutorId: tutorIdStr, key });
    } catch (err) {
      console.error(`[MongoAuthState] Error deleting key "${key}" for tutor ${tutorIdStr}:`, err.message);
    }
  };

  // Initialize or fetch existing creds
  const existingCreds = await readData('creds');
  const creds = existingCreds || initAuthCreds();
  cache.set('creds', creds);

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              if (value) {
                tasks.push(writeData(key, value));
              } else {
                tasks.push(removeData(key));
              }
            }
          }
          await Promise.all(tasks);
        }
      }
    },
    saveCreds: (update) => {
      if (update && typeof update === 'object') {
        Object.assign(creds, update);
      }
      cache.set('creds', creds);
      return writeData('creds', creds);
    },
    clearAll: async () => {
      cache.clear();
      await WaAuth.deleteMany({ tutorId: tutorIdStr });
    }
  };
}
