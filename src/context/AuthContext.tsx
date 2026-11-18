import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import {
  auth,
  db,
  ensureAuthPersistence,
  signInWithGoogle as fbSignInWithGoogle,
  logOut as fbLogOut,
} from '../lib/firebase';
import {
  registerUserAccount,
  signInUserAccount,
  changeUserPassword,
  saveActiveSession,
  getActiveSession,
  isSessionRevokedError,
  isRequiresRecentLoginError,
} from '../services/authAccountService';
import {
  clearSyncSessionValidationState,
  setSyncSessionValidationState,
} from '../lib/syncSessionGate';

export const NITA_AUTH_CHOICE_KEY = 'nita_auth_choice';
export const NITA_CACHED_USER_KEY = 'nita_cached_user';
export const NITA_GUEST_MODE_KEY = 'nita_guest_mode';

export type AuthChoice = 'google' | 'password' | 'offline' | null;

export interface CachedUserData {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  providerId?: string;
  sessionEpoch?: number;
  providerData?: Array<{
    providerId: string;
    email?: string | null;
    displayName?: string | null;
    photoURL?: string | null;
  }>;
  isOfflineSession?: boolean;
}

export type NitaUser = (User | CachedUserData) & {
  isOfflineSession?: boolean;
};

interface AuthContextValue {
  user: NitaUser | null;
  loading: boolean;
  authError: string | null;
  isGuestMode: boolean;
  authChoice: AuthChoice;
  isOnline: boolean;
  isOfflineSession: boolean;
  isFirebaseAuthActive: boolean;
  continueWithoutAccount: () => void;
  exitGuestMode: () => void;
  clearAuthError: () => void;
  signInWithGoogle: () => Promise<void>;
  registerWithUsername: (username: string, password: string) => Promise<void>;
  signInWithUsername: (username: string, password: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  checkUsernameAvailable: (username: string) => Promise<boolean>;
  signOutUser: () => Promise<void>;
  verifySessionStatus: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function getInitialAuthChoice(): AuthChoice {
  if (typeof window === 'undefined') return null;
  try {
    const choice = localStorage.getItem(NITA_AUTH_CHOICE_KEY) as AuthChoice;
    if (choice === 'google' || choice === 'password' || choice === 'offline') {
      return choice;
    }
    if (localStorage.getItem(NITA_GUEST_MODE_KEY) === 'true') {
      return 'offline';
    }
  } catch (e) {
    console.error('Error reading auth choice from localStorage:', e);
  }
  return null;
}

function synthesizeUser(cached: CachedUserData, isOffline: boolean): NitaUser {
  const fallbackProvider = cached.providerId || 'password';
  return {
    uid: cached.uid,
    email: cached.email,
    displayName: cached.displayName,
    photoURL: cached.photoURL,
    providerId: fallbackProvider,
    sessionEpoch: cached.sessionEpoch,
    providerData: cached.providerData || [
      {
        providerId: fallbackProvider,
        email: cached.email,
        displayName: cached.displayName,
        photoURL: cached.photoURL,
      },
    ],
    isOfflineSession: isOffline,
  } as NitaUser;
}

function isValidPositiveEpoch(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 1;
}

export type AuthSessionErrorCategory =
  | 'valid_online'
  | 'revoked_or_invalid'
  | 'network_error'
  | 'reauth_required'
  | 'unexpected_auth_error'
  | 'missing_cached_credentials';

export interface AuthTokenResultLike {
  claims?: Record<string, unknown> | null;
}

export interface AuthUserLike {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  providerData?: Array<{
    providerId: string;
    email?: string | null;
    displayName?: string | null;
    photoURL?: string | null;
  }>;
  getIdTokenResult(forceRefresh?: boolean): Promise<AuthTokenResultLike | null>;
}

export interface AuthSessionEvaluationResult {
  status:
    | 'valid_online'
    | 'degraded_offline'
    | 'revoked_or_invalid'
    | 'unrecoverable_no_session';
  category: AuthSessionErrorCategory;
  userData: CachedUserData | null;
  choice: 'google' | 'password' | null;
  isFirebaseAuthActive: boolean;
  isOfflineSession: boolean;
  shouldPersistMetadata: boolean;
  shouldClearSession: boolean;
  errorMessage?: string;
}

function isNetworkAuthError(err: unknown): boolean {
  const code = String((err as { code?: unknown })?.code || '').trim().toLowerCase();
  const msg = (err instanceof Error ? err.message : String(err || '')).toLowerCase();
  return (
    code === 'auth/network-request-failed' ||
    code === 'unavailable' ||
    code === 'functions/unavailable' ||
    msg.includes('network-request-failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('network error') ||
    msg.includes('offline')
  );
}

function hasPopulatedClaims(tokenResult: AuthTokenResultLike | null | undefined): boolean {
  return Boolean(
    tokenResult &&
      tokenResult.claims &&
      typeof tokenResult.claims === 'object' &&
      Object.keys(tokenResult.claims).length > 0
  );
}

export function isValidPersistedSession(
  persisted: CachedUserData | null | undefined,
  expectedUid: string
): persisted is CachedUserData {
  if (!persisted || typeof persisted !== 'object') return false;
  if (typeof persisted.uid !== 'string' || !persisted.uid || persisted.uid !== expectedUid) return false;
  if (typeof persisted.displayName !== 'string' || !persisted.displayName.trim()) return false;
  if (expectedUid.startsWith('usr_')) {
    if (persisted.providerId !== 'password') return false;
    if (!isValidPositiveEpoch(persisted.sessionEpoch)) return false;
  } else {
    if (persisted.providerId === 'password') return false;
  }
  return true;
}

function serializeFirebaseUser(
  fbUser: Pick<AuthUserLike, 'uid' | 'email' | 'displayName' | 'photoURL' | 'providerData'>,
  claims: Record<string, unknown>,
  fallbackSession?: CachedUserData | null
): { userData: CachedUserData; choice: 'google' | 'password'; valid: boolean } {
  const isCustomPasswordUser =
    claims.provider === 'nita_password' || fbUser.uid.startsWith('usr_');

  if (isCustomPasswordUser) {
    const valid =
      fbUser.uid.startsWith('usr_') &&
      claims.provider === 'nita_password' &&
      isValidPositiveEpoch(claims.sessionEpoch);

    const sameUserFallbackName =
      fallbackSession && fallbackSession.uid === fbUser.uid ? fallbackSession.displayName : null;
    const displayName =
      fbUser.displayName || sameUserFallbackName || fbUser.uid.replace(/^usr_/, '') || 'Usuario';

    return {
      choice: 'password',
      valid,
      userData: {
        uid: fbUser.uid,
        email: null,
        displayName,
        photoURL: null,
        providerId: 'password',
        sessionEpoch: isValidPositiveEpoch(claims.sessionEpoch) ? claims.sessionEpoch : undefined,
        providerData: [{ providerId: 'password', displayName, email: null, photoURL: null }],
        isOfflineSession: false,
      },
    };
  }

  const providerId = fbUser.providerData?.[0]?.providerId || 'google.com';
  const displayName = fbUser.displayName || fbUser.email?.split('@')[0] || 'Usuario';
  return {
    choice: 'google',
    valid: true,
    userData: {
      uid: fbUser.uid,
      email: fbUser.email,
      displayName,
      photoURL: fbUser.photoURL,
      providerId,
      providerData: fbUser.providerData?.length
        ? fbUser.providerData.map((p) => ({
            providerId: p.providerId,
            email: p.email,
            displayName: p.displayName,
            photoURL: p.photoURL,
          }))
        : [
            {
              providerId,
              email: fbUser.email,
              displayName: fbUser.displayName,
              photoURL: fbUser.photoURL,
            },
          ],
      isOfflineSession: false,
    },
  };
}

function resolveDegradedOfflineFromFallback(
  fbUser: AuthUserLike,
  cachedTokenResult: AuthTokenResultLike | null | undefined,
  persistedSession: CachedUserData | null,
  category: Exclude<AuthSessionErrorCategory, 'valid_online' | 'revoked_or_invalid'>
): AuthSessionEvaluationResult {
  const reauthMessage =
    category === 'reauth_required'
      ? 'Por tu seguridad, esta acción requiere que confirmes tu identidad recientemente. Tus datos locales se mantienen a salvo.'
      : undefined;

  // Si hay claims cacheados poblados y completos, conservar contexto local SIN activar online.
  // Si los claims cacheados son incompletos o antiguos (valid === false), JAMÁS inferir revocación
  // confirmada desde caché local; continuar hacia la sesión persistida coincidente o unrecoverable_no_session.
  if (hasPopulatedClaims(cachedTokenResult)) {
    const claims = (cachedTokenResult!.claims || {}) as Record<string, unknown>;
    const { userData, choice, valid } = serializeFirebaseUser(fbUser, claims, persistedSession);
    if (valid) {
      return {
        status: 'degraded_offline',
        category,
        userData: { ...userData, isOfflineSession: true },
        choice,
        isFirebaseAuthActive: false,
        isOfflineSession: true,
        shouldPersistMetadata: false,
        shouldClearSession: false,
        ...(reauthMessage ? { errorMessage: reauthMessage } : {}),
      };
    }
  }

  // Sin token cacheado legible/completo: conservar sesión persistida si coincide exactamente con el UID y es válida.
  if (isValidPersistedSession(persistedSession, fbUser.uid)) {
    const choice: 'google' | 'password' =
      persistedSession.providerId === 'password' ? 'password' : 'google';
    return {
      status: 'degraded_offline',
      category,
      userData: { ...persistedSession, isOfflineSession: true },
      choice,
      isFirebaseAuthActive: false,
      isOfflineSession: true,
      shouldPersistMetadata: false,
      shouldClearSession: false,
      ...(reauthMessage ? { errorMessage: reauthMessage } : {}),
    };
  }

  // Sin claims cacheados válidos ni sesión persistida válida para este UID:
  // nunca inventar sesión, nunca habilitar Firestore y nunca borrar metadatos de otra cuenta.
  return {
    status: 'unrecoverable_no_session',
    category,
    userData: null,
    choice: null,
    isFirebaseAuthActive: false,
    isOfflineSession: false,
    shouldPersistMetadata: false,
    shouldClearSession: false,
    ...(reauthMessage ? { errorMessage: reauthMessage } : {}),
  };
}

export async function evaluateAuthUserSession(
  fbUser: AuthUserLike,
  isOnlineNow: boolean,
  persistedSession: CachedUserData | null
): Promise<AuthSessionEvaluationResult> {
  if (isOnlineNow) {
    try {
      const tokenResult = await fbUser.getIdTokenResult(true);
      if (!tokenResult || !tokenResult.claims || typeof tokenResult.claims !== 'object') {
        // Respuesta vacía inesperada en validación online: jamás habilitar sincronización
        return resolveDegradedOfflineFromFallback(
          fbUser,
          null,
          persistedSession,
          'unexpected_auth_error'
        );
      }

      const claims = tokenResult.claims as Record<string, unknown>;
      const { userData, choice, valid } = serializeFirebaseUser(fbUser, claims, persistedSession);

      if (!valid) {
        return {
          status: 'revoked_or_invalid',
          category: 'revoked_or_invalid',
          userData: null,
          choice: null,
          isFirebaseAuthActive: false,
          isOfflineSession: false,
          shouldPersistMetadata: false,
          shouldClearSession: true,
          errorMessage: 'Tu sesión no contiene los permisos requeridos. Por favor, inicia sesión nuevamente.',
        };
      }

      return {
        status: 'valid_online',
        category: 'valid_online',
        userData,
        choice,
        isFirebaseAuthActive: true,
        isOfflineSession: false,
        shouldPersistMetadata: true,
        shouldClearSession: false,
      };
    } catch (err) {
      if (isSessionRevokedError(err)) {
        return {
          status: 'revoked_or_invalid',
          category: 'revoked_or_invalid',
          userData: null,
          choice: null,
          isFirebaseAuthActive: false,
          isOfflineSession: false,
          shouldPersistMetadata: false,
          shouldClearSession: true,
          errorMessage:
            'Tu sesión expiró o fue revocada (por ejemplo, tras un cambio de contraseña). Por favor, vuelve a iniciar sesión.',
        };
      }

      const errorCategory: AuthSessionErrorCategory = isRequiresRecentLoginError(err)
        ? 'reauth_required'
        : isNetworkAuthError(err)
          ? 'network_error'
          : 'unexpected_auth_error';

      // Intentar leer caché solo para conservar contexto local en modo degradado; NUNCA para validar online.
      let cachedTokenResult: AuthTokenResultLike | null = null;
      try {
        cachedTokenResult = await fbUser.getIdTokenResult(false);
      } catch (cacheErr) {
        if (isSessionRevokedError(cacheErr)) {
          return {
            status: 'revoked_or_invalid',
            category: 'revoked_or_invalid',
            userData: null,
            choice: null,
            isFirebaseAuthActive: false,
            isOfflineSession: false,
            shouldPersistMetadata: false,
            shouldClearSession: true,
            errorMessage:
              'Tu sesión expiró o fue revocada (por ejemplo, tras un cambio de contraseña). Por favor, vuelve a iniciar sesión.',
          };
        }
        cachedTokenResult = null;
      }

      return resolveDegradedOfflineFromFallback(
        fbUser,
        cachedTokenResult,
        persistedSession,
        errorCategory
      );
    }
  }

  // Modo offline (offlineFallback === true): inspeccionar token cacheado sin exigir red.
  try {
    const cachedTokenResult = await fbUser.getIdTokenResult(false);
    const category: AuthSessionErrorCategory = hasPopulatedClaims(cachedTokenResult)
      ? 'network_error'
      : 'missing_cached_credentials';
    return resolveDegradedOfflineFromFallback(
      fbUser,
      cachedTokenResult,
      persistedSession,
      category
    );
  } catch (cacheErr) {
    if (isSessionRevokedError(cacheErr)) {
      return {
        status: 'revoked_or_invalid',
        category: 'revoked_or_invalid',
        userData: null,
        choice: null,
        isFirebaseAuthActive: false,
        isOfflineSession: false,
        shouldPersistMetadata: false,
        shouldClearSession: true,
        errorMessage:
          'Tu sesión expiró o fue revocada (por ejemplo, tras un cambio de contraseña). Por favor, vuelve a iniciar sesión.',
      };
    }

    return resolveDegradedOfflineFromFallback(
      fbUser,
      null,
      persistedSession,
      'missing_cached_credentials'
    );
  }
}

function formatGoogleAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  const message = err instanceof Error ? err.message : String(err);

  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'Se canceló el inicio de sesión con Google.';
  }
  if (code === 'auth/popup-blocked') {
    return 'El navegador bloqueó la ventana emergente de Google. Permite las ventanas emergentes e intenta nuevamente.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Error de conexión al intentar acceder con Google. Verifica tu internet e intenta nuevamente.';
  }
  if (code === 'auth/unauthorized-domain') {
    return 'Este dominio no está autorizado para iniciar sesión con Google en Firebase Auth.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'El proveedor de Google no está habilitado en la configuración de Firebase Authentication.';
  }
  return message || 'No se pudo iniciar sesión con Google.';
}

async function ensureUserProfileDoc(userData: CachedUserData): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  if (!auth.currentUser || auth.currentUser.uid !== userData.uid) return;
  try {
    const now = new Date().toISOString();
    const userRef = doc(db, 'users', userData.uid);
    await setDoc(
      userRef,
      {
        uid: userData.uid,
        email: userData.email,
        displayName: userData.displayName,
        photoURL: userData.photoURL,
        updatedAt: now,
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('[Auth] Could not sync Google profile document:', err);
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initialChoice = getInitialAuthChoice();
  const [authChoice, setAuthChoice] = useState<AuthChoice>(initialChoice);
  const authChoiceRef = useRef<AuthChoice>(initialChoice);
  authChoiceRef.current = authChoice;

  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;

  const [, setCachedUser] = useState<CachedUserData | null>(() => getActiveSession());
  const [isGuestMode, setIsGuestMode] = useState<boolean>(() => initialChoice === 'offline');
  const [user, setUser] = useState<NitaUser | null>(null);
  const [loading, setLoading] = useState<boolean>(() => initialChoice !== 'offline');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isFirebaseAuthActive, setIsFirebaseAuthActive] = useState<boolean>(false);
  const isFirebaseAuthActiveRef = useRef(isFirebaseAuthActive);
  isFirebaseAuthActiveRef.current = isFirebaseAuthActive;

  const authEventSeqRef = useRef(0);
  const lastTokenRefreshCheckRef = useRef(0);

  const clearActiveSessionState = useCallback(async (errorMessage?: string) => {
    clearSyncSessionValidationState();
    try {
      localStorage.removeItem(NITA_AUTH_CHOICE_KEY);
      localStorage.removeItem(NITA_CACHED_USER_KEY);
      localStorage.removeItem(NITA_GUEST_MODE_KEY);
      saveActiveSession(null);
    } catch (e) {
      console.warn('Failed to clear auth storage:', e);
    }
    authChoiceRef.current = null;
    setAuthChoice(null);
    setCachedUser(null);
    setIsGuestMode(false);
    setIsFirebaseAuthActive(false);
    setUser(null);
    if (errorMessage) {
      setAuthError(errorMessage);
    }
    try {
      await fbLogOut();
    } catch (err) {
      console.warn('Sign out cleanup warning:', err);
    }
  }, []);

  const verifySessionStatus = useCallback(async (): Promise<boolean> => {
    const fbUser = auth.currentUser;
    if (!fbUser) {
      clearSyncSessionValidationState();
      setIsFirebaseAuthActive(false);
      if (authChoiceRef.current !== 'offline') {
        await clearActiveSessionState();
      }
      return false;
    }

    const onlineNow = typeof navigator !== 'undefined' ? navigator.onLine : true;
    if (onlineNow) {
      lastTokenRefreshCheckRef.current = Date.now();
    }

    const evaluation = await evaluateAuthUserSession(fbUser, onlineNow, getActiveSession());

    if (evaluation.shouldClearSession) {
      await clearActiveSessionState(evaluation.errorMessage);
      return false;
    }

    if (evaluation.status === 'valid_online' && evaluation.userData) {
      if (evaluation.shouldPersistMetadata) {
        saveActiveSession(evaluation.userData);
      }
      const activeOnline = auth.currentUser?.uid === fbUser.uid;
      setSyncSessionValidationState(fbUser.uid, activeOnline);
      authChoiceRef.current = evaluation.choice;
      setAuthChoice(evaluation.choice);
      setCachedUser(evaluation.userData);
      setIsGuestMode(false);
      setIsFirebaseAuthActive(activeOnline);
      setUser(synthesizeUser(evaluation.userData, !activeOnline));
      return activeOnline;
    }

    clearSyncSessionValidationState();
    if (evaluation.errorMessage) {
      setAuthError(evaluation.errorMessage);
    }

    if (evaluation.status === 'degraded_offline' && evaluation.userData) {
      authChoiceRef.current = evaluation.choice;
      setAuthChoice(evaluation.choice);
      setCachedUser(evaluation.userData);
      setIsGuestMode(false);
      setIsFirebaseAuthActive(false);
      setUser(synthesizeUser(evaluation.userData, true));
      return false;
    }

    // Sesión no recuperable sin revocación confirmada: desactivar sincronización sin borrar metadatos ajenos.
    setIsFirebaseAuthActive(false);
    setUser(null);
    return false;
  }, [clearActiveSessionState]);

  // Monitor network connection online / offline status & validate persisted session on reconnect
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      isOnlineRef.current = true;
      if (authChoiceRef.current === 'offline') {
        setIsFirebaseAuthActive(false);
        return;
      }
      void verifySessionStatus();
    };

    const handleOffline = () => {
      clearSyncSessionValidationState();
      setIsOnline(false);
      isOnlineRef.current = false;
      setIsFirebaseAuthActive(false);
      setUser((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          isOfflineSession: true,
        } as NitaUser;
      });
    };

    const handleVisibility = () => {
      const cooldownMs = isFirebaseAuthActiveRef.current ? 15000 : 2000;
      if (
        document.visibilityState === 'visible' &&
        (typeof navigator === 'undefined' || navigator.onLine) &&
        auth.currentUser &&
        Date.now() - lastTokenRefreshCheckRef.current > cooldownMs
      ) {
        void verifySessionStatus();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [verifySessionStatus]);

  // Single Source of Truth: Firebase Auth onAuthStateChanged handles BOTH Google and `nita_password` Custom Token sessions
  useEffect(() => {
    let isMounted = true;
    let firstAuthEventReceived = false;
    ensureAuthPersistence().catch(() => {});

    const isOfflineAtMount = typeof navigator !== 'undefined' && !navigator.onLine;
    const safetyTimeoutMs = isOfflineAtMount ? 1500 : 8000;
    const safetyTimer = setTimeout(() => {
      if (!isMounted || firstAuthEventReceived) return;
      // Do NOT synthesize an unverified registered session or mark isFirebaseAuthActive = true;
      // simply unblock the splash screen so offline users can use Guest mode or retry online.
      if (!auth.currentUser) {
        setIsFirebaseAuthActive(false);
        setLoading(false);
      }
    }, safetyTimeoutMs);

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      firstAuthEventReceived = true;
      clearTimeout(safetyTimer);
      const seq = ++authEventSeqRef.current;
      if (!isMounted) return;

      if (!fbUser) {
        clearSyncSessionValidationState();
        if (authChoiceRef.current === 'offline') {
          setIsGuestMode(true);
          setUser(null);
          setCachedUser(null);
          setIsFirebaseAuthActive(false);
          setLoading(false);
          return;
        }

        // Never leave a registered account logged in without a real Firebase Auth session
        saveActiveSession(null);
        authChoiceRef.current = null;
        setAuthChoice(null);
        setCachedUser(null);
        setIsGuestMode(false);
        setIsFirebaseAuthActive(false);
        setUser(null);
        setLoading(false);
        return;
      }

      // If user explicitly entered Guest mode, do not hijack guest mode with a lingering Firebase Auth session
      if (authChoiceRef.current === 'offline') {
        clearSyncSessionValidationState();
        await fbLogOut().catch(() => {});
        if (!isMounted || seq !== authEventSeqRef.current) return;
        setIsGuestMode(true);
        setUser(null);
        setIsFirebaseAuthActive(false);
        setLoading(false);
        return;
      }

      const onlineNow = typeof navigator === 'undefined' ? true : navigator.onLine;
      const offlineFallback = !onlineNow;
      if (onlineNow) {
        lastTokenRefreshCheckRef.current = Date.now();
      } else {
        // Ruta explícita offline: evaluar token cacheado sin exigir conectividad (fbUser.getIdTokenResult(false))
        void offlineFallback;
      }

      const evaluation = await evaluateAuthUserSession(fbUser, onlineNow, getActiveSession());
      if (!isMounted || seq !== authEventSeqRef.current) return;

      if (evaluation.shouldClearSession) {
        await clearActiveSessionState(evaluation.errorMessage);
        if (isMounted && seq === authEventSeqRef.current) {
          setLoading(false);
        }
        return;
      }

      if (evaluation.status === 'valid_online' && evaluation.userData) {
        if (evaluation.shouldPersistMetadata) {
          saveActiveSession(evaluation.userData);
        }
        try {
          localStorage.removeItem(NITA_GUEST_MODE_KEY);
        } catch {
          // ignore
        }

        const activeOnline = auth.currentUser?.uid === fbUser.uid;
        setSyncSessionValidationState(fbUser.uid, activeOnline);
        authChoiceRef.current = evaluation.choice;
        setAuthChoice(evaluation.choice);
        setCachedUser(evaluation.userData);
        setIsGuestMode(false);
        setIsFirebaseAuthActive(activeOnline);
        setUser(synthesizeUser(evaluation.userData, !activeOnline));
        setLoading(false);

        if (activeOnline && evaluation.choice === 'google') {
          void ensureUserProfileDoc(evaluation.userData);
        }
        return;
      }

      clearSyncSessionValidationState();
      if (evaluation.errorMessage) {
        setAuthError(evaluation.errorMessage);
      }

      if (evaluation.status === 'degraded_offline' && evaluation.userData) {
        // Sesión degradada offline o tras error transitorio online: mantener metadatos locales, NO habilitar Firestore.
        authChoiceRef.current = evaluation.choice;
        setAuthChoice(evaluation.choice);
        setCachedUser(evaluation.userData);
        setIsGuestMode(false);
        setIsFirebaseAuthActive(false);
        setUser(synthesizeUser(evaluation.userData, true));
        setLoading(false);
        return;
      }

      // Sin token cacheado ni sesión persistida coincidente: no inventar autenticación ni cerrar metadatos de otro usuario.
      setIsGuestMode(false);
      setIsFirebaseAuthActive(false);
      setUser(null);
      setLoading(false);
    });

    return () => {
      isMounted = false;
      clearTimeout(safetyTimer);
      unsubscribe();
    };
  }, [clearActiveSessionState]);

  const continueWithoutAccount = () => {
    clearSyncSessionValidationState();
    try {
      localStorage.setItem(NITA_AUTH_CHOICE_KEY, 'offline');
      localStorage.setItem(NITA_GUEST_MODE_KEY, 'true');
      saveActiveSession(null);
    } catch (e) {
      console.warn('Failed to save offline choice:', e);
    }
    authChoiceRef.current = 'offline';
    setAuthChoice('offline');
    setIsGuestMode(true);
    setUser(null);
    setCachedUser(null);
    setAuthError(null);
    setIsFirebaseAuthActive(false);
    setLoading(false);

    if (auth.currentUser) {
      fbLogOut().catch(() => {});
    }
  };

  const exitGuestMode = () => {
    clearSyncSessionValidationState();
    try {
      localStorage.removeItem(NITA_AUTH_CHOICE_KEY);
      localStorage.removeItem(NITA_GUEST_MODE_KEY);
    } catch (e) {
      console.warn('Failed to clear offline choice:', e);
    }
    authChoiceRef.current = null;
    setAuthChoice(null);
    setIsGuestMode(false);
    setIsFirebaseAuthActive(false);
    setUser(null);
  };

  const clearAuthError = () => setAuthError(null);

  const signInWithGoogle = async () => {
    setAuthError(null);
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const msg = 'No hay conexión a internet. Conéctate para iniciar sesión con Google o usa "Ingresar sin cuenta".';
      setAuthError(msg);
      throw new Error(msg);
    }

    try {
      const fbUser = await fbSignInWithGoogle();
      const tokenResult = await fbUser.getIdTokenResult(false).catch(() => null);
      const claims = (tokenResult?.claims || {}) as Record<string, unknown>;
      const { userData } = serializeFirebaseUser(fbUser, claims, getActiveSession());
      saveActiveSession(userData);
      try {
        localStorage.removeItem(NITA_GUEST_MODE_KEY);
      } catch {
        // ignore
      }
      const activeOnline = auth.currentUser?.uid === fbUser.uid;
      setSyncSessionValidationState(fbUser.uid, activeOnline);
      authChoiceRef.current = 'google';
      setAuthChoice('google');
      setCachedUser(userData);
      setIsGuestMode(false);
      setIsFirebaseAuthActive(activeOnline);
      setUser(synthesizeUser(userData, false));

      void ensureUserProfileDoc(userData);
    } catch (err: unknown) {
      const msg = formatGoogleAuthError(err);
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  // Deprecated username availability probe retained cleanly without querying /accounts
  const checkUsernameAvailable = async (): Promise<boolean> => {
    return true;
  };

  const registerWithUsername = async (username: string, password: string) => {
    setAuthError(null);
    try {
      const userData = await registerUserAccount(username, password);
      const synth = synthesizeUser(userData, false);
      const activeOnline = Boolean(auth.currentUser && auth.currentUser.uid === userData.uid);
      setSyncSessionValidationState(userData.uid, activeOnline);
      authChoiceRef.current = 'password';
      setAuthChoice('password');
      setCachedUser(userData);
      setIsGuestMode(false);
      setIsFirebaseAuthActive(activeOnline);
      setUser(synth);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setAuthError(msg);
      throw err;
    }
  };

  const signInWithUsername = async (username: string, password: string) => {
    setAuthError(null);
    try {
      const userData = await signInUserAccount(username, password);
      const synth = synthesizeUser(userData, false);
      const activeOnline = Boolean(auth.currentUser && auth.currentUser.uid === userData.uid);
      setSyncSessionValidationState(userData.uid, activeOnline);
      authChoiceRef.current = 'password';
      setAuthChoice('password');
      setCachedUser(userData);
      setIsGuestMode(false);
      setIsFirebaseAuthActive(activeOnline);
      setUser(synth);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setAuthError(msg);
      throw err;
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    setAuthError(null);
    try {
      const result = await changeUserPassword(currentPassword, newPassword);
      const latestSession = getActiveSession();
      if (latestSession && latestSession.uid === result.uid) {
        const updatedUser = synthesizeUser(latestSession, false);
        setCachedUser(latestSession);
        setUser(updatedUser);
      }
      const activeOnline = Boolean(auth.currentUser && auth.currentUser.uid === result.uid && isOnlineRef.current);
      setSyncSessionValidationState(result.uid, activeOnline);
      setIsFirebaseAuthActive(activeOnline);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isSessionRevokedError(err)) {
        await clearActiveSessionState(msg);
      } else {
        // Incluye auth/requires-recent-login y errores transitorios/validación:
        // jamás cerrar ni destruir la sesión activa ni los datos financieros locales.
        setAuthError(msg);
      }
      throw err;
    }
  };

  const signOutUser = async () => {
    setAuthError(null);
    await clearActiveSessionState();
  };

  const isOfflineSession = Boolean(
    user && (!isOnline || (user as CachedUserData).isOfflineSession === true || !isFirebaseAuthActive)
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        authError,
        isGuestMode,
        authChoice,
        isOnline,
        isOfflineSession,
        isFirebaseAuthActive,
        continueWithoutAccount,
        exitGuestMode,
        clearAuthError,
        signInWithGoogle,
        registerWithUsername,
        signInWithUsername,
        changePassword,
        checkUsernameAvailable,
        signOutUser,
        verifySessionStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
