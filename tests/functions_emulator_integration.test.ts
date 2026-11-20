import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { initializeApp as initializeClientApp, deleteApp as deleteClientApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth as getClientAuth,
  connectAuthEmulator,
  signInWithCustomToken,
  signOut as clientSignOut,
  type Auth as ClientAuth,
} from 'firebase/auth';
import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable,
  type Functions,
} from 'firebase/functions';
import { ScryptConcurrencyLimiter } from '../functions/src/crypto.ts';
import {
  AccountServiceError,
  changePassword,
  registerPasswordAccount,
  signInWithPasswordCustomToken,
} from '../functions/src/accountService.ts';
import { enforceRateLimitBeforeKdf, RateLimitExceededError } from '../functions/src/rateLimit.ts';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'demo-nita-etapa2a1';
if (!PROJECT_ID.startsWith('demo-')) {
  throw new Error(
    `[Security Guard Error] PROJECT_ID ('${PROJECT_ID}') debe comenzar con 'demo-' para garantizar aislamiento total del emulador.`
  );
}

const DATABASE_ID =
  process.env.NITA_FIRESTORE_DATABASE_ID || 'ai-studio-distribuidordedi-aff91045-91e1-4730-8049-ab5f53276b3f';
const TEST_PEPPER = process.env.NITA_HASH_PEPPER || 'nita-test-emulator-pepper-0123456789';

const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const FUNCTIONS_HOST = process.env.FUNCTIONS_EMULATOR_HOST || '127.0.0.1:5001';

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;

type DocRefLike = {
  get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
  set(data: Record<string, unknown>, options?: { merge?: boolean }): Promise<unknown>;
  update(data: Record<string, unknown>): Promise<unknown>;
  delete(): Promise<unknown>;
};

type AdminDb = Parameters<typeof signInWithPasswordCustomToken>[0]['db'] & {
  collection(path: string): {
    doc(id: string): DocRefLike & {
      collection(subPath: string): {
        doc(subId: string): DocRefLike;
      };
    };
    get(): Promise<{ size: number; docs: Array<{ id: string; data(): Record<string, unknown> }> }>;
  };
};

type AdminAuth = Parameters<typeof signInWithPasswordCustomToken>[0]['auth'] & {
  getUser(uid: string): Promise<{ uid: string; tokensValidAfterTime?: string }>;
  verifyIdToken(idToken: string, checkRevoked?: boolean): Promise<Record<string, unknown>>;
};

interface AdminAppLike {
  name: string;
}

class SpyScryptLimiter extends ScryptConcurrencyLimiter {
  executions = 0;

  override async run<T>(task: () => Promise<T>): Promise<T> {
    this.executions += 1;
    return super.run(task);
  }
}

const requireFromFunctions = createRequire(path.resolve(process.cwd(), 'functions/package.json'));
const { initializeApp: initializeAdminApp, deleteApp: deleteAdminApp } = requireFromFunctions(
  'firebase-admin/app'
) as {
  initializeApp(options?: { projectId?: string }, name?: string): AdminAppLike;
  deleteApp(app: AdminAppLike): Promise<void>;
};
const { getAuth: getAdminAuth } = requireFromFunctions('firebase-admin/auth') as {
  getAuth(app: AdminAppLike): AdminAuth;
};
const { getFirestore: getAdminFirestore } = requireFromFunctions('firebase-admin/firestore') as {
  getFirestore(app: AdminAppLike, databaseId?: string): AdminDb;
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

function extractCallableErrorCode(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = String((err as { code: unknown }).code);
    return code.replace(/^functions\//, '');
  }
  return 'unknown';
}

async function waitUntilUnixSecondExceeds(referenceUnixSec: number, safetyMarginMs = 150): Promise<void> {
  const targetMs = (referenceUnixSec + 1) * 1000 + safetyMarginMs;
  while (Date.now() < targetMs) {
    const remainingMs = targetMs - Date.now();
    await new Promise((resolve) => setTimeout(resolve, Math.max(remainingMs, 10)));
  }
}

describe('NITA Backend Etapa 2A.1.1 — Pruebas de Integración Reales (Functions + Auth + Firestore Emulators)', () => {
  let adminApp: AdminAppLike;
  let adminDb: AdminDb;
  let adminAuth: AdminAuth;

  let clientApp: FirebaseApp;
  let clientAuth: ClientAuth;
  let clientFunctions: Functions;

  let secondaryClientApp: FirebaseApp;
  let secondaryClientAuth: ClientAuth;
  let secondaryClientFunctions: Functions;

  async function clearRateLimitDocs(): Promise<void> {
    const snap = await adminDb.collection('authRateLimits').get();
    await Promise.all(snap.docs.map((doc) => adminDb.collection('authRateLimits').doc(doc.id).delete()));
  }

  before(async () => {
    await clearEmulators();

    adminApp = initializeAdminApp({ projectId: PROJECT_ID }, `nita-admin-${Date.now()}`);
    adminDb = getAdminFirestore(adminApp, DATABASE_ID);
    adminAuth = getAdminAuth(adminApp);

    const fnHostPort = parseHostPort(FUNCTIONS_HOST);

    clientApp = initializeClientApp(
      {
        projectId: PROJECT_ID,
        apiKey: 'demo-api-key',
        authDomain: `${PROJECT_ID}.firebaseapp.com`,
      },
      `nita-client-${Date.now()}`
    );
    clientAuth = getClientAuth(clientApp);
    connectAuthEmulator(clientAuth, `http://${AUTH_HOST}`, { disableWarnings: true });
    clientFunctions = getFunctions(clientApp, 'us-central1');
    connectFunctionsEmulator(clientFunctions, fnHostPort.host, fnHostPort.port);

    secondaryClientApp = initializeClientApp(
      {
        projectId: PROJECT_ID,
        apiKey: 'demo-api-key',
        authDomain: `${PROJECT_ID}.firebaseapp.com`,
      },
      `nita-client-2-${Date.now()}`
    );
    secondaryClientAuth = getClientAuth(secondaryClientApp);
    connectAuthEmulator(secondaryClientAuth, `http://${AUTH_HOST}`, { disableWarnings: true });
    secondaryClientFunctions = getFunctions(secondaryClientApp, 'us-central1');
    connectFunctionsEmulator(secondaryClientFunctions, fnHostPort.host, fnHostPort.port);
  });

  after(async () => {
    await deleteClientApp(clientApp).catch(() => {});
    await deleteClientApp(secondaryClientApp).catch(() => {});
    await deleteAdminApp(adminApp).catch(() => {});
  });

  test('1. Registro de cuenta nueva en Functions + Auth + Firestore Emulators (scrypt_v1 y Custom Token)', async () => {
    const registerFn = httpsCallable<
      { username: string; password: string },
      { customToken: string; uid: string; displayName: string; sessionEpoch: number }
    >(clientFunctions, 'registerPasswordAccountFn');

    const response = await registerFn({ username: 'Ana.Garcia', password: 'ClaveSegura#2026' });
    const data = response.data;

    assert.equal(data.uid, 'usr_ana_garcia');
    assert.equal(data.displayName, 'Ana.Garcia');
    assert.equal(data.sessionEpoch, 1);
    assert.ok(typeof data.customToken === 'string' && data.customToken.length > 20);

    const cred = await signInWithCustomToken(clientAuth, data.customToken);
    assert.equal(cred.user.uid, 'usr_ana_garcia');
    const tokenResult = await cred.user.getIdTokenResult();
    assert.equal(tokenResult.claims.provider, 'nita_password');
    assert.equal(tokenResult.claims.sessionEpoch, 1);

    const secretSnap = await adminDb.collection('accountSecrets').doc('ana.garcia').get();
    assert.equal(secretSnap.exists, true);
    const secretData = secretSnap.data()!;
    assert.equal(secretData.userId, 'usr_ana_garcia');
    assert.equal(secretData.kdfVersion, 'scrypt_v1');
    assert.deepEqual(secretData.kdfParams, { N: 32768, r: 8, p: 1, keylen: 64 });
    assert.match(String(secretData.salt), /^[a-f0-9]{32}$/);
    assert.ok(String(secretData.passwordHash).startsWith('scrypt_v1$N=32768,r=8,p=1$'));
    assert.equal(secretData.sessionEpoch, 1);

    const securitySnap = await adminDb.collection('userSecurity').doc('usr_ana_garcia').get();
    assert.equal(securitySnap.exists, true);
    assert.equal(securitySnap.data()!.minSessionEpoch, 1);
    assert.equal(securitySnap.data()!.usernameLower, 'ana.garcia');

    const userProfileSnap = await adminDb.collection('users').doc('usr_ana_garcia').get();
    assert.equal(userProfileSnap.exists, true);
    assert.equal(userProfileSnap.data()!.displayName, 'Ana.Garcia');

    const legacySnap = await adminDb.collection('accounts').doc('ana.garcia').get();
    assert.equal(legacySnap.exists, false);

    await clientSignOut(clientAuth);
  });

  test('2. Detección de duplicados (case-insensitive en /accountSecrets y en /accounts heredado)', async () => {
    const registerFn = httpsCallable(clientFunctions, 'registerPasswordAccountFn');

    await assert.rejects(
      () => registerFn({ username: 'ANA.GARCIA', password: 'OtraClave#2026' }),
      (err) => extractCallableErrorCode(err) === 'already-exists'
    );

    await adminDb.collection('accounts').doc('usuario_viejo').set({
      userId: 'usr_usuario_viejo',
      username: 'Usuario_Viejo',
      usernameLower: 'usuario_viejo',
      salt: '11223344556677889900aabbccddeeff',
      passwordHash: legacySha256Digest('ClaveVieja123', '11223344556677889900aabbccddeeff'),
    });

    await assert.rejects(
      () => registerFn({ username: 'USUARIO_VIEJO', password: 'ClaveNueva#2026' }),
      (err) => extractCallableErrorCode(err) === 'already-exists'
    );
  });

  test('3. Cuentas con colisión al sanitizar (juan.perez vs juan-perez y legacy maria.lopez vs maria-lopez) quedan aisladas', async () => {
    const registerFn = httpsCallable<
      { username: string; password: string },
      { customToken: string; uid: string; displayName: string; sessionEpoch: number }
    >(clientFunctions, 'registerPasswordAccountFn');

    const res1 = await registerFn({ username: 'juan.perez', password: 'ClaveJuan1#' });
    assert.equal(res1.data.uid, 'usr_juan_perez');

    const financialRef = adminDb.collection('users').doc(res1.data.uid).collection('months').doc('2026-04');
    const expectedMonthPayload = {
      userId: res1.data.uid,
      monthKey: '2026-04',
      income: 450000,
      fixedExpenses: [{ id: 'f1', name: 'Alquiler', amount: 180000, isPaid: false, dueDate: 10 }],
    };
    await financialRef.set(expectedMonthPayload);

    const res2 = await registerFn({ username: 'juan-perez', password: 'ClaveJuan2#' });
    assert.notEqual(res2.data.uid, res1.data.uid);
    assert.ok(res2.data.uid.startsWith('usr_juan_perez_'));

    const financialAfter = await financialRef.get();
    assert.deepEqual(financialAfter.data(), expectedMonthPayload);

    await adminDb.collection('accounts').doc('maria.lopez').set({
      userId: 'usr_maria_lopez',
      username: 'maria.lopez',
      usernameLower: 'maria.lopez',
      salt: 'aaaabbbbccccddddeeeeffff00001111',
      passwordHash: legacySha256Digest('MariaLegacy1!', 'aaaabbbbccccddddeeeeffff00001111'),
    });

    const resMariaDash = await registerFn({ username: 'maria-lopez', password: 'MariaNueva1!' });
    assert.notEqual(resMariaDash.data.uid, 'usr_maria_lopez');
    assert.ok(resMariaDash.data.uid.startsWith('usr_maria_lopez_'));
  });

  test('4. Login heredado SHA-256 -> migración perezosa segura, conserva usr_* y NO toca datos financieros', async () => {
    const legacyUid = 'usr_legacy_sha_hist_99';
    const salt = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
    const rawPassword = '  ClaveLegacy#2026  ';

    await adminDb.collection('accounts').doc('legacy_sha').set({
      userId: legacyUid,
      username: 'Legacy_Sha',
      usernameLower: 'legacy_sha',
      salt,
      passwordHash: legacySha256Digest(rawPassword, salt),
      createdAt: '2025-11-01T10:00:00.000Z',
    });

    const monthRef = adminDb.collection('users').doc(legacyUid).collection('months').doc('2026-03');
    const catsRef = adminDb.collection('users').doc(legacyUid).collection('categories').doc('global');
    const monthSnapshotBefore = {
      userId: legacyUid,
      monthKey: '2026-03',
      year: 2026,
      month: 2,
      income: 780000,
      savingsRate: 20,
      fixedExpenses: [{ id: 'fx-1', name: 'Internet', amount: 35000, isPaid: true, dueDate: 15 }],
      variableExpenses: [{ id: 'vx-1', date: '2026-03-04', description: 'Mercado', amount: 22000 }],
      updatedAt: '2026-03-10T12:00:00.000Z',
    };
    const catsSnapshotBefore = {
      userId: legacyUid,
      categories: [{ id: 'servicios', label: 'Servicios', color: '#2563eb' }],
      updatedAt: '2026-03-01T09:00:00.000Z',
    };

    await monthRef.set(monthSnapshotBefore);
    await catsRef.set(catsSnapshotBefore);

    const signInFn = httpsCallable<
      { username: string; password: string },
      { customToken: string; uid: string; displayName: string; sessionEpoch: number; migratedFrom?: string }
    >(clientFunctions, 'signInWithPasswordCustomTokenFn');

    const res = await signInFn({ username: 'legacy_sha', password: rawPassword });
    assert.equal(res.data.uid, legacyUid);
    assert.equal(res.data.displayName, 'Legacy_Sha');
    assert.equal(res.data.sessionEpoch, 1);
    assert.equal(res.data.migratedFrom, 'sha256');

    const authCred = await signInWithCustomToken(clientAuth, res.data.customToken);
    assert.equal(authCred.user.uid, legacyUid);
    await clientSignOut(clientAuth);

    const secretSnap = await adminDb.collection('accountSecrets').doc('legacy_sha').get();
    assert.equal(secretSnap.exists, true);
    assert.equal(secretSnap.data()!.userId, legacyUid);
    assert.equal(secretSnap.data()!.kdfVersion, 'scrypt_v1');
    assert.equal(secretSnap.data()!.migratedFrom, 'sha256');

    const legacyAfter = await adminDb.collection('accounts').doc('legacy_sha').get();
    assert.equal(legacyAfter.exists, true);
    assert.equal(legacyAfter.data()!.passwordHash, undefined);
    assert.equal(legacyAfter.data()!.salt, undefined);
    assert.equal(legacyAfter.data()!.migrated, true);

    const secSnap = await adminDb.collection('userSecurity').doc(legacyUid).get();
    assert.equal(secSnap.exists, true);
    assert.equal(secSnap.data()!.minSessionEpoch, 1);

    const monthAfter = await monthRef.get();
    const catsAfter = await catsRef.get();
    assert.deepEqual(monthAfter.data(), monthSnapshotBefore);
    assert.deepEqual(catsAfter.data(), catsSnapshotBefore);
  });

  test('5. Login heredado con fallback h_... (Unicode + emojis) -> migración perezosa y datos financieros intactos', async () => {
    const legacyUid = 'usr_legacy_fb_hist_77';
    const salt = 'f0e1d2c3b4a5968778695a4b3c2d1e0f';
    const rawPassword = 'MiClave🔒🚀ñ';

    await adminDb.collection('accounts').doc('legacy_fb').set({
      userId: legacyUid,
      username: 'Legacy_FB',
      usernameLower: 'legacy_fb',
      salt,
      passwordHash: legacyJsFallbackDigest(rawPassword, salt),
    });

    const monthRef = adminDb.collection('users').doc(legacyUid).collection('months').doc('2026-04');
    const monthBefore = {
      userId: legacyUid,
      monthKey: '2026-04',
      income: 510000,
      fixedExpenses: [{ id: 'fx-2', name: 'Luz', amount: 18500, isPaid: false, dueDate: 20 }],
    };
    await monthRef.set(monthBefore);

    const signInFn = httpsCallable<
      { username: string; password: string },
      { customToken: string; uid: string; displayName: string; sessionEpoch: number; migratedFrom?: string }
    >(clientFunctions, 'signInWithPasswordCustomTokenFn');

    const res = await signInFn({ username: 'Legacy_FB', password: rawPassword });
    assert.equal(res.data.uid, legacyUid);
    assert.equal(res.data.migratedFrom, 'legacy_fallback');

    const secretSnap = await adminDb.collection('accountSecrets').doc('legacy_fb').get();
    assert.equal(secretSnap.data()!.kdfVersion, 'scrypt_v1');
    assert.equal(secretSnap.data()!.migratedFrom, 'legacy_fallback');

    const legacyAfter = await adminDb.collection('accounts').doc('legacy_fb').get();
    assert.equal(legacyAfter.data()!.passwordHash, undefined);
    assert.equal(legacyAfter.data()!.salt, undefined);
    assert.equal(legacyAfter.data()!.migrated, true);

    assert.deepEqual((await monthRef.get()).data(), monthBefore);
  });

  test('6. Login posterior usando scrypt_v1 en cuentas ya migradas', async () => {
    const signInFn = httpsCallable<
      { username: string; password: string },
      { customToken: string; uid: string; displayName: string; sessionEpoch: number; migratedFrom?: string }
    >(clientFunctions, 'signInWithPasswordCustomTokenFn');

    const resSha = await signInFn({ username: 'legacy_sha', password: '  ClaveLegacy#2026  ' });
    assert.equal(resSha.data.uid, 'usr_legacy_sha_hist_99');
    assert.equal(resSha.data.migratedFrom, undefined);

    const resFb = await signInFn({ username: 'legacy_fb', password: 'MiClave🔒🚀ñ' });
    assert.equal(resFb.data.uid, 'usr_legacy_fb_hist_77');
    assert.equal(resFb.data.migratedFrom, undefined);
  });

  test('7. Contraseña incorrecta (en scrypt_v1 y en cuenta legacy sin migrar)', async () => {
    const signInFn = httpsCallable(clientFunctions, 'signInWithPasswordCustomTokenFn');

    await assert.rejects(
      () => signInFn({ username: 'ana.garcia', password: 'ClaveEquivocada!' }),
      (err) => extractCallableErrorCode(err) === 'unauthenticated'
    );

    const salt = '00112233445566778899aabbccddeeff';
    const expectedHash = legacySha256Digest('ClaveCorrecta99', salt);
    await adminDb.collection('accounts').doc('legacy_keep').set({
      userId: 'usr_legacy_keep',
      username: 'legacy_keep',
      usernameLower: 'legacy_keep',
      salt,
      passwordHash: expectedHash,
    });

    await assert.rejects(
      () => signInFn({ username: 'legacy_keep', password: 'ClaveIncorrecta99' }),
      (err) => extractCallableErrorCode(err) === 'unauthenticated'
    );

    assert.equal((await adminDb.collection('accountSecrets').doc('legacy_keep').get()).exists, false);
    assert.equal((await adminDb.collection('accounts').doc('legacy_keep').get()).data()!.passwordHash, expectedHash);
  });

  test('8. Hash malformado, salt ausente o datos incompletos -> falla cerrado sin emitir token', async () => {
    const signInFn = httpsCallable(clientFunctions, 'signInWithPasswordCustomTokenFn');

    await adminDb.collection('accounts').doc('bad_malformed').set({
      userId: 'usr_bad_malformed',
      username: 'bad_malformed',
      usernameLower: 'bad_malformed',
      salt: '0123456789abcdef0123456789abcdef',
      passwordHash: '$2b$10$hashInvalidoNoSoportado',
    });

    await assert.rejects(
      () => signInFn({ username: 'bad_malformed', password: 'cualquierPassword123' }),
      (err) => extractCallableErrorCode(err) === 'failed-precondition'
    );

    await adminDb.collection('accounts').doc('bad_nosalt').set({
      userId: 'usr_bad_nosalt',
      username: 'bad_nosalt',
      usernameLower: 'bad_nosalt',
      passwordHash: legacySha256Digest('Password123', 'abcd'),
    });

    await assert.rejects(
      () => signInFn({ username: 'bad_nosalt', password: 'Password123' }),
      (err) => extractCallableErrorCode(err) === 'failed-precondition'
    );
  });

  test('9. UID contradictorio en cuenta heredada -> aborta sin emitir token', async () => {
    const signInFn = httpsCallable(clientFunctions, 'signInWithPasswordCustomTokenFn');
    const salt = 'fedcba9876543210fedcba9876543210';

    await adminDb.collection('accounts').doc('uid_contradictorio').set({
      userId: 'usr_ana_garcia',
      username: 'uid_contradictorio',
      usernameLower: 'uid_contradictorio',
      salt,
      passwordHash: legacySha256Digest('ClaveConflict1', salt),
    });

    await assert.rejects(
      () => signInFn({ username: 'uid_contradictorio', password: 'ClaveConflict1' }),
      (err) => extractCallableErrorCode(err) === 'failed-precondition'
    );
  });

  test('10. Cambio de contraseña, rechazo de clave actual errónea, revocación real y nuevo Custom Token', async () => {
    const registerFn = httpsCallable<
      { username: string; password: string },
      { customToken: string; uid: string; displayName: string; sessionEpoch: number }
    >(clientFunctions, 'registerPasswordAccountFn');
    const signInFn = httpsCallable<
      { username: string; password: string },
      { customToken: string; uid: string; displayName: string; sessionEpoch: number }
    >(clientFunctions, 'signInWithPasswordCustomTokenFn');
    const changePassFn = httpsCallable<
      { currentPassword: string; newPassword: string },
      { customToken: string; uid: string; sessionEpoch: number }
    >(clientFunctions, 'changePasswordFn');

    await clientSignOut(clientAuth);
    await assert.rejects(
      () => changePassFn({ currentPassword: 'ClaveInicial#1', newPassword: 'ClaveNueva#2' }),
      (err) => extractCallableErrorCode(err) === 'unauthenticated'
    );

    const reg = await registerFn({ username: 'cambio_clave', password: 'ClaveInicial#1' });
    const uid = reg.data.uid;

    const userCred1 = await signInWithCustomToken(clientAuth, reg.data.customToken);
    const secondLogin = await signInFn({ username: 'cambio_clave', password: 'ClaveInicial#1' });
    const userCred2 = await signInWithCustomToken(secondaryClientAuth, secondLogin.data.customToken);
    const staleIdToken = await userCred2.user.getIdToken();
    const decodedStaleToken = await adminAuth.verifyIdToken(staleIdToken, true);
    const staleAuthTimeSec = Number(decodedStaleToken.auth_time);
    assert.ok(Number.isInteger(staleAuthTimeSec) && staleAuthTimeSec > 0);
    const staleIatSec = Number(decodedStaleToken.iat);
    const staleTokenMaxSec =
      Number.isInteger(staleIatSec) && staleIatSec > staleAuthTimeSec ? staleIatSec : staleAuthTimeSec;

    const secretBefore = (await adminDb.collection('accountSecrets').doc('cambio_clave').get()).data()!;

    await assert.rejects(
      () => changePassFn({ currentPassword: 'ClaveIncorrecta#9', newPassword: 'ClaveNueva#2' }),
      (err) => extractCallableErrorCode(err) === 'unauthenticated'
    );
    const secretAfterWrong = (await adminDb.collection('accountSecrets').doc('cambio_clave').get()).data()!;
    assert.equal(secretAfterWrong.sessionEpoch, 1);
    assert.equal(secretAfterWrong.passwordHash, secretBefore.passwordHash);

    await waitUntilUnixSecondExceeds(staleTokenMaxSec);
    assert.ok(Math.floor(Date.now() / 1000) > staleTokenMaxSec);

    const changed = await changePassFn({
      currentPassword: 'ClaveInicial#1',
      newPassword: 'ClaveNueva#2',
    });
    assert.equal(changed.data.uid, uid);
    assert.equal(changed.data.sessionEpoch, 2);

    const secretAfter = (await adminDb.collection('accountSecrets').doc('cambio_clave').get()).data()!;
    const securityAfter = (await adminDb.collection('userSecurity').doc(uid).get()).data()!;
    assert.equal(secretAfter.sessionEpoch, 2);
    assert.equal(securityAfter.minSessionEpoch, 2);
    assert.notEqual(secretAfter.passwordHash, secretBefore.passwordHash);

    const authUser = await adminAuth.getUser(uid);
    assert.ok(authUser.tokensValidAfterTime);
    await assert.rejects(() => adminAuth.verifyIdToken(staleIdToken, true));

    const secondaryFn = httpsCallable(secondaryClientFunctions, 'changePasswordFn');
    await assert.rejects(
      () => secondaryFn({ currentPassword: 'ClaveNueva#2', newPassword: 'ClaveTres#3' }),
      (err) => extractCallableErrorCode(err) === 'unauthenticated'
    );

    const refreshedCred = await signInWithCustomToken(clientAuth, changed.data.customToken);
    const claimsAfter = (await refreshedCred.user.getIdTokenResult(true)).claims;
    assert.equal(claimsAfter.sessionEpoch, 2);
    assert.equal(claimsAfter.provider, 'nita_password');

    await assert.rejects(
      () => signInFn({ username: 'cambio_clave', password: 'ClaveInicial#1' }),
      (err) => extractCallableErrorCode(err) === 'unauthenticated'
    );
    const newLogin = await signInFn({ username: 'cambio_clave', password: 'ClaveNueva#2' });
    assert.equal(newLogin.data.sessionEpoch, 2);

    await clientSignOut(clientAuth);
    await clientSignOut(secondaryClientAuth);
    void userCred1;
  });

  test('11. Corrección D+E HTTP: bloqueo por cuenta y por IP real (127.0.0.1) persiste blockedUntilMs en Firestore sin texto plano', async () => {
    await clearRateLimitDocs();

    const registerFn = httpsCallable(clientFunctions, 'registerPasswordAccountFn');
    await registerFn({ username: 'rl_target_user', password: 'CorrectaRL#2026' });

    const signInUrl = `http://${FUNCTIONS_HOST}/${PROJECT_ID}/us-central1/signInWithPasswordCustomTokenFn`;
    const callRawSignin = async (username: string, password: string) => {
      const res = await fetch(signInUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ data: { username, password } }),
      });
      return { status: res.status, json: (await res.json()) as { error?: { status?: string; message?: string } } };
    };

    // 5 intentos fallidos contra rl_target_user -> 5 x UNAUTHENTICATED
    for (let i = 1; i <= 5; i++) {
      const r = await callRawSignin('rl_target_user', `MalaClave_${i}`);
      assert.equal(r.json.error?.status, 'UNAUTHENTICATED');
    }

    // 6to intento contra rl_target_user (incluso con clave correcta) -> RESOURCE_EXHAUSTED
    const blockedByAccount = await callRawSignin('rl_target_user', 'CorrectaRL#2026');
    assert.equal(blockedByAccount.json.error?.status, 'RESOURCE_EXHAUSTED');

    // Confirmar persistencia inmediata de blockedUntilMs > 0 en Firestore Emulator
    const afterAccountLockSnap = await adminDb.collection('authRateLimits').get();
    assert.ok(
      afterAccountLockSnap.docs.some((d) => {
        const data = d.data();
        return data.scope === 'account' && Number(data.blockedUntilMs) > Date.now();
      })
    );

    // Límite por IP real (127.0.0.1): los 6 intentos anteriores consumieron 6 de los 20 permitidos en signin.
    // 14 intentos adicionales alcanzan el total de 20; el #21 debe bloquearse por IP antes de scrypt.
    for (let i = 1; i <= 14; i++) {
      const r = await callRawSignin(`inexistente_ip_${i}`, 'ClaveCualquiera1');
      assert.equal(r.json.error?.status, 'UNAUTHENTICATED');
    }

    const blockedByRealIp = await callRawSignin('inexistente_ip_21', 'ClaveCualquiera1');
    assert.equal(blockedByRealIp.json.error?.status, 'RESOURCE_EXHAUSTED');

    const rateLimitSnap = await adminDb.collection('authRateLimits').get();
    assert.ok(
      rateLimitSnap.docs.some((d) => {
        const data = d.data();
        return data.scope === 'ip' && data.action === 'signin' && Number(data.blockedUntilMs) > Date.now();
      })
    );

    for (const doc of rateLimitSnap.docs) {
      const serialized = `${doc.id}:${JSON.stringify(doc.data())}`;
      assert.equal(serialized.includes('127.0.0.1'), false);
      assert.equal(serialized.includes('::1'), false);
      assert.equal(serialized.includes('rl_target_user'), false);
    }
  });

  test('12. Saturación controlada de concurrencia scrypt en flujo real de servicio con Firestore + Auth Emulators', async () => {
    await clearRateLimitDocs();

    const usernames = ['conc_user_0', 'conc_user_1', 'conc_user_2', 'conc_user_3', 'conc_user_4'];
    for (const [idx, uname] of usernames.entries()) {
      await registerPasswordAccount(
        {
          db: adminDb,
          auth: adminAuth,
          pepper: TEST_PEPPER,
          ipAddress: `192.0.2.${50 + idx}`,
        },
        { username: uname, password: 'ClaveConcurrencia#1' }
      );
    }

    const tightLimiter = new ScryptConcurrencyLimiter({
      maxConcurrent: 2,
      maxQueueSize: 1,
      queueTimeoutMs: 5000,
    });

    const results = await Promise.allSettled(
      usernames.map((uname, idx) =>
        signInWithPasswordCustomToken(
          {
            db: adminDb,
            auth: adminAuth,
            pepper: TEST_PEPPER,
            ipAddress: `192.0.2.${10 + idx}`,
            limiter: tightLimiter,
          },
          {
            username: uname,
            password: 'ClaveConcurrencia#1',
          }
        )
      )
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

    assert.equal(fulfilled.length, 3);
    assert.equal(rejected.length, 2);
    for (const rej of rejected) {
      assert.ok(rej.reason instanceof AccountServiceError);
      assert.equal(rej.reason.code, 'resource-exhausted');
    }
    assert.equal(tightLimiter.getStats().peakActive, 2);
    assert.equal(tightLimiter.getStats().rejectedCount, 2);
    assert.equal(tightLimiter.getStats().active, 0);
  });

  // =========================================================================
  // ETAPA 2A.1.1 — BLOQUE A: FALLO CERRADO DE userSecurity EN LOGIN
  // =========================================================================

  test('A1-A5. Corrección A: signIn falla cerrado si falta o es inválido /userSecurity/{uid} (sin reconstruir ni ejecutar scrypt)', async () => {
    await clearRateLimitDocs();

    const signInFn = httpsCallable(clientFunctions, 'signInWithPasswordCustomTokenFn');

    const regMissing = await registerPasswordAccount(
      { db: adminDb, auth: adminAuth, pepper: TEST_PEPPER, ipAddress: '198.51.100.11' },
      { username: 'sec_missing', password: 'ClaveSecA#2026' }
    );
    await adminDb.collection('userSecurity').doc(regMissing.uid).delete();

    // HTTP Callable real: falla cerrado y NO reconstruye /userSecurity/{uid}
    await assert.rejects(
      () => signInFn({ username: 'sec_missing', password: 'ClaveSecA#2026' }),
      (err) => extractCallableErrorCode(err) === 'failed-precondition'
    );
    assert.equal((await adminDb.collection('userSecurity').doc(regMissing.uid).get()).exists, false);

    // También verificamos que no ejecuta scrypt cuando falta /userSecurity/{uid}
    const spyLimiter = new SpyScryptLimiter();
    await assert.rejects(
      () =>
        signInWithPasswordCustomToken(
          { db: adminDb, auth: adminAuth, pepper: TEST_PEPPER, ipAddress: '198.51.100.12', limiter: spyLimiter },
          { username: 'sec_missing', password: 'ClaveSecA#2026' }
        ),
      (err) => err instanceof AccountServiceError && err.code === 'failed-precondition'
    );
    assert.equal(spyLimiter.executions, 0);
    assert.equal((await adminDb.collection('userSecurity').doc(regMissing.uid).get()).exists, false);

    // Casos de documento corrupto o discrepante en /userSecurity/{uid}
    const regBad = await registerPasswordAccount(
      { db: adminDb, auth: adminAuth, pepper: TEST_PEPPER, ipAddress: '198.51.100.13' },
      { username: 'sec_corrupt', password: 'ClaveSecA#2026' }
    );
    const secBadRef = adminDb.collection('userSecurity').doc(regBad.uid);

    // A2a: falta minSessionEpoch
    await secBadRef.set({
      uid: regBad.uid,
      usernameLower: 'sec_corrupt',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await assert.rejects(
      () =>
        signInWithPasswordCustomToken(
          { db: adminDb, auth: adminAuth, pepper: TEST_PEPPER, ipAddress: '198.51.100.14' },
          { username: 'sec_corrupt', password: 'ClaveSecA#2026' }
        ),
      (err) => err instanceof AccountServiceError && err.code === 'failed-precondition'
    );

    // A2b: falta uid o usernameLower
    await secBadRef.set({ usernameLower: 'sec_corrupt', minSessionEpoch: 1 });
    await assert.rejects(
      () =>
        signInWithPasswordCustomToken(
          { db: adminDb, auth: adminAuth, pepper: TEST_PEPPER, ipAddress: '198.51.100.15' },
          { username: 'sec_corrupt', password: 'ClaveSecA#2026' }
        ),
      (err) => err instanceof AccountServiceError && err.code === 'failed-precondition'
    );

    await secBadRef.set({ uid: regBad.uid, minSessionEpoch: 1 });
    await assert.rejects(
      () =>
        signInWithPasswordCustomToken(
          { db: adminDb, auth: adminAuth, pepper: TEST_PEPPER, ipAddress: '198.51.100.16' },
          { username: 'sec_corrupt', password: 'ClaveSecA#2026' }
        ),
      (err) => err instanceof AccountServiceError && err.code === 'failed-precondition'
    );

    // A3: uid incorrecto en /userSecurity/{uid}
    await secBadRef.set({
      uid: 'usr_otro_distinto',
      usernameLower: 'sec_corrupt',
      minSessionEpoch: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await assert.rejects(
      () =>
        signInWithPasswordCustomToken(
          { db: adminDb, auth: adminAuth, pepper: TEST_PEPPER, ipAddress: '198.51.100.17' },
          { username: 'sec_corrupt', password: 'ClaveSecA#2026' }
        ),
      (err) => err instanceof AccountServiceError && err.code === 'failed-precondition'
    );

    // A4: usernameLower incorrecto en /userSecurity/{uid}
    await secBadRef.set({
      uid: regBad.uid,
      usernameLower: 'otro_usuario',
      minSessionEpoch: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await assert.rejects(
      () =>
        signInWithPasswordCustomToken(
          { db: adminDb, auth: adminAuth, pepper: TEST_PEPPER, ipAddress: '198.51.100.18' },
          { username: 'sec_corrupt', password: 'ClaveSecA#2026' }
        ),
      (err) => err instanceof AccountServiceError && err.code === 'failed-precondition'
    );

    // A5: épocas distintas entre /accountSecrets (1) y /userSecurity (3) -> rechazado vía HTTP real
    await clearRateLimitDocs();
    await secBadRef.set({
      uid: regBad.uid,
      usernameLower: 'sec_corrupt',
      minSessionEpoch: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await assert.rejects(
      () => signInFn({ username: 'sec_corrupt', password: 'ClaveSecA#2026' }),
      (err) => extractCallableErrorCode(err) === 'failed-precondition'
    );
    assert.equal((await adminDb.collection('userSecurity').doc(regBad.uid).get()).data()!.minSessionEpoch, 3);
  });

  // =========================================================================
  // ETAPA 2A.1.1 — BLOQUE B: VALIDACIÓN ESTRICTA DE CLAIMS EN changePasswordFn
  // =========================================================================

  test('B1-B9. Corrección B: changePasswordFn y changePassword rechazan claims ausentes/inválidos y /userSecurity faltante o inconsistente', async () => {
    await clearRateLimitDocs();

    const reg = await registerPasswordAccount(
      { db: adminDb, auth: adminAuth, pepper: TEST_PEPPER, ipAddress: '198.51.100.21' },
      { username: 'chg_strict', password: 'ClaveStrict#1' }
    );
    const uid = reg.uid;
    const changePassFn = httpsCallable<
      { currentPassword: string; newPassword: string },
      { customToken: string; uid: string; sessionEpoch: number }
    >(secondaryClientFunctions, 'changePasswordFn');

    const signAndCallChange = async (claims?: Record<string, unknown>) => {
      const customToken = await adminAuth.createCustomToken(uid, claims);
      await signInWithCustomToken(secondaryClientAuth, customToken);
      try {
        return await changePassFn({ currentPassword: 'ClaveStrict#1', newPassword: 'ClaveStrict#2' });
      } finally {
        await clientSignOut(secondaryClientAuth);
      }
    };

    // B1: provider ausente
    await assert.rejects(
      () => signAndCallChange({ sessionEpoch: 1 }),
      (err) => extractCallableErrorCode(err) === 'permission-denied'
    );

    // B1b: provider null
    await assert.rejects(
      () => signAndCallChange({ provider: null, sessionEpoch: 1 }),
      (err) => extractCallableErrorCode(err) === 'permission-denied'
    );

    // B2: provider incorrecto ('google.com')
    await assert.rejects(
      () => signAndCallChange({ provider: 'google.com', sessionEpoch: 1 }),
      (err) => extractCallableErrorCode(err) === 'permission-denied'
    );

    // B3: sessionEpoch ausente
    await assert.rejects(
      () => signAndCallChange({ provider: 'nita_password' }),
      (err) => extractCallableErrorCode(err) === 'unauthenticated'
    );

    // B4: sessionEpoch no entero (1.5) en HTTP real + NaN/Infinity directo en servicio
    await assert.rejects(
      () => signAndCallChange({ provider: 'nita_password', sessionEpoch: 1.5 }),
      (err) => extractCallableErrorCode(err) === 'unauthenticated'
    );
    for (const invalidEpoch of [NaN, Infinity, -Infinity, '1']) {
      await assert.rejects(
        () =>
          changePassword(
            { db: adminDb, auth: adminAuth, pepper: TEST_PEPPER, ipAddress: '198.51.100.22' },
            {
              callerUid: uid,
              tokenProvider: 'nita_password',
              tokenSessionEpoch: invalidEpoch,
              currentPassword: 'ClaveStrict#1',
              newPassword: 'ClaveStrict#2',
            }
          ),
        (err) => err instanceof AccountServiceError && err.code === 'unauthenticated'
      );
    }

    // B5: sessionEpoch cero o negativo (0 y -1)
    await assert.rejects(
      () => signAndCallChange({ provider: 'nita_password', sessionEpoch: 0 }),
      (err) => extractCallableErrorCode(err) === 'unauthenticated'
    );
    await assert.rejects(
      () => signAndCallChange({ provider: 'nita_password', sessionEpoch: -1 }),
      (err) => extractCallableErrorCode(err) === 'unauthenticated'
    );

    // B6: sessionEpoch obsoleto (ej. minSessionEpoch=2, token=1)
    await adminDb.collection('userSecurity').doc(uid).update({ minSessionEpoch: 2 });
    await adminDb.collection('accountSecrets').doc('chg_strict').update({ sessionEpoch: 2 });
    await assert.rejects(
      () => signAndCallChange({ provider: 'nita_password', sessionEpoch: 1 }),
      (err) => extractCallableErrorCode(err) === 'unauthenticated'
    );

    // B8: /userSecurity/{uid} inconsistente con /accountSecrets (ej. usernameLower o épocas distintas)
    await clearRateLimitDocs();
    await adminDb.collection('userSecurity').doc(uid).update({ minSessionEpoch: 3 });
    await assert.rejects(
      () => signAndCallChange({ provider: 'nita_password', sessionEpoch: 3 }),
      (err) => extractCallableErrorCode(err) === 'failed-precondition'
    );

    await adminDb.collection('userSecurity').doc(uid).update({ minSessionEpoch: 2, usernameLower: 'otro_nombre' });
    await assert.rejects(
      () => signAndCallChange({ provider: 'nita_password', sessionEpoch: 2 }),
      (err) => extractCallableErrorCode(err) === 'failed-precondition'
    );

    // B7: /userSecurity/{uid} ausente -> failed-precondition y NO se reconstruye
    await adminDb.collection('userSecurity').doc(uid).delete();
    await assert.rejects(
      () => signAndCallChange({ provider: 'nita_password', sessionEpoch: 2 }),
      (err) => extractCallableErrorCode(err) === 'failed-precondition'
    );
    assert.equal((await adminDb.collection('userSecurity').doc(uid).get()).exists, false);

    // Restaurar estado consistente en época 2 y confirmar B9 (caso válido exitoso)
    await clearRateLimitDocs();
    await adminDb.collection('userSecurity').doc(uid).set({
      uid,
      usernameLower: 'chg_strict',
      minSessionEpoch: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const okResult = await signAndCallChange({ provider: 'nita_password', sessionEpoch: 2 });
    assert.equal(okResult.data.uid, uid);
    assert.equal(okResult.data.sessionEpoch, 3);
    assert.equal((await adminDb.collection('userSecurity').doc(uid).get()).data()!.minSessionEpoch, 3);
    assert.equal((await adminDb.collection('accountSecrets').doc('chg_strict').get()).data()!.sessionEpoch, 3);

    const newCred = await signInWithCustomToken(secondaryClientAuth, okResult.data.customToken);
    const idTokenRes = await newCred.user.getIdTokenResult(true);
    assert.equal(idTokenRes.claims.provider, 'nita_password');
    assert.equal(idTokenRes.claims.sessionEpoch, 3);
    await clientSignOut(secondaryClientAuth);
  });

  // =========================================================================
  // ETAPA 2A.1.1 — BLOQUE C: MIGRACIÓN HEREDADA SIN REDUCCIÓN DE ÉPOCAS
  // =========================================================================

  test('C1-C4. Corrección C: migración heredada (SHA-256 y fallback) preserva minSessionEpoch, rechaza corruptos y mantiene finanzas idénticas', async () => {
    await clearRateLimitDocs();
    const signInFn = httpsCallable<
      { username: string; password: string },
      { customToken: string; uid: string; displayName: string; sessionEpoch: number; migratedFrom?: string }
    >(clientFunctions, 'signInWithPasswordCustomTokenFn');
    const changePassFn = httpsCallable<
      { currentPassword: string; newPassword: string },
      { customToken: string; uid: string; sessionEpoch: number }
    >(secondaryClientFunctions, 'changePasswordFn');

    // C2: Cuenta heredada SHA-256 con /userSecurity/{uid} preexistente en minSessionEpoch: 1
    const uidEpoch1 = 'usr_leg_ep1';
    const salt1 = '12121212121212121212121212121212';
    await adminDb.collection('accounts').doc('leg_ep1').set({
      userId: uidEpoch1,
      username: 'Leg_Ep1',
      usernameLower: 'leg_ep1',
      salt: salt1,
      passwordHash: legacySha256Digest('ClaveEp1#', salt1),
    });
    await adminDb.collection('userSecurity').doc(uidEpoch1).set({
      uid: uidEpoch1,
      usernameLower: 'leg_ep1',
      minSessionEpoch: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const resEp1 = await signInFn({ username: 'leg_ep1', password: 'ClaveEp1#' });
    assert.equal(resEp1.data.sessionEpoch, 1);
    assert.equal(resEp1.data.migratedFrom, 'sha256');
    assert.equal((await adminDb.collection('userSecurity').doc(uidEpoch1).get()).data()!.minSessionEpoch, 1);
    assert.equal((await adminDb.collection('accountSecrets').doc('leg_ep1').get()).data()!.sessionEpoch, 1);

    // C3a: Cuenta heredada SHA-256 con /userSecurity/{uid} preexistente en minSessionEpoch: 5 (> 1)
    const uidEpoch5Sha = 'usr_leg_ep5_sha';
    const salt5Sha = '34343434343434343434343434343434';
    await adminDb.collection('accounts').doc('leg_ep5_sha').set({
      userId: uidEpoch5Sha,
      username: 'Leg_Ep5_Sha',
      usernameLower: 'leg_ep5_sha',
      salt: salt5Sha,
      passwordHash: legacySha256Digest('ClaveEp5Sha#', salt5Sha),
    });
    await adminDb.collection('userSecurity').doc(uidEpoch5Sha).set({
      uid: uidEpoch5Sha,
      usernameLower: 'leg_ep5_sha',
      minSessionEpoch: 5,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    });

    const monthShaRef = adminDb.collection('users').doc(uidEpoch5Sha).collection('months').doc('2026-04');
    const catsShaRef = adminDb.collection('users').doc(uidEpoch5Sha).collection('categories').doc('global');
    const expectedMonthSha = {
      userId: uidEpoch5Sha,
      monthKey: '2026-04',
      income: 950000,
      fixedExpenses: [{ id: 'f-ep5', name: 'Expensas', amount: 85000, isPaid: false, dueDate: 10 }],
    };
    const expectedCatsSha = {
      userId: uidEpoch5Sha,
      categories: [{ id: 'hogar', label: 'Hogar', color: '#10b981' }],
    };
    await monthShaRef.set(expectedMonthSha);
    await catsShaRef.set(expectedCatsSha);

    const resEp5Sha = await signInFn({ username: 'leg_ep5_sha', password: 'ClaveEp5Sha#' });
    assert.equal(resEp5Sha.data.sessionEpoch, 5);
    assert.equal(resEp5Sha.data.migratedFrom, 'sha256');

    const secEp5ShaAfter = (await adminDb.collection('userSecurity').doc(uidEpoch5Sha).get()).data()!;
    const secretEp5ShaAfter = (await adminDb.collection('accountSecrets').doc('leg_ep5_sha').get()).data()!;
    assert.ok(Number(secEp5ShaAfter.minSessionEpoch) >= 5);
    assert.equal(secEp5ShaAfter.minSessionEpoch, 5);
    assert.equal(secretEp5ShaAfter.sessionEpoch, 5);
    assert.deepEqual((await monthShaRef.get()).data(), expectedMonthSha);
    assert.deepEqual((await catsShaRef.get()).data(), expectedCatsSha);

    const credEp5 = await signInWithCustomToken(clientAuth, resEp5Sha.data.customToken);
    assert.equal((await credEp5.user.getIdTokenResult()).claims.sessionEpoch, 5);
    await clientSignOut(clientAuth);

    // Tokens anteriores (< 5, ej. epoch 1 o 4) NO deben reactivarse
    for (const staleEpoch of [1, 4]) {
      const staleToken = await adminAuth.createCustomToken(uidEpoch5Sha, {
        provider: 'nita_password',
        sessionEpoch: staleEpoch,
      });
      await signInWithCustomToken(secondaryClientAuth, staleToken);
      await assert.rejects(
        () => changePassFn({ currentPassword: 'ClaveEp5Sha#', newPassword: 'OtraClave#2026' }),
        (err) => extractCallableErrorCode(err) === 'unauthenticated'
      );
      await clientSignOut(secondaryClientAuth);
    }

    // C3b: Cuenta heredada legacy_fallback (h_...) con /userSecurity/{uid} en minSessionEpoch: 5 (> 1)
    const uidEpoch5Fb = 'usr_leg_ep5_fb';
    const salt5Fb = '56565656565656565656565656565656';
    await adminDb.collection('accounts').doc('leg_ep5_fb').set({
      userId: uidEpoch5Fb,
      username: 'Leg_Ep5_Fb',
      usernameLower: 'leg_ep5_fb',
      salt: salt5Fb,
      passwordHash: legacyJsFallbackDigest('ClaveEp5Fb🚀', salt5Fb),
    });
    await adminDb.collection('userSecurity').doc(uidEpoch5Fb).set({
      uid: uidEpoch5Fb,
      usernameLower: 'leg_ep5_fb',
      minSessionEpoch: 5,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    });

    const resEp5Fb = await signInFn({ username: 'leg_ep5_fb', password: 'ClaveEp5Fb🚀' });
    assert.equal(resEp5Fb.data.sessionEpoch, 5);
    assert.equal(resEp5Fb.data.migratedFrom, 'legacy_fallback');
    assert.equal((await adminDb.collection('userSecurity').doc(uidEpoch5Fb).get()).data()!.minSessionEpoch, 5);
    assert.equal((await adminDb.collection('accountSecrets').doc('leg_ep5_fb').get()).data()!.sessionEpoch, 5);

    // C4: /userSecurity/{uid} corrupto o contradictorio durante migración -> aborta sin migrar ni limpiar /accounts
    const badMigrationCases: Array<{ key: string; secDoc: Record<string, unknown> }> = [
      {
        key: 'leg_bad_uid',
        secDoc: { uid: 'usr_ajeno', usernameLower: 'leg_bad_uid', minSessionEpoch: 2 },
      },
      {
        key: 'leg_bad_uname',
        secDoc: { uid: 'usr_leg_bad_uname', usernameLower: 'otro_username', minSessionEpoch: 2 },
      },
      {
        key: 'leg_bad_ep_zero',
        secDoc: { uid: 'usr_leg_bad_ep_zero', usernameLower: 'leg_bad_ep_zero', minSessionEpoch: 0 },
      },
      {
        key: 'leg_bad_ep_neg',
        secDoc: { uid: 'usr_leg_bad_ep_neg', usernameLower: 'leg_bad_ep_neg', minSessionEpoch: -2 },
      },
      {
        key: 'leg_bad_ep_float',
        secDoc: { uid: 'usr_leg_bad_ep_float', usernameLower: 'leg_bad_ep_float', minSessionEpoch: 1.5 },
      },
      {
        key: 'leg_bad_ep_str',
        secDoc: { uid: 'usr_leg_bad_ep_str', usernameLower: 'leg_bad_ep_str', minSessionEpoch: '5' },
      },
      {
        key: 'leg_bad_ep_missing',
        secDoc: { uid: 'usr_leg_bad_ep_missing', usernameLower: 'leg_bad_ep_missing' },
      },
    ];

    for (const [idx, c] of badMigrationCases.entries()) {
      const testUid = `usr_${c.key}`;
      const testSalt = `7878787878787878787878787878780${idx}`;
      const testHash = legacySha256Digest('ClaveCorrupta1#', testSalt);

      await adminDb.collection('accounts').doc(c.key).set({
        userId: testUid,
        username: c.key,
        usernameLower: c.key,
        salt: testSalt,
        passwordHash: testHash,
      });
      await adminDb.collection('userSecurity').doc(testUid).set(c.secDoc);

      await assert.rejects(
        () =>
          signInWithPasswordCustomToken(
            { db: adminDb, auth: adminAuth, pepper: TEST_PEPPER, ipAddress: `198.51.100.${100 + idx}` },
            { username: c.key, password: 'ClaveCorrupta1#' }
          ),
        (err) => err instanceof AccountServiceError && err.code === 'failed-precondition'
      );

      assert.equal((await adminDb.collection('accountSecrets').doc(c.key).get()).exists, false);
      const acctAfter = (await adminDb.collection('accounts').doc(c.key).get()).data()!;
      assert.equal(acctAfter.passwordHash, testHash);
      assert.equal(acctAfter.salt, testSalt);
      assert.equal(acctAfter.migrated, undefined);
    }
  });

  // =========================================================================
  // ETAPA 2A.1.1 — BLOQUE D: PERSISTENCIA EFECTIVA DE blockedUntilMs Y EXPIRACIÓN
  // =========================================================================

  test('D1-D2. Corrección D: persistencia real de blockedUntilMs en Firestore, bloqueo pre-scrypt, expiración limpia e independencia de buckets', async () => {
    await clearRateLimitDocs();

    await registerPasswordAccount(
      { db: adminDb, auth: adminAuth, pepper: TEST_PEPPER, ipAddress: '198.51.100.200' },
      { username: 'rl_persist_a', password: 'ClavePersistA#1' }
    );
    await registerPasswordAccount(
      { db: adminDb, auth: adminAuth, pepper: TEST_PEPPER, ipAddress: '198.51.100.201' },
      { username: 'rl_persist_b', password: 'ClavePersistB#1' }
    );
    await registerPasswordAccount(
      { db: adminDb, auth: adminAuth, pepper: TEST_PEPPER, ipAddress: '198.51.100.202' },
      { username: 'rl_persist_c', password: 'ClavePersistC#1' }
    );

    const policy = {
      signin: {
        accountMaxAttempts: 5,
        ipMaxAttempts: 20,
        windowMs: 60_000,
        lockDurationMs: 120_000,
      },
    };
    const baseNow = 1_800_000_000_000;
    const attackIp = '203.0.113.55';

    // 1. Intentos 1..5 fallidos contra rl_persist_a (permitidos -> unauthenticated, blockedUntilMs === 0)
    const spyAllowed = new SpyScryptLimiter();
    for (let i = 1; i <= 5; i++) {
      await assert.rejects(
        () =>
          signInWithPasswordCustomToken(
            {
              db: adminDb,
              auth: adminAuth,
              pepper: TEST_PEPPER,
              ipAddress: attackIp,
              limiter: spyAllowed,
              nowMs: baseNow + i * 1000,
              rateLimitOverrides: policy,
            },
            { username: 'rl_persist_a', password: `MalaClave_${i}` }
          ),
        (err) => err instanceof AccountServiceError && err.code === 'unauthenticated'
      );
    }
    assert.equal(spyAllowed.executions, 5);

    const rlKeysCheck = await enforceRateLimitBeforeKdf(adminDb, {
      action: 'signin',
      accountIdentifier: 'rl_persist_a',
      accountScope: 'account',
      ipAddress: '203.0.113.56',
      pepper: TEST_PEPPER,
      nowMs: baseNow + 6000,
      policyOverride: { accountMaxAttempts: 100, ipMaxAttempts: 100, windowMs: 60_000, lockDurationMs: 120_000 },
    });
    // Nota: el check con política alta no representa el umbral anterior; limpiamos e iniciamos ciclo exacto con reloj controlado:
    void rlKeysCheck;
    await clearRateLimitDocs();

    // Ciclo controlado con SpyScryptLimiter en attempts 1..5 -> 6 (bloqueo) -> 7..8 (rechazo pre-scrypt) -> post-expiración
    const spyPhase1 = new SpyScryptLimiter();
    for (let i = 1; i <= 5; i++) {
      await assert.rejects(
        () =>
          signInWithPasswordCustomToken(
            {
              db: adminDb,
              auth: adminAuth,
              pepper: TEST_PEPPER,
              ipAddress: attackIp,
              limiter: spyPhase1,
              nowMs: baseNow + i * 100,
              rateLimitOverrides: policy,
            },
            { username: 'rl_persist_a', password: 'WrongPassword!' }
          ),
        (err) => err instanceof AccountServiceError && err.code === 'unauthenticated'
      );
    }
    assert.equal(spyPhase1.executions, 5);

    // Antes del 6to intento, ningún bucket tiene blockedUntilMs > 0
    const before6Snap = await adminDb.collection('authRateLimits').get();
    for (const d of before6Snap.docs) {
      assert.equal(d.data().blockedUntilMs, 0);
    }

    // 6to intento excede accountMaxAttempts=5: DEBE lanzar resource-exhausted Y persistir blockedUntilMs > nowMs en Firestore
    const lockTriggerTime = baseNow + 1000;
    const spyTrigger = new SpyScryptLimiter();
    await assert.rejects(
      () =>
        signInWithPasswordCustomToken(
          {
            db: adminDb,
            auth: adminAuth,
            pepper: TEST_PEPPER,
            ipAddress: attackIp,
            limiter: spyTrigger,
            nowMs: lockTriggerTime,
            rateLimitOverrides: policy,
          },
          { username: 'rl_persist_a', password: 'ClavePersistA#1' }
        ),
      (err) => err instanceof AccountServiceError && err.code === 'resource-exhausted'
    );
    assert.equal(spyTrigger.executions, 0);

    const after6Snap = await adminDb.collection('authRateLimits').get();
    const lockedAcctDoc = after6Snap.docs.find((d) => d.data().scope === 'account');
    assert.ok(lockedAcctDoc, 'Debe existir documento de bucket por cuenta');
    assert.equal(lockedAcctDoc.data().blockedUntilMs, lockTriggerTime + policy.signin.lockDurationMs);

    // D1b: Mientras nowMs < blockedUntilMs, cualquier intento posterior falla resource-exhausted y scrypt.executions === 0
    const spyDuringLock = new SpyScryptLimiter();
    for (const deltaMs of [1000, 60_000, 119_999]) {
      await assert.rejects(
        () =>
          signInWithPasswordCustomToken(
            {
              db: adminDb,
              auth: adminAuth,
              pepper: TEST_PEPPER,
              ipAddress: '203.0.113.57',
              limiter: spyDuringLock,
              nowMs: lockTriggerTime + deltaMs,
              rateLimitOverrides: policy,
            },
            { username: 'rl_persist_a', password: 'ClavePersistA#1' }
          ),
        (err) => err instanceof AccountServiceError && err.code === 'resource-exhausted'
      );
    }
    assert.equal(spyDuringLock.executions, 0);

    // D2a: Independencia de cuentas desde la misma IP (rl_persist_a bloqueada, pero rl_persist_b desde attackIp funciona)
    const resB = await signInWithPasswordCustomToken(
      {
        db: adminDb,
        auth: adminAuth,
        pepper: TEST_PEPPER,
        ipAddress: attackIp,
        nowMs: lockTriggerTime + 5000,
        rateLimitOverrides: policy,
      },
      { username: 'rl_persist_b', password: 'ClavePersistB#1' }
    );
    assert.equal(resB.uid, 'usr_rl_persist_b');

    // D1c: Cuando nowMs >= blockedUntilMs, el bloqueo expira limpiamente y el siguiente intento válido tiene éxito
    const postExpiryTime = lockTriggerTime + policy.signin.lockDurationMs;
    const resAAfterExpiry = await signInWithPasswordCustomToken(
      {
        db: adminDb,
        auth: adminAuth,
        pepper: TEST_PEPPER,
        ipAddress: '203.0.113.58',
        nowMs: postExpiryTime,
        rateLimitOverrides: policy,
      },
      { username: 'rl_persist_a', password: 'ClavePersistA#1' }
    );
    assert.equal(resAAfterExpiry.uid, 'usr_rl_persist_a');

    const acctDocAfterExpiry = (await adminDb.collection('authRateLimits').doc(lockedAcctDoc.id).get()).data()!;
    assert.equal(acctDocAfterExpiry.blockedUntilMs, 0);
    assert.equal(acctDocAfterExpiry.attemptsInWindow, 0);

    // D2b: Bloqueo de IP Y rechaza cuenta C nueva antes de scrypt sin bloquear el bucket de cuenta C
    const tightIpPolicy = {
      accountMaxAttempts: 5,
      ipMaxAttempts: 2,
      windowMs: 60_000,
      lockDurationMs: 120_000,
    };
    const badIp = '198.51.100.222';
    await enforceRateLimitBeforeKdf(adminDb, {
      action: 'signin',
      accountIdentifier: 'other_user_1',
      ipAddress: badIp,
      pepper: TEST_PEPPER,
      nowMs: baseNow,
      policyOverride: tightIpPolicy,
    });
    await enforceRateLimitBeforeKdf(adminDb, {
      action: 'signin',
      accountIdentifier: 'other_user_2',
      ipAddress: badIp,
      pepper: TEST_PEPPER,
      nowMs: baseNow + 100,
      policyOverride: tightIpPolicy,
    });
    await assert.rejects(
      () =>
        enforceRateLimitBeforeKdf(adminDb, {
          action: 'signin',
          accountIdentifier: 'other_user_3',
          ipAddress: badIp,
          pepper: TEST_PEPPER,
          nowMs: baseNow + 200,
          policyOverride: tightIpPolicy,
        }),
      (err) => err instanceof RateLimitExceededError
    );

    const spyBlockedIp = new SpyScryptLimiter();
    await assert.rejects(
      () =>
        signInWithPasswordCustomToken(
          {
            db: adminDb,
            auth: adminAuth,
            pepper: TEST_PEPPER,
            ipAddress: badIp,
            limiter: spyBlockedIp,
            nowMs: baseNow + 1000,
            rateLimitOverrides: { signin: tightIpPolicy },
          },
          { username: 'rl_persist_c', password: 'ClavePersistC#1' }
        ),
      (err) => err instanceof AccountServiceError && err.code === 'resource-exhausted'
    );
    assert.equal(spyBlockedIp.executions, 0);

    // Verificar que la cuenta C funciona normalmente desde una IP legítima (no quedó bloqueada por badIp)
    const resC = await signInWithPasswordCustomToken(
      {
        db: adminDb,
        auth: adminAuth,
        pepper: TEST_PEPPER,
        ipAddress: '198.51.100.223',
        nowMs: baseNow + 2000,
        rateLimitOverrides: { signin: tightIpPolicy },
      },
      { username: 'rl_persist_c', password: 'ClavePersistC#1' }
    );
    assert.equal(resC.uid, 'usr_rl_persist_c');
  });
});
