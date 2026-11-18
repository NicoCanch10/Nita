import * as crypto from 'node:crypto';

export const SCRYPT_PARAMS = Object.freeze({
  algorithm: 'scrypt_v1' as const,
  N: 32768,
  r: 8,
  p: 1,
  keylen: 64,
  saltBytes: 16,
  maxmem: 64 * 1024 * 1024, // 67,108,864 bytes (64 MiB) requerido en Node/OpenSSL para N=32768, r=8, p=1
  maxConcurrent: 2,
});

export const MAX_PASSWORD_LENGTH = 1024;
export const MIN_PEPPER_LENGTH = 16;

export type LegacyHashFormat = 'sha256' | 'legacy_fallback' | 'malformed';

export class ScryptBusyError extends Error {
  readonly code = 'resource-exhausted';
  constructor(message = 'El servicio de autenticación está temporalmente saturado. Intenta nuevamente en unos segundos.') {
    super(message);
    this.name = 'ScryptBusyError';
  }
}

export class InvalidCryptoInputError extends Error {
  readonly code = 'invalid-argument';
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCryptoInputError';
  }
}

export interface ScryptLimiterOptions {
  maxConcurrent?: number;
  maxQueueSize?: number;
  queueTimeoutMs?: number;
}

export interface ScryptLimiterStats {
  active: number;
  queued: number;
  maxConcurrent: number;
  maxQueueSize: number;
  peakActive: number;
  rejectedCount: number;
}

interface QueuedTask {
  resolve: () => void;
  reject: (err: Error) => void;
  timer?: NodeJS.Timeout;
  settled: boolean;
}

/**
 * Limitador explícito de concurrencia para operaciones scrypt por instancia.
 * Acota el consumo nativo de memoria (~32-33 MiB por scrypt) a maxConcurrent <= 2
 * y rechaza de forma controlada cuando la cola alcanza maxQueueSize.
 */
export class ScryptConcurrencyLimiter {
  private readonly maxConcurrent: number;
  private readonly maxQueueSize: number;
  private readonly queueTimeoutMs: number;
  private active = 0;
  private peakActive = 0;
  private rejectedCount = 0;
  private readonly queue: QueuedTask[] = [];

  constructor(options: ScryptLimiterOptions = {}) {
    this.maxConcurrent = Math.max(1, Math.min(options.maxConcurrent ?? SCRYPT_PARAMS.maxConcurrent, SCRYPT_PARAMS.maxConcurrent));
    this.maxQueueSize = Math.max(0, options.maxQueueSize ?? 6);
    this.queueTimeoutMs = Math.max(50, options.queueTimeoutMs ?? 10000);
  }

  getStats(): ScryptLimiterStats {
    return {
      active: this.active,
      queued: this.queue.length,
      maxConcurrent: this.maxConcurrent,
      maxQueueSize: this.maxQueueSize,
      peakActive: this.peakActive,
      rejectedCount: this.rejectedCount,
    };
  }

  private acquire(): Promise<void> {
    if (this.active < this.maxConcurrent) {
      this.active += 1;
      if (this.active > this.peakActive) {
        this.peakActive = this.active;
      }
      return Promise.resolve();
    }

    if (this.queue.length >= this.maxQueueSize) {
      this.rejectedCount += 1;
      return Promise.reject(new ScryptBusyError());
    }

    return new Promise<void>((resolve, reject) => {
      const entry: QueuedTask = {
        resolve,
        reject,
        settled: false,
      };

      entry.timer = setTimeout(() => {
        if (entry.settled) return;
        entry.settled = true;
        const idx = this.queue.indexOf(entry);
        if (idx >= 0) {
          this.queue.splice(idx, 1);
        }
        this.rejectedCount += 1;
        reject(new ScryptBusyError('Tiempo de espera agotado en la cola criptográfica. Intenta nuevamente.'));
      }, this.queueTimeoutMs);

      this.queue.push(entry);
    });
  }

  private release(): void {
    this.active = Math.max(0, this.active - 1);

    while (this.queue.length > 0 && this.active < this.maxConcurrent) {
      const next = this.queue.shift();
      if (!next || next.settled) continue;
      next.settled = true;
      if (next.timer) clearTimeout(next.timer);
      this.active += 1;
      if (this.active > this.peakActive) {
        this.peakActive = this.active;
      }
      next.resolve();
    }
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }
}

export const defaultScryptLimiter = new ScryptConcurrencyLimiter({
  maxConcurrent: SCRYPT_PARAMS.maxConcurrent,
  maxQueueSize: 6,
  queueTimeoutMs: 10000,
});

// Clave HMAC efímera por instancia para comparación en tiempo constante de strings de longitud variable
const COMPARE_KEY = crypto.randomBytes(32);

/**
 * Compara dos cadenas en tiempo constante sin lanzar RangeError ante longitudes distintas.
 */
export function constantTimeEqualStrings(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  const digestA = crypto.createHmac('sha256', COMPARE_KEY).update(Buffer.from(a, 'utf8')).digest();
  const digestB = crypto.createHmac('sha256', COMPARE_KEY).update(Buffer.from(b, 'utf8')).digest();
  const digestsMatch = crypto.timingSafeEqual(digestA, digestB);
  return digestsMatch && a.length === b.length;
}

function assertValidPepper(pepper: string): void {
  if (typeof pepper !== 'string' || pepper.length < MIN_PEPPER_LENGTH) {
    throw new Error('Configuración criptográfica incompleta: pepper de servidor inválido o ausente.');
  }
}

function assertValidPasswordInput(password: string): void {
  if (typeof password !== 'string' || password.length === 0) {
    throw new InvalidCryptoInputError('La contraseña es requerida.');
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new InvalidCryptoInputError('La contraseña excede la longitud máxima permitida.');
  }
}

function scryptAsync(input: Buffer, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      input,
      salt,
      SCRYPT_PARAMS.keylen,
      {
        N: SCRYPT_PARAMS.N,
        r: SCRYPT_PARAMS.r,
        p: SCRYPT_PARAMS.p,
        maxmem: SCRYPT_PARAMS.maxmem,
      },
      (err, derivedKey) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(derivedKey);
      }
    );
  });
}

function buildPepperedPrehash(password: string, saltHex: string, pepper: string): Buffer {
  // No se aplica trim, normalización Unicode ni cambio de mayúsculas/minúsculas sobre password.
  return crypto
    .createHmac('sha256', Buffer.from(pepper, 'utf8'))
    .update(Buffer.from(`${saltHex}:${password}`, 'utf8'))
    .digest();
}

export interface ScryptCredential {
  kdfVersion: 'scrypt_v1';
  kdfParams: {
    N: number;
    r: number;
    p: number;
    keylen: number;
  };
  salt: string;
  passwordHash: string;
}

/**
 * Genera una credencial nueva en formato versionado scrypt_v1:
 *   scrypt_v1$N=32768,r=8,p=1$<saltHex32>$<derivedKeyHex128>
 */
export async function createScryptCredential(
  password: string,
  pepper: string,
  limiter: ScryptConcurrencyLimiter = defaultScryptLimiter
): Promise<ScryptCredential> {
  assertValidPasswordInput(password);
  assertValidPepper(pepper);

  const salt = crypto.randomBytes(SCRYPT_PARAMS.saltBytes).toString('hex');
  const saltBuf = Buffer.from(salt, 'hex');
  const prehash = buildPepperedPrehash(password, salt, pepper);

  const derived = await limiter.run(() => scryptAsync(prehash, saltBuf));
  const derivedHex = derived.toString('hex');

  return {
    kdfVersion: 'scrypt_v1',
    kdfParams: {
      N: SCRYPT_PARAMS.N,
      r: SCRYPT_PARAMS.r,
      p: SCRYPT_PARAMS.p,
      keylen: SCRYPT_PARAMS.keylen,
    },
    salt,
    passwordHash: `scrypt_v1$N=${SCRYPT_PARAMS.N},r=${SCRYPT_PARAMS.r},p=${SCRYPT_PARAMS.p}$${salt}$${derivedHex}`,
  };
}

const SCRYPT_V1_REGEX = /^scrypt_v1\$N=32768,r=8,p=1\$([a-f0-9]{32})\$([a-f0-9]{128})$/;

export function isValidScryptV1Format(passwordHash: unknown, salt: unknown): boolean {
  if (typeof passwordHash !== 'string' || typeof salt !== 'string') {
    return false;
  }
  if (!/^[a-f0-9]{32}$/.test(salt)) {
    return false;
  }
  const match = SCRYPT_V1_REGEX.exec(passwordHash);
  if (!match) {
    return false;
  }
  return constantTimeEqualStrings(match[1], salt);
}

/**
 * Verifica una credencial scrypt_v1 almacenada usando el pepper del servidor y el limitador de concurrencia.
 */
export async function verifyScryptCredential(
  password: string,
  storedHash: string,
  storedSalt: string,
  pepper: string,
  limiter: ScryptConcurrencyLimiter = defaultScryptLimiter
): Promise<boolean> {
  assertValidPepper(pepper);
  if (typeof password !== 'string' || password.length === 0 || password.length > MAX_PASSWORD_LENGTH) {
    return false;
  }
  if (!isValidScryptV1Format(storedHash, storedSalt)) {
    return false;
  }

  const saltBuf = Buffer.from(storedSalt, 'hex');
  const prehash = buildPepperedPrehash(password, storedSalt, pepper);
  const derived = await limiter.run(() => scryptAsync(prehash, saltBuf));
  const candidateHash = `scrypt_v1$N=${SCRYPT_PARAMS.N},r=${SCRYPT_PARAMS.r},p=${SCRYPT_PARAMS.p}$${storedSalt}$${derived.toString('hex')}`;

  return constantTimeEqualStrings(candidateHash, storedHash);
}

/**
 * Detecta el formato de un hash heredado de src/services/authAccountService.ts:
 * - 'sha256': exactamente 64 dígitos hexadecimales minúsculas.
 * - 'legacy_fallback': `h_${Math.abs(hash).toString(16)}_${salt}` con coincidencia exacta del sufijo salt.
 * - 'malformed': cualquier otro valor, hash truncado, salt ausente o formato desconocido.
 */
export function detectLegacyHashFormat(passwordHash: unknown, salt: unknown): LegacyHashFormat {
  if (typeof passwordHash !== 'string' || typeof salt !== 'string') {
    return 'malformed';
  }
  if (salt.length === 0 || salt.length > 128) {
    return 'malformed';
  }

  if (/^[a-f0-9]{64}$/.test(passwordHash)) {
    return 'sha256';
  }

  if (passwordHash.startsWith('h_')) {
    const secondUnderscore = passwordHash.indexOf('_', 2);
    if (secondUnderscore > 2) {
      const hexPart = passwordHash.slice(2, secondUnderscore);
      const saltSuffix = passwordHash.slice(secondUnderscore + 1);
      if (/^[0-9a-f]{1,8}$/.test(hexPart) && constantTimeEqualStrings(saltSuffix, salt)) {
        return 'legacy_fallback';
      }
    }
  }

  return 'malformed';
}

/**
 * Verificador A: SHA-256 UTF-8 sobre `${salt}:${password}` sin trim ni normalización.
 */
export function verifyLegacySha256(password: string, storedHash: string, salt: string): boolean {
  if (typeof password !== 'string' || password.length === 0 || password.length > MAX_PASSWORD_LENGTH) {
    return false;
  }
  if (detectLegacyHashFormat(storedHash, salt) !== 'sha256') {
    return false;
  }

  const computed = crypto
    .createHash('sha256')
    .update(Buffer.from(`${salt}:${password}`, 'utf8'))
    .digest('hex');

  return constantTimeEqualStrings(computed, storedHash);
}

/**
 * Verificador B: Fallback JS heredado `h_${Math.abs(hash).toString(16)}_${salt}`
 * reproduciendo exactamente charCodeAt (UTF-16) y enteros con signo de 32 bits.
 */
export function verifyLegacyFallbackHash(password: string, storedHash: string, salt: string): boolean {
  if (typeof password !== 'string' || password.length === 0 || password.length > MAX_PASSWORD_LENGTH) {
    return false;
  }
  if (detectLegacyHashFormat(storedHash, salt) !== 'legacy_fallback') {
    return false;
  }

  const input = `${salt}:${password}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  const computed = `h_${Math.abs(hash).toString(16)}_${salt}`;

  return constantTimeEqualStrings(computed, storedHash);
}

/**
 * Verifica una credencial heredada (SHA-256 o fallback h_...) devolviendo el formato verificado o null.
 */
export function verifyLegacyCredential(
  password: string,
  storedHash: string,
  salt: string
): { valid: boolean; format: LegacyHashFormat } {
  const format = detectLegacyHashFormat(storedHash, salt);
  if (format === 'sha256') {
    return { valid: verifyLegacySha256(password, storedHash, salt), format };
  }
  if (format === 'legacy_fallback') {
    return { valid: verifyLegacyFallbackHash(password, storedHash, salt), format };
  }
  return { valid: false, format: 'malformed' };
}
