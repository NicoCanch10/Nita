import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCustomToken,
  signOut, 
  User,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
  connectAuthEmulator
} from 'firebase/auth';
import { 
  initializeFirestore, 
  getFirestore, 
  doc, 
  getDocFromServer,
  persistentLocalCache,
  persistentMultipleTabManager,
  setLogLevel,
  Firestore,
  connectFirestoreEmulator
} from 'firebase/firestore';
import {
  getFunctions,
  connectFunctionsEmulator,
  Functions
} from 'firebase/functions';
import firebaseConfig from '../../firebase-applet-config.json';
import { clearSyncSessionValidationState } from './syncSessionGate';

// Configure Firestore SDK log level to 'silent' to silence internal IndexedDB lease jitter and sub-millisecond clock drift warnings
setLogLevel('silent');

// In browser environment, filter out benign internal Firestore multi-tab lease jitter warnings
if (typeof window !== 'undefined') {
  const origError = console.error;
  console.error = (...args: unknown[]) => {
    const first = typeof args[0] === 'string' ? args[0] : '';
    if (first.includes('Detected an update time that is in the future')) {
      return;
    }
    origError.apply(console, args);
  };
}

const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> })?.env;
const nodeEnv = typeof process !== 'undefined' ? process.env : undefined;
const useEmulatorsEnv =
  viteEnv?.VITE_USE_FIREBASE_EMULATORS === 'true' || nodeEnv?.NITA_USE_FIREBASE_EMULATORS === 'true';
const emulatorProjectId = viteEnv?.VITE_EMULATOR_PROJECT_ID || nodeEnv?.NITA_EMULATOR_PROJECT_ID;

const effectiveFirebaseConfig =
  useEmulatorsEnv && emulatorProjectId && emulatorProjectId.startsWith('demo-')
    ? {
        ...firebaseConfig,
        projectId: emulatorProjectId,
        authDomain: `${emulatorProjectId}.firebaseapp.com`,
      }
    : firebaseConfig;

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(effectiveFirebaseConfig) : getApp();

// Initialize single Firebase Auth instance
export const auth = getAuth(app);

// Explicitly configure browserLocalPersistence immediately to ensure sessions survive reloads, app restarts and device reboots
if (typeof window !== 'undefined') {
  setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.warn('[Firebase Auth] Immediate browserLocalPersistence initialization warning:', err);
  });
}

let persistenceInitPromise: Promise<void> | null = null;

export function ensureAuthPersistence(): Promise<void> {
  if (!persistenceInitPromise) {
    persistenceInitPromise = setPersistence(auth, browserLocalPersistence).catch(async (err) => {
      console.warn('[Firebase Auth] browserLocalPersistence not available, falling back to session:', err);
      try {
        await setPersistence(auth, browserSessionPersistence);
      } catch (err2) {
        console.warn('[Firebase Auth] browserSessionPersistence not available, using in-memory:', err2);
        await setPersistence(auth, inMemoryPersistence).catch(() => {});
      }
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

// Initialize Cloud Functions Gen 2 instance in us-central1
export const FUNCTIONS_REGION = 'us-central1';
export const functions: Functions = getFunctions(app, FUNCTIONS_REGION);

let emulatorsConnected = false;

export interface FirebaseEmulatorConfig {
  authUrl?: string;
  firestoreHost?: string;
  firestorePort?: number;
  functionsHost?: string;
  functionsPort?: number;
}

/**
 * Connects Firebase Web SDK instances to local emulators strictly when explicitly requested
 * (e.g. VITE_USE_FIREBASE_EMULATORS=true or test harnesses). Never active in production by default.
 */
export function connectFirebaseEmulators(config?: FirebaseEmulatorConfig): void {
  if (emulatorsConnected) return;
  emulatorsConnected = true;

  const authUrl = config?.authUrl || 'http://127.0.0.1:9099';
  const firestoreHost = config?.firestoreHost || '127.0.0.1';
  const firestorePort = config?.firestorePort ?? 8080;
  const functionsHost = config?.functionsHost || '127.0.0.1';
  const functionsPort = config?.functionsPort ?? 5001;

  try {
    connectAuthEmulator(auth, authUrl, { disableWarnings: true });
  } catch {
    // Already connected
  }
  try {
    connectFirestoreEmulator(db, firestoreHost, firestorePort);
  } catch {
    // Already connected
  }
  try {
    connectFunctionsEmulator(functions, functionsHost, functionsPort);
  } catch {
    // Already connected
  }
}

if (useEmulatorsEnv) {
  const parseHostPort = (raw: string | undefined, fallbackHost: string, fallbackPort: number) => {
    if (!raw) return { host: fallbackHost, port: fallbackPort };
    const [h, p] = raw.split(':');
    return { host: h || fallbackHost, port: Number(p) || fallbackPort };
  };
  const fsTarget = parseHostPort(
    viteEnv?.VITE_FIRESTORE_EMULATOR_HOST || nodeEnv?.FIRESTORE_EMULATOR_HOST,
    '127.0.0.1',
    8080
  );
  const fnTarget = parseHostPort(
    viteEnv?.VITE_FUNCTIONS_EMULATOR_HOST || nodeEnv?.FUNCTIONS_EMULATOR_HOST,
    '127.0.0.1',
    5001
  );
  const authHost = viteEnv?.VITE_AUTH_EMULATOR_HOST || nodeEnv?.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
  connectFirebaseEmulators({
    authUrl: authHost.startsWith('http') ? authHost : `http://${authHost}`,
    firestoreHost: fsTarget.host,
    firestorePort: fsTarget.port,
    functionsHost: fnTarget.host,
    functionsPort: fnTarget.port,
  });
}

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
  const errMsg = error instanceof Error ? error.message : String(error);
  const errCode = (error as any)?.code || '';
  const isPermission = 
    errCode === 'permission-denied' || 
    errCode === 'firestore/permission-denied' || 
    errMsg.includes('Missing or insufficient permissions') ||
    errMsg.includes('permission-denied') ||
    errMsg.includes('PERMISSION_DENIED');

  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
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

  if (isPermission) {
    console.error('Firestore Error:', JSON.stringify(errInfo));
    throw new Error(JSON.stringify(errInfo));
  }

  console.warn(`[Firestore ${operationType} warning on ${path}]:`, errMsg);
  throw error instanceof Error ? error : new Error(errMsg);
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

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

export async function signInWithGoogle(): Promise<User> {
  await ensureAuthPersistence();
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signInWithFirebaseCustomToken(customToken: string): Promise<User> {
  await ensureAuthPersistence();
  const result = await signInWithCustomToken(auth, customToken);
  return result.user;
}

export async function logOut() {
  clearSyncSessionValidationState();
  return await signOut(auth);
}

// Trigger initial connection test safely in background
if (typeof window !== 'undefined') {
  testConnection().catch(() => {});
}
