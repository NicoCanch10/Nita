"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultScryptLimiter = exports.ScryptConcurrencyLimiter = exports.InvalidCryptoInputError = exports.ScryptBusyError = exports.MIN_PEPPER_LENGTH = exports.MAX_PASSWORD_LENGTH = exports.SCRYPT_PARAMS = void 0;
exports.constantTimeEqualStrings = constantTimeEqualStrings;
exports.createScryptCredential = createScryptCredential;
exports.isValidScryptV1Format = isValidScryptV1Format;
exports.verifyScryptCredential = verifyScryptCredential;
exports.detectLegacyHashFormat = detectLegacyHashFormat;
exports.verifyLegacySha256 = verifyLegacySha256;
exports.verifyLegacyFallbackHash = verifyLegacyFallbackHash;
exports.verifyLegacyCredential = verifyLegacyCredential;
const crypto = __importStar(require("node:crypto"));
exports.SCRYPT_PARAMS = Object.freeze({
    algorithm: 'scrypt_v1',
    N: 32768,
    r: 8,
    p: 1,
    keylen: 64,
    saltBytes: 16,
    maxmem: 64 * 1024 * 1024, // 67,108,864 bytes (64 MiB) requerido en Node/OpenSSL para N=32768, r=8, p=1
    maxConcurrent: 2,
});
exports.MAX_PASSWORD_LENGTH = 1024;
exports.MIN_PEPPER_LENGTH = 16;
class ScryptBusyError extends Error {
    code = 'resource-exhausted';
    constructor(message = 'El servicio de autenticación está temporalmente saturado. Intenta nuevamente en unos segundos.') {
        super(message);
        this.name = 'ScryptBusyError';
    }
}
exports.ScryptBusyError = ScryptBusyError;
class InvalidCryptoInputError extends Error {
    code = 'invalid-argument';
    constructor(message) {
        super(message);
        this.name = 'InvalidCryptoInputError';
    }
}
exports.InvalidCryptoInputError = InvalidCryptoInputError;
/**
 * Limitador explícito de concurrencia para operaciones scrypt por instancia.
 * Acota el consumo nativo de memoria (~32-33 MiB por scrypt) a maxConcurrent <= 2
 * y rechaza de forma controlada cuando la cola alcanza maxQueueSize.
 */
class ScryptConcurrencyLimiter {
    maxConcurrent;
    maxQueueSize;
    queueTimeoutMs;
    active = 0;
    peakActive = 0;
    rejectedCount = 0;
    queue = [];
    constructor(options = {}) {
        this.maxConcurrent = Math.max(1, Math.min(options.maxConcurrent ?? exports.SCRYPT_PARAMS.maxConcurrent, exports.SCRYPT_PARAMS.maxConcurrent));
        this.maxQueueSize = Math.max(0, options.maxQueueSize ?? 6);
        this.queueTimeoutMs = Math.max(50, options.queueTimeoutMs ?? 10000);
    }
    getStats() {
        return {
            active: this.active,
            queued: this.queue.length,
            maxConcurrent: this.maxConcurrent,
            maxQueueSize: this.maxQueueSize,
            peakActive: this.peakActive,
            rejectedCount: this.rejectedCount,
        };
    }
    acquire() {
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
        return new Promise((resolve, reject) => {
            const entry = {
                resolve,
                reject,
                settled: false,
            };
            entry.timer = setTimeout(() => {
                if (entry.settled)
                    return;
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
    release() {
        this.active = Math.max(0, this.active - 1);
        while (this.queue.length > 0 && this.active < this.maxConcurrent) {
            const next = this.queue.shift();
            if (!next || next.settled)
                continue;
            next.settled = true;
            if (next.timer)
                clearTimeout(next.timer);
            this.active += 1;
            if (this.active > this.peakActive) {
                this.peakActive = this.active;
            }
            next.resolve();
        }
    }
    async run(task) {
        await this.acquire();
        try {
            return await task();
        }
        finally {
            this.release();
        }
    }
}
exports.ScryptConcurrencyLimiter = ScryptConcurrencyLimiter;
exports.defaultScryptLimiter = new ScryptConcurrencyLimiter({
    maxConcurrent: exports.SCRYPT_PARAMS.maxConcurrent,
    maxQueueSize: 6,
    queueTimeoutMs: 10000,
});
// Clave HMAC efímera por instancia para comparación en tiempo constante de strings de longitud variable
const COMPARE_KEY = crypto.randomBytes(32);
/**
 * Compara dos cadenas en tiempo constante sin lanzar RangeError ante longitudes distintas.
 */
function constantTimeEqualStrings(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') {
        return false;
    }
    const digestA = crypto.createHmac('sha256', COMPARE_KEY).update(Buffer.from(a, 'utf8')).digest();
    const digestB = crypto.createHmac('sha256', COMPARE_KEY).update(Buffer.from(b, 'utf8')).digest();
    const digestsMatch = crypto.timingSafeEqual(digestA, digestB);
    return digestsMatch && a.length === b.length;
}
function assertValidPepper(pepper) {
    if (typeof pepper !== 'string' || pepper.length < exports.MIN_PEPPER_LENGTH) {
        throw new Error('Configuración criptográfica incompleta: pepper de servidor inválido o ausente.');
    }
}
function assertValidPasswordInput(password) {
    if (typeof password !== 'string' || password.length === 0) {
        throw new InvalidCryptoInputError('La contraseña es requerida.');
    }
    if (password.length > exports.MAX_PASSWORD_LENGTH) {
        throw new InvalidCryptoInputError('La contraseña excede la longitud máxima permitida.');
    }
}
function scryptAsync(input, salt) {
    return new Promise((resolve, reject) => {
        crypto.scrypt(input, salt, exports.SCRYPT_PARAMS.keylen, {
            N: exports.SCRYPT_PARAMS.N,
            r: exports.SCRYPT_PARAMS.r,
            p: exports.SCRYPT_PARAMS.p,
            maxmem: exports.SCRYPT_PARAMS.maxmem,
        }, (err, derivedKey) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(derivedKey);
        });
    });
}
function buildPepperedPrehash(password, saltHex, pepper) {
    // No se aplica trim, normalización Unicode ni cambio de mayúsculas/minúsculas sobre password.
    return crypto
        .createHmac('sha256', Buffer.from(pepper, 'utf8'))
        .update(Buffer.from(`${saltHex}:${password}`, 'utf8'))
        .digest();
}
/**
 * Genera una credencial nueva en formato versionado scrypt_v1:
 *   scrypt_v1$N=32768,r=8,p=1$<saltHex32>$<derivedKeyHex128>
 */
async function createScryptCredential(password, pepper, limiter = exports.defaultScryptLimiter) {
    assertValidPasswordInput(password);
    assertValidPepper(pepper);
    const salt = crypto.randomBytes(exports.SCRYPT_PARAMS.saltBytes).toString('hex');
    const saltBuf = Buffer.from(salt, 'hex');
    const prehash = buildPepperedPrehash(password, salt, pepper);
    const derived = await limiter.run(() => scryptAsync(prehash, saltBuf));
    const derivedHex = derived.toString('hex');
    return {
        kdfVersion: 'scrypt_v1',
        kdfParams: {
            N: exports.SCRYPT_PARAMS.N,
            r: exports.SCRYPT_PARAMS.r,
            p: exports.SCRYPT_PARAMS.p,
            keylen: exports.SCRYPT_PARAMS.keylen,
        },
        salt,
        passwordHash: `scrypt_v1$N=${exports.SCRYPT_PARAMS.N},r=${exports.SCRYPT_PARAMS.r},p=${exports.SCRYPT_PARAMS.p}$${salt}$${derivedHex}`,
    };
}
const SCRYPT_V1_REGEX = /^scrypt_v1\$N=32768,r=8,p=1\$([a-f0-9]{32})\$([a-f0-9]{128})$/;
function isValidScryptV1Format(passwordHash, salt) {
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
async function verifyScryptCredential(password, storedHash, storedSalt, pepper, limiter = exports.defaultScryptLimiter) {
    assertValidPepper(pepper);
    if (typeof password !== 'string' || password.length === 0 || password.length > exports.MAX_PASSWORD_LENGTH) {
        return false;
    }
    if (!isValidScryptV1Format(storedHash, storedSalt)) {
        return false;
    }
    const saltBuf = Buffer.from(storedSalt, 'hex');
    const prehash = buildPepperedPrehash(password, storedSalt, pepper);
    const derived = await limiter.run(() => scryptAsync(prehash, saltBuf));
    const candidateHash = `scrypt_v1$N=${exports.SCRYPT_PARAMS.N},r=${exports.SCRYPT_PARAMS.r},p=${exports.SCRYPT_PARAMS.p}$${storedSalt}$${derived.toString('hex')}`;
    return constantTimeEqualStrings(candidateHash, storedHash);
}
/**
 * Detecta el formato de un hash heredado de src/services/authAccountService.ts:
 * - 'sha256': exactamente 64 dígitos hexadecimales minúsculas.
 * - 'legacy_fallback': `h_${Math.abs(hash).toString(16)}_${salt}` con coincidencia exacta del sufijo salt.
 * - 'malformed': cualquier otro valor, hash truncado, salt ausente o formato desconocido.
 */
function detectLegacyHashFormat(passwordHash, salt) {
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
function verifyLegacySha256(password, storedHash, salt) {
    if (typeof password !== 'string' || password.length === 0 || password.length > exports.MAX_PASSWORD_LENGTH) {
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
function verifyLegacyFallbackHash(password, storedHash, salt) {
    if (typeof password !== 'string' || password.length === 0 || password.length > exports.MAX_PASSWORD_LENGTH) {
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
function verifyLegacyCredential(password, storedHash, salt) {
    const format = detectLegacyHashFormat(storedHash, salt);
    if (format === 'sha256') {
        return { valid: verifyLegacySha256(password, storedHash, salt), format };
    }
    if (format === 'legacy_fallback') {
        return { valid: verifyLegacyFallbackHash(password, storedHash, salt), format };
    }
    return { valid: false, format: 'malformed' };
}
//# sourceMappingURL=crypto.js.map