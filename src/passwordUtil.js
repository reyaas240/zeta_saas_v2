import crypto from 'crypto';
import bcrypt from 'bcryptjs';

/**
 * Detects the password hashing format of a given hash string.
 * Supports:
 * - bcrypt ($2a$, $2y$, $2b$)
 * - MD5 (32 hex chars)
 * - SHA1 (40 hex chars)
 * - SHA256 (64 hex chars)
 * - Plaintext fallback (if unhashed, with warning)
 * 
 * @param {string} storedHash 
 * @returns {string} Hash format identifier ('bcrypt' | 'md5' | 'sha1' | 'sha256' | 'plaintext')
 */
export function detectHashAlgorithm(storedHash) {
  if (!storedHash || typeof storedHash !== 'string') {
    return 'unknown';
  }

  const trimmed = storedHash.trim();

  if (trimmed.startsWith('$2a$') || trimmed.startsWith('$2y$') || trimmed.startsWith('$2b$')) {
    return 'bcrypt';
  }

  if (/^[a-fA-F0-9]{32}$/.test(trimmed)) {
    return 'md5';
  }

  if (/^[a-fA-F0-9]{40}$/.test(trimmed)) {
    return 'sha1';
  }

  if (/^[a-fA-F0-9]{64}$/.test(trimmed)) {
    return 'sha256';
  }

  return 'plaintext';
}

/**
 * Verifies a raw user input password against a stored hash string strictly READ-ONLY.
 * Does NOT re-hash, mutate, or write back to the database.
 * 
 * @param {string} plainPassword 
 * @param {string} storedHash 
 * @returns {boolean} Whether password matches stored hash
 */
export function verifyPassword(plainPassword, storedHash) {
  if (!plainPassword || !storedHash) {
    return false;
  }

  const algorithm = detectHashAlgorithm(storedHash);
  const trimmedHash = storedHash.trim();

  switch (algorithm) {
    case 'bcrypt':
      // Handles PHP $2y$ by replacing prefix with $2a$ if needed by bcryptjs,
      // though bcryptjs handles $2a$/$2b$/$2y$ well.
      try {
        const normalizedHash = trimmedHash.replace(/^\$2y\$/, '$2a$');
        return bcrypt.compareSync(plainPassword, normalizedHash);
      } catch (err) {
        console.error('[Auth Engine] Bcrypt verification error:', err);
        return false;
      }

    case 'md5':
      {
        const hash = crypto.createHash('md5').update(plainPassword).digest('hex');
        return hash.toLowerCase() === trimmedHash.toLowerCase();
      }

    case 'sha1':
      {
        const hash = crypto.createHash('sha1').update(plainPassword).digest('hex');
        return hash.toLowerCase() === trimmedHash.toLowerCase();
      }

    case 'sha256':
      {
        const hash = crypto.createHash('sha256').update(plainPassword).digest('hex');
        return hash.toLowerCase() === trimmedHash.toLowerCase();
      }

    case 'plaintext':
      console.warn('[Auth Engine Security Alert] Comparing against unhashed plaintext password in database.');
      return plainPassword === trimmedHash;

    default:
      console.error(`[Auth Engine] Unknown hash format: "${storedHash}"`);
      return false;
  }
}
