import { scryptSync, randomBytes, timingSafeEqual, createHash } from 'node:crypto';

const KEYLEN = 64;
const SCRYPT = { N: 16384, r: 8, p: 1 };

export function hashPassword(plain) {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, KEYLEN, SCRYPT);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(plain, stored) {
  const [alg, saltHex, hashHex] = String(stored).split('$');
  if (alg !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(plain, Buffer.from(saltHex, 'hex'), expected.length, SCRYPT);
  return timingSafeEqual(expected, actual);
}

export const sha256 = (s) => createHash('sha256').update(s).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');

// Contraseña temporal legible (sin caracteres ambiguos) para cuentas creadas por el administrador.
export function tempPassword() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(10);
  let s = '';
  for (const b of bytes) s += abc[b % abc.length];
  return s.slice(0, 5) + '-' + s.slice(5) ;
}

export function passwordProblem(p) {
  if (typeof p !== 'string' || p.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  if (p.length > 128) return 'La contraseña es demasiado larga.';
  if (!/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(p) || !/\d/.test(p)) return 'La contraseña debe combinar letras y números.';
  return null;
}

// Límite simple de intentos por IP+correo para el inicio de sesión.
const attempts = new Map();
export function tooManyAttempts(key) {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || now - rec.first > 15 * 60_000) return false;
  return rec.count >= 8;
}
export function registerFailure(key) {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || now - rec.first > 15 * 60_000) attempts.set(key, { first: now, count: 1 });
  else rec.count++;
}
export const clearFailures = (key) => attempts.delete(key);
