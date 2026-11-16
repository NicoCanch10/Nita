import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { 
  auth,
  db,
  ensureAuthPersistence,
  signInWithGoogle as fbSignInWithGoogle,
  logOut as fbLogOut 
} from '../lib/firebase';
import {
  registerUserAccount,
  signInUserAccount,
  saveActiveSession,
  getActiveSession,
  isUsernameTaken,
} from '../services/authAccountService';

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
  providerData?: Array<{ providerId: string; email?: string | null; displayName?: string | null; photoURL?: string | null }>;
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
  checkUsernameAvailable: (username: string) => Promise<boolean>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function getInitialAuthChoice(): AuthChoice {
  if (typeof window === 'undefined') return null;
  try {
    const choice = localStorage.getItem(NITA_AUTH_CHOICE_KEY) as AuthChoice;
    if (choice === 'google' || choice === 'password' || choice === 'offline') {
      return choice;
    }
    // Backward compatibility with legacy guest mode key
    if (localStorage.getItem(NITA_GUEST_MODE_KEY) === 'true') {
      return 'offline';
    }
  } catch (e) {
    console.error('Error reading auth choice from localStorage:', e);
  }
  return null;
}

function getInitialCachedUser(): CachedUserData | null {
  if (typeof window === 'undefined') return null;
  return getActiveSession();
}

function synthesizeUser(cached: CachedUserData, isOffline: boolean): NitaUser {
  const fallbackProvider = cached.providerId || 'password';
  return {
    uid: cached.uid,
    email: cached.email,
    displayName: cached.displayName,
    photoURL: cached.photoURL,
    providerId: fallbackProvider,
    providerData: cached.providerData || [{
      providerId: fallbackProvider,
      email: cached.email,
      displayName: cached.displayName,
      photoURL: cached.photoURL,
    }],
    isOfflineSession: isOffline,
  } as NitaUser;
}

function serializeFirebaseUser(fbUser: User): CachedUserData {
  const providerId = fbUser.providerData?.[0]?.providerId || 'google.com';
  return {
    uid: fbUser.uid,
    email: fbUser.email,
    displayName: fbUser.displayName || fbUser.email?.split('@')[0] || 'Usuario',
    photoURL: fbUser.photoURL,
    providerId,
    providerData: fbUser.providerData?.length
      ? fbUser.providerData.map((p) => ({
          providerId: p.providerId,
          email: p.email,
          displayName: p.displayName,
          photoURL: p.photoURL,
        }))
      : [{
          providerId,
          email: fbUser.email,
          displayName: fbUser.displayName,
          photoURL: fbUser.photoURL,
        }],
    isOfflineSession: false,
  };
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
  const [authChoice, setAuthChoice] = useState<AuthChoice>(() => getInitialAuthChoice());
  const authChoiceRef = useRef<AuthChoice>(authChoice);
  authChoiceRef.current = authChoice;

  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });

  const [cachedUser, setCachedUser] = useState<CachedUserData | null>(() => getInitialCachedUser());

  // Initialize guest mode if user chose 'offline'
  const [isGuestMode, setIsGuestMode] = useState<boolean>(() => {
    const initialChoice = getInitialAuthChoice();
    return initialChoice === 'offline';
  });

  // Authenticated user state: restored immediately from device persistence if user signed in previously
  const [user, setUser] = useState<NitaUser | null>(() => {
    const initialChoice = getInitialAuthChoice();
    const initialCached = getInitialCachedUser();
    if (initialCached && initialChoice !== 'offline') {
      return synthesizeUser(initialCached, typeof navigator !== 'undefined' ? !navigator.onLine : false);
    }
    return null;
  });

  const [loading, setLoading] = useState<boolean>(() => {
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    if (isOffline && getInitialCachedUser()) {
      return false;
    }
    return false;
  });
  const [authError, setAuthError] = useState<string | null>(null);
  const [isFirebaseAuthActive, setIsFirebaseAuthActive] = useState<boolean>(() => Boolean(user));

  // Monitor network connection online / offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setUser(prev => {
        if (!prev) return null;
        return {
          ...prev,
          isOfflineSession: false,
        } as NitaUser;
      });
      setIsFirebaseAuthActive(Boolean(user));
    };

    const handleOffline = () => {
      setIsOnline(false);
      setUser(prev => {
        if (!prev) return null;
        return {
          ...prev,
          isOfflineSession: true,
        } as NitaUser;
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [user]);

  // Listen to Firebase Auth state for Google sessions and preserve local username/offline sessions
  useEffect(() => {
    let isMounted = true;
    ensureAuthPersistence().catch(() => {});

    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
      if (!isMounted) return;

      const currentChoice = authChoiceRef.current;

      // Never overwrite active username/password or offline guest sessions
      if (currentChoice === 'password' || currentChoice === 'offline') {
        return;
      }

      if (fbUser) {
        const userData = serializeFirebaseUser(fbUser);
        saveActiveSession(userData);
        try {
          localStorage.removeItem(NITA_GUEST_MODE_KEY);
        } catch {
          // ignore
        }
        authChoiceRef.current = 'google';
        setAuthChoice('google');
        setCachedUser(userData);
        setIsGuestMode(false);
        setIsFirebaseAuthActive(true);
        setUser(synthesizeUser(userData, typeof navigator !== 'undefined' ? !navigator.onLine : false));
        setLoading(false);
      } else {
        // Offline or initial persistence check: preserve cached Google session if present
        const session = getActiveSession();
        if (session && currentChoice === 'google') {
          setUser(synthesizeUser(session, typeof navigator !== 'undefined' ? !navigator.onLine : false));
          setCachedUser(session);
          setIsGuestMode(false);
          setIsFirebaseAuthActive(true);
        }
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // Restore local session on mount / authChoice changes
  useEffect(() => {
    const session = getActiveSession();
    if (session && authChoice !== 'offline') {
      setUser(synthesizeUser(session, typeof navigator !== 'undefined' ? !navigator.onLine : false));
      setCachedUser(session);
      setIsGuestMode(false);
      setIsFirebaseAuthActive(true);
    }
  }, [authChoice]);

  const continueWithoutAccount = () => {
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
  };

  const exitGuestMode = () => {
    try {
      localStorage.removeItem(NITA_AUTH_CHOICE_KEY);
      localStorage.removeItem(NITA_GUEST_MODE_KEY);
    } catch (e) {
      console.warn('Failed to clear offline choice:', e);
    }
    authChoiceRef.current = null;
    setAuthChoice(null);
    setIsGuestMode(false);
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
      const userData = serializeFirebaseUser(fbUser);
      saveActiveSession(userData);
      try {
        localStorage.removeItem(NITA_GUEST_MODE_KEY);
      } catch {
        // ignore
      }
      authChoiceRef.current = 'google';
      setAuthChoice('google');
      setCachedUser(userData);
      setIsGuestMode(false);
      setIsFirebaseAuthActive(true);
      setUser(synthesizeUser(userData, false));

      // Ensure user profile document exists in Firestore
      void ensureUserProfileDoc(userData);
    } catch (err: unknown) {
      const msg = formatGoogleAuthError(err);
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  const checkUsernameAvailable = async (username: string): Promise<boolean> => {
    try {
      const taken = await isUsernameTaken(username);
      return !taken;
    } catch {
      return false;
    }
  };

  const registerWithUsername = async (username: string, password: string) => {
    setAuthError(null);
    try {
      const userData = await registerUserAccount(username, password);
      const synth = synthesizeUser(userData, false);
      authChoiceRef.current = 'password';
      setUser(synth);
      setCachedUser(userData);
      setAuthChoice('password');
      setIsGuestMode(false);
      setIsFirebaseAuthActive(true);
      if (auth.currentUser) {
        fbLogOut().catch(() => {});
      }
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
      authChoiceRef.current = 'password';
      setUser(synth);
      setCachedUser(userData);
      setAuthChoice('password');
      setIsGuestMode(false);
      setIsFirebaseAuthActive(true);
      if (auth.currentUser) {
        fbLogOut().catch(() => {});
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setAuthError(msg);
      throw err;
    }
  };

  const signOutUser = async () => {
    setAuthError(null);
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
    try {
      await fbLogOut();
    } catch (err) {
      console.warn('Sign out warning:', err);
    }
  };

  const isOfflineSession = Boolean(
    user && (!isOnline || (user as any).isOfflineSession === true)
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
        checkUsernameAvailable,
        signOutUser,
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
