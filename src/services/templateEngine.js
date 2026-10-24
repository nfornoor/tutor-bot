/**
 * Replaces placeholders in template string with variable values
 * Supported variables:
 * - {{student_name}}
 * - {{homework}}
 * - {{exam_topic}}
 * - {{marks}}
 * - {{percentage}}
 * - {{status_sentence}}
 * - {{tutor_name}}
 *
 * @param {string} templateBody
 * @param {Record<string, string|number>} variables
 * @returns {string}
 */
export function renderTemplate(templateBody, variables = {}) {
  if (!templateBody) return '';

  return templateBody.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(variables, key)) {
      const val = variables[key];
      return val !== null && val !== undefined ? String(val) : '';
    }
    return match; // Keep unchanged if placeholder is unknown
  });
}

/**
 * Returns Bengali closing sentence corresponding to homework status
 * @param {'complete' | 'partial' | 'incomplete'} status
 * @param {Record<string, string>} [customSentences]
 * @returns {string}
 */
export function getStatusSentence(status, customSentences = null) {
  if (customSentences && customSentences[status]) {
    return customSentences[status];
  }
  switch (status) {
    case 'complete':
      return 'আজকের বাড়ির কাজ সম্পূর্ণ করেছে।';
    case 'partial':
      return 'আজকের বাড়ির কাজ আংশিক সম্পন্ন করেছে।';
    case 'incomplete':
      return 'আজকের বাড়ির কাজ সম্পন্ন করেনি।';
    default:
      return 'আজকের বাড়ির কাজ সম্পূর্ণ করেছে।';
  }
}
