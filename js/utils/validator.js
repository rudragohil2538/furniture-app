/**
 * INPUT VALIDATION & SANITIZATION UTILITIES (js/utils/validator.js)
 * 
 * Provides robust validation rules and XSS sanitization for customer
 * forms, order entry, and authentication fields.
 */

/**
 * Validates email addresses against standard RFC 5322 regex.
 * @param {string} email
 * @returns {boolean}
 */
export function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/;
  return emailRegex.test(email.trim());
}

/**
 * Validates mobile phone numbers (supports 10-digit formats with optional +91 or leading zero).
 * @param {string} phone
 * @returns {boolean}
 */
export function isValidPhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  // Cleans spaces, dashes, parentheses
  const cleaned = phone.replace(/[\s\-\(\)]/g, '');
  // Matches: 10 digits (e.g., 9876543210), or +919876543210, or 09876543210
  const phoneRegex = /^(?:\+91|0)?[6-9]\d{9}$/;
  return phoneRegex.test(cleaned);
}

/**
 * Validates 6-digit Postal / PIN codes.
 * @param {string} code
 * @returns {boolean}
 */
export function isValidPostalCode(code) {
  if (!code || typeof code !== 'string') return false;
  const pinRegex = /^[1-9][0-9]{5}$/;
  return pinRegex.test(code.trim());
}

/**
 * Validates non-empty required text inputs.
 * @param {any} value
 * @returns {boolean}
 */
export function isNotEmpty(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

/**
 * Validates positive monetary prices.
 * @param {any} value
 * @returns {boolean}
 */
export function isValidPrice(value) {
  const num = Number(value);
  return !isNaN(num) && num > 0;
}

/**
 * Validates order item quantity (must be positive integer >= 1).
 * @param {any} value
 * @returns {boolean}
 */
export function isValidQuantity(value) {
  const num = Number(value);
  return Number.isInteger(num) && num >= 1;
}

/**
 * Sanitize text strings to guard against Cross-Site Scripting (XSS).
 * @param {string} str
 * @returns {string} Sanitized string
 */
export function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

