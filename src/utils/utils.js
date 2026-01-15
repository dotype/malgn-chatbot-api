/**
 * Format response data
 */
/**
 * Format response data into a new, immutable object.
 * @param {Object} data - Plain object to include in the response.
 * @returns {Object} - New object containing original properties and formattedAt timestamp.
 * @throws {TypeError} - If data is not a plain object.
 */
export const formatResponse = (data) => {
	// Validate input
	if (data === null || data === undefined || typeof data !== 'object' || Array.isArray(data)) {
		throw new TypeError('formatResponse expects a plain object as input');
	}

	const result = {
		...data,
		formattedAt: new Date().toISOString()
	};

	// Return an immutable object to avoid accidental mutations downstream
	return Object.freeze(result);
};

/**
 * Validate email format
 */
/**
 * Validate an email address string.
 * Trims and lowercases input before testing.
 * @param {string} email
 * @returns {boolean}
 */
export const isValidEmail = (email) => {
	if (typeof email !== 'string') return false;
	const normalized = email.trim().toLowerCase();

	// Simple but stricter regex: no spaces, has '@', domain and TLD (min 2 chars)
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
	return emailRegex.test(normalized);
};

/**
 * Generate unique ID
 */
/**
 * Generate a unique identifier. Uses crypto.randomUUID() when available,
 * otherwise falls back to a timestamp + random base36 string.
 * @param {string} [prefix] - Optional prefix to prepend to the id.
 * @returns {string}
 * @throws {TypeError} - If prefix is provided but is not a string.
 */
export const generateId = (prefix = '') => {
	if (typeof prefix !== 'string') {
		throw new TypeError('generateId prefix must be a string');
	}

	let id;
	try {
		if (typeof globalThis?.crypto?.randomUUID === 'function') {
			id = globalThis.crypto.randomUUID();
		} else {
			// Fallback: timestamp + random base36 slice
			id = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
		}
	} catch (e) {
		// In very constrained environments, fallback deterministically
		id = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
	}

	return prefix ? `${prefix}-${id}` : id;
};
