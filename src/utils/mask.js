/**
 * Masks a phone number for privacy display (e.g., '01712345678' -> '01*******78')
 * Never reveals full numbers in admin lists or overview screens
 * @param {string} phone
 * @returns {string}
 */
export function maskPhone(phone) {
  if (!phone) return '';
  const str = String(phone).trim();
  if (str.length <= 4) return str;
  const firstTwo = str.slice(0, 2);
  const lastTwo = str.slice(-2);
  const stars = '*'.repeat(Math.max(str.length - 4, 4));
  return `${firstTwo}${stars}${lastTwo}`;
}
