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
exports.RateLimitExceededError = exports.DEFAULT_RATE_LIMIT_POLICY = void 0;
exports.enforceRateLimitBeforeKdf = enforceRateLimitBeforeKdf;
exports.resetAccountRateLimit = resetAccountRateLimit;
const crypto = __importStar(require("node:crypto"));
exports.DEFAULT_RATE_LIMIT_POLICY = {
    register: {
        accountMaxAttempts: 5,
        ipMaxAttempts: 15,
        windowMs: 15 * 60 * 1000,
        lockDurationMs: 15 * 60 * 1000,
    },
    signin: {
        accountMaxAttempts: 5,
        ipMaxAttempts: 20,
        windowMs: 15 * 60 * 1000,
        lockDurationMs: 15 * 60 * 1000,
    },
    change_password: {
        accountMaxAttempts: 5,
        ipMaxAttempts: 15,
        windowMs: 15 * 60 * 1000,
        lockDurationMs: 15 * 60 * 1000,
    },
};
class RateLimitExceededError extends Error {
    code = 'resource-exhausted';
    retryAfterSeconds;
    constructor(retryAfterMs) {
        const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
        super(`Demasiados intentos recientes. Por seguridad, espera ${seconds} segundos antes de volver a intentar.`);
        this.name = 'RateLimitExceededError';
        this.retryAfterSeconds = seconds;
    }
}
exports.RateLimitExceededError = RateLimitExceededError;
function buildBucketKey(scope, action, identifier, pepper) {
    const digest = crypto
        .createHmac('sha256', Buffer.from(pepper, 'utf8'))
        .update(Buffer.from(`nita_rl_v1:${scope}:${action}:${identifier}`, 'utf8'))
        .digest('hex')
        .slice(0, 40);
    return `${scope}_${action}_${digest}`;
}
function isWindowExpired(prev, nowMs, windowMs) {
    if (!prev)
        return true;
    // Si existió un bloqueo previo y ya expiró, se inicia una ventana limpia para evitar re-bloqueo inmediato.
    if (prev.blockedUntilMs > 0 && prev.blockedUntilMs <= nowMs) {
        return true;
    }
    return nowMs - prev.windowStartedAtMs >= windowMs;
}
/**
 * Aplica control transaccional distribuido en /authRateLimits/{bucketKey} ANTES de ejecutar scrypt.
 * No almacena IPs ni nombres de usuario en texto plano (solo digests HMAC-SHA-256).
 * Persiste blockedUntilMs mediante commit transaccional y lanza RateLimitExceededError fuera de la transacción.
 */
async function enforceRateLimitBeforeKdf(db, params) {
    const nowMs = params.nowMs ?? Date.now();
    const basePolicy = exports.DEFAULT_RATE_LIMIT_POLICY[params.action];
    const policy = {
        ...basePolicy,
        ...(params.policyOverride ?? {}),
    };
    const normalizedIp = (params.ipAddress || 'unknown').trim().slice(0, 128) || 'unknown';
    const ipBucketKey = buildBucketKey('ip', params.action, normalizedIp, params.pepper);
    const ipRef = db.collection('authRateLimits').doc(ipBucketKey);
    const accountScope = params.accountScope ?? 'account';
    const accountBucketKey = params.accountIdentifier
        ? buildBucketKey(accountScope, params.action, params.accountIdentifier, params.pepper)
        : undefined;
    const accountRef = accountBucketKey
        ? db.collection('authRateLimits').doc(accountBucketKey)
        : undefined;
    const outcome = await db.runTransaction(async (tx) => {
        const ipSnap = await tx.get(ipRef);
        const accountSnap = accountRef ? await tx.get(accountRef) : null;
        const ipData = ipSnap.exists ? ipSnap.data() : null;
        const acctData = accountSnap && accountSnap.exists ? accountSnap.data() : null;
        // 1. Verificar si alguno de los buckets ya tiene un bloqueo vigente sin sobrescribirlo
        const ipActiveRetryMs = ipData && ipData.blockedUntilMs > nowMs ? ipData.blockedUntilMs - nowMs : 0;
        const acctActiveRetryMs = acctData && acctData.blockedUntilMs > nowMs ? acctData.blockedUntilMs - nowMs : 0;
        if (ipActiveRetryMs > 0 || acctActiveRetryMs > 0) {
            return {
                blocked: true,
                retryAfterMs: Math.max(ipActiveRetryMs, acctActiveRetryMs),
            };
        }
        // 2. Evaluar incremento en ventana activa para cada bucket de forma independiente
        const ipFresh = isWindowExpired(ipData, nowMs, policy.windowMs);
        const nextIpWindowStart = ipFresh ? nowMs : ipData.windowStartedAtMs;
        const nextIpAttempts = ipFresh ? 1 : ipData.attemptsInWindow + 1;
        const ipExceeded = nextIpAttempts > policy.ipMaxAttempts;
        const acctFresh = isWindowExpired(acctData, nowMs, policy.windowMs);
        const nextAcctWindowStart = acctFresh ? nowMs : acctData.windowStartedAtMs;
        const nextAcctAttempts = acctFresh ? 1 : acctData.attemptsInWindow + 1;
        const acctExceeded = Boolean(accountRef && nextAcctAttempts > policy.accountMaxAttempts);
        const nowIso = new Date(nowMs).toISOString();
        tx.set(ipRef, {
            scope: 'ip',
            action: params.action,
            attemptsInWindow: nextIpAttempts,
            windowStartedAtMs: nextIpWindowStart,
            blockedUntilMs: ipExceeded ? nowMs + policy.lockDurationMs : 0,
            updatedAt: nowIso,
        });
        if (accountRef) {
            tx.set(accountRef, {
                scope: accountScope,
                action: params.action,
                attemptsInWindow: nextAcctAttempts,
                windowStartedAtMs: nextAcctWindowStart,
                blockedUntilMs: acctExceeded ? nowMs + policy.lockDurationMs : 0,
                updatedAt: nowIso,
            });
        }
        if (acctExceeded || ipExceeded) {
            return {
                blocked: true,
                retryAfterMs: policy.lockDurationMs,
            };
        }
        return {
            blocked: false,
            retryAfterMs: 0,
        };
    });
    if (outcome.blocked) {
        throw new RateLimitExceededError(outcome.retryAfterMs);
    }
    return { accountBucketKey, ipBucketKey };
}
/**
 * Reinicia el contador de fallos de la cuenta/UID tras autenticación exitosa,
 * manteniendo intacto el bucket por IP contra ataques de rociado distribuido.
 */
async function resetAccountRateLimit(db, accountBucketKey, nowMs = Date.now()) {
    if (!accountBucketKey)
        return;
    const ref = db.collection('authRateLimits').doc(accountBucketKey);
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists)
            return;
        const prev = snap.data();
        tx.set(ref, {
            ...prev,
            attemptsInWindow: 0,
            windowStartedAtMs: nowMs,
            blockedUntilMs: 0,
            updatedAt: new Date(nowMs).toISOString(),
        });
    });
}
//# sourceMappingURL=rateLimit.js.map