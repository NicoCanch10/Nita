import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { 
  auth, 
  signInWithGoogle as fbSignInWithGoogle, 
  signInWithApple as fbSignInWithApple, 
  linkGoogle as fbLinkGoogle, 
  linkApple as fbLinkApple, 
  logOut as fbLogOut 
} from '../lib/firebase';

export const NITA_AUTH_CHOICE_KEY = 'nita_auth_choice';
export const NITA_CACHED_USER_KEY = 'nita_cached_user';
export const NITA_GUEST_MODE_KEY = 'nita_guest_mode';

export type AuthChoice = 'google' | 'apple' | 'offline' | null;

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
  continueWithoutAccount: () => void;
  exitGuestMode: () => void;
  clearAuthError: () => void;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  linkGoogleAccount: () => Promise<void>;
  linkAppleAccount: () => Promise<void>;
  signOutUser: () => Promise<void>;
  isGoogleLinked: boolean;
  isAppleLinked: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function getInitialAuthChoice(): AuthChoice {
  if (typeof window === 'undefined') return null;
  try {
    const choice = localStorage.getItem(NITA_AUTH_CHOICE_KEY) as AuthChoice;
    if (choice === 'google' || choice === 'apple' || choice === 'offline') {
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
  try {
    const raw = localStorage.getItem(NITA_CACHED_USER_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Error reading cached user from localStorage:', e);
  }
  return null;
}

function synthesizeUser(cached: CachedUserData, isOffline: boolean): NitaUser {
  return {
    uid: cached.uid,
    email: cached.email,
    displayName: cached.displayName,
    photoURL: cached.photoURL,
    providerData: cached.providerData || (cached.providerId ? [{ providerId: cached.providerId }] : [{ providerId: 'google.com' }]),
    isOfflineSession: isOffline,
  } as NitaUser;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authChoice, setAuthChoice] = useState<AuthChoice>(() => getInitialAuthChoice());
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
    if (initialCached && (initialChoice === 'google' || initialChoice === 'apple')) {
      return synthesizeUser(initialCached, typeof navigator !== 'undefined' ? !navigator.onLine : false);
    }
    return null;
  });

  // Loading state: if we already have the remembered user in local device storage, don't block with loading screen
  const [loading, setLoading] = useState<boolean>(() => {
    const initialChoice = getInitialAuthChoice();
    const initialCached = getInitialCachedUser();
    if (initialChoice === 'offline') return false;
    if (initialCached && (initialChoice === 'google' || initialChoice === 'apple')) return false;
    return true;
  });

  const [authError, setAuthError] = useState<string | null>(null);

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
  }, []);

  // Firebase auth state listener: authoritative source of truth for user authentication
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        // Genuine Firebase authenticated user
        const providerId = currentUser.providerData?.[0]?.providerId || '';
        const choice: AuthChoice = providerId.includes('apple') ? 'apple' : 'google';

        const cached: CachedUserData = {
          uid: currentUser.uid,
          email: currentUser.email,
          displayName: currentUser.displayName,
          photoURL: currentUser.photoURL,
          providerId: providerId || 'google.com',
          providerData: currentUser.providerData?.map(p => ({
            providerId: p.providerId,
            email: p.email,
            displayName: p.displayName,
            photoURL: p.photoURL,
          })) || [{ providerId: 'google.com' }],
          isOfflineSession: typeof navigator !== 'undefined' ? !navigator.onLine : false,
        };

        try {
          localStorage.setItem(NITA_AUTH_CHOICE_KEY, choice);
          localStorage.setItem(NITA_CACHED_USER_KEY, JSON.stringify(cached));
          localStorage.removeItem(NITA_GUEST_MODE_KEY);
        } catch (e) {
          console.warn('Could not persist auth choice:', e);
        }

        setAuthChoice(choice);
        setCachedUser(cached);
        setUser(currentUser as NitaUser);
        setIsGuestMode(false);
        setLoading(false);
      } else {
        // Firebase auth state callback with null (e.g. offline, startup recovery delay, or network drop)
        const savedChoice = getInitialAuthChoice();
        const existingCached = getInitialCachedUser();

        if (savedChoice === 'offline') {
          setUser(null);
          setCachedUser(null);
          setIsGuestMode(true);
          setLoading(false);
        } else if (existingCached && (savedChoice === 'google' || savedChoice === 'apple')) {
          // El usuario tiene su cuenta guardada y recordada en este dispositivo y NO solicitó cerrar sesión.
          // Mantenemos la sesión activa de forma permanente en el dispositivo.
          const rememberedUser = synthesizeUser(existingCached, typeof navigator !== 'undefined' ? !navigator.onLine : false);
          setUser(rememberedUser);
          setCachedUser(existingCached);
          setIsGuestMode(false);
          setLoading(false);
        } else {
          setUser(null);
          setCachedUser(null);
          setIsGuestMode(false);
          setLoading(false);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  const continueWithoutAccount = () => {
    try {
      localStorage.setItem(NITA_AUTH_CHOICE_KEY, 'offline');
      localStorage.setItem(NITA_GUEST_MODE_KEY, 'true');
      localStorage.removeItem(NITA_CACHED_USER_KEY);
    } catch (e) {
      console.warn('Failed to save offline choice:', e);
    }
    setAuthChoice('offline');
    setIsGuestMode(true);
    setUser(null);
    setCachedUser(null);
    setAuthError(null);
  };

  const exitGuestMode = () => {
    try {
      localStorage.removeItem(NITA_AUTH_CHOICE_KEY);
      localStorage.removeItem(NITA_GUEST_MODE_KEY);
    } catch (e) {
      console.warn('Failed to clear offline choice:', e);
    }
    setAuthChoice(null);
    setIsGuestMode(false);
    setUser(null);
  };

  const clearAuthError = () => setAuthError(null);

  const getFriendlyAuthError = (err: unknown, provider?: 'apple' | 'google'): string => {
    if (!(err instanceof Error)) return 'Ocurrió un error inesperado al autenticar.';
    const msg = err.message || '';
    if (msg.includes('auth/popup-closed-by-user') || msg.includes('auth/cancelled-popup-request')) {
      return '';
    }
    if (msg.includes('auth/popup-blocked')) {
      return 'El navegador bloqueó la ventana emergente de Google. Por favor, toca "Permitir ventanas emergentes" o intenta presionar nuevamente el botón.';
    }
    if (msg.includes('auth/unauthorized-domain')) {
      return 'El dominio actual no está en la lista de dominios autorizados de Firebase Authentication. Ve a Firebase Console > Authentication > Settings > Authorized Domains y agrega este dominio.';
    }
    if (msg.includes('auth/credential-already-in-use')) {
      return 'Esta credencial ya está vinculada a otra cuenta de NITA.';
    }
    if (msg.includes('auth/account-exists-with-different-credential')) {
      return 'Ya existe una cuenta con este correo pero con otro método de acceso. Inicia sesión con tu proveedor habitual y luego vincúlala desde Configuración.';
    }
    if (msg.includes('auth/network-request-failed') || msg.includes('the client is offline')) {
      return 'No hay conexión a internet disponible. Puedes "Ingresar sin cuenta" para utilizar NITA de forma offline y sincronizar después.';
    }
    if (msg.includes('auth/operation-not-allowed') || msg.includes('auth/configuration-not-found')) {
      if (provider === 'apple' || msg.toLowerCase().includes('apple')) {
        return 'Apple Sign-In no está configurado en Firebase Console (requiere membresía Apple Developer $99/año).';
      }
      return 'El proveedor de autenticación aún no está habilitado en la consola de Firebase.';
    }
    return err.message;
  };

  const signInWithGoogle = async () => {
    setAuthError(null);
    try {
      const res = await fbSignInWithGoogle();
      if (res.user) {
        const choice: AuthChoice = 'google';
        const cached: CachedUserData = {
          uid: res.user.uid,
          email: res.user.email,
          displayName: res.user.displayName,
          photoURL: res.user.photoURL,
          providerId: 'google.com',
          providerData: res.user.providerData?.map(p => ({
            providerId: p.providerId,
            email: p.email,
            displayName: p.displayName,
            photoURL: p.photoURL,
          })) || [{ providerId: 'google.com' }],
          isOfflineSession: false,
        };
        try {
          localStorage.setItem(NITA_AUTH_CHOICE_KEY, choice);
          localStorage.setItem(NITA_CACHED_USER_KEY, JSON.stringify(cached));
          localStorage.removeItem(NITA_GUEST_MODE_KEY);
        } catch (e) {
          console.warn('Could not persist auth choice:', e);
        }
        setAuthChoice(choice);
        setCachedUser(cached);
        setUser(res.user as NitaUser);
        setIsGuestMode(false);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('auth/popup-closed-by-user') || msg.includes('auth/cancelled-popup-request')) {
        // User voluntarily closed popup: do not show an error banner
        return;
      }
      const friendly = getFriendlyAuthError(err, 'google');
      setAuthError(friendly);
      throw err;
    }
  };

  const signInWithApple = async () => {
    setAuthError(null);
    try {
      const res = await fbSignInWithApple();
      if (res.user) {
        const choice: AuthChoice = 'apple';
        const cached: CachedUserData = {
          uid: res.user.uid,
          email: res.user.email,
          displayName: res.user.displayName,
          photoURL: res.user.photoURL,
          providerId: 'apple.com',
          providerData: res.user.providerData?.map(p => ({
            providerId: p.providerId,
            email: p.email,
            displayName: p.displayName,
            photoURL: p.photoURL,
          })) || [{ providerId: 'apple.com' }],
          isOfflineSession: false,
        };
        try {
          localStorage.setItem(NITA_AUTH_CHOICE_KEY, choice);
          localStorage.setItem(NITA_CACHED_USER_KEY, JSON.stringify(cached));
          localStorage.removeItem(NITA_GUEST_MODE_KEY);
        } catch (e) {
          console.warn('Could not persist auth choice:', e);
        }
        setAuthChoice(choice);
        setCachedUser(cached);
        setUser(res.user as NitaUser);
        setIsGuestMode(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('auth/popup-closed-by-user') || msg.includes('auth/cancelled-popup-request')) {
        const errorObj = new Error('popup-closed');
        (errorObj as unknown as { code: string }).code = 'popup-closed';
        throw errorObj;
      }
      if (
        msg.includes('auth/operation-not-allowed') ||
        msg.includes('auth/configuration-not-found') ||
        msg.includes('auth/invalid-provider-id') ||
        msg.toLowerCase().includes('apple')
      ) {
        // Apple provider is not configured in Firebase Console.
        // DO NOT set authError (so no red cartel appears).
        const errorObj = new Error('apple-not-configured');
        (errorObj as unknown as { code: string }).code = 'apple-not-configured';
        throw errorObj;
      }
      const friendly = getFriendlyAuthError(err, 'apple');
      if (friendly) setAuthError(friendly);
      throw err;
    }
  };

  const linkGoogleAccount = async () => {
    if (!user) return;
    setAuthError(null);
    try {
      const res = await fbLinkGoogle(user as User);
      setUser(res.user as NitaUser);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('auth/popup-closed-by-user') || msg.includes('auth/cancelled-popup-request')) {
        return;
      }
      const friendly = getFriendlyAuthError(err, 'google');
      if (friendly) setAuthError(friendly);
      throw err;
    }
  };

  const linkAppleAccount = async () => {
    if (!user) return;
    setAuthError(null);
    try {
      const res = await fbLinkApple(user as User);
      setUser(res.user as NitaUser);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('auth/popup-closed-by-user') || msg.includes('auth/cancelled-popup-request')) {
        const errorObj = new Error('popup-closed');
        (errorObj as unknown as { code: string }).code = 'popup-closed';
        throw errorObj;
      }
      if (
        msg.includes('auth/operation-not-allowed') ||
        msg.includes('auth/configuration-not-found') ||
        msg.includes('auth/invalid-provider-id') ||
        msg.toLowerCase().includes('apple')
      ) {
        const errorObj = new Error('apple-not-configured');
        (errorObj as unknown as { code: string }).code = 'apple-not-configured';
        throw errorObj;
      }
      const friendly = getFriendlyAuthError(err, 'apple');
      if (friendly) setAuthError(friendly);
      throw err;
    }
  };

  const signOutUser = async () => {
    setAuthError(null);
    try {
      localStorage.removeItem(NITA_AUTH_CHOICE_KEY);
      localStorage.removeItem(NITA_CACHED_USER_KEY);
      localStorage.removeItem(NITA_GUEST_MODE_KEY);
    } catch (e) {
      console.warn('Failed to clear auth storage:', e);
    }
    setAuthChoice(null);
    setCachedUser(null);
    setIsGuestMode(false);
    setUser(null);
    try {
      await fbLogOut();
    } catch (err) {
      console.warn('Sign out warning:', err);
    }
  };

  const isGoogleLinked = Boolean(
    user?.providerData?.some(p => p.providerId === 'google.com') ||
    authChoice === 'google'
  );

  const isAppleLinked = Boolean(
    user?.providerData?.some(p => p.providerId === 'apple.com') ||
    authChoice === 'apple'
  );

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
        continueWithoutAccount,
        exitGuestMode,
        clearAuthError,
        signInWithGoogle,
        signInWithApple,
        linkGoogleAccount,
        linkAppleAccount,
        signOutUser,
        isGoogleLinked,
        isAppleLinked,
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
