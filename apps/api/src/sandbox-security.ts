import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { argon2id, hash, verify } from 'argon2';

export const digest = (value: string): string => createHash('sha256').update(value).digest('hex');
export const newToken = (): string => randomBytes(32).toString('base64url');
export async function hashPassword(password: string): Promise<string> {
  return hash(password, { type: argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
}
export async function checkPassword(encoded: string, password: string): Promise<boolean> {
  if (!encoded.startsWith('$argon2id$')) return false;
  try {
    return await verify(encoded, password);
  } catch {
    return false;
  }
}
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function newTotpSecret(): string {
  const bytes = randomBytes(20);
  let bits = '';
  for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
  let result = '';
  for (let i = 0; i < bits.length; i += 5) result += alphabet[parseInt(bits.slice(i, i + 5), 2)];
  return result;
}
export function totpAt(secret: string, counter: number): string {
  if (!/^[A-Z2-7]{16,64}$/.test(secret)) throw new Error('Invalid TOTP secret');
  let bits = '';
  for (const letter of secret) bits += alphabet.indexOf(letter).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g)?.map((byte) => parseInt(byte, 2)) ?? []);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac('sha1', key).update(message).digest();
  const offset = (mac[mac.length - 1] ?? 0) & 15;
  return ((mac.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
}
export function verifyTotp(
  secret: string,
  code: string,
  lastCounter: number,
  now = Date.now(),
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 30000);
  for (const counter of [current, current - 1, current + 1]) {
    if (
      counter > lastCounter &&
      timingSafeEqual(Buffer.from(totpAt(secret, counter)), Buffer.from(code))
    )
      return counter;
  }
  return null;
}
export function encryptSecret(value: string, key: string): string {
  if (!/^[a-f0-9]{64}$/i.test(key))
    throw new Error('SANDBOX_ENCRYPTION_KEY must contain 64 hex characters');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
}
export function decryptSecret(value: string, key: string): string {
  const [iv, tag, ciphertext] = value.split('.').map((part) => Buffer.from(part, 'base64url'));
  if (!iv || !tag || !ciphertext) throw new Error('Invalid encrypted secret');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
