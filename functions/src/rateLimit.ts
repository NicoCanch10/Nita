import * as crypto from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';

export type AuthRateLimitAction = 'register' | 'signin' | 'change_password';

export interface RateLimitPolicy {
  accountMaxAttempts: number;
  ipMaxAttempts: number;
  windowMs: number;
  lockDurationMs: number;
}

export const DEFAULT_RATE_LIMIT_POLICY: Record<AuthRateLimitAction, RateLimitPolicy> = {
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

export class RateLimitExceededError extends Error {
  readonly code = 'resource-exhausted';
  readonly retryAfterSeconds: number;

  constructor(retryAfterMs: number) {
    const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
    super(`Demasiados intentos recientes. Por seguridad, espera ${seconds} segundos antes de volver a intentar.`);
    this.name = 'RateLimitExceededError';
    this.retryAfterSeconds = seconds;
  }
}

interface RateLimitDoc {
  scope: 'account' | 'ip' | 'uid';
  action: AuthRateLimitAction;
  attemptsInWindow: number;
  windowStartedAtMs: number;
  blockedUntilMs: number;
  updatedAt: string;
}

function buildBucketKey(
  scope: 'account' | 'ip' | 'uid',
  action: AuthRateLimitAction,
  identifier: string,
  pepper: string
): string {
  const digest = crypto
    .createHmac('sha256', Buffer.from(pepper, 'utf8'))
    .update(Buffer.from(`nita_rl_v1:${scope}:${action}:${identifier}`, 'utf8'))
    .digest('hex')
    .slice(0, 40);
  return `${scope}_${action}_${digest}`;
}

export interface EnforceRateLimitParams {
  action: AuthRateLimitAction;
  accountIdentifier?: string;
  accountScope?: 'account' | 'uid';
  ipAddress: string;
  pepper: string;
  nowMs?: number;
  policyOverride?: Partial<RateLimitPolicy>;
}

interface RateLimitTxOutcome {
  blocked: boolean;
  retryAfterMs: number;
}

function isWindowExpired(prev: RateLimitDoc | null, nowMs: number, windowMs: number): boolean {
  if (!prev) return true;
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
export async function enforceRateLimitBeforeKdf(
  db: Firestore,
  params: EnforceRateLimitParams
): Promise<{ accountBucketKey?: string; ipBucketKey: string }> {
  const nowMs = params.nowMs ?? Date.now();
  const basePolicy = DEFAULT_RATE_LIMIT_POLICY[params.action];
  const policy: RateLimitPolicy = {
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

  const outcome = await db.runTransaction<RateLimitTxOutcome>(async (tx) => {
    const ipSnap = await tx.get(ipRef);
    const accountSnap = accountRef ? await tx.get(accountRef) : null;

    const ipData = ipSnap.exists ? (ipSnap.data() as RateLimitDoc) : null;
    const acctData = accountSnap && accountSnap.exists ? (accountSnap.data() as RateLimitDoc) : null;

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
    const nextIpWindowStart = ipFresh ? nowMs : (ipData as RateLimitDoc).windowStartedAtMs;
    const nextIpAttempts = ipFresh ? 1 : (ipData as RateLimitDoc).attemptsInWindow + 1;
    const ipExceeded = nextIpAttempts > policy.ipMaxAttempts;

    const acctFresh = isWindowExpired(acctData, nowMs, policy.windowMs);
    const nextAcctWindowStart = acctFresh ? nowMs : (acctData as RateLimitDoc).windowStartedAtMs;
    const nextAcctAttempts = acctFresh ? 1 : (acctData as RateLimitDoc).attemptsInWindow + 1;
    const acctExceeded = Boolean(accountRef && nextAcctAttempts > policy.accountMaxAttempts);

    const nowIso = new Date(nowMs).toISOString();

    tx.set(ipRef, {
      scope: 'ip',
      action: params.action,
      attemptsInWindow: nextIpAttempts,
      windowStartedAtMs: nextIpWindowStart,
      blockedUntilMs: ipExceeded ? nowMs + policy.lockDurationMs : 0,
      updatedAt: nowIso,
    } satisfies RateLimitDoc);

    if (accountRef) {
      tx.set(accountRef, {
        scope: accountScope,
        action: params.action,
        attemptsInWindow: nextAcctAttempts,
        windowStartedAtMs: nextAcctWindowStart,
        blockedUntilMs: acctExceeded ? nowMs + policy.lockDurationMs : 0,
        updatedAt: nowIso,
      } satisfies RateLimitDoc);
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
export async function resetAccountRateLimit(
  db: Firestore,
  accountBucketKey?: string,
  nowMs: number = Date.now()
): Promise<void> {
  if (!accountBucketKey) return;
  const ref = db.collection('authRateLimits').doc(accountBucketKey);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const prev = snap.data() as RateLimitDoc;
    tx.set(ref, {
      ...prev,
      attemptsInWindow: 0,
      windowStartedAtMs: nowMs,
      blockedUntilMs: 0,
      updatedAt: new Date(nowMs).toISOString(),
    } satisfies RateLimitDoc);
  });
}
