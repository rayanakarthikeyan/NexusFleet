import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const keyLength = 32;
const cost = 32768;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  // Async scrypt keeps expensive password work off the HTTP event loop.
  return new Promise((resolve, reject) =>
    scrypt(
      password,
      salt,
      keyLength,
      { N: cost, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || password.length > 128)
    throw new Error('Use a password of 12–128 characters');
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt-v1$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [version, salt, key, extra] = encoded.split('$');
  if (
    version !== 'scrypt-v1' ||
    !/^[0-9a-f]{32}$/.test(salt ?? '') ||
    !/^[0-9a-f]{64}$/.test(key ?? '') ||
    extra !== undefined
  )
    return false;
  const actual = await derive(password, Buffer.from(salt, 'hex'));
  return timingSafeEqual(actual, Buffer.from(key, 'hex'));
}

// Missing accounts perform the same password work to avoid an easy timing oracle.
export const dummyPasswordHash = `scrypt-v1$${'0'.repeat(32)}$${'0'.repeat(64)}`;
