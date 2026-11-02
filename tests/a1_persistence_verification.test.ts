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
  hasPendingSync
} from '../src/utils/storage';
import { LocalPersistenceController, VersionedBudgetSnapshot } from '../src/utils/persistenceController';
import { BudgetState, MonthData } from '../src/types/budget';

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
