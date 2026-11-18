import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

class MockLocalStorage {
  private store: Map<string, string> = new Map();

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get length(): number {
    return this.store.size;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] || null;
  }
}

if (typeof (globalThis as any).localStorage === 'undefined') {
  (globalThis as any).localStorage = new MockLocalStorage();
}
if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = globalThis;
}

import {
  evaluateAuthUserSession,
  isValidPersistedSession,
  type AuthUserLike,
  type CachedUserData,
} from '../src/context/AuthContext';
import {
  saveActiveSession,
  getActiveSession,
  mapAuthBackendError,
  isSessionRevokedError,
  isRequiresRecentLoginError,
} from '../src/services/authAccountService';
import {
  clearSyncSessionValidationState,
  setSyncSessionValidationState,
  isSyncSessionValidatedForUser,
} from '../src/lib/syncSessionGate';
import {
  LEGACY_STORAGE_KEY,
  LEGACY_CATEGORIES_STORAGE_KEY,
  getUserStorageKey,
  getUserCategoriesKey,
  loadBudgetState,
  saveBudgetState,
  saveGlobalCategories,
  createFreshMonthData,
  enqueuePendingMonth,
  getPendingSyncQueue,
  recoverLocalDataSources,
  prepareSafeLegacyRecovery,
  executeSafeLegacyRecovery,
  explicitlyMigrateLegacyDataToUser,
} from '../src/utils/storage';
import { DEFAULT_CATEGORIES } from '../src/utils/currency';
import { processPendingSyncQueue } from '../src/services/budgetSyncService';

function setMockOnline(online: boolean): void {
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: online },
    writable: true,
    configurable: true,
  });
}

function makeStubAuthUser(options: {
  uid: string;
  displayName?: string | null;
  email?: string | null;
  providerId?: string;
  forceHandler?: () => Promise<{ claims?: Record<string, unknown> | null } | null>;
  cacheHandler?: () => Promise<{ claims?: Record<string, unknown> | null } | null>;
}): AuthUserLike {
  const providerId = options.providerId || (options.uid.startsWith('usr_') ? 'custom' : 'google.com');
  return {
    uid: options.uid,
    email: options.email ?? null,
    displayName: options.displayName ?? null,
    photoURL: null,
    providerData: [
      {
        providerId,
        email: options.email ?? null,
        displayName: options.displayName ?? null,
        photoURL: null,
      },
    ],
    getIdTokenResult: async (forceRefresh?: boolean) => {
      if (forceRefresh) {
        if (options.forceHandler) return options.forceHandler();
        return { claims: { provider: 'nita_password', sessionEpoch: 1 } };
      }
      if (options.cacheHandler) return options.cacheHandler();
      return null;
    },
  };
}

describe('NITA Etapa 2A.2.2 — Pruebas de Sesiones Offline, Aislamiento y Recuperación Legacy (A–J)', () => {
  beforeEach(() => {
    localStorage.clear();
    setMockOnline(true);
    clearSyncSessionValidationState();
  });

  test('A. Error inesperado en getIdTokenResult(true) estando online NO habilita isFirebaseAuthActive ni permite procesar cola', async () => {
    const persisted: CachedUserData = {
      uid: 'usr_martin',
      email: null,
      displayName: 'Martin',
      photoURL: null,
      providerId: 'password',
      sessionEpoch: 1,
    };
    saveActiveSession(persisted);

    // Encolar una mutación pendiente para usr_martin
    enqueuePendingMonth(
      'usr_martin',
      '2026-05',
      2026,
      4,
      { ...createFreshMonthData(), income: 300000 },
      'op_martin_1'
    );

    // Subcaso A1: Error inesperado online pero con token cacheado presente
    const fbUserWithCachedToken = makeStubAuthUser({
      uid: 'usr_martin',
      forceHandler: async () => {
        throw Object.assign(new Error('Internal STS failure'), { code: 'auth/internal-error' });
      },
      cacheHandler: async () => ({
        claims: { provider: 'nita_password', sessionEpoch: 1 },
      }),
    });

    const evalWithCache = await evaluateAuthUserSession(fbUserWithCachedToken, true, getActiveSession());
    assert.equal(evalWithCache.status, 'degraded_offline');
    assert.equal(evalWithCache.category, 'unexpected_auth_error');
    assert.equal(evalWithCache.isFirebaseAuthActive, false, 'NUNCA debe activar Firebase Auth con token cacheado');
    assert.equal(evalWithCache.isOfflineSession, true);
    assert.equal(evalWithCache.shouldClearSession, false);

    // Subcaso A2: Error inesperado online y sin token cacheado (retorna null)
    const fbUserNoCache = makeStubAuthUser({
      uid: 'usr_martin',
      forceHandler: async () => {
        throw new Error('Unexpected 502 from token service');
      },
      cacheHandler: async () => null,
    });

    const evalNoCache = await evaluateAuthUserSession(fbUserNoCache, true, getActiveSession());
    assert.equal(evalNoCache.status, 'degraded_offline');
    assert.equal(evalNoCache.category, 'unexpected_auth_error');
    assert.equal(evalNoCache.isFirebaseAuthActive, false);
    assert.equal(evalNoCache.isOfflineSession, true);
    assert.equal(evalNoCache.shouldClearSession, false);

    // Sin sesión online validada (ni auth.currentUser coincidente / gate desactivado), la cola no se procesa
    const queueRes = await processPendingSyncQueue('usr_martin');
    assert.equal(queueRes.syncedCount, 0);
    assert.equal(queueRes.remainingCount, 1);
    assert.equal(getPendingSyncQueue('usr_martin').length, 1);
  });

  test('B. Error de red durante validación online conserva modo local degradado si existe sesión persistida del mismo UID', async () => {
    const persisted: CachedUserData = {
      uid: 'usr_ana',
      email: null,
      displayName: 'Ana',
      photoURL: null,
      providerId: 'password',
      sessionEpoch: 2,
    };
    saveActiveSession(persisted);

    const fbUser = makeStubAuthUser({
      uid: 'usr_ana',
      forceHandler: async () => {
        throw Object.assign(new Error('Network request failed'), { code: 'auth/network-request-failed' });
      },
      cacheHandler: async () => null,
    });

    const evaluation = await evaluateAuthUserSession(fbUser, true, getActiveSession());
    assert.equal(evaluation.status, 'degraded_offline');
    assert.equal(evaluation.category, 'network_error');
    assert.equal(evaluation.isFirebaseAuthActive, false);
    assert.equal(evaluation.isOfflineSession, true);
    assert.equal(evaluation.shouldClearSession, false);
    assert.equal(evaluation.userData?.uid, 'usr_ana');
    assert.equal(evaluation.userData?.displayName, 'Ana');
    assert.equal(getActiveSession()?.uid, 'usr_ana', 'Metadatos persistidos deben conservarse');
  });

  test('C. getIdTokenResult(false) devuelve error o null estando offline NO destruye metadatos persistidos ni datos financieros', async () => {
    setMockOnline(false);

    const persisted: CachedUserData = {
      uid: 'usr_carlos',
      email: null,
      displayName: 'CarlosOffline',
      photoURL: null,
      providerId: 'password',
      sessionEpoch: 1,
    };
    saveActiveSession(persisted);
    saveBudgetState(
      {
        month: 4,
        year: 2026,
        currency: 'USD',
        monthsData: {
          '2026-05': {
            ...createFreshMonthData(),
            income: 420000,
            fixedExpenses: [{ id: 'f_c1', name: 'Internet', amount: 25000, category: 'services', isPaid: true }],
          },
        },
      },
      'usr_carlos',
      false
    );

    // Subcaso C1: getIdTokenResult(false) devuelve null offline
    const fbUserNullCache = makeStubAuthUser({
      uid: 'usr_carlos',
      cacheHandler: async () => null,
    });
    const evalNull = await evaluateAuthUserSession(fbUserNullCache, false, getActiveSession());
    assert.equal(evalNull.status, 'degraded_offline');
    assert.equal(evalNull.category, 'missing_cached_credentials');
    assert.equal(evalNull.shouldClearSession, false);
    assert.equal(evalNull.isFirebaseAuthActive, false);
    assert.equal(evalNull.isOfflineSession, true);
    assert.equal(evalNull.userData?.uid, 'usr_carlos');

    // Subcaso C2: getIdTokenResult(false) lanza error temporal de almacenamiento offline
    const fbUserErrorCache = makeStubAuthUser({
      uid: 'usr_carlos',
      cacheHandler: async () => {
        throw new Error('IndexedDB transaction aborted');
      },
    });
    const evalErr = await evaluateAuthUserSession(fbUserErrorCache, false, getActiveSession());
    assert.equal(evalErr.status, 'degraded_offline');
    assert.equal(evalErr.category, 'missing_cached_credentials');
    assert.equal(evalErr.shouldClearSession, false);
    assert.equal(evalErr.isFirebaseAuthActive, false);
    assert.equal(evalErr.isOfflineSession, true);

    // Metadatos y datos financieros permanecen intactos y modificables localmente
    assert.equal(getActiveSession()?.uid, 'usr_carlos');
    assert.equal(localStorage.getItem('nita_auth_choice'), 'password');
    const localState = loadBudgetState('usr_carlos', false);
    assert.equal(localState.monthsData['2026-05']?.income, 420000);
    assert.equal(localState.monthsData['2026-05']?.fixedExpenses[0]?.name, 'Internet');

    // Subcaso C3: sin token cacheado Y sin sesión persistida coincidente -> no inventar sesión ni claims
    const mismatchEval = await evaluateAuthUserSession(
      makeStubAuthUser({ uid: 'usr_otro', cacheHandler: async () => null }),
      false,
      getActiveSession()
    );
    assert.equal(mismatchEval.status, 'unrecoverable_no_session');
    assert.equal(mismatchEval.userData, null);
    assert.equal(mismatchEval.isFirebaseAuthActive, false);
    assert.equal(getActiveSession()?.uid, 'usr_carlos', 'No debe borrar metadatos de otra sesión');
  });

  test('D. Revocación confirmada cierra sesión registrada pero conserva datos financieros locales del UID', async () => {
    const persisted: CachedUserData = {
      uid: 'usr_revoked',
      email: null,
      displayName: 'RevokedUser',
      photoURL: null,
      providerId: 'password',
      sessionEpoch: 1,
    };
    saveActiveSession(persisted);
    saveBudgetState(
      {
        month: 4,
        year: 2026,
        currency: 'ARS',
        monthsData: {
          '2026-05': {
            ...createFreshMonthData(),
            income: 610000,
          },
        },
      },
      'usr_revoked',
      false
    );
    enqueuePendingMonth(
      'usr_revoked',
      '2026-05',
      2026,
      4,
      { ...createFreshMonthData(), income: 610000 },
      'op_revoked_1'
    );

    const fbUserRevoked = makeStubAuthUser({
      uid: 'usr_revoked',
      forceHandler: async () => {
        throw Object.assign(new Error('Token revoked'), { code: 'auth/id-token-revoked' });
      },
    });

    const evalRevoked = await evaluateAuthUserSession(fbUserRevoked, true, getActiveSession());
    assert.equal(evalRevoked.status, 'revoked_or_invalid');
    assert.equal(evalRevoked.category, 'revoked_or_invalid');
    assert.equal(evalRevoked.shouldClearSession, true);
    assert.equal(evalRevoked.isFirebaseAuthActive, false);

    // Simular ejecución de clearActiveSessionState: limpia sesión pero respeta datos financieros locales
    saveActiveSession(null);
    assert.equal(getActiveSession(), null);
    assert.equal(loadBudgetState('usr_revoked', false).monthsData['2026-05']?.income, 610000);
    assert.equal(getPendingSyncQueue('usr_revoked').length, 1);

    // También detecta invalidez confirmada si el servidor emite token fresco sin claims nita_password
    const fbUserInvalidClaims = makeStubAuthUser({
      uid: 'usr_revoked',
      forceHandler: async () => ({ claims: { aud: 'demo-project' } }),
    });
    const evalInvalidClaims = await evaluateAuthUserSession(fbUserInvalidClaims, true, persisted);
    assert.equal(evalInvalidClaims.status, 'revoked_or_invalid');
    assert.equal(evalInvalidClaims.shouldClearSession, true);
  });

  test('E. Reconexión revalida sesión y solo habilita sincronización tras confirmación válida del servidor', async () => {
    const persisted: CachedUserData = {
      uid: 'usr_reconn',
      email: null,
      displayName: 'ReconnUser',
      photoURL: null,
      providerId: 'password',
      sessionEpoch: 1,
    };
    saveActiveSession(persisted);
    assert.equal(isValidPersistedSession(getActiveSession(), 'usr_reconn'), true);

    let onlineShouldSucceed = false;
    const fbUser = makeStubAuthUser({
      uid: 'usr_reconn',
      forceHandler: async () => {
        if (!onlineShouldSucceed) {
          throw Object.assign(new Error('Temporary STS outage'), { code: 'auth/internal-error' });
        }
        return { claims: { provider: 'nita_password', sessionEpoch: 2 } };
      },
      cacheHandler: async () => null,
    });

    // Paso 1: Inicio offline sin caché -> modo degradado, sync apagado
    const step1Offline = await evaluateAuthUserSession(fbUser, false, getActiveSession());
    assert.equal(step1Offline.status, 'degraded_offline');
    assert.equal(step1Offline.isFirebaseAuthActive, false);
    assert.equal(step1Offline.isOfflineSession, true);

    // Paso 2: Vuelve conectividad pero validación del servidor todavía falla -> sigue sin habilitar sync
    const step2RetryFail = await evaluateAuthUserSession(fbUser, true, getActiveSession());
    assert.equal(step2RetryFail.status, 'degraded_offline');
    assert.equal(step2RetryFail.isFirebaseAuthActive, false);
    assert.equal(step2RetryFail.isOfflineSession, true);

    // Paso 3: Servidor confirma token válido -> recién ahora se habilita sincronización online
    onlineShouldSucceed = true;
    const step3OnlineOk = await evaluateAuthUserSession(fbUser, true, getActiveSession());
    assert.equal(step3OnlineOk.status, 'valid_online');
    assert.equal(step3OnlineOk.category, 'valid_online');
    assert.equal(step3OnlineOk.isFirebaseAuthActive, true);
    assert.equal(step3OnlineOk.isOfflineSession, false);
    assert.equal(step3OnlineOk.userData?.sessionEpoch, 2);
  });

  test('F. Cola cruzada: operación de userA en nita_pending_sync_queue_v1 no se procesa cuando se ejecuta processPendingSyncQueue(userB)', async () => {
    setMockOnline(true);
    const userA = 'usr_alice';
    const userB = 'usr_bob';

    enqueuePendingMonth(
      userA,
      '2026-07',
      2026,
      6,
      {
        ...createFreshMonthData(),
        income: 999000,
        variableExpenses: [
          { id: 'va1', date: '2026-07-02', description: 'Gasto Privado Alice', amount: 15000, category: 'food' },
        ],
      },
      'op_alice_secret'
    );

    assert.equal(getPendingSyncQueue(userA).length, 1);
    assert.equal(getPendingSyncQueue(userB).length, 0);

    // Ejecutar processPendingSyncQueue bajo la identidad de userB
    const resultB = await processPendingSyncQueue(userB);
    assert.equal(resultB.syncedCount, 0);
    assert.equal(resultB.remainingCount, 0);

    // La operación de userA sigue intacta y aislada en la cola
    const queueA = getPendingSyncQueue(userA);
    assert.equal(queueA.length, 1);
    assert.equal(queueA[0].userId, userA);
    assert.equal(queueA[0].opId, 'op_alice_secret');
    assert.equal(queueA[0].data?.income, 999000);
  });

  test('G. Recuperación legacy con destino vacío prepara y ejecuta fusión segura sin borrar fuente original', () => {
    const legacyBudget = {
      month: 4,
      year: 2026,
      currency: 'USD',
      monthsData: {
        '2026-05': {
          ...createFreshMonthData(),
          income: 350000,
          fixedExpenses: [{ id: 'f_leg_1', name: 'Alquiler Viejo', amount: 120000, category: 'housing', isPaid: true }],
        },
      },
    };
    const legacyCats = [
      { id: 'cat_leg', label: 'Mascotas Legacy', color: '#f59e0b', isCustom: true },
    ];

    const rawLegacyBudget = JSON.stringify(legacyBudget);
    const rawLegacyCats = JSON.stringify(legacyCats);
    localStorage.setItem(LEGACY_STORAGE_KEY, rawLegacyBudget);
    localStorage.setItem(LEGACY_CATEGORIES_STORAGE_KEY, rawLegacyCats);

    const uid = 'usr_destino_vacio';
    const plan = prepareSafeLegacyRecovery(uid, {
      authenticatedUid: uid,
      ownershipConfirmed: true,
    });
    assert.equal(plan.safeToApply, true);
    assert.equal(plan.status, 'ready_to_merge');
    assert.equal(plan.targetWasEmpty, true);
    assert.equal(plan.backupVerified, true);
    assert.equal(plan.conflicts.length, 0);
    assert.deepEqual(plan.monthsAdded, ['2026-05']);

    const execRes = executeSafeLegacyRecovery(uid, {
      authenticatedUid: uid,
      ownershipConfirmed: true,
    });
    assert.equal(execRes.applied, true);
    assert.equal(execRes.status, 'applied');

    // Verificar datos fusionados en destino
    const migratedTarget = loadBudgetState(uid, false);
    assert.equal(migratedTarget.currency, 'USD');
    assert.equal(migratedTarget.monthsData['2026-05']?.income, 350000);
    assert.equal(migratedTarget.monthsData['2026-05']?.fixedExpenses[0]?.name, 'Alquiler Viejo');

    // Verificar fuentes legacy 100% intactas
    assert.equal(localStorage.getItem(LEGACY_STORAGE_KEY), rawLegacyBudget);
    assert.equal(localStorage.getItem(LEGACY_CATEGORIES_STORAGE_KEY), rawLegacyCats);
  });

  test('H. Recuperación legacy con destino con información detecta conflictos y NO sobrescribe datos existentes', () => {
    const legacyBudget = {
      month: 4,
      year: 2026,
      currency: 'ARS',
      monthsData: {
        '2026-05': {
          ...createFreshMonthData(),
          income: 300000,
          fixedExpenses: [{ id: 'f_rent', name: 'Alquiler Legacy', amount: 100000, category: 'housing', isPaid: false }],
        },
      },
    };
    const rawLegacy = JSON.stringify(legacyBudget);
    localStorage.setItem(LEGACY_STORAGE_KEY, rawLegacy);

    const uid = 'usr_con_datos';
    const targetBudget = {
      month: 4,
      year: 2026,
      currency: 'USD' as const,
      monthsData: {
        '2026-05': {
          ...createFreshMonthData(),
          income: 550000,
          fixedExpenses: [{ id: 'f_rent', name: 'Alquiler Actual', amount: 180000, category: 'housing', isPaid: true }],
        },
      },
    };
    saveBudgetState(targetBudget, uid, false);
    const rawTargetBefore = localStorage.getItem(getUserStorageKey(uid));

    const res = executeSafeLegacyRecovery(uid, {
      authenticatedUid: uid,
      ownershipConfirmed: true,
    });

    assert.equal(res.applied, false, 'Debe abortar ante conflictos sin sobrescribir');
    assert.equal(res.status, 'conflicts_detected');
    assert.equal(res.targetWasEmpty, false);
    assert.ok(res.conflicts.some((c) => c.type === 'currency_mismatch'));
    assert.ok(res.conflicts.some((c) => c.type === 'income_mismatch'));
    assert.ok(res.conflicts.some((c) => c.type === 'fixed_expense_conflict'));

    // Ambos almacenamientos intactos
    assert.equal(localStorage.getItem(getUserStorageKey(uid)), rawTargetBefore);
    assert.equal(localStorage.getItem(LEGACY_STORAGE_KEY), rawLegacy);

    // También cuando meses son estrictamente disjuntos y misma moneda, fusiona sin borrar el mes existente
    const uidDisjoint = 'usr_disjunto';
    saveBudgetState(
      {
        month: 5,
        year: 2026,
        currency: 'ARS',
        monthsData: {
          '2026-06': { ...createFreshMonthData(), income: 777000 },
        },
      },
      uidDisjoint,
      false
    );
    const appliedDisjoint = explicitlyMigrateLegacyDataToUser(uidDisjoint, {
      authenticatedUid: uidDisjoint,
      ownershipConfirmed: true,
    });
    assert.equal(appliedDisjoint, true);
    const mergedDisjoint = loadBudgetState(uidDisjoint, false);
    assert.equal(mergedDisjoint.monthsData['2026-06']?.income, 777000, 'No debe perder mes actual');
    assert.equal(mergedDisjoint.monthsData['2026-05']?.income, 300000, 'Debe incorporar mes legacy disjunto');
    assert.equal(localStorage.getItem(LEGACY_STORAGE_KEY), rawLegacy);
  });

  test('I. Respaldo legacy sin propietario identificable no se asigna automáticamente a userA ni userB', () => {
    const rawLegacy = JSON.stringify({
      month: 3,
      year: 2026,
      currency: 'EUR',
      monthsData: {
        '2026-04': { ...createFreshMonthData(), income: 888000 },
      },
    });
    localStorage.setItem(LEGACY_STORAGE_KEY, rawLegacy);

    const userA = 'usr_alice';
    const userB = 'usr_bob';

    // 1. Sin confirmación explícita de titularidad, ninguna cuenta recibe el respaldo legacy
    const resA = executeSafeLegacyRecovery(userA, { authenticatedUid: userA });
    const resB = executeSafeLegacyRecovery(userB, { authenticatedUid: userB });
    assert.equal(resA.applied, false);
    assert.equal(resA.status, 'ownership_unverified');
    assert.equal(resA.ownershipVerified, false);
    assert.equal(resB.applied, false);
    assert.equal(resB.status, 'ownership_unverified');
    assert.equal(resB.ownershipVerified, false);

    // 2. Llamada sin sesión autenticada o con UID distinto también falla cerrado sin escribir destino
    assert.equal(explicitlyMigrateLegacyDataToUser(userA), false);
    const mismatchRes = executeSafeLegacyRecovery(userB, {
      authenticatedUid: userA,
      ownershipConfirmed: true,
    });
    assert.equal(mismatchRes.applied, false);
    assert.equal(mismatchRes.status, 'auth_mismatch');

    assert.equal(localStorage.getItem(getUserStorageKey(userA)), null);
    assert.equal(localStorage.getItem(getUserStorageKey(userB)), null);

    // 3. Carga normal y recuperación automática por UID nunca heredan datos legacy
    const loadedA = loadBudgetState(userA, false);
    const loadedB = loadBudgetState(userB, false);
    assert.equal(loadedA.monthsData['2026-04'], undefined);
    assert.equal(loadedB.monthsData['2026-04'], undefined);
    assert.equal(loadedA.currency, 'ARS');
    assert.equal(loadedB.currency, 'ARS');
    assert.equal(recoverLocalDataSources(userA)['2026-04'], undefined);
    assert.equal(recoverLocalDataSources(userB)['2026-04'], undefined);
    assert.equal(localStorage.getItem(LEGACY_STORAGE_KEY), rawLegacy);
  });

  test('J. Fallo durante una operación de recuperación revierte atómicamente y conserva ambas fuentes intactas', () => {
    const rawLegacy = JSON.stringify({
      month: 3,
      year: 2026,
      currency: 'ARS',
      monthsData: {
        '2026-04': { ...createFreshMonthData(), income: 250000 },
      },
    });
    const rawLegacyCats = JSON.stringify([
      { id: 'cat_old', label: 'Categoría Vieja', color: '#10b981', isCustom: true },
    ]);
    localStorage.setItem(LEGACY_STORAGE_KEY, rawLegacy);
    localStorage.setItem(LEGACY_CATEGORIES_STORAGE_KEY, rawLegacyCats);

    const uid = 'usr_rollback';
    saveBudgetState(
      {
        month: 5,
        year: 2026,
        currency: 'ARS',
        monthsData: {
          '2026-06': { ...createFreshMonthData(), income: 900000 },
        },
      },
      uid,
      false
    );
    const rawTargetBefore = localStorage.getItem(getUserStorageKey(uid));
    const rawTargetCatsBefore = localStorage.getItem(getUserCategoriesKey(uid));

    // Fallo J1: Excepción previa a escritura (p.ej. cuota o error inesperado)
    const failBefore = executeSafeLegacyRecovery(uid, {
      authenticatedUid: uid,
      ownershipConfirmed: true,
      onBeforeTargetWrite: () => {
        throw new Error('Simulated QuotaExceededError');
      },
    });
    assert.equal(failBefore.applied, false);
    assert.equal(failBefore.status, 'write_failed_rolled_back');
    assert.equal(localStorage.getItem(getUserStorageKey(uid)), rawTargetBefore);
    assert.equal(localStorage.getItem(getUserCategoriesKey(uid)), rawTargetCatsBefore);
    assert.equal(localStorage.getItem(LEGACY_STORAGE_KEY), rawLegacy);
    assert.equal(localStorage.getItem(LEGACY_CATEGORIES_STORAGE_KEY), rawLegacyCats);

    // Fallo J2: Fallo a mitad de escritura (setItem tiene éxito en presupuesto pero falla al escribir categorías)
    const flakyStorage = {
      getItem: (k: string) => localStorage.getItem(k),
      setItem: (k: string, v: string) => {
        if (k === getUserCategoriesKey(uid)) {
          throw new Error('Simulated disk full on categories write');
        }
        localStorage.setItem(k, v);
      },
      removeItem: (k: string) => localStorage.removeItem(k),
    };

    const failMidWrite = executeSafeLegacyRecovery(uid, {
      authenticatedUid: uid,
      ownershipConfirmed: true,
      storage: flakyStorage,
    });
    assert.equal(failMidWrite.applied, false);
    assert.equal(failMidWrite.status, 'write_failed_rolled_back');
    assert.equal(localStorage.getItem(getUserStorageKey(uid)), rawTargetBefore, 'Presupuesto destino debe haberse revertido');
    assert.equal(localStorage.getItem(getUserCategoriesKey(uid)), rawTargetCatsBefore);
    assert.equal(localStorage.getItem(LEGACY_STORAGE_KEY), rawLegacy);
    assert.equal(localStorage.getItem(LEGACY_CATEGORIES_STORAGE_KEY), rawLegacyCats);
  });
});

describe('NITA Etapa 2A.2.3 — Correcciones Finales de Autenticación, Sesiones Degradadas, Rollback y Cola Sync (K–O)', () => {
  beforeEach(() => {
    localStorage.clear();
    setMockOnline(true);
    clearSyncSessionValidationState();
  });

  test('K. Clasificación de errores: auth/requires-recent-login exige reautenticación sin revocar ni borrar datos; invalid-user-token y user-not-found son coherentes', async () => {
    const uid = 'usr_reauth_check';
    const persisted: CachedUserData = {
      uid,
      email: null,
      displayName: 'ReauthCheck',
      photoURL: null,
      providerId: 'password',
      sessionEpoch: 3,
    };
    saveActiveSession(persisted);
    saveBudgetState(
      {
        month: 4,
        year: 2026,
        currency: 'ARS',
        monthsData: { '2026-05': { ...createFreshMonthData(), income: 510000 } },
      },
      uid,
      false
    );

    // 1. auth/requires-recent-login en isSessionRevokedError, isRequiresRecentLoginError y mapAuthBackendError
    const rawRecentLogin = Object.assign(new Error('CREDENTIAL_TOO_OLD_LOGIN_AGAIN'), {
      code: 'auth/requires-recent-login',
    });
    assert.equal(isSessionRevokedError(rawRecentLogin), false);
    assert.equal(isRequiresRecentLoginError(rawRecentLogin), true);

    const mappedRecent = mapAuthBackendError(rawRecentLogin, 'change_password');
    assert.equal(mappedRecent.isSessionRevoked, false);
    assert.equal(mappedRecent.requiresReauth, true);
    assert.equal(isSessionRevokedError(mappedRecent), false);
    assert.equal(isRequiresRecentLoginError(mappedRecent), true);
    assert.match(mappedRecent.message, /confirmes tu identidad|vuelve a autenticarte/i);

    // 2. evaluateAuthUserSession con auth/requires-recent-login no destruye sesión ni activa sync
    const fbUserRecent = makeStubAuthUser({
      uid,
      forceHandler: async () => {
        throw rawRecentLogin;
      },
      cacheHandler: async () => ({
        claims: { provider: 'nita_password', sessionEpoch: 3 },
      }),
    });

    const evalRecent = await evaluateAuthUserSession(fbUserRecent, true, getActiveSession());
    assert.equal(evalRecent.status, 'degraded_offline');
    assert.equal(evalRecent.category, 'reauth_required');
    assert.equal(evalRecent.isFirebaseAuthActive, false);
    assert.equal(evalRecent.shouldClearSession, false);
    assert.equal(getActiveSession()?.uid, uid);
    assert.equal(loadBudgetState(uid, false).monthsData['2026-05']?.income, 510000);

    // 3. auth/invalid-user-token y auth/user-not-found se clasifican coherentemente como revocados/inválidos
    for (const code of ['auth/invalid-user-token', 'auth/user-not-found'] as const) {
      const rawErr = Object.assign(new Error(`Error ${code}`), { code });
      assert.equal(isSessionRevokedError(rawErr), true, `${code} debe ser sesión revocada/inválida`);
      assert.equal(isRequiresRecentLoginError(rawErr), false);

      const mapped = mapAuthBackendError(rawErr, 'change_password');
      assert.equal(mapped.isSessionRevoked, true);
      assert.equal(mapped.requiresReauth, false);
      assert.equal(isSessionRevokedError(mapped), true);
      assert.match(mapped.message, /expiró|revocada|no es válida/i);
    }
  });

  test('L. Claims cacheados incompletos ({ aud }) nunca revocan falsamente ni habilitan sync con o sin sesión persistida', async () => {
    const uid = 'usr_incomplete_claims';
    const persisted: CachedUserData = {
      uid,
      email: null,
      displayName: 'ClaimsIncompletos',
      photoURL: null,
      providerId: 'password',
      sessionEpoch: 2,
    };
    saveActiveSession(persisted);

    // L1. Offline con claims cacheados incompletos { aud: '...' } y sesión persistida válida -> degraded_offline, NO revocado
    setMockOnline(false);
    const fbUserOfflineIncomplete = makeStubAuthUser({
      uid,
      cacheHandler: async () => ({ claims: { aud: 'demo-project' } }),
    });
    const evalOffline = await evaluateAuthUserSession(fbUserOfflineIncomplete, false, getActiveSession());
    assert.equal(evalOffline.status, 'degraded_offline');
    assert.equal(evalOffline.category, 'network_error');
    assert.equal(evalOffline.isFirebaseAuthActive, false);
    assert.equal(evalOffline.isOfflineSession, true);
    assert.equal(evalOffline.shouldClearSession, false);
    assert.equal(evalOffline.userData?.uid, uid);

    // L2. Claims cacheados incompletos { aud: '...' } SIN sesión persistida coincidente -> unrecoverable_no_session, sin borrado falso
    const evalNoSession = await evaluateAuthUserSession(fbUserOfflineIncomplete, false, null);
    assert.equal(evalNoSession.status, 'unrecoverable_no_session');
    assert.equal(evalNoSession.isFirebaseAuthActive, false);
    assert.equal(evalNoSession.shouldClearSession, false);
    assert.equal(evalNoSession.userData, null);

    // L3. Error transitorio online (auth/internal-error y auth/network-request-failed) con cache incompleto { aud: '...' } -> degraded_offline
    setMockOnline(true);
    for (const code of ['auth/internal-error', 'auth/network-request-failed'] as const) {
      const fbUserTransient = makeStubAuthUser({
        uid,
        forceHandler: async () => {
          throw Object.assign(new Error(`Transient ${code}`), { code });
        },
        cacheHandler: async () => ({ claims: { aud: 'demo-project' } }),
      });

      const evalTransient = await evaluateAuthUserSession(fbUserTransient, true, getActiveSession());
      assert.equal(evalTransient.status, 'degraded_offline');
      assert.equal(evalTransient.isFirebaseAuthActive, false);
      assert.equal(evalTransient.isOfflineSession, true);
      assert.equal(evalTransient.shouldClearSession, false);
      assert.equal(evalTransient.userData?.uid, uid);
    }
  });

  test('M. Recuperación legacy: rollback verificado, fallo en primera/segunda escritura, lectura fallida, rollback_failed y rollback_unconfirmed', () => {
    const rawLegacy = JSON.stringify({
      month: 3,
      year: 2026,
      currency: 'ARS',
      monthsData: { '2026-04': { ...createFreshMonthData(), income: 210000 } },
    });
    const rawLegacyCats = JSON.stringify([
      { id: 'cat_leg_rb', label: 'Mascotas Legacy', color: '#10b981', isCustom: true },
    ]);
    localStorage.setItem(LEGACY_STORAGE_KEY, rawLegacy);
    localStorage.setItem(LEGACY_CATEGORIES_STORAGE_KEY, rawLegacyCats);

    const uid = 'usr_rollback_matrix';
    saveBudgetState(
      {
        month: 5,
        year: 2026,
        currency: 'ARS',
        monthsData: { '2026-06': { ...createFreshMonthData(), income: 850000 } },
      },
      uid,
      false
    );
    saveGlobalCategories(
      [...DEFAULT_CATEGORIES.map((c) => ({ ...c })), { id: 'cat_keep', label: 'Propia', color: '#111111', isCustom: true }],
      uid,
      false
    );
    const dataKey = getUserStorageKey(uid);
    const catsKey = getUserCategoriesKey(uid);
    const rawTargetBefore = localStorage.getItem(dataKey)!;
    const rawCatsBefore = localStorage.getItem(catsKey)!;

    // M1. Fallo en primera escritura (setItem del presupuesto) + reversión verificada
    const failFirstWriteStorage = {
      getItem: (k: string) => localStorage.getItem(k),
      setItem: (k: string, v: string) => {
        if (k === dataKey && v !== rawTargetBefore) {
          throw new Error('First write rejected');
        }
        localStorage.setItem(k, v);
      },
      removeItem: (k: string) => localStorage.removeItem(k),
    };
    const resFirstWriteFail = executeSafeLegacyRecovery(uid, {
      authenticatedUid: uid,
      ownershipConfirmed: true,
      storage: failFirstWriteStorage,
    });
    assert.equal(resFirstWriteFail.applied, false);
    assert.equal(resFirstWriteFail.status, 'write_failed_rolled_back');
    assert.equal(resFirstWriteFail.rollbackVerified, true);
    assert.equal(resFirstWriteFail.partialStateRisk, false);

    // M2. Fallo en segunda escritura (categorías) + relectura exitosa de rollback
    const failSecondWriteStorage = {
      getItem: (k: string) => localStorage.getItem(k),
      setItem: (k: string, v: string) => {
        if (k === catsKey && v !== rawCatsBefore) {
          throw new Error('Second write rejected');
        }
        localStorage.setItem(k, v);
      },
      removeItem: (k: string) => localStorage.removeItem(k),
    };
    const resSecondWriteFail = executeSafeLegacyRecovery(uid, {
      authenticatedUid: uid,
      ownershipConfirmed: true,
      storage: failSecondWriteStorage,
    });
    assert.equal(resSecondWriteFail.applied, false);
    assert.equal(resSecondWriteFail.status, 'write_failed_rolled_back');
    assert.equal(resSecondWriteFail.rollbackVerified, true);
    assert.deepEqual(resSecondWriteFail.rollbackFailedKeys, []);
    assert.equal(localStorage.getItem(dataKey), rawTargetBefore);
    assert.equal(localStorage.getItem(catsKey), rawCatsBefore);

    // M3. Fallo en lectura de verificación posterior a escritura -> rollback verificado
    let catsReadCount = 0;
    const failVerifyReadStorage = {
      getItem: (k: string) => {
        if (k === catsKey) {
          catsReadCount++;
          // Lectura 1: prepareSafeLegacyRecovery; Lectura 2: snapshot pre-write; Lectura 3: verificación post-write
          if (catsReadCount === 3) {
            return 'corrupted_verify_read';
          }
        }
        return localStorage.getItem(k);
      },
      setItem: (k: string, v: string) => localStorage.setItem(k, v),
      removeItem: (k: string) => localStorage.removeItem(k),
    };
    const resVerifyReadFail = executeSafeLegacyRecovery(uid, {
      authenticatedUid: uid,
      ownershipConfirmed: true,
      storage: failVerifyReadStorage,
    });
    assert.equal(resVerifyReadFail.applied, false);
    assert.equal(resVerifyReadFail.status, 'write_failed_rolled_back');
    assert.equal(resVerifyReadFail.rollbackVerified, true);
    assert.equal(localStorage.getItem(dataKey), rawTargetBefore);
    assert.equal(localStorage.getItem(catsKey), rawCatsBefore);

    // M4. Fallo de rollback en la PRIMERA clave (rollback_failed)
    let dataSetCalls = 0;
    const failRollbackFirstStorage = {
      getItem: (k: string) => localStorage.getItem(k),
      setItem: (k: string, v: string) => {
        if (k === dataKey) {
          dataSetCalls++;
          if (dataSetCalls === 2) {
            throw new Error('Rollback write failed on dataKey');
          }
        }
        if (k === catsKey && v !== rawCatsBefore) {
          throw new Error('Trigger rollback');
        }
        localStorage.setItem(k, v);
      },
      removeItem: (k: string) => localStorage.removeItem(k),
    };
    const resRollbackFailFirst = executeSafeLegacyRecovery(uid, {
      authenticatedUid: uid,
      ownershipConfirmed: true,
      storage: failRollbackFirstStorage,
    });
    assert.equal(resRollbackFailFirst.applied, false);
    assert.equal(resRollbackFailFirst.status, 'rollback_failed');
    assert.equal(resRollbackFailFirst.rollbackVerified, false);
    assert.equal(resRollbackFailFirst.partialStateRisk, true);
    assert.ok(resRollbackFailFirst.rollbackFailedKeys?.includes(dataKey));

    // Restaurar snapshot limpio antes de M5
    localStorage.setItem(dataKey, rawTargetBefore);
    localStorage.setItem(catsKey, rawCatsBefore);

    // M5. Fallo de rollback en la SEGUNDA clave (rollback_failed)
    const failRollbackSecondStorage = {
      getItem: (k: string) => localStorage.getItem(k),
      setItem: (k: string, v: string) => {
        if (k === catsKey) {
          // Falla tanto al escribir merged como al revertir
          throw new Error('Cats key locked for writes');
        }
        localStorage.setItem(k, v);
      },
      removeItem: (k: string) => localStorage.removeItem(k),
    };
    const resRollbackFailSecond = executeSafeLegacyRecovery(uid, {
      authenticatedUid: uid,
      ownershipConfirmed: true,
      storage: failRollbackSecondStorage,
    });
    assert.equal(resRollbackFailSecond.applied, false);
    assert.equal(resRollbackFailSecond.status, 'rollback_failed');
    assert.equal(resRollbackFailSecond.rollbackVerified, false);
    assert.equal(resRollbackFailSecond.partialStateRisk, true);
    assert.ok(resRollbackFailSecond.rollbackFailedKeys?.includes(catsKey));

    // M6. Relectura NO confirmada después de rollback (rollback_unconfirmed)
    let rollbackTriggered = false;
    const unconfirmedRollbackStorage = {
      getItem: (k: string) => {
        if (rollbackTriggered && k === dataKey) {
          return '{"stale":"corrupted"}';
        }
        return localStorage.getItem(k);
      },
      setItem: (k: string, v: string) => {
        if (k === catsKey && v !== rawCatsBefore) {
          rollbackTriggered = true;
          throw new Error('Force rollback');
        }
        localStorage.setItem(k, v);
      },
      removeItem: (k: string) => localStorage.removeItem(k),
    };
    const resUnconfirmed = executeSafeLegacyRecovery(uid, {
      authenticatedUid: uid,
      ownershipConfirmed: true,
      storage: unconfirmedRollbackStorage,
    });
    assert.equal(resUnconfirmed.applied, false);
    assert.equal(resUnconfirmed.status, 'rollback_unconfirmed');
    assert.equal(resUnconfirmed.rollbackVerified, false);
    assert.equal(resUnconfirmed.partialStateRisk, true);
    assert.ok(resUnconfirmed.rollbackFailedKeys?.includes(dataKey));

    // Fuente legacy siempre intacta en todos los escenarios
    assert.equal(localStorage.getItem(LEGACY_STORAGE_KEY), rawLegacy);
    assert.equal(localStorage.getItem(LEGACY_CATEGORIES_STORAGE_KEY), rawLegacyCats);
  });

  test('N. Recuperación legacy detecta conflictos en jarAdjustments, lastJarAdjustmentLog, MonthData.categories, metadatos de categorías, moneda con 0 movimientos y duplicados semánticos', () => {
    // Subcaso N1: Moneda distinta cuando cuenta destino está inicializada con 0 movimientos/ingresos
    localStorage.setItem(
      LEGACY_STORAGE_KEY,
      JSON.stringify({
        month: 4,
        year: 2026,
        currency: 'EUR',
        monthsData: {
          '2026-04': { ...createFreshMonthData(), income: 1200 },
        },
      })
    );

    const uidZero = 'usr_zero_movs_currency';
    saveBudgetState(
      {
        month: 4,
        year: 2026,
        currency: 'USD',
        monthsData: { '2026-05': createFreshMonthData() },
      },
      uidZero,
      false
    );
    const planZeroCurrency = prepareSafeLegacyRecovery(uidZero, {
      authenticatedUid: uidZero,
      ownershipConfirmed: true,
    });
    assert.equal(planZeroCurrency.safeToApply, false);
    assert.equal(planZeroCurrency.status, 'conflicts_detected');
    assert.ok(planZeroCurrency.conflicts.some((c) => c.type === 'currency_mismatch'));

    // Subcaso N2: jarAdjustments, lastJarAdjustmentLog, MonthData.categories, metadatos globales y duplicados semánticos
    const legacyComplexBudget = {
      month: 4,
      year: 2026,
      currency: 'ARS',
      monthsData: {
        '2026-05': {
          ...createFreshMonthData(),
          income: 500000,
          categories: DEFAULT_CATEGORIES.map((c) =>
            c.id === 'food'
              ? { ...c, isCustom: true, badgeBg: '#dcfce7', badgeText: '#166534' }
              : { ...c }
          ),
          jarAdjustments: { 0: -5000 },
          lastJarAdjustmentLog: {
            date: '2026-05-10',
            exceededJarTitle: 'Necesidades',
            diff: 5000,
            transferredToNextMonth: false,
          },
          fixedExpenses: [
            { id: 'f_legacy_99', name: '  Alquiler  Depto ', amount: 180000, category: 'housing', isPaid: true },
          ],
          variableExpenses: [
            { id: 'v_legacy_88', date: '2026-05-12', description: 'Supermercado  Coto', amount: 42500, category: 'food' },
          ],
        },
      },
    };
    const legacyComplexCats = DEFAULT_CATEGORIES.map((c) =>
      c.id === 'housing'
        ? { ...c, isCustom: true, badgeBg: '#eef2ff', badgeText: '#312e81' }
        : { ...c }
    );
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(legacyComplexBudget));
    localStorage.setItem(LEGACY_CATEGORIES_STORAGE_KEY, JSON.stringify(legacyComplexCats));

    const uidTarget = 'usr_complex_conflicts';
    saveBudgetState(
      {
        month: 4,
        year: 2026,
        currency: 'ARS',
        monthsData: {
          '2026-05': {
            ...createFreshMonthData(),
            income: 500000,
            categories: DEFAULT_CATEGORIES.map((c) =>
              c.id === 'food'
                ? { ...c, isCustom: false, badgeBg: '#fee2e2', badgeText: '#991b1b' }
                : { ...c }
            ),
            jarAdjustments: { 0: 12000 },
            lastJarAdjustmentLog: {
              date: '2026-05-11',
              exceededJarTitle: 'Ahorro',
              diff: 9000,
              transferredToNextMonth: true,
              nextMonthKey: '2026-06',
            },
            fixedExpenses: [
              { id: 'f_target_11', name: 'Alquiler Depto', amount: 180000, category: 'housing', isPaid: false },
            ],
            variableExpenses: [
              { id: 'v_target_22', date: '2026-05-12', description: 'supermercado coto', amount: 42500, category: 'food' },
            ],
          },
        },
      },
      uidTarget,
      false
    );
    saveGlobalCategories(
      DEFAULT_CATEGORIES.map((c) =>
        c.id === 'housing'
          ? { ...c, isCustom: false, badgeBg: '#000000', badgeText: '#ffffff' }
          : { ...c }
      ),
      uidTarget,
      false
    );

    const rawTargetFixedBefore = localStorage.getItem(getUserStorageKey(uidTarget));
    const execComplex = executeSafeLegacyRecovery(uidTarget, {
      authenticatedUid: uidTarget,
      ownershipConfirmed: true,
    });
    assert.equal(execComplex.applied, false);
    assert.equal(execComplex.status, 'conflicts_detected');

    const conflictTypes = new Set(execComplex.conflicts.map((c) => c.type));
    assert.ok(conflictTypes.has('category_conflict'), 'Debe detectar diferencia en isCustom/badgeBg/badgeText global');
    assert.ok(conflictTypes.has('month_category_conflict'), 'Debe detectar diferencia en MonthData.categories');
    assert.ok(conflictTypes.has('jar_adjustments_conflict'), 'Debe detectar conflicto en jarAdjustments');
    assert.ok(conflictTypes.has('jar_adjustment_log_conflict'), 'Debe detectar conflicto en lastJarAdjustmentLog');
    assert.ok(conflictTypes.has('semantic_duplicate_fixed_expense'), 'Debe detectar duplicado semántico de gasto fijo con distinto ID');
    assert.ok(conflictTypes.has('semantic_duplicate_variable_expense'), 'Debe detectar duplicado semántico de gasto variable con distinto ID');

    // Ningún ítem se auto-elimina ni sobrescribe
    assert.equal(localStorage.getItem(getUserStorageKey(uidTarget)), rawTargetFixedBefore);
    assert.equal(loadBudgetState(uidTarget, false).monthsData['2026-05']?.fixedExpenses.length, 1);
    assert.equal(loadBudgetState(uidTarget, false).monthsData['2026-05']?.variableExpenses.length, 1);
  });

  test('O. processPendingSyncQueue falla cerrado en sesión degradada incluso si se invoca directamente con authUser coincidente', async () => {
    setMockOnline(true);
    const userA = 'usr_queue_gate_a';
    const userB = 'usr_queue_gate_b';
    const uploaded: Array<{ uid: string; monthKey: string }> = [];

    enqueuePendingMonth(
      userA,
      '2026-08',
      2026,
      7,
      { ...createFreshMonthData(), income: 440000 },
      'op_gate_a'
    );
    enqueuePendingMonth(
      userB,
      '2026-09',
      2026,
      8,
      { ...createFreshMonthData(), income: 660000 },
      'op_gate_b'
    );

    const mockSaveMonth = async (uid: string, monthKey: string) => {
      uploaded.push({ uid, monthKey });
    };

    // 1. Sesión degradada (syncSessionGate cerrado) -> aunque authUser coincida, NO procesa la cola
    assert.equal(isSyncSessionValidatedForUser(userA), false);
    const degradedRes = await processPendingSyncQueue(userA, {
      authUser: { uid: userA },
      saveMonthFn: mockSaveMonth,
    });
    assert.equal(degradedRes.syncedCount, 0);
    assert.equal(degradedRes.remainingCount, 1);
    assert.equal(uploaded.length, 0);
    assert.equal(getPendingSyncQueue(userA).length, 1);

    // 2. Sesión validada online para userA -> procesa solo userA y deja intacta la cola de userB
    setSyncSessionValidationState(userA, true);
    assert.equal(isSyncSessionValidatedForUser(userA), true);
    assert.equal(isSyncSessionValidatedForUser(userB), false);

    // Aunque alguien intente procesar userB pasando authUser=userB, el gate activo pertenece solo a userA -> bloqueado
    const wrongUserGateRes = await processPendingSyncQueue(userB, {
      authUser: { uid: userB },
      saveMonthFn: mockSaveMonth,
    });
    assert.equal(wrongUserGateRes.syncedCount, 0);
    assert.equal(wrongUserGateRes.remainingCount, 1);
    assert.equal(uploaded.length, 0);

    // Procesamiento legítimo de userA
    const validResA = await processPendingSyncQueue(userA, {
      authUser: { uid: userA },
      saveMonthFn: mockSaveMonth,
    });
    assert.equal(validResA.syncedCount, 1);
    assert.equal(validResA.remainingCount, 0);
    assert.deepEqual(uploaded, [{ uid: userA, monthKey: '2026-08' }]);
    assert.equal(getPendingSyncQueue(userA).length, 0);
    assert.equal(getPendingSyncQueue(userB).length, 1);
  });
});
