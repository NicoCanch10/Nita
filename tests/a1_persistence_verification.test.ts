import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Mock localStorage for Node test runner with actual physical storage inspection
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

import { 
  createFreshMonthData,
  saveBudgetState,
  loadBudgetState,
  enqueuePendingMonth,
  getPendingSyncQueue,
  hasPendingSync,
  generateOpId,
  recoverLocalDataSources,
  mergeMonthData,
  hasRealUserContent,
  resolveStorageKeys,
  GUEST_STORAGE_KEY,
  saveGlobalCategories,
  loadGlobalCategories,
  verifyGlobalCategoriesPersisted,
  areCategoryListsEqual
} from '../src/utils/storage';
import { 
  LocalPersistenceController, 
  VersionedBudgetSnapshot,
  confirmServerInitialSyncPersistence,
  mergeAndPersistManualSync,
  applyPostInitMonthsPersistence,
  applyRemoteGlobalCategoriesPersistence
} from '../src/utils/persistenceController';
import {
  savePendingConflicts,
  getPendingConflicts,
  areMonthDataEqual,
  processRemoteMonthsSnapshot,
  handleUserMonthsSnapshot,
  MonthConflictInfo
} from '../src/services/budgetSyncService';
import { BudgetState, CategoryInfo, MonthData } from '../src/types/budget';
import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import * as fs from 'node:fs';
import * as path from 'node:path';

const verifyStorageExists = (uId?: string | null, guest?: boolean): boolean => {
  if (typeof localStorage === 'undefined') return false;
  const key = guest ? 'nita_guest_data' : (uId ? `nita_user_data_${uId}` : null);
  if (!key) return false;
  const raw = localStorage.getItem(key);
  return Boolean(raw && raw.length > 5);
};

describe('NITA ETAPA A - Pruebas Obligatorias de Persistencia Local y Versionado (A-1.5)', () => {
  const userId = 'user_test_a1_master';
  const monthKey = '2026-10';

  beforeEach(() => {
    localStorage.clear();
  });

  // 1. Reintento con snapshot vigente y versión correcta: escritura aprobada
  test('1. Reintento con snapshot vigente y versión correcta: escritura aprobada', () => {
    const controller = new LocalPersistenceController(userId, false, false);
    controller.markStorageFailure();

    const snapshotV2: BudgetState = {
      month: 9,
      year: 2026,
      currency: 'ARS',
      monthsData: { [monthKey]: { ...createFreshMonthData(), income: 5000 } },
    };

    const v2 = controller.incrementMutationVersion(snapshotV2);
    const versionedUnit = controller.createVersionedSnapshot(snapshotV2, v2);

    const success = controller.retryPersistence(versionedUnit, saveBudgetState);

    assert.equal(success, true, 'El reintento con snapshot y versión vigentes debe aprobarse');
    assert.equal(controller.getLastPersistedVersion(), v2, 'La versión persistida debe ser exactamente v2');
    assert.equal(controller.hasLocalStorageFailure(), false, 'La bandera de fallo debe limpiarse');

    const raw = localStorage.getItem(`nita_user_data_${userId}`);
    assert.ok(raw, 'El registro físico debe existir en localStorage');
    const parsed = JSON.parse(raw!);
    assert.equal(parsed.monthsData[monthKey]?.income, 5000, 'El contenido persistido debe reflejar 5000');
  });

  // 2. Reintento con snapshot antiguo y versión ausente: operación rechazada
  test('2. Reintento con snapshot antiguo y versión ausente: operación rechazada', () => {
    const controller = new LocalPersistenceController(userId, false, false);
    let saveFnCalls = 0;
    const spySaveFn = (state: BudgetState, uId?: string | null, isG?: boolean) => {
      saveFnCalls++;
      return saveBudgetState(state, uId, isG);
    };

    const oldSnapshot: BudgetState = {
      month: 9,
      year: 2026,
      currency: 'ARS',
      monthsData: { [monthKey]: { ...createFreshMonthData(), income: 1000 } },
    };

    // Intento de reintento sin versión (undefined)
    const success = controller.retryPersistence(
      oldSnapshot,
      undefined as any,
      userId,
      false,
      controller.getSessionEpoch(),
      spySaveFn
    );

    assert.equal(success, false, 'El reintento sin versión esperada debe ser rechazado');
    assert.equal(saveFnCalls, 0, 'saveFn NUNCA debe ejecutarse cuando falta la versión');
    assert.equal(localStorage.getItem(`nita_user_data_${userId}`), null, 'El almacenamiento debe permanecer intacto');
  });

  // 3. Reintento con snapshot antiguo y versión nueva incorrectamente indicada: operación rechazada
  test('3. Reintento con snapshot antiguo y versión nueva incorrectamente indicada: operación rechazada', () => {
    const controller = new LocalPersistenceController(userId, false, false);
    let saveFnCalls = 0;
    const spySaveFn = (state: BudgetState, uId?: string | null, isG?: boolean) => {
      saveFnCalls++;
      return saveBudgetState(state, uId, isG);
    };

    // Estado vigente registrado en v2 con income 3000
    const snapshotV2: BudgetState = {
      month: 9,
      year: 2026,
      currency: 'ARS',
      monthsData: { [monthKey]: { ...createFreshMonthData(), income: 3000 } },
    };
    const v2 = controller.incrementMutationVersion(snapshotV2);
    controller.createVersionedSnapshot(snapshotV2, v2);

    // Caller malicioso o callback desincronizado pasa snapshot de v1 (income: 1000) pero falsamente indica version: 2
    const oldSnapshotV1: BudgetState = {
      month: 9,
      year: 2026,
      currency: 'ARS',
      monthsData: { [monthKey]: { ...createFreshMonthData(), income: 1000 } },
    };

    const success = controller.retryPersistence(
      oldSnapshotV1,
      v2,
      userId,
      false,
      controller.getSessionEpoch(),
      spySaveFn
    );

    assert.equal(success, false, 'El reintento con snapshot que no corresponde a la versión registrada debe ser rechazado');
    assert.equal(saveFnCalls, 0, 'saveFn NUNCA debe ejecutarse con snapshot no correspondiente');
    assert.equal(localStorage.getItem(`nita_user_data_${userId}`), null, 'El almacenamiento no debe ser contaminado con el snapshot antiguo');
  });

  // 4. Reintento con versión antigua: operación rechazada
  test('4. Reintento con versión antigua: operación rechazada', () => {
    const controller = new LocalPersistenceController(userId, false, false);
    let saveFnCalls = 0;
    const spySaveFn = (state: BudgetState, uId?: string | null, isG?: boolean) => {
      saveFnCalls++;
      return saveBudgetState(state, uId, isG);
    };

    // Controller avanza a v2
    const snapshotV2: BudgetState = {
      month: 9,
      year: 2026,
      currency: 'ARS',
      monthsData: { [monthKey]: { ...createFreshMonthData(), income: 2500 } },
    };
    controller.incrementMutationVersion(snapshotV2);

    const snapshotV1: BudgetState = {
      month: 9,
      year: 2026,
      currency: 'ARS',
      monthsData: { [monthKey]: { ...createFreshMonthData(), income: 1000 } },
    };

    // Intento con version: 1 cuando mutationVersion es 2
    const success = controller.retryPersistence(
      snapshotV1,
      1,
      userId,
      false,
      controller.getSessionEpoch(),
      spySaveFn
    );

    assert.equal(success, false, 'El reintento con versión obsoleta debe ser rechazado');
    assert.equal(saveFnCalls, 0, 'saveFn no debe ejecutarse con versión obsoleta');
  });

  // 5. Reintento con identidad de usuario incorrecta: operación rechazada
  test('5. Reintento con identidad de usuario incorrecta: operación rechazada', () => {
    const controller = new LocalPersistenceController(userId, false, false);
    let saveFnCalls = 0;
    const spySaveFn = (state: BudgetState, uId?: string | null, isG?: boolean) => {
      saveFnCalls++;
      return saveBudgetState(state, uId, isG);
    };

    const snapshot: BudgetState = {
      month: 9,
      year: 2026,
      currency: 'ARS',
      monthsData: { [monthKey]: createFreshMonthData() },
    };
    const unit = controller.createVersionedSnapshot(snapshot, 1);

    // Caller pasa userId diferente
    const success = controller.retryPersistence(
      snapshot,
      1,
      'different_user_id',
      false,
      controller.getSessionEpoch(),
      spySaveFn
    );

    assert.equal(success, false, 'Reintento con discordancia de identidad debe ser rechazado');
    assert.equal(saveFnCalls, 0);
  });

  // 6. Reintento con época de sesión anterior: operación rechazada
  test('6. Reintento con época de sesión anterior: operación rechazada', () => {
    const controller = new LocalPersistenceController(userId, false, false);
    const oldEpoch = controller.getSessionEpoch();

    const snapshot: BudgetState = {
      month: 9,
      year: 2026,
      currency: 'ARS',
      monthsData: { [monthKey]: createFreshMonthData() },
    };
    controller.createVersionedSnapshot(snapshot, 1);

    // Simular reinicio de sesión (incrementa epoch)
    controller.reset(userId, false, false);
    assert.notEqual(controller.getSessionEpoch(), oldEpoch);

    let saveFnCalls = 0;
    const spySaveFn = (state: BudgetState, uId?: string | null, isG?: boolean) => {
      saveFnCalls++;
      return saveBudgetState(state, uId, isG);
    };

    const success = controller.retryPersistence(
      snapshot,
      1,
      userId,
      false,
      oldEpoch, // Época expirada
      spySaveFn
    );

    assert.equal(success, false, 'Reintento con época de sesión expirada debe ser rechazado');
    assert.equal(saveFnCalls, 0);
  });

  // 7. Mutación durante el ciclo de reintento: el snapshot anterior no sobrescribe el nuevo
  test('7. Mutación durante el ciclo de reintento: el snapshot anterior no sobrescribe el nuevo', () => {
    const controller = new LocalPersistenceController(userId, false, false);
    const snapshotV1: BudgetState = {
      month: 9,
      year: 2026,
      currency: 'ARS',
      monthsData: { [monthKey]: { ...createFreshMonthData(), income: 2000 } },
    };
    controller.createVersionedSnapshot(snapshotV1, 1);

    // Simular que durante el guardado se produce una nueva mutación en memoria
    const reentrantSaveFn = (state: BudgetState, uId?: string | null, isG?: boolean) => {
      // Llega una nueva mutación a v2 antes de que el guardado termine
      controller.incrementMutationVersion({
        ...state,
        monthsData: { [monthKey]: { ...createFreshMonthData(), income: 4000 } },
      });
      return saveBudgetState(state, uId, isG);
    };

    const success = controller.retryPersistence(
      snapshotV1,
      1,
      userId,
      false,
      controller.getSessionEpoch(),
      reentrantSaveFn
    );

    assert.equal(success, false, 'La verificación post-escritura debe rechazar confirmar un snapshot si la versión mutó');
    assert.notEqual(controller.getLastPersistedVersion(), controller.getMutationVersion());
  });

  // 8. Reintento válido después de una mutación: se persiste el snapshot más reciente
  test('8. Reintento válido después de una mutación: se persiste el snapshot más reciente', () => {
    const controller = new LocalPersistenceController(userId, false, false);
    controller.markStorageFailure();

    // v1 mutó a v2
    const snapshotV2: BudgetState = {
      month: 9,
      year: 2026,
      currency: 'ARS',
      monthsData: { [monthKey]: { ...createFreshMonthData(), income: 4000 } },
    };
    const v2 = controller.incrementMutationVersion(snapshotV2);
    const unitV2 = controller.createVersionedSnapshot(snapshotV2, v2);

    const success = controller.retryPersistence(unitV2, saveBudgetState);
    assert.equal(success, true);
    assert.equal(controller.getLastPersistedVersion(), v2);
    assert.equal(controller.hasLocalStorageFailure(), false);

    const raw = localStorage.getItem(`nita_user_data_${userId}`);
    assert.equal(JSON.parse(raw!).monthsData[monthKey]?.income, 4000);
  });

  // 9. Error de almacenamiento: no se confirma la versión
  test('9. Error de almacenamiento: no se confirma la versión', () => {
    const controller = new LocalPersistenceController(userId, false, false);
    const snapshot: BudgetState = {
      month: 9,
      year: 2026,
      currency: 'ARS',
      monthsData: { [monthKey]: createFreshMonthData() },
    };
    const unit = controller.createVersionedSnapshot(snapshot, 1);

    const failingSaveFn = () => false;
    const success = controller.retryPersistence(unit, failingSaveFn);

    assert.equal(success, false);
    assert.equal(controller.getLastPersistedVersion(), 0);
    assert.equal(controller.hasLocalStorageFailure(), true);
  });

  // 10. Snapshot obsoleto: el contenido físico del almacenamiento permanece intacto
  test('10. Snapshot obsoleto: el contenido físico del almacenamiento permanece intacto', () => {
    const controller = new LocalPersistenceController(userId, false, false);
    // 1. Guardar con éxito versión inicial legítima (income: 7000)
    const legitSnapshot: BudgetState = {
      month: 9,
      year: 2026,
      currency: 'ARS',
      monthsData: { [monthKey]: { ...createFreshMonthData(), income: 7000 } },
    };
    const unitLegit = controller.createVersionedSnapshot(legitSnapshot, 1);
    controller.commitSnapshot(unitLegit, saveBudgetState);

    const rawAfterLegit = localStorage.getItem(`nita_user_data_${userId}`);
    assert.equal(JSON.parse(rawAfterLegit!).monthsData[monthKey]?.income, 7000);

    // 2. Incrementar versión a 2
    controller.incrementMutationVersion({
      ...legitSnapshot,
      monthsData: { [monthKey]: { ...createFreshMonthData(), income: 8000 } },
    });

    // 3. Intento obsoleto con snapshot antiguo (income: 500)
    const obsoleteSnapshot: BudgetState = {
      month: 9,
      year: 2026,
      currency: 'ARS',
      monthsData: { [monthKey]: { ...createFreshMonthData(), income: 500 } },
    };

    let saveFnCalls = 0;
    const spySaveFn = (state: BudgetState, uId?: string | null, isG?: boolean) => {
      saveFnCalls++;
      return saveBudgetState(state, uId, isG);
    };

    const result = controller.retryPersistence(
      obsoleteSnapshot,
      1,
      userId,
      false,
      controller.getSessionEpoch(),
      spySaveFn
    );

    assert.equal(result, false);
    assert.equal(saveFnCalls, 0);

    // 4. Verificar contenido físico en disco
    const rawFinal = localStorage.getItem(`nita_user_data_${userId}`);
    assert.equal(JSON.parse(rawFinal!).monthsData[monthKey]?.income, 7000, 'El disco físico debe conservar 7000 intacto');
  });

  // 11. markHydrated() no puede utilizarse para confirmar datos que nunca fueron hidratados
  test('11. markHydrated() no puede utilizarse para confirmar datos que nunca fueron hidratados', () => {
    const controller = new LocalPersistenceController(userId, false, false);
    assert.equal(controller.getLastPersistedVersion(), 0);

    // localStorage está vacío para este usuario
    const success = controller.markHydrated(1, userId, false, verifyStorageExists);
    assert.equal(success, false, 'markHydrated debe ser rechazado si el almacenamiento físico está vacío');
    assert.equal(controller.getLastPersistedVersion(), 0, 'No debe registrarse versión persistida');
  });

  // 12. setLastPersistedVersion() no permite una confirmación artificial desde rutas productivas
  test('12. setLastPersistedVersion() no permite una confirmación artificial desde rutas productivas', () => {
    const controller = new LocalPersistenceController(userId, false, false);
    assert.equal(controller.getLastPersistedVersion(), 0);

    // Llamada sin verificador de almacenamiento
    const unverifiedResult = controller.setLastPersistedVersion(1);
    assert.equal(unverifiedResult, false, 'setLastPersistedVersion debe rechazar llamadas no verificadas');
    assert.equal(controller.getLastPersistedVersion(), 0);
  });

  // 13. Cambio de usuario: las operaciones anteriores quedan invalidadas
  test('13. Cambio de usuario: las operaciones anteriores quedan invalidadas', () => {
    const controller = new LocalPersistenceController('user_A', false, false);
    const snapshotUserA: BudgetState = {
      month: 9,
      year: 2026,
      currency: 'ARS',
      monthsData: { [monthKey]: { ...createFreshMonthData(), income: 9999 } },
    };
    const unitUserA = controller.createVersionedSnapshot(snapshotUserA, 1);

    // Cambio de usuario a user_B
    controller.reset('user_B', false, false, verifyStorageExists);

    const retryResult = controller.retryPersistence(unitUserA, saveBudgetState);
    assert.equal(retryResult, false, 'Operaciones del usuario anterior deben ser rechazadas');
    assert.equal(localStorage.getItem('nita_user_data_user_B'), null);
  });

  // 14. Cierre de sesión y nuevo inicio: no se mezclan snapshots
  test('14. Cierre de sesión y nuevo inicio: no se mezclan snapshots', () => {
    const controller = new LocalPersistenceController('user_A', false, false);
    const snapshotUserA: BudgetState = {
      month: 9,
      year: 2026,
      currency: 'ARS',
      monthsData: { [monthKey]: { ...createFreshMonthData(), income: 1111 } },
    };
    const unitA = controller.createVersionedSnapshot(snapshotUserA, 1);

    // Logout
    controller.reset(null, false, false);
    assert.equal(controller.getCurrentUserId(), null);

    // Login nuevo usuario B
    controller.reset('user_B', false, false);

    // Intento tardío de guardar snapshot de User A
    const saved = controller.commitSnapshot(unitA, saveBudgetState);
    assert.equal(saved, false);
    assert.equal(localStorage.getItem('nita_user_data_user_B'), null);
  });

  // 15. canDeclareSynced() permanece falso si existe una persistencia local pendiente
  test('15. canDeclareSynced() permanece falso si existe una persistencia local pendiente', () => {
    const controller = new LocalPersistenceController(userId, false, false);
    // Persistir versión 1
    const snapshot: BudgetState = {
      month: 9,
      year: 2026,
      currency: 'ARS',
      monthsData: { [monthKey]: createFreshMonthData() },
    };
    const unit = controller.createVersionedSnapshot(snapshot, 1);
    controller.commitSnapshot(unit, saveBudgetState);
    assert.equal(controller.getLastPersistedVersion(), 1);

    // Se produce una mutación local a versión 2 (aún no persistida)
    controller.incrementMutationVersion();
    assert.equal(controller.getMutationVersion(), 2);
    assert.equal(controller.getLastPersistedVersion(), 1);

    const canSync = controller.canDeclareSynced({
      userId,
      isCloudSyncReady: true,
      isOnline: true,
      isOfflineSession: false,
      hasPendingSync: false,
      unresolvedConflictCount: 0,
    });

    assert.equal(canSync, false, 'canDeclareSynced debe ser falso mientras lastPersistedVersion < mutationVersion');
  });

  // 16. La aplicación no declara sincronización completa después de un reintento rechazado
  test('16. La aplicación no declara sincronización completa después de un reintento rechazado', () => {
    const controller = new LocalPersistenceController(userId, false, false);
    controller.markStorageFailure();

    const staleSnapshot: BudgetState = {
      month: 9,
      year: 2026,
      currency: 'ARS',
      monthsData: { [monthKey]: createFreshMonthData() },
    };

    // Reintento rechazado por versión incorrecta
    const retryResult = controller.retryPersistence(
      staleSnapshot,
      999, // Versión inválida
      userId,
      false,
      controller.getSessionEpoch(),
      saveBudgetState
    );
    assert.equal(retryResult, false);

    const canSync = controller.canDeclareSynced({
      userId,
      isCloudSyncReady: true,
      isOnline: true,
      isOfflineSession: false,
      hasPendingSync: false,
      unresolvedConflictCount: 0,
    });

    assert.equal(canSync, false, 'No puede declarar synced después de un reintento rechazado');
  });

  // 17. CommitSnapshot con VersionedBudgetSnapshot válido
  test('17. CommitSnapshot con VersionedBudgetSnapshot válido confirma versión y almacenamiento', () => {
    const controller = new LocalPersistenceController(userId, false, false);
    const snapshot: BudgetState = {
      month: 9,
      year: 2026,
      currency: 'ARS',
      monthsData: { [monthKey]: { ...createFreshMonthData(), income: 6000 } },
    };
    const unit = controller.createVersionedSnapshot(snapshot, 1);
    const success = controller.commitSnapshot(unit, saveBudgetState);

    assert.equal(success, true);
    assert.equal(controller.getLastPersistedVersion(), 1);

    const raw = localStorage.getItem(`nita_user_data_${userId}`);
    assert.equal(JSON.parse(raw!).monthsData[monthKey]?.income, 6000);
  });

  // 18. Mutaciones de moneda, categorías y navegación quedan versionadas con VersionedBudgetSnapshot
  test('18. Mutaciones de moneda y navegación quedan versionadas con VersionedBudgetSnapshot', () => {
    const controller = new LocalPersistenceController(userId, false, false);
    const snapshot: BudgetState = {
      month: 9,
      year: 2026,
      currency: 'ARS',
      monthsData: { [monthKey]: createFreshMonthData() },
    };
    controller.commitSnapshot(controller.createVersionedSnapshot(snapshot, 1), saveBudgetState);

    // Cambio de moneda a USD
    const v2 = controller.incrementMutationVersion();
    const updatedUSD: BudgetState = { ...snapshot, currency: 'USD' };
    const unitUSD = controller.createVersionedSnapshot(updatedUSD, v2);
    const successUSD = controller.commitSnapshot(unitUSD, saveBudgetState);

    assert.equal(successUSD, true);
    assert.equal(controller.getLastPersistedVersion(), v2);
    assert.equal(JSON.parse(localStorage.getItem(`nita_user_data_${userId}`)!).currency, 'USD');
  });
});

describe('NITA — Pruebas Obligatorias de Corrección de Persistencia y Sincronización (A - F)', () => {
  const userId = 'user_sync_fix_verification';
  const monthKey = '2026-11';

  const realVerifyStorageExists = (uId?: string | null, guest?: boolean): boolean => {
    if (typeof localStorage === 'undefined') return false;
    const { dataKey } = resolveStorageKeys(uId, guest);
    if (!dataKey) return false;
    const raw = localStorage.getItem(dataKey);
    return Boolean(raw && raw.length > 5);
  };

  beforeEach(() => {
    localStorage.clear();
  });

  test('A. Primera inicialización con Firestore confirmado: no rechaza la versión 1 ni bloquea la sincronización', () => {
    // Simular primera carga de usuario con estado inicial en storage (hasRecord = true)
    loadBudgetState(userId, false);
    const controller = new LocalPersistenceController(userId, false, true);
    assert.equal(controller.getMutationVersion(), 1);
    assert.equal(controller.getLastPersistedVersion(), 1);

    const serverSnapshot: BudgetState = {
      month: 10,
      year: 2026,
      currency: 'ARS',
      monthsData: {
        [monthKey]: {
          ...createFreshMonthData(),
          income: 125000,
          fixedExpenses: [{ id: 'f_server_1', name: 'Alquiler', amount: 45000, category: 'vivienda', isPaid: true }],
        },
      },
    };

    const warnings: string[] = [];
    const origWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(a => String(a)).join(' '));
    };

    try {
      const res = confirmServerInitialSyncPersistence<MonthConflictInfo>({
        controller,
        snapshot: serverSnapshot,
        userId,
        conflicts: {},
        storageVerifier: realVerifyStorageExists,
        saveBudgetFn: saveBudgetState,
        saveConflictsFn: savePendingConflicts,
      });

      assert.equal(res.ok, true, 'La inicialización con servidor confirmado debe completarse exitosamente');
      assert.equal(res.budgetSaved, true);
      assert.equal(res.conflictsSaved, true);
      assert.equal(res.usedVersion, 1);
      assert.equal(res.mode, 'hydrated');
      assert.equal(
        warnings.some(w => w.includes('Commit rejected')),
        false,
        `No debe emitirse rechazo de commit en inicialización normal. Warnings: ${warnings.join('; ')}`
      );

      // Verificar que el controlador permite habilitar isCloudSyncReady y declarar synced
      assert.equal(
        controller.canDeclareSynced({
          userId,
          isCloudSyncReady: true,
          isOnline: true,
          isOfflineSession: false,
          hasPendingSync: hasPendingSync(userId),
          unresolvedConflictCount: Object.keys(getPendingConflicts(userId)).length,
        }),
        true,
        'La aplicación debe quedar habilitada y sincronizada tras confirmación inicial'
      );

      const persisted = loadBudgetState(userId, false);
      assert.equal(persisted.monthsData[monthKey]?.income, 125000);
      assert.equal(persisted.monthsData[monthKey]?.fixedExpenses[0]?.id, 'f_server_1');
    } finally {
      console.warn = origWarn;
    }
  });

  test('B. Primera inicialización con fallo real de saveBudgetState(): no debe declararse sincronizada', () => {
    const controller = new LocalPersistenceController(userId, false, false);
    const serverSnapshot: BudgetState = {
      month: 10,
      year: 2026,
      currency: 'ARS',
      monthsData: {
        [monthKey]: { ...createFreshMonthData(), income: 88000 },
      },
    };

    const origSetItem = localStorage.setItem;
    localStorage.setItem = () => {
      throw new Error('QuotaExceededError');
    };

    try {
      const res = confirmServerInitialSyncPersistence<MonthConflictInfo>({
        controller,
        snapshot: serverSnapshot,
        userId,
        conflicts: {},
        storageVerifier: realVerifyStorageExists,
        saveBudgetFn: saveBudgetState,
        saveConflictsFn: savePendingConflicts,
      });

      assert.equal(res.ok, false, 'Debe fallar cuando saveBudgetState() falla');
      assert.equal(res.budgetSaved, false);
      assert.equal(res.mode, 'failed');
      assert.equal(controller.hasLocalStorageFailure(), true);
      assert.equal(controller.getLastPersistedVersion(), 0, 'No debe registrar versión persistida');

      // Incluso si alguien consultara canDeclareSynced, debe retornar false
      assert.equal(
        controller.canDeclareSynced({
          userId,
          isCloudSyncReady: res.ok,
          isOnline: true,
          isOfflineSession: false,
          hasPendingSync: false,
          unresolvedConflictCount: 0,
        }),
        false,
        'No debe declararse sincronizada si falló saveBudgetState()'
      );
    } finally {
      localStorage.setItem = origSetItem;
    }
  });

  test('C. Primera inicialización con fallo real de savePendingConflicts(): no debe declararse lista', () => {
    loadBudgetState(userId, false);
    const controller = new LocalPersistenceController(userId, false, true);
    const serverSnapshot: BudgetState = {
      month: 10,
      year: 2026,
      currency: 'ARS',
      monthsData: {
        [monthKey]: { ...createFreshMonthData(), income: 55000 },
      },
    };

    const conflicts: Record<string, MonthConflictInfo> = {
      [monthKey]: {
        local: { ...createFreshMonthData(), income: 99000 },
        remote: { ...createFreshMonthData(), income: 55000 },
        reason: 'orphan_local_divergence',
        detectedAt: new Date().toISOString(),
      },
    };

    const origSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = (key: string, value: string) => {
      if (key.startsWith('nita_user_conflicts_')) {
        throw new Error('QuotaExceededError on conflicts key');
      }
      origSetItem(key, value);
    };

    try {
      const res = confirmServerInitialSyncPersistence<MonthConflictInfo>({
        controller,
        snapshot: serverSnapshot,
        userId,
        conflicts,
        storageVerifier: realVerifyStorageExists,
        saveBudgetFn: saveBudgetState,
        saveConflictsFn: savePendingConflicts,
      });

      assert.equal(res.ok, false, 'La inicialización no debe completarse si falla savePendingConflicts()');
      assert.equal(res.budgetSaved, true);
      assert.equal(res.conflictsSaved, false);
      assert.equal(res.mode, 'failed');

      const isCloudSyncReady = res.ok;
      assert.equal(isCloudSyncReady, false, 'isCloudSyncReady debe permanecer en false');
      assert.equal(
        controller.canDeclareSynced({
          userId,
          isCloudSyncReady,
          isOnline: true,
          isOfflineSession: false,
          hasPendingSync: false,
          unresolvedConflictCount: Object.keys(conflicts).length,
        }),
        false,
        'No debe declararse lista ni sincronizada cuando falla savePendingConflicts()'
      );
    } finally {
      localStorage.setItem = origSetItem;
    }
  });

  test('D. Modificación local offline y posterior recuperación de conexión: preserva secuencia de versiones y datos pendientes', () => {
    // 1. Estado inicial hidratado en v1
    loadBudgetState(userId, false);
    const controller = new LocalPersistenceController(userId, false, true);
    assert.equal(controller.getMutationVersion(), 1);
    assert.equal(controller.getLastPersistedVersion(), 1);

    // 2. El usuario trabaja offline y realiza dos modificaciones reales (v2 y v3)
    const offlineStateV2: BudgetState = {
      month: 10,
      year: 2026,
      currency: 'ARS',
      monthsData: {
        [monthKey]: {
          ...createFreshMonthData(),
          income: 200000,
          variableExpenses: [
            { id: 'v_offline_1', date: '2026-11-05', description: 'Compra offline', amount: 15000, category: 'comida' },
          ],
        },
      },
    };
    const v2 = controller.incrementMutationVersion(offlineStateV2);
    assert.equal(v2, 2);
    assert.equal(
      controller.commitSnapshot(controller.getActiveVersionedSnapshot()!, saveBudgetState),
      true
    );

    const offlineStateV3: BudgetState = {
      ...offlineStateV2,
      monthsData: {
        [monthKey]: {
          ...offlineStateV2.monthsData[monthKey],
          income: 240000,
        },
      },
    };
    const v3 = controller.incrementMutationVersion(offlineStateV3);
    assert.equal(v3, 3);
    assert.equal(
      controller.commitSnapshot(controller.getActiveVersionedSnapshot()!, saveBudgetState),
      true
    );
    enqueuePendingMonth(userId, monthKey, 2026, 10, offlineStateV3.monthsData[monthKey], generateOpId());

    assert.equal(controller.getMutationVersion(), 3);
    assert.equal(controller.getLastPersistedVersion(), 3);

    // 3. Se recupera la conexión y llega el primer snapshot del servidor (con datos antiguos en Firestore para monthKey y otro mes nuevo)
    const remoteOtherMonth = '2026-09';
    const remoteMonths: Record<string, MonthData> = {
      [monthKey]: { ...createFreshMonthData(), income: 100000 }, // Versión remota antigua en nube
      [remoteOtherMonth]: { ...createFreshMonthData(), income: 90000 },
    };

    const pendingItems = getPendingSyncQueue(userId);
    const pendingMonthKeys = new Set(pendingItems.map(i => i.monthKey));
    const finalMonths: Record<string, MonthData> = { ...remoteMonths };
    if (pendingMonthKeys.has(monthKey)) {
      // Protección equivalente a subscribeToUserMonths: conserva la modificación local pendiente en vuelo
      finalMonths[monthKey] = offlineStateV3.monthsData[monthKey];
    }

    const res = confirmServerInitialSyncPersistence<MonthConflictInfo>({
      controller,
      snapshot: {
        month: 10,
        year: 2026,
        currency: 'ARS',
        monthsData: finalMonths,
      },
      userId,
      conflicts: {},
      storageVerifier: realVerifyStorageExists,
      saveBudgetFn: saveBudgetState,
      saveConflictsFn: savePendingConflicts,
    });

    assert.equal(res.ok, true);
    assert.equal(res.mode, 'committed', 'Al existir mutaciones previas debe commitear monotonicamente sin reiniciar a 1');
    assert.equal(res.usedVersion, 4, 'Debe avanzar monotonicamente a v4 en lugar de reiniciarse a 1');
    assert.equal(controller.getMutationVersion(), 4);
    assert.equal(controller.getLastPersistedVersion(), 4);

    // Verificar persistencia física de la modificación offline y del mes remoto
    const persisted = loadBudgetState(userId, false);
    assert.equal(persisted.monthsData[monthKey]?.income, 240000, 'El ingreso editado offline debe conservarse');
    assert.equal(persisted.monthsData[monthKey]?.variableExpenses[0]?.id, 'v_offline_1');
    assert.equal(persisted.monthsData[remoteOtherMonth]?.income, 90000);
    assert.equal(hasPendingSync(userId), true, 'La operación pendiente debe seguir en cola hasta subirse a Firestore');
  });

  test('E. Sincronización manual que incorpora datos nuevos: incrementa versión, persiste localmente y no duplica si no hay cambios', () => {
    // 1. Estado inicial del usuario autenticado (vacío en v1)
    const initialBudget = loadBudgetState(userId, false);
    const controller = new LocalPersistenceController(userId, false, true);
    assert.equal(controller.getMutationVersion(), 1);
    assert.equal(controller.getLastPersistedVersion(), 1);

    // 2. Simular datos recuperables en almacenamiento invitado previo (fuente local recuperable)
    const guestMonthData: MonthData = {
      ...createFreshMonthData(),
      income: 310000,
      variableExpenses: [
        { id: 'v_guest_rec', date: '2026-11-08', description: 'Gasto recuperado', amount: 22000, category: 'comida' },
      ],
    };
    localStorage.setItem(
      GUEST_STORAGE_KEY,
      JSON.stringify({
        month: 10,
        year: 2026,
        currency: 'ARS',
        monthsData: { [monthKey]: guestMonthData },
      })
    );

    const recovered = recoverLocalDataSources(userId);
    const mergeRes = mergeAndPersistManualSync({
      controller,
      userId,
      currentKey: monthKey,
      currentMonths: initialBudget.monthsData,
      recoveredMonths: recovered,
      month: 10,
      year: 2026,
      currency: 'ARS',
      areEqualFn: areMonthDataEqual,
      mergeFn: mergeMonthData,
      hasContentFn: hasRealUserContent,
      saveBudgetFn: saveBudgetState,
      enqueuePendingFn: enqueuePendingMonth,
      generateOpIdFn: generateOpId,
    });

    assert.equal(mergeRes.hasChanges, true);
    assert.equal(mergeRes.localSaved, true);
    assert.equal(mergeRes.targetVersion, 2);
    assert.equal(controller.getMutationVersion(), 2);
    assert.equal(controller.getLastPersistedVersion(), 2);
    assert.ok(mergeRes.enqueuedOps[monthKey], 'Debe encolar el mes modificado para conservar operación pendiente ante fallo de red');

    // Verificar persistencia física en localStorage
    const persistedAfter = loadBudgetState(userId, false);
    assert.equal(persistedAfter.monthsData[monthKey]?.income, 310000);
    assert.equal(persistedAfter.monthsData[monthKey]?.variableExpenses[0]?.id, 'v_guest_rec');
    assert.equal(hasPendingSync(userId), true);

    // 3. Invocar nuevamente sin cambios nuevos: no debe incrementar versión ni duplicar escrituras
    let writeCalls = 0;
    const spySave = (s: BudgetState, u?: string | null, g?: boolean) => {
      writeCalls++;
      return saveBudgetState(s, u, g);
    };
    const secondRun = mergeAndPersistManualSync({
      controller,
      userId,
      currentKey: monthKey,
      currentMonths: mergeRes.nextMonths,
      recoveredMonths: recoverLocalDataSources(userId),
      month: 10,
      year: 2026,
      currency: 'ARS',
      areEqualFn: areMonthDataEqual,
      mergeFn: mergeMonthData,
      hasContentFn: hasRealUserContent,
      saveBudgetFn: spySave,
      enqueuePendingFn: enqueuePendingMonth,
      generateOpIdFn: generateOpId,
    });

    assert.equal(secondRun.hasChanges, false);
    assert.equal(writeCalls, 0, 'No debe duplicar escrituras si no hubo cambios');
    assert.equal(controller.getMutationVersion(), 2, 'No debe incrementar versión innecesariamente');
  });

  test('F. Dos instancias independientes con el mismo UID: modificación en instancia A llega a instancia B mediante Firestore sin intervención manual', async (t) => {
    const rawHost = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
    const [host, portStr] = rawHost.split(':');
    const port = Number(portStr);

    let testEnv: RulesTestEnvironment | null = null;
    try {
      const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
      const rules = fs.existsSync(rulesPath) ? fs.readFileSync(rulesPath, 'utf8') : '';
      testEnv = await initializeTestEnvironment({
        projectId: 'demo-nita-persistence-sync',
        firestore: { host, port, rules },
      });
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await getDoc(doc(ctx.firestore(), 'ping', 'check'));
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      t.skip(`Firestore Emulator no disponible en ${rawHost}: ${msg}`);
      return;
    }

    try {
      const sharedUid = 'user_two_instances_real_sync';
      const dbA = testEnv.authenticatedContext(sharedUid).firestore();
      const dbB = testEnv.authenticatedContext(sharedUid).firestore();

      const storageA = new MockLocalStorage();
      const storageB = new MockLocalStorage();
      const saveTo = (store: MockLocalStorage) => (state: BudgetState, uId?: string | null, guest?: boolean) => {
        const { dataKey } = resolveStorageKeys(uId, guest);
        if (!dataKey) return false;
        store.setItem(dataKey, JSON.stringify(state));
        return true;
      };
      const verifyIn = (store: MockLocalStorage) => (uId?: string | null, guest?: boolean) => {
        const { dataKey } = resolveStorageKeys(uId, guest);
        if (!dataKey) return false;
        const raw = store.getItem(dataKey);
        return Boolean(raw && raw.length > 5);
      };

      const controllerA = new LocalPersistenceController(sharedUid, false, false);
      const controllerB = new LocalPersistenceController(sharedUid, false, false);
      let stateB: Record<string, MonthData> = {};
      let isInitBDone = false;

      const monthRefA = doc(dbA, 'users', sharedUid, 'months', monthKey);
      await deleteDoc(monthRefA).catch(() => {});

      let resolveBUpdate: ((months: Record<string, MonthData>) => void) | null = null;
      const waitForBUpdate = () => new Promise<Record<string, MonthData>>(resolve => {
        resolveBUpdate = resolve;
      });

      const unsubB = onSnapshot(
        collection(dbB, 'users', sharedUid, 'months'),
        { includeMetadataChanges: true },
        (snap) => {
          handleUserMonthsSnapshot(snap, (remoteMonths, hasPendingWrites, fromCache) => {
            if (!isInitBDone) {
              if (fromCache || hasPendingWrites) return;
              const initRes = confirmServerInitialSyncPersistence({
                controller: controllerB,
                snapshot: { month: 10, year: 2026, currency: 'ARS', monthsData: remoteMonths },
                userId: sharedUid,
                conflicts: {},
                storageVerifier: verifyIn(storageB),
                saveBudgetFn: saveTo(storageB),
                saveConflictsFn: () => true,
              });
              if (initRes.ok) {
                isInitBDone = true;
                stateB = remoteMonths;
                if (resolveBUpdate && Object.keys(remoteMonths).length > 0) {
                  const r = resolveBUpdate;
                  resolveBUpdate = null;
                  r(stateB);
                }
              }
              return;
            }
            if (hasPendingWrites) return;

            const { updatedMonths } = processRemoteMonthsSnapshot(
              remoteMonths,
              stateB,
              {},
              new Set(),
              new Set(),
              new Map(),
              new Map(),
              new Map(),
              sharedUid
            );
            const nextVer = controllerB.incrementMutationVersion();
            const unitB = controllerB.createVersionedSnapshot(
              { month: 10, year: 2026, currency: 'ARS', monthsData: updatedMonths },
              nextVer
            );
            const savedB = controllerB.commitSnapshot(unitB, saveTo(storageB));
            if (savedB) {
              stateB = updatedMonths;
              if (resolveBUpdate) {
                const r = resolveBUpdate;
                resolveBUpdate = null;
                r(stateB);
              }
            }
          });
        }
      );

      // Inicializar A y luego modificar un monto en A -> publicar en Firestore
      const initMonthA: MonthData = {
        ...createFreshMonthData(),
        income: 450000,
        variableExpenses: [{ id: 'v_inst_a', date: '2026-11-10', description: 'Desde A', amount: 18000, category: 'comida' }],
      };
      confirmServerInitialSyncPersistence({
        controller: controllerA,
        snapshot: { month: 10, year: 2026, currency: 'ARS', monthsData: { [monthKey]: initMonthA } },
        userId: sharedUid,
        conflicts: {},
        storageVerifier: verifyIn(storageA),
        saveBudgetFn: saveTo(storageA),
        saveConflictsFn: () => true,
      });

      const waitUpdated = waitForBUpdate();
      await setDoc(monthRefA, {
        userId: sharedUid,
        monthKey,
        year: 2026,
        month: 10,
        income: initMonthA.income,
        savingsRate: initMonthA.savingsRate,
        extraDaysPosition: initMonthA.extraDaysPosition,
        categories: initMonthA.categories,
        fixedExpenses: initMonthA.fixedExpenses,
        variableExpenses: initMonthA.variableExpenses,
        jarAdjustments: {},
        lastJarAdjustmentLog: null,
        updatedAt: new Date().toISOString(),
      });

      const monthsInB = await waitUpdated;
      unsubB();

      assert.equal(monthsInB[monthKey]?.income, 450000);
      assert.equal(monthsInB[monthKey]?.variableExpenses[0]?.id, 'v_inst_a');
      const rawB = storageB.getItem(`nita_user_data_${sharedUid}`);
      assert.ok(rawB, 'Instancia B debe haber persistido localmente el cambio recibido desde Firestore');
      assert.equal(JSON.parse(rawB!).monthsData[monthKey]?.income, 450000);
    } finally {
      if (testEnv) {
        await testEnv.cleanup();
      }
    }
  });
});

describe('NITA — Corrección Final de Persistencia de Conflictos y Categorías', () => {
  const userId = 'user_final_conflicts_categories';
  const monthKey = '2026-11';

  beforeEach(() => {
    localStorage.clear();
  });

  test('1. Conflictos: fallo real de localStorage.setItem conserva intacto el estado anterior y no declara synced', () => {
    const initialBudget = loadBudgetState(userId, false);
    const controller = new LocalPersistenceController(userId, false, true);

    const prevConflict: MonthConflictInfo = {
      local: { ...createFreshMonthData(), income: 120000 },
      remote: { ...createFreshMonthData(), income: 80000 },
      reason: 'orphan_local_divergence',
      detectedAt: '2026-11-10T10:00:00.000Z',
    };
    const prevConflicts: Record<string, MonthConflictInfo> = {
      '2026-10': prevConflict,
    };
    assert.equal(savePendingConflicts(userId, prevConflicts), true);

    let unresolvedConflictsRefCurrent: Record<string, MonthConflictInfo> = { ...prevConflicts };
    let activeConflictsState: Record<string, MonthConflictInfo> = { ...prevConflicts };
    let latestMonthsData = { ...initialBudget.monthsData };

    // Llega actualización remota posterior con datos nuevos para el mes en conflicto
    const remoteMonths: Record<string, MonthData> = {
      '2026-10': { ...createFreshMonthData(), income: 95000 },
      [monthKey]: { ...createFreshMonthData(), income: 150000 },
    };

    const { updatedMonths, updatedConflicts } = processRemoteMonthsSnapshot(
      remoteMonths,
      latestMonthsData,
      unresolvedConflictsRefCurrent,
      new Set(),
      new Set(),
      new Map(),
      new Map(),
      new Map(),
      userId
    );

    // Simular fallo real de localStorage.setItem sobre la clave de conflictos
    const origSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = (key: string, value: string) => {
      if (key.startsWith('nita_user_conflicts_')) {
        throw new Error('QuotaExceededError on conflicts key');
      }
      origSetItem(key, value);
    };

    try {
      const res = applyPostInitMonthsPersistence<MonthConflictInfo>({
        controller,
        userId,
        updatedMonths,
        updatedConflicts,
        month: 10,
        year: 2026,
        currency: 'ARS',
        saveBudgetFn: saveBudgetState,
        saveConflictsFn: savePendingConflicts,
        onConflictsPersisted: (persisted) => {
          unresolvedConflictsRefCurrent = persisted;
          activeConflictsState = persisted;
        },
      });

      assert.equal(res.ok, false, 'No debe reportar éxito si falla savePendingConflicts');
      assert.equal(res.conflictsSaved, false);
      assert.equal(res.budgetSaved, false);

      // El estado y referencia anteriores deben permanecer intactos (los conflictos no desaparecen)
      assert.deepEqual(unresolvedConflictsRefCurrent, prevConflicts, 'unresolvedConflictsRef debe conservar el estado previo');
      assert.deepEqual(activeConflictsState, prevConflicts, 'activeConflicts debe conservar el estado previo');
      assert.deepEqual(latestMonthsData, initialBudget.monthsData, 'latestMonthsData no debe mutar');
      assert.deepEqual(getPendingConflicts(userId), prevConflicts, 'El conflicto previo en localStorage no debe perderse');
      assert.equal(controller.hasConflictStorageFailure(), true);
      assert.equal(
        controller.canDeclareSynced({
          userId,
          isCloudSyncReady: true,
          isOnline: true,
          isOfflineSession: false,
          hasPendingSync: false,
          unresolvedConflictCount: Object.keys(activeConflictsState).length,
        }),
        false,
        'No debe declarar synced cuando falla la persistencia de conflictos'
      );
    } finally {
      localStorage.setItem = origSetItem;
    }
  });

  test('2. Conflictos: escritura exitosa actualiza referencias, estado activo y almacenamiento físico', () => {
    const initialBudget = loadBudgetState(userId, false);
    const controller = new LocalPersistenceController(userId, false, true);

    const prevConflict: MonthConflictInfo = {
      local: { ...createFreshMonthData(), income: 120000 },
      remote: { ...createFreshMonthData(), income: 80000 },
      reason: 'orphan_local_divergence',
      detectedAt: '2026-11-10T10:00:00.000Z',
    };
    let unresolvedConflictsRefCurrent: Record<string, MonthConflictInfo> = {
      '2026-10': prevConflict,
    };
    let activeConflictsState: Record<string, MonthConflictInfo> = {
      '2026-10': prevConflict,
    };
    let latestMonthsData: Record<string, MonthData> = {
      ...initialBudget.monthsData,
      '2026-10': prevConflict.local,
    };

    const updatedRemoteForConflict: MonthData = { ...createFreshMonthData(), income: 99000 };
    const remoteMonths: Record<string, MonthData> = {
      '2026-10': updatedRemoteForConflict,
      [monthKey]: { ...createFreshMonthData(), income: 210000 },
    };

    const { updatedMonths, updatedConflicts } = processRemoteMonthsSnapshot(
      remoteMonths,
      latestMonthsData,
      unresolvedConflictsRefCurrent,
      new Set(),
      new Set(),
      new Map(),
      new Map(),
      new Map(),
      userId
    );

    const res = applyPostInitMonthsPersistence<MonthConflictInfo>({
      controller,
      userId,
      updatedMonths,
      updatedConflicts,
      month: 10,
      year: 2026,
      currency: 'ARS',
      saveBudgetFn: saveBudgetState,
      saveConflictsFn: savePendingConflicts,
      onConflictsPersisted: (persisted) => {
        unresolvedConflictsRefCurrent = persisted;
        activeConflictsState = persisted;
      },
    });

    assert.equal(res.ok, true);
    assert.equal(res.conflictsSaved, true);
    assert.equal(res.budgetSaved, true);
    assert.equal(controller.hasConflictStorageFailure(), false);

    assert.equal(unresolvedConflictsRefCurrent['2026-10']?.remote.income, 99000);
    assert.equal(activeConflictsState['2026-10']?.remote.income, 99000);
    assert.equal(getPendingConflicts(userId)['2026-10']?.remote.income, 99000);

    latestMonthsData = updatedMonths;
    assert.equal(latestMonthsData[monthKey]?.income, 210000);
    assert.equal(latestMonthsData['2026-10']?.income, 120000, 'El mes en conflicto sigue protegido localmente');

    // Al haber conflictos sin resolver, canDeclareSynced debe seguir en false; si no hay conflictos, true
    assert.equal(
      controller.canDeclareSynced({
        userId,
        isCloudSyncReady: true,
        isOnline: true,
        isOfflineSession: false,
        hasPendingSync: false,
        unresolvedConflictCount: Object.keys(activeConflictsState).length,
      }),
      false
    );

    // Ahora sin conflictos pendientes en el snapshot remoto: debe quedar synced
    const clearRes = applyPostInitMonthsPersistence<MonthConflictInfo>({
      controller,
      userId,
      updatedMonths,
      updatedConflicts: {},
      month: 10,
      year: 2026,
      currency: 'ARS',
      saveBudgetFn: saveBudgetState,
      saveConflictsFn: savePendingConflicts,
      onConflictsPersisted: (persisted) => {
        unresolvedConflictsRefCurrent = persisted;
        activeConflictsState = persisted;
      },
    });
    assert.equal(clearRes.ok, true);
    assert.deepEqual(activeConflictsState, {});
    assert.equal(
      controller.canDeclareSynced({
        userId,
        isCloudSyncReady: true,
        isOnline: true,
        isOfflineSession: false,
        hasPendingSync: false,
        unresolvedConflictCount: 0,
      }),
      true
    );
  });

  test('3. Categorías: escritura exitosa de una lista no vacía coincide exactamente y permite synced', () => {
    const initialBudget = loadBudgetState(userId, false);
    const controller = new LocalPersistenceController(userId, false, true);

    const remoteCats: CategoryInfo[] = [
      { id: 'cat_food', label: 'Alimentación', color: '#16a34a', isCustom: false },
      { id: 'cat_custom', label: 'Mascotas', color: '#9333ea', isCustom: true },
    ];

    const res = applyRemoteGlobalCategoriesPersistence({
      controller,
      userId,
      remoteCats,
      currentMonths: initialBudget.monthsData,
      month: 10,
      year: 2026,
      currency: 'ARS',
    });

    assert.equal(res.ok, true);
    assert.equal(res.categoriesSaved, true);
    assert.equal(res.budgetSaved, true);
    assert.equal(controller.hasCategoryStorageFailure(), false);

    assert.equal(verifyGlobalCategoriesPersisted(remoteCats, userId, false), true);
    assert.equal(areCategoryListsEqual(loadGlobalCategories(userId, false), remoteCats), true);
    assert.equal(areCategoryListsEqual(res.nextMonths[monthKey]?.categories, remoteCats), true);
    assert.equal(
      controller.canDeclareSynced({
        userId,
        isCloudSyncReady: true,
        isOnline: true,
        isOfflineSession: false,
        hasPendingSync: false,
        unresolvedConflictCount: 0,
      }),
      true
    );
  });

  test('4. Categorías: escritura exitosa de [] se persiste como valor válido y coincide exactamente', () => {
    const initialBudget = loadBudgetState(userId, false);
    const controller = new LocalPersistenceController(userId, false, true);

    // Preexistían categorías previas
    const oldCats: CategoryInfo[] = [{ id: 'cat_prev', label: 'Previa', color: '#2563eb' }];
    assert.equal(saveGlobalCategories(oldCats, userId, false), true);

    const res = applyRemoteGlobalCategoriesPersistence({
      controller,
      userId,
      remoteCats: [],
      currentMonths: initialBudget.monthsData,
      month: 10,
      year: 2026,
      currency: 'ARS',
    });

    assert.equal(res.ok, true);
    assert.equal(res.categoriesSaved, true);
    assert.equal(res.budgetSaved, true);

    const { categoriesKey } = resolveStorageKeys(userId, false);
    assert.equal(localStorage.getItem(categoriesKey!), '[]', 'Debe persistir [] literalmente en localStorage');
    assert.deepEqual(loadGlobalCategories(userId, false), [], 'loadGlobalCategories debe respetar [] como valor válido');
    assert.equal(verifyGlobalCategoriesPersisted([], userId, false), true);
    assert.deepEqual(res.nextMonths[monthKey]?.categories, []);
    assert.equal(
      controller.canDeclareSynced({
        userId,
        isCloudSyncReady: true,
        isOnline: true,
        isOfflineSession: false,
        hasPendingSync: false,
        unresolvedConflictCount: 0,
      }),
      true
    );
  });

  test('5. Categorías: fallo real de escritura con clave antigua preexistente no produce falso positivo ni declara synced', () => {
    const initialBudget = loadBudgetState(userId, false);
    const controller = new LocalPersistenceController(userId, false, true);

    // Clave antigua previamente persistida en localStorage
    const staleCats: CategoryInfo[] = [{ id: 'cat_stale', label: 'Antigua', color: '#dc2626' }];
    assert.equal(saveGlobalCategories(staleCats, userId, false), true);

    const { categoriesKey } = resolveStorageKeys(userId, false);
    assert.ok(localStorage.getItem(categoriesKey!), 'La clave antigua debe existir previamente en localStorage');

    let latestMonthsDataRefCurrent = initialBudget.monthsData;
    const remoteCats: CategoryInfo[] = [{ id: 'cat_new', label: 'Remota Nueva', color: '#0ea5e9' }];

    // Simular fallo real de localStorage.setItem sobre la clave de categorías manteniendo intacta la clave antigua
    const origSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = (key: string, value: string) => {
      if (key === categoriesKey) {
        throw new Error('QuotaExceededError on categories key');
      }
      origSetItem(key, value);
    };

    try {
      const res = applyRemoteGlobalCategoriesPersistence({
        controller,
        userId,
        remoteCats,
        currentMonths: latestMonthsDataRefCurrent,
        month: 10,
        year: 2026,
        currency: 'ARS',
      });

      assert.equal(res.ok, false, 'No debe informar éxito aunque exista una clave antigua en localStorage');
      assert.equal(res.categoriesSaved, false);
      assert.equal(res.budgetSaved, false);
      assert.strictEqual(res.nextMonths, latestMonthsDataRefCurrent, 'No debe actualizar monthsData con categorías no persistidas');
      assert.equal(areCategoryListsEqual(loadGlobalCategories(userId, false), staleCats), true, 'El disco conserva la lista previa');
      assert.equal(verifyGlobalCategoriesPersisted(remoteCats, userId, false), false);
      assert.equal(controller.hasCategoryStorageFailure(), true);
      assert.equal(
        controller.canDeclareSynced({
          userId,
          isCloudSyncReady: true,
          isOnline: true,
          isOfflineSession: false,
          hasPendingSync: false,
          unresolvedConflictCount: 0,
        }),
        false,
        'Ningún caso debe declarar synced cuando falla la persistencia de categorías'
      );
    } finally {
      localStorage.setItem = origSetItem;
    }
  });
});


