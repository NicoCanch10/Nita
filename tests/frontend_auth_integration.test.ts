import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { initializeApp as initializeClientApp, deleteApp as deleteClientApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth as getClientAuth,
  connectAuthEmulator,
  signOut as clientSignOut,
  type Auth as ClientAuth,
} from 'firebase/auth';
import {
  getFunctions as getClientFunctions,
  connectFunctionsEmulator,
  type Functions as ClientFunctions,
} from 'firebase/functions';
import {
  doc,
  getDoc,
  setDoc,
  getFirestore as getClientFirestore,
  connectFirestoreEmulator,
  type Firestore as ClientFirestore,
} from 'firebase/firestore';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'demo-nita-etapa2a1';
if (!PROJECT_ID.startsWith('demo-')) {
  throw new Error(
    `[Security Guard Error] PROJECT_ID ('${PROJECT_ID}') debe comenzar con 'demo-' para aislar el emulador.`
  );
}
const DATABASE_ID =
  process.env.NITA_FIRESTORE_DATABASE_ID || 'ai-studio-distribuidordedi-aff91045-91e1-4730-8049-ab5f53276b3f';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const FUNCTIONS_HOST = process.env.FUNCTIONS_EMULATOR_HOST || '127.0.0.1:5001';

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
process.env.NITA_USE_FIREBASE_EMULATORS = 'true';
process.env.NITA_EMULATOR_PROJECT_ID = PROJECT_ID;

// Mock browser globals for Node test execution
const mockStorage: Record<string, string> = {};
(globalThis as any).window = globalThis;
(globalThis as any).localStorage = {
  getItem: (k: string) => (k in mockStorage ? mockStorage[k] : null),
  setItem: (k: string, v: string) => {
    mockStorage[k] = String(v);
  },
  removeItem: (k: string) => {
    delete mockStorage[k];
  },
  clear: () => {
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
  },
};

function setMockOnline(online: boolean): void {
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: online },
    writable: true,
    configurable: true,
  });
}
setMockOnline(true);

const requireFromFunctions = createRequire(path.resolve(process.cwd(), 'functions/package.json'));
const { initializeApp: initializeAdminApp, deleteApp: deleteAdminApp } = requireFromFunctions(
  'firebase-admin/app'
) as {
  initializeApp(options?: { projectId?: string }, name?: string): { name: string };
  deleteApp(app: { name: string }): Promise<void>;
};
const { getAuth: getAdminAuth } = requireFromFunctions('firebase-admin/auth') as {
  getAuth(app: { name: string }): {
    createCustomToken(uid: string, claims?: Record<string, unknown>): Promise<string>;
    getUser(uid: string): Promise<{ uid: string; tokensValidAfterTime?: string }>;
  };
};
const { getFirestore: getAdminFirestore } = requireFromFunctions('firebase-admin/firestore') as {
  getFirestore(app: { name: string }, databaseId?: string): {
    collection(name: string): {
      doc(id: string): {
        get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
        set(data: Record<string, unknown>, opts?: { merge?: boolean }): Promise<unknown>;
        delete(): Promise<unknown>;
        collection(sub: string): {
          doc(subId: string): {
            get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
            set(data: Record<string, unknown>, opts?: { merge?: boolean }): Promise<unknown>;
            delete(): Promise<unknown>;
          };
        };
      };
      get(): Promise<{ docs: Array<{ id: string }> }>;
    };
  };
};

function parseHostPort(raw: string): { host: string; port: number } {
  const [host, portStr] = raw.split(':');
  return { host: host || '127.0.0.1', port: Number(portStr) };
}

function legacySha256Digest(password: string, salt: string): string {
  return crypto.createHash('sha256').update(Buffer.from(`${salt}:${password}`, 'utf8')).digest('hex');
}

function legacyJsFallbackDigest(password: string, salt: string): string {
  const input = `${salt}:${password}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return `h_${Math.abs(hash).toString(16)}_${salt}`;
}

async function clearEmulators(): Promise<void> {
  const fsRes = await fetch(
    `http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`,
    { method: 'DELETE' }
  );
  if (!fsRes.ok && fsRes.status !== 404) {
    throw new Error(`No se pudo limpiar Firestore Emulator (${fsRes.status})`);
  }

  const authRes = await fetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`, {
    method: 'DELETE',
  });
  if (!authRes.ok && authRes.status !== 404) {
    throw new Error(`No se pudo limpiar Auth Emulator (${authRes.status})`);
  }
}

describe('NITA Etapa 2A.2 — Integración Completa Frontend + Firebase Emulators (A–O)', () => {
  let adminApp: { name: string };
  let adminDb: ReturnType<typeof getAdminFirestore>;
  let adminAuth: ReturnType<typeof getAdminAuth>;

  let secondaryApp: FirebaseApp;
  let secondaryAuth: ClientAuth;
  let secondaryDb: ClientFirestore;
  let secondaryFunctions: ClientFunctions;

  // Dynamic imports so NITA_USE_FIREBASE_EMULATORS / NITA_EMULATOR_PROJECT_ID apply cleanly
  let fbLib: typeof import('../src/lib/firebase.ts');
  let authAccountSvc: typeof import('../src/services/authAccountService.ts');
  let budgetSyncSvc: typeof import('../src/services/budgetSyncService.ts');
  let storageUtils: typeof import('../src/utils/storage.ts');

  before(async () => {
    await clearEmulators();

    fbLib = await import('../src/lib/firebase.ts');
    authAccountSvc = await import('../src/services/authAccountService.ts');
    budgetSyncSvc = await import('../src/services/budgetSyncService.ts');
    storageUtils = await import('../src/utils/storage.ts');

    adminApp = initializeAdminApp({ projectId: PROJECT_ID }, `nita-2a2-admin-${Date.now()}`);
    adminDb = getAdminFirestore(adminApp, DATABASE_ID);
    adminAuth = getAdminAuth(adminApp);

    const fsTarget = parseHostPort(FIRESTORE_HOST);
    const fnTarget = parseHostPort(FUNCTIONS_HOST);
    secondaryApp = initializeClientApp(
      {
        projectId: PROJECT_ID,
        apiKey: 'demo-api-key',
        authDomain: `${PROJECT_ID}.firebaseapp.com`,
      },
      `nita-2a2-secondary-${Date.now()}`
    );
    secondaryAuth = getClientAuth(secondaryApp);
    connectAuthEmulator(secondaryAuth, `http://${AUTH_HOST}`, { disableWarnings: true });
    secondaryDb = getClientFirestore(secondaryApp, DATABASE_ID);
    connectFirestoreEmulator(secondaryDb, fsTarget.host, fsTarget.port);
    secondaryFunctions = getClientFunctions(secondaryApp, 'us-central1');
    connectFunctionsEmulator(secondaryFunctions, fnTarget.host, fnTarget.port);
  });

  after(async () => {
    await fbLib?.logOut().catch(() => {});
    await clientSignOut(secondaryAuth).catch(() => {});
    await deleteClientApp(secondaryApp).catch(() => {});
    await deleteAdminApp(adminApp).catch(() => {});
  });

  beforeEach(async () => {
    setMockOnline(true);
    localStorage.clear();
    await fbLib.logOut().catch(() => {});
    await clientSignOut(secondaryAuth).catch(() => {});
    // Delete rate limits between tests so rate-limit state starts clean with valid RateLimitDoc schema
    const rlSnap = await adminDb.collection('authRateLimits').get();
    await Promise.all(
      rlSnap.docs.map((d) => adminDb.collection('authRateLimits').doc(d.id).delete())
    );
  });

  test('A & B & C. Registro nuevo usr_*, rechazo duplicado, login moderno con Custom Token y claims válidos', async () => {
    // A. Registro nuevo
    const registered = await authAccountSvc.registerUserAccount('MartinGomez', 'ClaveSegura2026!');
    assert.equal(registered.uid, 'usr_martingomez');
    assert.equal(registered.displayName, 'MartinGomez');
    assert.equal(registered.sessionEpoch, 1);
    assert.equal(fbLib.auth.currentUser?.uid, 'usr_martingomez');

    const tokenRes = await fbLib.auth.currentUser!.getIdTokenResult(true);
    assert.equal(tokenRes.claims.provider, 'nita_password');
    assert.equal(tokenRes.claims.sessionEpoch, 1);

    // No debe crear documento en /accounts/{usernameLower} desde cliente ni guardar secretos en localStorage
    const legacyAccountSnap = await adminDb.collection('accounts').doc('martingomez').get();
    assert.equal(legacyAccountSnap.exists, false, 'Registro moderno no debe crear /accounts/{usernameLower}');

    const rawSession = localStorage.getItem('nita_active_user_session') || '';
    assert.equal(rawSession.includes('ClaveSegura'), false);
    assert.equal(rawSession.includes('passwordHash'), false);
    assert.equal(rawSession.includes('customToken'), false);
    assert.equal(localStorage.getItem('nita_registered_accounts'), null);

    // Debe poder escribir en Firestore en su propia ruta /users/{uid}/months/*
    await budgetSyncSvc.saveMonthToFirestore('usr_martingomez', '2026-05', 2026, 4, {
      ...storageUtils.createFreshMonthData(),
      income: 450000,
    });
    const monthSnap = await adminDb.collection('users').doc('usr_martingomez').collection('months').doc('2026-05').get();
    assert.equal(monthSnap.exists, true);
    assert.equal(monthSnap.data()?.income, 450000);

    // B. Registro duplicado case-insensitive debe ser rechazado por backend sin romper la sesión vigente
    await assert.rejects(
      async () => authAccountSvc.registerUserAccount('martingomez', 'OtraClave999!'),
      (err: unknown) => {
        assert.ok(err instanceof authAccountSvc.AuthFlowError);
        assert.match(err.message, /ya está en uso/i);
        return true;
      }
    );

    // C. Cerrar sesión y volver a iniciar con credenciales modernas
    await fbLib.logOut();
    authAccountSvc.saveActiveSession(null);
    assert.equal(fbLib.auth.currentUser, null);

    const signedIn = await authAccountSvc.signInUserAccount('MARTINGOMEZ', 'ClaveSegura2026!');
    assert.equal(signedIn.uid, 'usr_martingomez');
    assert.equal(signedIn.displayName, 'MartinGomez');
    const reSignedInUser = fbLib.auth.currentUser as { uid: string; getIdTokenResult: (force?: boolean) => Promise<{ claims: Record<string, unknown> }> } | null;
    assert.equal(reSignedInUser?.uid, 'usr_martingomez');
    const loginClaims = (await reSignedInUser!.getIdTokenResult(true)).claims;
    assert.equal(loginClaims.provider, 'nita_password');
    assert.equal(loginClaims.sessionEpoch, 1);
  });

  test('D & E. Login heredado con migración perezosa (SHA-256 y fallback h_...) conservando UID usr_* y datos financieros', async () => {
    // D. Seed legacy SHA-256 account + financial data
    const shaSalt = 'sha_salt_001';
    const shaPass = 'ClaveLegacySha256!';
    await adminDb.collection('accounts').doc('usuario_sha').set({
      userId: 'usr_usuario_sha',
      username: 'Usuario_Sha',
      usernameLower: 'usuario_sha',
      salt: shaSalt,
      passwordHash: legacySha256Digest(shaPass, shaSalt),
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    });
    await adminDb.collection('users').doc('usr_usuario_sha').collection('months').doc('2026-04').set({
      userId: 'usr_usuario_sha',
      monthKey: '2026-04',
      year: 2026,
      month: 3,
      income: 320000,
      savingsRate: 15,
      extraDaysPosition: 'end',
      categories: [],
      fixedExpenses: [{ id: 'f_sha', name: 'Alquiler Legacy', amount: 120000, category: 'housing', isPaid: true }],
      variableExpenses: [],
      updatedAt: '2026-04-01T00:00:00.000Z',
    });

    const loggedSha = await authAccountSvc.signInUserAccount('usuario_sha', shaPass);
    assert.equal(loggedSha.uid, 'usr_usuario_sha');
    assert.equal(fbLib.auth.currentUser?.uid, 'usr_usuario_sha');

    const migratedSecret = await adminDb.collection('accountSecrets').doc('usuario_sha').get();
    assert.equal(migratedSecret.exists, true);
    assert.equal(migratedSecret.data()?.kdfVersion, 'scrypt_v1');
    assert.equal(migratedSecret.data()?.migratedFrom, 'sha256');

    const preservedMonth = await getDoc(doc(fbLib.db, 'users', 'usr_usuario_sha', 'months', '2026-04'));
    assert.equal(preservedMonth.exists(), true);
    assert.equal(preservedMonth.data()?.income, 320000);

    // E. Seed legacy fallback h_... account + financial data
    await fbLib.logOut();
    const fbSalt = 'fb_salt_002';
    const fbPass = 'ClaveFallback2026!';
    await adminDb.collection('accounts').doc('usuario_fallback').set({
      userId: 'usr_usuario_fallback',
      username: 'usuario_fallback',
      usernameLower: 'usuario_fallback',
      salt: fbSalt,
      passwordHash: legacyJsFallbackDigest(fbPass, fbSalt),
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    });
    await adminDb.collection('users').doc('usr_usuario_fallback').collection('months').doc('2026-03').set({
      userId: 'usr_usuario_fallback',
      monthKey: '2026-03',
      year: 2026,
      month: 2,
      income: 195000,
      savingsRate: 10,
      extraDaysPosition: 'end',
      categories: [],
      fixedExpenses: [],
      variableExpenses: [],
      updatedAt: '2026-03-01T00:00:00.000Z',
    });

    const loggedFb = await authAccountSvc.signInUserAccount('usuario_fallback', fbPass);
    assert.equal(loggedFb.uid, 'usr_usuario_fallback');
    assert.equal(fbLib.auth.currentUser?.uid, 'usr_usuario_fallback');

    const migratedFbSecret = await adminDb.collection('accountSecrets').doc('usuario_fallback').get();
    assert.equal(migratedFbSecret.data()?.migratedFrom, 'legacy_fallback');

    const preservedFbMonth = await getDoc(doc(fbLib.db, 'users', 'usr_usuario_fallback', 'months', '2026-03'));
    assert.equal(preservedFbMonth.data()?.income, 195000);
  });

  test('F. Credenciales incorrectas: rechazo consistente sin sesión ni sincronización', async () => {
    await authAccountSvc.registerUserAccount('CarlosTest', 'ClaveValida123!');
    await fbLib.logOut();
    authAccountSvc.saveActiveSession(null);

    await assert.rejects(
      async () => authAccountSvc.signInUserAccount('CarlosTest', 'ClaveEquivocada!'),
      /incorrectos/i
    );
    await assert.rejects(
      async () => authAccountSvc.signInUserAccount('NoExiste999', 'CualquierClave!'),
      /incorrectos/i
    );

    assert.equal(fbLib.auth.currentUser, null);
    assert.equal(authAccountSvc.getActiveSession(), null);
    assert.throws(() => budgetSyncSvc.verifyUserAuthorization('usr_carlostest'), /no hay sesión activa/i);
  });

  test('G & O. Persistencia de sesión Custom Token y compatibilidad total con rutas y operaciones Firestore', async () => {
    const user = await authAccountSvc.registerUserAccount('PersistenciaUser', 'ClavePersist2026!');
    const uid = user.uid;

    // Simular cliente con token emitido validado
    await fbLib.ensureAuthPersistence();
    assert.equal(fbLib.auth.currentUser?.uid, uid);

    // Operaciones completas de Firestore (perfil, categorías globales, meses)
    await budgetSyncSvc.saveUserPreferencesToFirestore(uid, { currency: 'USD', language: 'es' });
    await budgetSyncSvc.saveGlobalCategoriesToFirestore(uid, [
      { id: 'cat_custom', label: 'Ahorro', color: '#10b981', isCustom: true },
    ]);
    await budgetSyncSvc.saveMonthToFirestore(uid, '2026-06', 2026, 5, {
      ...storageUtils.createFreshMonthData(),
      income: 780000,
    });

    const profileSnap = await adminDb.collection('users').doc(uid).get();
    assert.equal(profileSnap.data()?.currency, 'USD');
    const catSnap = await adminDb.collection('users').doc(uid).collection('categories').doc('global').get();
    assert.equal((catSnap.data()?.categories as Array<{ id: string }>)?.[0]?.id, 'cat_custom');
    const monthSnap = await adminDb.collection('users').doc(uid).collection('months').doc('2026-06').get();
    assert.equal(monthSnap.data()?.income, 780000);
  });

  test('H. Usuario Google: continúa operando sin regresión y rechaza cambio de contraseña NITA', async () => {
    const googleUid = 'google_user_uid_001';
    const googleCustomToken = await adminAuth.createCustomToken(googleUid);
    await fbLib.signInWithFirebaseCustomToken(googleCustomToken);

    assert.equal(fbLib.auth.currentUser?.uid, googleUid);
    assert.doesNotThrow(() => budgetSyncSvc.verifyUserAuthorization(googleUid));

    await budgetSyncSvc.saveMonthToFirestore(googleUid, '2026-07', 2026, 6, {
      ...storageUtils.createFreshMonthData(),
      income: 990000,
    });

    const monthSnap = await adminDb.collection('users').doc(googleUid).collection('months').doc('2026-07').get();
    assert.equal(monthSnap.data()?.income, 990000);

    // Cuenta Google no puede usar changeUserPassword de cuentas usr_*
    await assert.rejects(
      async () => authAccountSvc.changeUserPassword('pass123', 'pass456'),
      (err: unknown) => err instanceof authAccountSvc.AuthFlowError
    );
  });

  test('I & J. Aislamiento estricto entre Cuenta A, Cuenta B, Google, Invitado, cierre de sesión y cambio de cuenta', async () => {
    // 1. Invitado guarda datos locales
    storageUtils.saveBudgetState(
      {
        month: 4,
        year: 2026,
        currency: 'ARS',
        monthsData: {
          '2026-05': {
            ...storageUtils.createFreshMonthData(),
            income: 111111,
          },
        },
      },
      null,
      true
    );

    // 2. Cuenta A registra e inicia sesión
    const userA = await authAccountSvc.registerUserAccount('CuentaA', 'ClaveCuentaA!');
    storageUtils.saveBudgetState(
      {
        month: 4,
        year: 2026,
        currency: 'USD',
        monthsData: {
          '2026-05': {
            ...storageUtils.createFreshMonthData(),
            income: 222222,
          },
        },
      },
      userA.uid,
      false
    );
    storageUtils.enqueuePendingMonth(
      userA.uid,
      '2026-05',
      2026,
      4,
      { ...storageUtils.createFreshMonthData(), income: 222222 },
      storageUtils.generateOpId()
    );

    // Cuenta A no puede autorizar escrituras ni procesar cola de Cuenta B
    assert.throws(() => budgetSyncSvc.verifyUserAuthorization('usr_cuentab'), /no coincide/i);
    const recoveredA = storageUtils.recoverLocalDataSources(userA.uid);
    assert.equal(recoveredA['2026-05']?.income, 222222, 'Cuenta A no debe heredar datos del invitado (111111)');

    // 3. Cierre de sesión limpia sesión activa pero conserva datos locales de A
    await fbLib.logOut();
    authAccountSvc.saveActiveSession(null);
    assert.equal(fbLib.auth.currentUser, null);
    assert.throws(() => budgetSyncSvc.verifyUserAuthorization(userA.uid), /no hay sesión activa/i);
    assert.equal(storageUtils.loadBudgetState(userA.uid, false).monthsData['2026-05']?.income, 222222);

    // 4. Cuenta B inicia sesión: aislamiento absoluto respecto a A e Invitado
    const userB = await authAccountSvc.registerUserAccount('CuentaB', 'ClaveCuentaB!');
    const loadedB = storageUtils.loadBudgetState(userB.uid, false);
    assert.notEqual(loadedB.monthsData['2026-05']?.income, 222222);
    assert.notEqual(loadedB.monthsData['2026-05']?.income, 111111);
    assert.equal(storageUtils.getPendingSyncQueue(userB.uid).length, 0);
    assert.equal(Object.keys(storageUtils.recoverLocalDataSources(userB.uid)).length, 0);

    // Cola cruzada: ejecutar processPendingSyncQueue(userB.uid) mientras hay ítem de userA en nita_pending_sync_queue_v1
    const crossQueueRes = await budgetSyncSvc.processPendingSyncQueue(userB.uid);
    assert.equal(crossQueueRes.syncedCount, 0);
    assert.equal(crossQueueRes.remainingCount, 0);
    assert.equal(storageUtils.getPendingSyncQueue(userA.uid).length, 1, 'La cola pendiente de A no debe procesarse bajo B');
    const aQueuedLeakDoc = await adminDb.collection('users').doc(userA.uid).collection('months').doc('2026-05').get();
    assert.equal(aQueuedLeakDoc.exists, false, 'La operación encolada de A no debe escribirse en Firestore cuando B procesa su cola');

    // Guardar datos propios de B sin afectar a A
    await budgetSyncSvc.saveMonthToFirestore(userB.uid, '2026-08', 2026, 7, {
      ...storageUtils.createFreshMonthData(),
      income: 333333,
    });
    const bDoc = await adminDb.collection('users').doc(userB.uid).collection('months').doc('2026-08').get();
    assert.equal(bDoc.data()?.income, 333333);
    const aLeakDoc = await adminDb.collection('users').doc(userA.uid).collection('months').doc('2026-08').get();
    assert.equal(aLeakDoc.exists, false);
  });

  test('K & L. Cambio de contraseña actualiza epoch en dispositivo actual y revoca sesión en dispositivo secundario sin borrar datos locales', async () => {
    // Dispositivo 1 registra cuenta
    const reg = await authAccountSvc.registerUserAccount('MultideviceUser', 'ClaveInicial2026!');
    const uid = reg.uid;

    // Guardar datos financieros locales del usuario en dispositivo
    storageUtils.saveBudgetState(
      {
        month: 4,
        year: 2026,
        currency: 'ARS',
        monthsData: {
          '2026-05': {
            ...storageUtils.createFreshMonthData(),
            income: 550000,
          },
        },
      },
      uid,
      false
    );

    // Dispositivo 2 inicia sesión con la misma cuenta (sessionEpoch = 1)
    const secondarySession = await authAccountSvc.signInUserAccount('MultideviceUser', 'ClaveInicial2026!', {
      authInstance: secondaryAuth,
      functionsInstance: secondaryFunctions,
    });
    assert.equal(secondarySession.sessionEpoch, 1);
    assert.equal(secondaryAuth.currentUser?.uid, uid);

    // K. Dispositivo 1 cambia contraseña -> época sube a 2 y tokens previos se revocan
    const changed = await authAccountSvc.changeUserPassword('ClaveInicial2026!', 'ClaveNueva2026!');
    assert.equal(changed.uid, uid);
    assert.equal(changed.sessionEpoch, 2);

    const primaryClaims = (await fbLib.auth.currentUser!.getIdTokenResult(true)).claims;
    assert.equal(primaryClaims.provider, 'nita_password');
    assert.equal(primaryClaims.sessionEpoch, 2);

    // Dispositivo 1 sigue sincronizando normalmente tras cambio de contraseña
    await budgetSyncSvc.saveMonthToFirestore(uid, '2026-09', 2026, 8, {
      ...storageUtils.createFreshMonthData(),
      income: 600000,
    });

    // Contraseña vieja rechazada; nueva contraseña aceptada
    await assert.rejects(
      async () =>
        authAccountSvc.signInUserAccount('MultideviceUser', 'ClaveInicial2026!', {
          authInstance: secondaryAuth,
          functionsInstance: secondaryFunctions,
        }),
      /incorrectos/i
    );

    // L. Sesión previa del Dispositivo 2 quedó revocada tras revokeRefreshTokens + cambio de época
    // Primero validamos con un segundo cliente cuyo token estaba activo antes de re-logear
    const user2BeforeRevoke = await authAccountSvc.registerUserAccount('RevokeCheckUser', 'ClaveOne123!');
    await authAccountSvc.signInUserAccount('RevokeCheckUser', 'ClaveOne123!', {
      authInstance: secondaryAuth,
      functionsInstance: secondaryFunctions,
    });
    await authAccountSvc.changeUserPassword('ClaveOne123!', 'ClaveTwo456!');

    // Firestore Rules debe rechazar inmediatamente el token cacheado en secondaryDb (sessionEpoch 1 < minSessionEpoch 2)
    await assert.rejects(
      async () => getDoc(doc(secondaryDb, 'users', user2BeforeRevoke.uid)),
      (err: unknown) => {
        const code = (err as { code?: string })?.code || '';
        const msg = err instanceof Error ? err.message : String(err);
        return code === 'permission-denied' || /permission-denied|PERMISSION_DENIED/i.test(msg);
      }
    );

    // En secondaryAuth, intentar refrescar token o cambiar contraseña debe fallar indicando revocación
    await assert.rejects(
      async () =>
        authAccountSvc.changeUserPassword('ClaveOne123!', 'ClaveThree789!', {
          authInstance: secondaryAuth,
          functionsInstance: secondaryFunctions,
        }),
      (err: unknown) => {
        assert.ok(err instanceof authAccountSvc.AuthFlowError);
        assert.equal(err.isSessionRevoked, true);
        return true;
      }
    );

    // Los datos financieros locales previos del usuario permanecen 100% intactos tras la revocación
    assert.equal(storageUtils.loadBudgetState(uid, false).monthsData['2026-05']?.income, 550000);
    assert.ok(user2BeforeRevoke.uid === 'usr_revokecheckuser');
  });

  test('M. Reapertura offline con sesión Firebase persistida y sincronización automática al reconectar', async () => {
    const user = await authAccountSvc.registerUserAccount('OfflineSyncUser', 'ClaveOffline2026!');
    const uid = user.uid;

    // Encolar cambio mientras está offline
    setMockOnline(false);
    storageUtils.enqueuePendingMonth(
      uid,
      '2026-10',
      2026,
      9,
      { ...storageUtils.createFreshMonthData(), income: 410000 },
      storageUtils.generateOpId()
    );

    // Estando offline, processPendingSyncQueue no debe intentar subir ni perder la cola
    const offlineQueueRes = await budgetSyncSvc.processPendingSyncQueue(uid);
    assert.equal(offlineQueueRes.syncedCount, 0);
    assert.equal(offlineQueueRes.remainingCount, 1);

    // Al volver la red con sesión Firebase persistida válida, sincroniza sin pedir login nuevamente
    setMockOnline(true);
    const tokenStillValid = await fbLib.auth.currentUser!.getIdTokenResult(true);
    assert.equal(tokenStillValid.claims.provider, 'nita_password');

    const onlineQueueRes = await budgetSyncSvc.processPendingSyncQueue(uid);
    assert.equal(onlineQueueRes.syncedCount, 1);
    assert.equal(onlineQueueRes.remainingCount, 0);

    const syncedDoc = await adminDb.collection('users').doc(uid).collection('months').doc('2026-10').get();
    assert.equal(syncedDoc.data()?.income, 410000);
  });

  test('N. Errores de red o backend no generan sesión falsa ni activan sincronización', async () => {
    const unavailableDeps = {
      callableInvoker: async () => {
        throw Object.assign(new Error('Service unavailable'), { code: 'functions/unavailable' });
      },
    };

    await assert.rejects(
      async () => authAccountSvc.signInUserAccount('Alguien', 'Clave123456', unavailableDeps),
      (err: unknown) => {
        assert.ok(err instanceof authAccountSvc.AuthFlowError);
        assert.equal(err.isOfflineOrNetwork, true);
        return true;
      }
    );

    assert.equal(fbLib.auth.currentUser, null);
    assert.equal(authAccountSvc.getActiveSession(), null);
    assert.throws(() => budgetSyncSvc.verifyUserAuthorization('usr_alguien'), /no hay sesión activa/i);
  });
});
