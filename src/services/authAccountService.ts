import {
  signInWithCustomToken,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import { httpsCallable, type Functions } from 'firebase/functions';
import {
  auth,
  ensureAuthPersistence,
  functions,
} from '../lib/firebase';
import {
  clearSyncSessionValidationState,
  setSyncSessionValidationState,
} from '../lib/syncSessionGate';
import type { CachedUserData } from '../context/AuthContext';

export const ACTIVE_SESSION_KEY = 'nita_active_user_session';
const LEGACY_LOCAL_ACCOUNTS_KEY = 'nita_registered_accounts';
export const MAX_PASSWORD_LENGTH = 1024;

export interface BackendAuthTokenResponse {
  customToken: string;
  uid: string;
  displayName: string;
  sessionEpoch: number;
  migratedFrom?: 'sha256' | 'legacy_fallback';
}

export interface BackendChangePasswordResponse {
  customToken: string;
  uid: string;
  sessionEpoch: number;
}

export interface AuthAccountDeps {
  authInstance?: Auth;
  functionsInstance?: Functions;
  callableInvoker?: <TReq, TRes>(name: string, payload: TReq) => Promise<TRes>;
  ensurePersistence?: () => Promise<void>;
  isOnlineFn?: () => boolean;
}

export type AuthOperation = 'register' | 'signin' | 'change_password';

export class AuthFlowError extends Error {
  readonly code: string;
  readonly isSessionRevoked: boolean;
  readonly isOfflineOrNetwork: boolean;
  readonly requiresReauth: boolean;

  constructor(
    message: string,
    options?: {
      code?: string;
      isSessionRevoked?: boolean;
      isOfflineOrNetwork?: boolean;
      requiresReauth?: boolean;
    }
  ) {
    super(message);
    this.name = 'AuthFlowError';
    this.code = options?.code || 'auth/unknown';
    this.isSessionRevoked = Boolean(options?.isSessionRevoked);
    this.isOfflineOrNetwork = Boolean(options?.isOfflineOrNetwork);
    this.requiresReauth = Boolean(options?.requiresReauth);
  }
}

export function isRequiresRecentLoginError(err: unknown): boolean {
  if (err instanceof AuthFlowError && err.requiresReauth) {
    return true;
  }
  const code = normalizeErrorCode((err as { code?: unknown })?.code);
  return code === 'auth/requires-recent-login';
}

export function isSessionRevokedError(err: unknown): boolean {
  if (err instanceof AuthFlowError) {
    return err.isSessionRevoked;
  }
  const code = normalizeErrorCode((err as { code?: unknown })?.code);
  return (
    code === 'auth/user-token-expired' ||
    code === 'auth/id-token-revoked' ||
    code === 'auth/user-disabled' ||
    code === 'auth/invalid-user-token' ||
    code === 'auth/user-not-found'
  );
}

function normalizeErrorCode(rawCode: unknown): string {
  if (typeof rawCode !== 'string') return '';
  return rawCode.trim().toLowerCase();
}

function isDeviceOffline(deps?: AuthAccountDeps): boolean {
  if (deps?.isOnlineFn) {
    return !deps.isOnlineFn();
  }
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function isValidPositiveEpoch(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 1;
}

function sanitizeSafeValidationMessage(rawMessage: string, fallback: string): string {
  const lowered = rawMessage.toLowerCase();
  const forbiddenFragments = ['hash', 'salt', 'pepper', 'scrypt', 'customtoken', 'token', 'stack', 'firestore'];
  if (forbiddenFragments.some((f) => lowered.includes(f))) {
    return fallback;
  }
  return rawMessage.trim() || fallback;
}

/**
 * Mapea errores de Cloud Functions y Firebase Auth a mensajes claros en español
 * sin exponer hashes, salts, tokens ni detalles internos.
 */
export function mapAuthBackendError(err: unknown, operation: AuthOperation): AuthFlowError {
  if (err instanceof AuthFlowError) {
    return err;
  }

  const rawCode = normalizeErrorCode((err as { code?: unknown })?.code);
  const shortCode = rawCode.replace(/^functions\//, '');
  const rawMessage = err instanceof Error ? err.message : String(err || '');
  const loweredMessage = rawMessage.toLowerCase();

  // 1. Errores de red / sin conexión
  if (
    rawCode === 'auth/network-request-failed' ||
    shortCode === 'unavailable' ||
    shortCode === 'deadline-exceeded' ||
    loweredMessage.includes('network-request-failed') ||
    loweredMessage.includes('failed to fetch') ||
    loweredMessage.includes('networkerror') ||
    loweredMessage.includes('offline')
  ) {
    return new AuthFlowError(
      'No pudimos conectarnos con el servidor de NITA. Verifica tu conexión a internet e intenta nuevamente.',
      { code: rawCode || 'unavailable', isOfflineOrNetwork: true }
    );
  }

  // 2. Solicitud de reautenticación reciente (NO implica sesión revocada ni cierre destructivo)
  if (rawCode === 'auth/requires-recent-login') {
    return new AuthFlowError(
      'Por tu seguridad, esta acción requiere que confirmes tu identidad recientemente. Vuelve a autenticarte e intenta nuevamente; tus datos locales permanecen intactos.',
      { code: rawCode, isSessionRevoked: false, requiresReauth: true }
    );
  }

  // 3. Sesión revocada / token expirado / credenciales de usuario inválidas en Firebase Auth
  if (
    rawCode === 'auth/user-token-expired' ||
    rawCode === 'auth/id-token-revoked' ||
    rawCode === 'auth/user-disabled' ||
    rawCode === 'auth/invalid-user-token' ||
    rawCode === 'auth/user-not-found'
  ) {
    return new AuthFlowError(
      'Tu sesión expiró o fue revocada (ya no es válida). Por favor, vuelve a iniciar sesión.',
      { code: rawCode, isSessionRevoked: true }
    );
  }

  // 3. Error de Custom Token inválido o expirado al autenticar con Firebase Auth
  if (rawCode === 'auth/invalid-custom-token' || rawCode === 'auth/custom-token-mismatch') {
    return new AuthFlowError(
      'No se pudo validar la sesión segura con Firebase Authentication. Intenta iniciar sesión nuevamente.',
      { code: rawCode }
    );
  }

  // 4. Rate limit / protección contra abuso
  if (shortCode === 'resource-exhausted') {
    return new AuthFlowError(
      'Demasiados intentos en poco tiempo. Espera unos minutos antes de volver a intentarlo.',
      { code: rawCode || 'functions/resource-exhausted' }
    );
  }

  // 5. Nombre de usuario ya existente
  if (shortCode === 'already-exists') {
    return new AuthFlowError(
      'Ese nombre de usuario ya está en uso. Por favor, elige otro o inicia sesión.',
      { code: rawCode || 'functions/already-exists' }
    );
  }

  // 6. Unauthenticated (credenciales erróneas o sesión/época revocada)
  if (shortCode === 'unauthenticated') {
    if (operation === 'change_password') {
      const looksRevoked =
        loweredMessage.includes('revocad') ||
        loweredMessage.includes('obsolet') ||
        loweredMessage.includes('época') ||
        loweredMessage.includes('epoca') ||
        loweredMessage.includes('vuelve a iniciar sesión') ||
        loweredMessage.includes('debes iniciar sesión');

      if (looksRevoked) {
        return new AuthFlowError(
          'Tu sesión actual fue revocada o expiró. Vuelve a iniciar sesión para continuar.',
          { code: rawCode || 'functions/unauthenticated', isSessionRevoked: true }
        );
      }

      return new AuthFlowError('La contraseña actual ingresada es incorrecta.', {
        code: rawCode || 'functions/unauthenticated',
      });
    }

    return new AuthFlowError('Usuario o contraseña incorrectos.', {
      code: rawCode || 'functions/unauthenticated',
    });
  }

  // 7. Precondición fallida (/userSecurity faltante/inconsistente o formato heredado inválido)
  if (shortCode === 'failed-precondition') {
    return new AuthFlowError(
      'No fue posible completar la autenticación por una inconsistencia de seguridad en la cuenta. Intenta nuevamente o contacta soporte.',
      { code: rawCode || 'functions/failed-precondition' }
    );
  }

  // 8. Permiso denegado (ej. proveedor no corresponde a nita_password)
  if (shortCode === 'permission-denied') {
    return new AuthFlowError(
      'Esta operación solo está disponible para cuentas autenticadas con usuario y contraseña de NITA.',
      { code: rawCode || 'functions/permission-denied' }
    );
  }

  // 9. Argumentos inválidos
  if (shortCode === 'invalid-argument') {
    return new AuthFlowError(
      sanitizeSafeValidationMessage(rawMessage, 'Los datos ingresados no son válidos.'),
      { code: rawCode || 'functions/invalid-argument' }
    );
  }

  // 10. Conflicto transaccional / abortado
  if (shortCode === 'aborted') {
    return new AuthFlowError(
      'La operación fue interrumpida por un cambio simultáneo en la cuenta. Intenta nuevamente.',
      { code: rawCode || 'functions/aborted' }
    );
  }

  // 11. Genérico seguro (nunca exponer detalles internos)
  return new AuthFlowError('No se pudo completar la operación de autenticación. Intenta nuevamente.', {
    code: rawCode || 'functions/internal',
  });
}

/**
 * Validates username format:
 * - 3 to 25 characters
 * - Letters, numbers, underscores, dots, hyphens
 */
export function validateUsernameFormat(username: string): { valid: boolean; error?: string } {
  const trimmed = typeof username === 'string' ? username.trim() : '';
  if (!trimmed) {
    return { valid: false, error: 'Por favor, ingresa un nombre de usuario.' };
  }
  if (trimmed.length < 3) {
    return { valid: false, error: 'El nombre de usuario debe tener al menos 3 caracteres.' };
  }
  if (trimmed.length > 25) {
    return { valid: false, error: 'El nombre de usuario no puede tener más de 25 caracteres.' };
  }
  const validRegex = /^[a-zA-Z0-9_.-]+$/;
  if (!validRegex.test(trimmed)) {
    return {
      valid: false,
      error: 'El nombre de usuario solo puede contener letras, números, guiones y puntos.',
    };
  }
  return { valid: true };
}

/**
 * Validates password format:
 * - 6 to 1024 characters
 */
export function validatePasswordFormat(password: string): { valid: boolean; error?: string } {
  if (typeof password !== 'string' || !password) {
    return { valid: false, error: 'Por favor, ingresa una contraseña.' };
  }
  if (password.length < 6) {
    return { valid: false, error: 'La contraseña debe tener al menos 6 caracteres.' };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return { valid: false, error: 'La contraseña excede la longitud máxima permitida.' };
  }
  return { valid: true };
}

async function invokeBackendCallable<TReq, TRes>(
  name: string,
  payload: TReq,
  deps?: AuthAccountDeps
): Promise<TRes> {
  if (deps?.callableInvoker) {
    return await deps.callableInvoker<TReq, TRes>(name, payload);
  }
  const fnInstance = deps?.functionsInstance || functions;
  const callable = httpsCallable<TReq, TRes>(fnInstance, name);
  const result = await callable(payload);
  return result.data;
}

async function signInAndVerifyCustomTokenSession(
  expectedUid: string,
  expectedEpoch: number,
  customToken: string,
  deps?: AuthAccountDeps
): Promise<User> {
  if (
    !expectedUid ||
    typeof expectedUid !== 'string' ||
    !expectedUid.startsWith('usr_') ||
    expectedUid.length <= 4 ||
    !isValidPositiveEpoch(expectedEpoch) ||
    !customToken ||
    typeof customToken !== 'string'
  ) {
    throw new AuthFlowError('La respuesta del servidor de autenticación es incompleta o inválida.', {
      code: 'auth/invalid-custom-token',
    });
  }

  const targetAuth = deps?.authInstance || auth;
  if (deps?.ensurePersistence) {
    await deps.ensurePersistence().catch(() => {});
  } else if (!deps?.authInstance) {
    await ensureAuthPersistence().catch(() => {});
  }

  const credential = await signInWithCustomToken(targetAuth, customToken);
  const fbUser = credential.user;

  if (!fbUser || fbUser.uid !== expectedUid || !fbUser.uid.startsWith('usr_')) {
    clearSyncSessionValidationState();
    await signOut(targetAuth).catch(() => {});
    throw new AuthFlowError('No se pudo confirmar la identidad esperada en Firebase Auth.', {
      code: 'auth/invalid-custom-token',
    });
  }

  const tokenResult = await fbUser.getIdTokenResult(true);
  const claims = (tokenResult?.claims || {}) as Record<string, unknown>;
  if (claims.provider !== 'nita_password' || claims.sessionEpoch !== expectedEpoch) {
    clearSyncSessionValidationState();
    await signOut(targetAuth).catch(() => {});
    throw new AuthFlowError('Los claims de seguridad de la sesión no son válidos.', {
      code: 'auth/invalid-custom-token',
    });
  }

  setSyncSessionValidationState(fbUser.uid, true);
  return fbUser;
}

/**
 * Registers a new user with username and password via Gen 2 Cloud Function `registerPasswordAccountFn`,
 * authenticates into Firebase Auth with the returned Custom Token, and validates claims.
 */
export async function registerUserAccount(
  username: string,
  password: string,
  deps?: AuthAccountDeps
): Promise<CachedUserData> {
  const usernameCheck = validateUsernameFormat(username);
  if (!usernameCheck.valid) {
    throw new AuthFlowError(usernameCheck.error || 'Nombre de usuario inválido.', {
      code: 'functions/invalid-argument',
    });
  }

  const passwordCheck = validatePasswordFormat(password);
  if (!passwordCheck.valid) {
    throw new AuthFlowError(passwordCheck.error || 'Contraseña inválida.', {
      code: 'functions/invalid-argument',
    });
  }

  if (isDeviceOffline(deps)) {
    throw new AuthFlowError(
      'No hay conexión a internet. Conéctate para crear una cuenta o usa "Ingresar sin cuenta".',
      { code: 'unavailable', isOfflineOrNetwork: true }
    );
  }

  const cleanUsername = username.trim();

  let response: BackendAuthTokenResponse;
  try {
    response = await invokeBackendCallable<{ username: string; password: string }, BackendAuthTokenResponse>(
      'registerPasswordAccountFn',
      { username: cleanUsername, password },
      deps
    );
  } catch (err) {
    throw mapAuthBackendError(err, 'register');
  }

  try {
    await signInAndVerifyCustomTokenSession(response.uid, response.sessionEpoch, response.customToken, deps);
  } catch (err) {
    throw mapAuthBackendError(err, 'register');
  }

  const finalDisplayName =
    typeof response.displayName === 'string' && response.displayName.trim()
      ? response.displayName.trim()
      : cleanUsername;

  const userData: CachedUserData = {
    uid: response.uid,
    displayName: finalDisplayName,
    email: null,
    photoURL: null,
    providerId: 'password',
    sessionEpoch: response.sessionEpoch,
    providerData: [
      { providerId: 'password', displayName: finalDisplayName, email: null, photoURL: null },
    ],
    isOfflineSession: false,
  };

  saveActiveSession(userData);
  return userData;
}

/**
 * Signs in an existing user with username and password via Gen 2 Cloud Function `signInWithPasswordCustomTokenFn`
 * (including transparent server-side lazy migration for legacy SHA-256 / fallback accounts),
 * authenticates into Firebase Auth with the returned Custom Token, and validates claims.
 */
export async function signInUserAccount(
  username: string,
  password: string,
  deps?: AuthAccountDeps
): Promise<CachedUserData> {
  const usernameCheck = validateUsernameFormat(username);
  if (!usernameCheck.valid) {
    throw new AuthFlowError(usernameCheck.error || 'Nombre de usuario inválido.', {
      code: 'functions/invalid-argument',
    });
  }
  if (typeof password !== 'string' || !password) {
    throw new AuthFlowError('Por favor, ingresa tu contraseña.', {
      code: 'functions/invalid-argument',
    });
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new AuthFlowError('La contraseña excede la longitud máxima permitida.', {
      code: 'functions/invalid-argument',
    });
  }

  if (isDeviceOffline(deps)) {
    throw new AuthFlowError(
      'No hay conexión a internet. Conéctate para iniciar sesión o usa "Ingresar sin cuenta".',
      { code: 'unavailable', isOfflineOrNetwork: true }
    );
  }

  const cleanUsername = username.trim();

  let response: BackendAuthTokenResponse;
  try {
    response = await invokeBackendCallable<{ username: string; password: string }, BackendAuthTokenResponse>(
      'signInWithPasswordCustomTokenFn',
      { username: cleanUsername, password },
      deps
    );
  } catch (err) {
    throw mapAuthBackendError(err, 'signin');
  }

  try {
    await signInAndVerifyCustomTokenSession(response.uid, response.sessionEpoch, response.customToken, deps);
  } catch (err) {
    throw mapAuthBackendError(err, 'signin');
  }

  const finalDisplayName =
    typeof response.displayName === 'string' && response.displayName.trim()
      ? response.displayName.trim()
      : cleanUsername;

  const userData: CachedUserData = {
    uid: response.uid,
    displayName: finalDisplayName,
    email: null,
    photoURL: null,
    providerId: 'password',
    sessionEpoch: response.sessionEpoch,
    providerData: [
      { providerId: 'password', displayName: finalDisplayName, email: null, photoURL: null },
    ],
    isOfflineSession: false,
  };

  saveActiveSession(userData);
  return userData;
}

/**
 * Changes password for the currently signed-in `usr_*` user via `changePasswordFn`,
 * seamlessly re-authenticating this device with the new Custom Token (`sessionEpoch + 1`)
 * while all other devices have their refresh tokens revoked by the backend.
 */
export async function changeUserPassword(
  currentPassword: string,
  newPassword: string,
  deps?: AuthAccountDeps
): Promise<{ uid: string; sessionEpoch: number }> {
  const targetAuth = deps?.authInstance || auth;
  const currentUser = targetAuth.currentUser;

  if (!currentUser || !currentUser.uid.startsWith('usr_')) {
    throw new AuthFlowError('Debes iniciar sesión con una cuenta de usuario y contraseña NITA para cambiar tu clave.', {
      code: 'functions/unauthenticated',
      isSessionRevoked: true,
    });
  }

  if (typeof currentPassword !== 'string' || !currentPassword) {
    throw new AuthFlowError('Por favor, ingresa tu contraseña actual.', {
      code: 'functions/invalid-argument',
    });
  }
  if (currentPassword.length > MAX_PASSWORD_LENGTH) {
    throw new AuthFlowError('La contraseña actual excede la longitud máxima permitida.', {
      code: 'functions/invalid-argument',
    });
  }

  const newPassCheck = validatePasswordFormat(newPassword);
  if (!newPassCheck.valid) {
    throw new AuthFlowError(newPassCheck.error || 'La nueva contraseña no es válida.', {
      code: 'functions/invalid-argument',
    });
  }

  if (isDeviceOffline(deps)) {
    throw new AuthFlowError(
      'No hay conexión a internet. Necesitas conexión para cambiar tu contraseña.',
      { code: 'unavailable', isOfflineOrNetwork: true }
    );
  }

  // Refresh ID token before calling backend so revoked secondary sessions fail fast with explicit reauth error
  try {
    const tokenResult = await currentUser.getIdTokenResult(true);
    const claims = (tokenResult?.claims || {}) as Record<string, unknown>;
    if (claims.provider !== 'nita_password' || !isValidPositiveEpoch(claims.sessionEpoch)) {
      throw new AuthFlowError(
        'Tu sesión actual no tiene credenciales válidas para esta operación. Vuelve a iniciar sesión.',
        { code: 'auth/user-token-expired', isSessionRevoked: true }
      );
    }
  } catch (err) {
    throw mapAuthBackendError(err, 'change_password');
  }

  let response: BackendChangePasswordResponse;
  try {
    response = await invokeBackendCallable<
      { currentPassword: string; newPassword: string },
      BackendChangePasswordResponse
    >('changePasswordFn', { currentPassword, newPassword }, deps);
  } catch (err) {
    throw mapAuthBackendError(err, 'change_password');
  }

  try {
    await signInAndVerifyCustomTokenSession(response.uid, response.sessionEpoch, response.customToken, deps);
  } catch (err) {
    throw mapAuthBackendError(err, 'change_password');
  }

  // Update lightweight display metadata preserving displayName
  const existingSession = getActiveSession();
  const displayName =
    (existingSession?.uid === response.uid && existingSession.displayName) ||
    currentUser.displayName ||
    'Usuario';

  saveActiveSession({
    uid: response.uid,
    displayName,
    email: null,
    photoURL: null,
    providerId: 'password',
    sessionEpoch: response.sessionEpoch,
    providerData: [{ providerId: 'password', displayName, email: null, photoURL: null }],
    isOfflineSession: false,
  });

  return {
    uid: response.uid,
    sessionEpoch: response.sessionEpoch,
  };
}

/**
 * Saves non-sensitive active session metadata in localStorage (never passwords, salts, hashes, or customTokens).
 */
export function saveActiveSession(user: CachedUserData | null): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    // Clean up any legacy client-side credential cache containing old salts/hashes
    localStorage.removeItem(LEGACY_LOCAL_ACCOUNTS_KEY);

    if (user) {
      const safeMetadata: CachedUserData = {
        uid: user.uid,
        email: user.email ?? null,
        displayName: user.displayName ?? null,
        photoURL: user.photoURL ?? null,
        providerId: user.providerId,
        ...(isValidPositiveEpoch(user.sessionEpoch) ? { sessionEpoch: user.sessionEpoch } : {}),
        providerData: user.providerData,
        isOfflineSession: false,
      };
      localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(safeMetadata));
      localStorage.setItem('nita_cached_user', JSON.stringify(safeMetadata));
      const choice = user.providerId === 'google.com' ? 'google' : 'password';
      localStorage.setItem('nita_auth_choice', choice);
    } else {
      localStorage.removeItem(ACTIVE_SESSION_KEY);
      localStorage.removeItem('nita_cached_user');
      localStorage.removeItem('nita_auth_choice');
    }
  } catch (e) {
    console.error('Error saving active session:', e);
  }
}

/**
 * Loads lightweight active session metadata from localStorage.
 * Note: This metadata alone does NOT grant authenticated access without a valid Firebase Auth `currentUser`.
 */
export function getActiveSession(): CachedUserData | null {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ACTIVE_SESSION_KEY) || localStorage.getItem('nita_cached_user');
    if (raw) {
      const data = JSON.parse(raw);
      if (data && typeof data.uid === 'string' && data.uid.trim() && data.displayName) {
        return data;
      }
    }
  } catch (e) {
    console.error('Error reading active session:', e);
  }
  return null;
}
