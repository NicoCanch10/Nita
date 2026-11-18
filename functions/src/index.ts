import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { defineSecret } from 'firebase-functions/params';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import {
  AccountServiceError,
  changePassword,
  registerPasswordAccount,
  signInWithPasswordCustomToken,
} from './accountService';

export const NITA_HASH_PEPPER = defineSecret('NITA_HASH_PEPPER');
export const DEFAULT_DATABASE_ID = 'ai-studio-distribuidordedi-aff91045-91e1-4730-8049-ab5f53276b3f';

setGlobalOptions({
  region: 'us-central1',
  maxInstances: 10,
  memory: '512MiB',
  concurrency: 4,
  timeoutSeconds: 30,
});

function getFirebaseAdminServices() {
  const app = getApps().length === 0 ? initializeApp() : getApps()[0];
  const databaseId = process.env.NITA_FIRESTORE_DATABASE_ID || DEFAULT_DATABASE_ID;
  const db = getFirestore(app, databaseId);
  const auth = getAuth(app);
  return { db, auth };
}

function resolvePepper(): string {
  let pepper = '';
  try {
    pepper = NITA_HASH_PEPPER.value();
  } catch {
    pepper = process.env.NITA_HASH_PEPPER || '';
  }
  if (!pepper) {
    pepper = process.env.NITA_HASH_PEPPER || '';
  }
  if (!pepper || pepper.length < 16) {
    throw new HttpsError('failed-precondition', 'Configuración de seguridad del servidor incompleta.');
  }
  return pepper;
}

function normalizeIpString(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let cleaned = raw.trim();
  if (!cleaned) return null;
  if (cleaned.startsWith('::ffff:')) {
    cleaned = cleaned.slice(7);
  }
  return cleaned.slice(0, 128) || null;
}

/**
 * Extrae la IP de origen priorizando la IP confiable resuelta por la plataforma
 * (Firebase / Cloud Run / Express `rawRequest.ip`), ignorando `x-forwarded-for`
 * manipulable por el cliente y usando `socket.remoteAddress` únicamente como respaldo.
 */
export function extractClientIp(request: { rawRequest?: unknown }): string {
  const rawReq = request.rawRequest as
    | {
        ip?: unknown;
        socket?: { remoteAddress?: unknown };
      }
    | undefined;

  const platformIp = normalizeIpString(rawReq?.ip);
  if (platformIp) {
    return platformIp;
  }

  const socketIp = normalizeIpString(rawReq?.socket?.remoteAddress);
  if (socketIp) {
    return socketIp;
  }

  return 'unknown';
}

function toHttpsError(err: unknown): HttpsError {
  if (err instanceof HttpsError) {
    return err;
  }
  if (err instanceof AccountServiceError) {
    return new HttpsError(err.code, err.message);
  }
  logger.error('[NITA Auth Backend] Unexpected non-secret operational error', {
    name: err instanceof Error ? err.name : 'UnknownError',
    message: err instanceof Error ? err.message : 'Operational error',
  });
  return new HttpsError('internal', 'No se pudo completar la operación de autenticación.');
}

export const registerPasswordAccountFn = onCall(
  {
    secrets: [NITA_HASH_PEPPER],
    memory: '512MiB',
    concurrency: 4,
    cors: true,
  },
  async (request) => {
    try {
      const { db, auth } = getFirebaseAdminServices();
      const pepper = resolvePepper();
      const data = (request.data && typeof request.data === 'object' ? request.data : {}) as {
        username?: unknown;
        password?: unknown;
      };

      return await registerPasswordAccount(
        {
          db,
          auth,
          pepper,
          ipAddress: extractClientIp(request),
        },
        {
          username: data.username,
          password: data.password,
        }
      );
    } catch (err) {
      throw toHttpsError(err);
    }
  }
);

export const signInWithPasswordCustomTokenFn = onCall(
  {
    secrets: [NITA_HASH_PEPPER],
    memory: '512MiB',
    concurrency: 4,
    cors: true,
  },
  async (request) => {
    try {
      const { db, auth } = getFirebaseAdminServices();
      const pepper = resolvePepper();
      const data = (request.data && typeof request.data === 'object' ? request.data : {}) as {
        username?: unknown;
        password?: unknown;
      };

      return await signInWithPasswordCustomToken(
        {
          db,
          auth,
          pepper,
          ipAddress: extractClientIp(request),
        },
        {
          username: data.username,
          password: data.password,
        }
      );
    } catch (err) {
      throw toHttpsError(err);
    }
  }
);

export const changePasswordFn = onCall(
  {
    secrets: [NITA_HASH_PEPPER],
    memory: '512MiB',
    concurrency: 4,
    cors: true,
  },
  async (request) => {
    try {
      if (!request.auth?.uid) {
        throw new HttpsError('unauthenticated', 'Debes iniciar sesión para cambiar tu contraseña.');
      }

      const { db, auth } = getFirebaseAdminServices();
      const pepper = resolvePepper();
      const data = (request.data && typeof request.data === 'object' ? request.data : {}) as {
        currentPassword?: unknown;
        newPassword?: unknown;
      };

      const tokenClaims =
        request.auth.token && typeof request.auth.token === 'object'
          ? (request.auth.token as Record<string, unknown>)
          : {};
      const tokenProvider: unknown = Object.prototype.hasOwnProperty.call(tokenClaims, 'provider')
        ? tokenClaims.provider
        : undefined;
      const tokenSessionEpoch: unknown = Object.prototype.hasOwnProperty.call(tokenClaims, 'sessionEpoch')
        ? tokenClaims.sessionEpoch
        : undefined;

      return await changePassword(
        {
          db,
          auth,
          pepper,
          ipAddress: extractClientIp(request),
        },
        {
          callerUid: request.auth.uid,
          tokenProvider,
          tokenSessionEpoch,
          currentPassword: data.currentPassword,
          newPassword: data.newPassword,
        }
      );
    } catch (err) {
      throw toHttpsError(err);
    }
  }
);
