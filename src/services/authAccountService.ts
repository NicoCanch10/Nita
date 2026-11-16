import { 
  doc, 
  getDoc, 
  setDoc, 
  getDocFromServer,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { CachedUserData } from '../context/AuthContext';

export interface UserAccountRecord {
  userId: string;
  username: string;
  usernameLower: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
  updatedAt: string;
}

const LOCAL_ACCOUNTS_KEY = 'nita_registered_accounts';
export const ACTIVE_SESSION_KEY = 'nita_active_user_session';

/**
 * Validates username format:
 * - 3 to 25 characters
 * - Letters, numbers, underscores, dots, hyphens
 */
export function validateUsernameFormat(username: string): { valid: boolean; error?: string } {
  const trimmed = username.trim();
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
      error: 'El nombre de usuario solo puede contener letras, números, guiones y puntos.' 
    };
  }
  return { valid: true };
}

/**
 * Validates password format:
 * - At least 6 characters
 */
export function validatePasswordFormat(password: string): { valid: boolean; error?: string } {
  if (!password) {
    return { valid: false, error: 'Por favor, ingresa una contraseña.' };
  }
  if (password.length < 6) {
    return { valid: false, error: 'La contraseña debe tener al menos 6 caracteres.' };
  }
  return { valid: true };
}

/**
 * Generates a random cryptographic salt.
 */
export function generateSalt(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Securely hashes password with salt using SHA-256.
 */
export async function hashPassword(password: string, salt: string): Promise<string> {
  const input = `${salt}:${password}`;
  if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback hash for environments without Web Crypto subtle (e.g. older JS runtimes)
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return `h_${Math.abs(hash).toString(16)}_${salt}`;
}

/**
 * Reads local cached accounts from localStorage.
 */
export function getLocalAccounts(): Record<string, UserAccountRecord> {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(LOCAL_ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error('Error reading local accounts from storage:', e);
    return {};
  }
}

/**
 * Saves an account to localStorage cache.
 */
export function saveLocalAccount(account: UserAccountRecord): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    const accounts = getLocalAccounts();
    accounts[account.usernameLower] = account;
    localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch (e) {
    console.error('Error saving local account to storage:', e);
  }
}

/**
 * Checks if a username is already taken.
 * Checks both remote Firestore and local storage cache.
 * Case-insensitive comparison.
 */
export async function isUsernameTaken(username: string): Promise<boolean> {
  const lower = username.trim().toLowerCase();
  if (!lower) return false;

  // 1. Check local storage cache
  const localAccounts = getLocalAccounts();
  if (localAccounts[lower]) {
    return true;
  }

  // 2. Check remote Firestore
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return false;
  }

  try {
    const accountRef = doc(db, 'accounts', lower);
    const docSnap = await getDocFromServer(accountRef).catch(async () => {
      return await getDoc(accountRef);
    });
    return docSnap.exists();
  } catch (err) {
    console.warn('[Username Check] Error checking username in Firestore:', err);
    // If offline or permission check, rely on local accounts
    return Boolean(localAccounts[lower]);
  }
}

/**
 * Registers a new user with username and password.
 * Strictly verifies that the username is not already repeated.
 */
export async function registerUserAccount(username: string, password: string): Promise<CachedUserData> {
  const usernameCheck = validateUsernameFormat(username);
  if (!usernameCheck.valid) {
    throw new Error(usernameCheck.error);
  }

  const passwordCheck = validatePasswordFormat(password);
  if (!passwordCheck.valid) {
    throw new Error(passwordCheck.error);
  }

  const cleanUsername = username.trim();
  const lower = cleanUsername.toLowerCase();

  // Strict check: verify that username is not repeated
  const taken = await isUsernameTaken(lower);
  if (taken) {
    throw new Error(`El nombre de usuario "${cleanUsername}" ya está en uso. Por favor, elige otro o inicia sesión.`);
  }

  const salt = generateSalt();
  const passwordHash = await hashPassword(password, salt);
  const now = new Date().toISOString();
  // Deterministic user ID based on lowercase username
  const userId = `usr_${lower.replace(/[^a-z0-9]/g, '_')}`;

  const accountRecord: UserAccountRecord = {
    userId,
    username: cleanUsername,
    usernameLower: lower,
    passwordHash,
    salt,
    createdAt: now,
    updatedAt: now,
  };

  // Save locally first for resilience
  saveLocalAccount(accountRecord);

  // Save to Firestore if online
  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      const accountRef = doc(db, 'accounts', lower);
      await setDoc(accountRef, {
        userId,
        username: cleanUsername,
        usernameLower: lower,
        passwordHash,
        salt,
        createdAt: now,
        updatedAt: now,
      });

      // Initialize user document
      const userRef = doc(db, 'users', userId);
      await setDoc(userRef, {
        uid: userId,
        displayName: cleanUsername,
        createdAt: now,
        updatedAt: now,
      }, { merge: true });
    } catch (err) {
      console.warn('[Register] Error saving account to cloud, saved locally:', err);
    }
  }

  const userData: CachedUserData = {
    uid: userId,
    displayName: cleanUsername,
    email: null,
    photoURL: null,
    providerId: 'password',
    providerData: [{ providerId: 'password', displayName: cleanUsername, email: null, photoURL: null }],
    isOfflineSession: false,
  };

  saveActiveSession(userData);
  return userData;
}

/**
 * Signs in an existing user with username and password.
 */
export async function signInUserAccount(username: string, password: string): Promise<CachedUserData> {
  const cleanUsername = username.trim();
  const lower = cleanUsername.toLowerCase();

  if (!cleanUsername) {
    throw new Error('Por favor, ingresa tu nombre de usuario.');
  }
  if (!password) {
    throw new Error('Por favor, ingresa tu contraseña.');
  }

  let account: UserAccountRecord | null = null;

  // 1. Try fetching from Firestore
  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      const accountRef = doc(db, 'accounts', lower);
      const docSnap = await getDoc(accountRef);
      if (docSnap.exists()) {
        account = docSnap.data() as UserAccountRecord;
        // Cache locally for offline resilience
        saveLocalAccount(account);
      }
    } catch (err) {
      console.warn('[SignIn] Error checking cloud account, checking local:', err);
    }
  }

  // 2. If not found in cloud (or offline), check local storage
  if (!account) {
    const localAccounts = getLocalAccounts();
    account = localAccounts[lower] || null;
  }

  if (!account) {
    throw new Error(`El nombre de usuario "${cleanUsername}" no está registrado.`);
  }

  // 3. Verify password hash
  const computedHash = await hashPassword(password, account.salt);
  if (computedHash !== account.passwordHash) {
    throw new Error('La contraseña ingresada es incorrecta.');
  }

  const userData: CachedUserData = {
    uid: account.userId,
    displayName: account.username,
    email: null,
    photoURL: null,
    providerId: 'password',
    providerData: [{ providerId: 'password', displayName: account.username, email: null, photoURL: null }],
    isOfflineSession: false,
  };

  saveActiveSession(userData);
  return userData;
}

/**
 * Saves active session in localStorage.
 */
export function saveActiveSession(user: CachedUserData | null): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    if (user) {
      localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(user));
      // Also update standard cached user key for App compatibility
      localStorage.setItem('nita_cached_user', JSON.stringify(user));
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
 * Loads active session from localStorage.
 */
export function getActiveSession(): CachedUserData | null {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ACTIVE_SESSION_KEY) || localStorage.getItem('nita_cached_user');
    if (raw) {
      const data = JSON.parse(raw);
      if (data && data.uid && data.displayName) {
        return data;
      }
    }
  } catch (e) {
    console.error('Error reading active session:', e);
  }
  return null;
}
