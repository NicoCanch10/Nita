import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  OAuthProvider, 
  signInWithPopup, 
  signOut, 
  linkWithPopup, 
  User,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';
import { 
  initializeFirestore, 
  getFirestore, 
  doc, 
  getDocFromServer,
  persistentLocalCache,
  persistentMultipleTabManager,
  setLogLevel,
  Firestore
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Configure Firestore SDK log level to 'error' to avoid benign sub-millisecond clock drift warnings in console
setLogLevel('error');

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize single Firebase Auth instance
export const auth = getAuth(app);

// Explicitly configure browserLocalPersistence to ensure Google session survives reloads, app restarts and device reboots
let persistenceInitPromise: Promise<void> | null = null;

export function ensureAuthPersistence(): Promise<void> {
  if (!persistenceInitPromise) {
    persistenceInitPromise = setPersistence(auth, browserLocalPersistence).catch((err) => {
      console.error('[Firebase Auth] Failed to configure browserLocalPersistence:', err);
      // Reset promise so subsequent user attempts can retry
      persistenceInitPromise = null;
      throw err;
    });
  }
  return persistenceInitPromise;
}

// Early persistence configuration kick-off in browser environment
if (typeof window !== 'undefined') {
  ensureAuthPersistence().catch((err) => {
    console.warn('[Firebase Auth] Early persistence setup warning:', err);
  });
}

// Initialize Firestore with named database and offline persistence
const databaseId = firebaseConfig.firestoreDatabaseId || '(default)';

let firestoreDb: Firestore;
try {
  firestoreDb = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  }, databaseId);
} catch {
  firestoreDb = getFirestore(app, databaseId);
}

export const db = firestoreDb;

// Operation Types for error tracking conforming to Firebase Skill guidelines
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Connection test as required by skill, guarded against offline PWA mode
export async function testConnection(): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return;
  }
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return;
    }
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase configuration check: the client is currently offline.');
    }
  }
}

// Providers
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const appleProvider = new OAuthProvider('apple.com');
appleProvider.addScope('email');
appleProvider.addScope('name');

// Auth actions: synchronous user gesture execution for reliable popup authorization across all browsers
export async function signInWithGoogle() {
  await ensureAuthPersistence();
  return await signInWithPopup(auth, googleProvider);
}

export async function signInWithApple() {
  await ensureAuthPersistence();
  return await signInWithPopup(auth, appleProvider);
}

export async function linkGoogle(user: User) {
  await ensureAuthPersistence();
  return await linkWithPopup(user, googleProvider);
}

export async function linkApple(user: User) {
  await ensureAuthPersistence();
  return await linkWithPopup(user, appleProvider);
}

export async function logOut() {
  return await signOut(auth);
}

// Trigger initial connection test safely in background
if (typeof window !== 'undefined') {
  testConnection().catch(() => {});
}
