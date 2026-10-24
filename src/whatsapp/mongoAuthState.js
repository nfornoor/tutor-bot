import { initAuthCreds, BufferJSON, proto } from '@whiskeysockets/baileys';
import { WaAuth } from '../models/WaAuth.js';
import { encrypt, decrypt } from '../utils/crypto.js';

/**
 * Checks whether MongoDB holds registered auth credentials for a tutor
 * @param {string|import('mongoose').Types.ObjectId} tutorId
 * @returns {Promise<boolean>}
 */
export async function hasRegisteredCreds(tutorId) {
  try {
    const tutorIdStr = tutorId.toString();
    const doc = await WaAuth.findOne({ tutorId: tutorIdStr, key: 'creds' });
    if (!doc || !doc.value) return false;
    const decrypted = decrypt(doc.value);
    const creds = JSON.parse(decrypted, BufferJSON.reviver);
    return Boolean(creds?.registered || creds?.account);
  } catch (err) {
    return false;
  }
}

/**
 * Creates MongoDB-backed authentication state for Baileys, encrypted at rest
 * @param {string|import('mongoose').Types.ObjectId} tutorId
 */
export async function useMongoAuthState(tutorId) {
  const tutorIdStr = tutorId.toString();

  // Helper to read data from WaAuth
  const readData = async (key) => {
    try {
      const doc = await WaAuth.findOne({ tutorId: tutorIdStr, key });
      if (!doc || !doc.value) return null;
      const decrypted = decrypt(doc.value);
      return JSON.parse(decrypted, BufferJSON.reviver);
    } catch (err) {
      console.error(`[MongoAuthState] Error reading key "${key}" for tutor ${tutorIdStr}:`, err.message);
      return null;
    }
  };

  // Helper to write data to WaAuth
  const writeData = async (key, value) => {
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

  // Helper to remove data from WaAuth
  const removeData = async (key) => {
    try {
      await WaAuth.deleteOne({ tutorId: tutorIdStr, key });
    } catch (err) {
      console.error(`[MongoAuthState] Error deleting key "${key}" for tutor ${tutorIdStr}:`, err.message);
    }
  };

  // Initialize or fetch existing creds
  const existingCreds = await readData('creds');
  const creds = existingCreds || initAuthCreds();

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
    saveCreds: () => writeData('creds', creds),
    clearAll: async () => {
      await WaAuth.deleteMany({ tutorId: tutorIdStr });
    }
  };
}
