import { Setting } from '../models/Setting.js';
import { DEFAULT_STUDENT_TEMPLATE, DEFAULT_PARENT_TEMPLATE } from '../models/Template.js';

export const DEFAULT_SETTINGS = {
  defaultDailyLimit: 100,
  sendDelayMinSec: 5,
  sendDelayMaxSec: 15,
  registrationOpen: true,
  maintenanceMode: false,
  defaultStudentTemplate: DEFAULT_STUDENT_TEMPLATE,
  defaultParentTemplate: DEFAULT_PARENT_TEMPLATE,
  defaultStatusSentences: {
    complete: 'আজকের বাড়ির কাজ সম্পূর্ণ করেছে।',
    partial: 'আজকের বাড়ির কাজ আংশিক সম্পন্ন করেছে।',
    incomplete: 'আজকের বাড়ির কাজ সম্পন্ন করেনি।'
  }
};

let cachedSettings = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 30 * 1000; // 30 seconds

/**
 * Loads all settings from DB or returns cached settings if within TTL
 * @returns {Promise<Record<string, any>>}
 */
export async function getAllSettings() {
  const now = Date.now();
  if (cachedSettings && now - lastCacheTime < CACHE_TTL_MS) {
    return cachedSettings;
  }

  try {
    const docs = await Setting.find({}).lean();
    const result = { ...DEFAULT_SETTINGS };

    for (const doc of docs) {
      if (doc.key in result) {
        result[doc.key] = doc.value;
      }
    }

    cachedSettings = result;
    lastCacheTime = now;
    return cachedSettings;
  } catch (err) {
    console.error('[SettingsService] Failed to load settings from DB:', err.message);
    return cachedSettings || { ...DEFAULT_SETTINGS };
  }
}

/**
 * Reads a single setting with cached getter and fallback
 * @param {string} key
 * @param {any} [fallback]
 * @returns {Promise<any>}
 */
export async function getSetting(key, fallback = undefined) {
  const settings = await getAllSettings();
  if (key in settings) {
    return settings[key];
  }
  return fallback !== undefined ? fallback : DEFAULT_SETTINGS[key];
}

/**
 * Updates multiple settings in DB and immediately invalidates the cache
 * @param {Record<string, any>} updates
 * @param {string|import('mongoose').Types.ObjectId} adminId
 * @returns {Promise<Record<string, any>>}
 */
export async function updateMultipleSettings(updates, adminId) {
  const operations = Object.entries(updates).map(([key, value]) => ({
    updateOne: {
      filter: { key },
      update: { $set: { key, value, updatedBy: adminId, updatedAt: new Date() } },
      upsert: true
    }
  }));

  if (operations.length > 0) {
    await Setting.bulkWrite(operations);
  }

  // Invalidate cache immediately
  cachedSettings = null;
  lastCacheTime = 0;

  return await getAllSettings();
}

/**
 * Explicit cache invalidator
 */
export function invalidateSettingsCache() {
  cachedSettings = null;
  lastCacheTime = 0;
}
