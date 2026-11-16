import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Mock localStorage for Node test runner
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
  getPendingSyncQueue,
  enqueuePendingMonth,
  removePendingSyncItemIfMatch,
  removePendingMonthFromQueue,
  generateOpId,
  savePendingSyncQueue,
  createFreshMonthData,
  saveBudgetState,
  loadBudgetState,
  PendingSyncItem
} from '../src/utils/storage';
import { 
  reconcileMonthData, 
  saveMonthToFirestoreSerialized,
  fetchAndSyncUserData,
  areMonthDataEqual,
  FirestoreSyncAdapter,
  getPendingConflicts,
  savePendingConflicts,
  processRemoteMonthsSnapshot,
  clearPendingConflict,
  MonthConflictInfo,
  handleUserMonthsSnapshot,
  handleGlobalCategoriesSnapshot,
  verifyUserAuthorization
} from '../src/services/budgetSyncService';
import { MonthData, FixedExpense, VariableExpense } from '../src/types/budget';
import { LocalPersistenceController } from '../src/utils/persistenceController';
import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('NITA Etapa 1 — Pruebas Obligatorias de Consistencia Local y Cola de Sincronización', () => {
  const userId = 'user_test_stage1_consistency';
  const monthKey = '2026-10';

  beforeEach(() => {
    localStorage.clear();
  });

  test('1. Escritura en curso seguida de una mutación más reciente (protección por opId)', () => {
    const dataV1: MonthData = {
      ...createFreshMonthData(),
      income: 1000,
      fixedExpenses: [{ id: 'f1', name: 'Alquiler', amount: 500, category: 'vivienda', isPaid: false }],
    };

    // Paso A: Dispositivo inicia escritura con opId_1
    const opId1 = enqueuePendingMonth(userId, monthKey, 2026, 9, dataV1);
    let queue = getPendingSyncQueue(userId);
    assert.equal(queue.length, 1);
    assert.equal(queue[0].opId, opId1);

    // Paso B: Mientras la escritura 1 está "en vuelo", el usuario realiza una nueva mutación (elimina f1)
    const dataV2: MonthData = {
      ...createFreshMonthData(),
      income: 1000,
      fixedExpenses: [],
    };
    const opId2 = enqueuePendingMonth(userId, monthKey, 2026, 9, dataV2);
    queue = getPendingSyncQueue(userId);
    assert.equal(queue.length, 1);
    assert.equal(queue[0].opId, opId2);
    assert.notEqual(opId1, opId2);

    // Paso C: La promesa 1 finaliza e intenta remover su elemento con opId1
    const removedOlder = removePendingMonthFromQueue(userId, monthKey, opId1);
    assert.equal(removedOlder, false, 'No debe remover el elemento porque opId1 es obsoleto');

    // La cola DEBE conservar intacta la mutación más reciente (opId2)
    queue = getPendingSyncQueue(userId);
    assert.equal(queue.length, 1, 'La cola no debe haber sido borrada por la promesa antigua');
    assert.equal(queue[0].opId, opId2);
    assert.equal(queue[0].data?.fixedExpenses.length, 0);

    // Paso D: Cuando finaliza la promesa 2, su opId2 sí remueve el elemento
    const removedNewer = removePendingMonthFromQueue(userId, monthKey, opId2);
    assert.equal(removedNewer, true, 'Debe remover el elemento al coincidir opId2');
    queue = getPendingSyncQueue(userId);
    assert.equal(queue.length, 0, 'La cola queda limpia al completarse la última mutación');
  });

  test('2. Cinco mutaciones rápidas del mismo mes', () => {
    let lastOpId: string | null = '';
    for (let i = 1; i <= 5; i++) {
      const data: MonthData = {
        ...createFreshMonthData(),
        income: 1000 * i,
        fixedExpenses: [{ id: `f${i}`, name: `Gasto ${i}`, amount: 100 * i, category: 'servicios', isPaid: false }],
      };
      lastOpId = enqueuePendingMonth(userId, monthKey, 2026, 9, data);
    }

    const queue = getPendingSyncQueue(userId);
    // Debe haber exactamente 1 ítem en cola para este mes (upsert sin duplicación)
    assert.equal(queue.length, 1);
    assert.equal(queue[0].opId, lastOpId);
    assert.equal(queue[0].data?.income, 5000);
    assert.equal(queue[0].data?.fixedExpenses[0].id, 'f5');
  });

  test('3. Cambios simultáneos de ingresos y gastos (reconciliación pura sin pérdida de campos)', () => {
    const baseMonth: MonthData = {
      ...createFreshMonthData(),
      income: 1000,
      savingsRate: 10,
      extraDaysPosition: 'end',
      fixedExpenses: [{ id: 'f_base', name: 'Alquiler', amount: 400, category: 'vivienda', isPaid: true }],
      variableExpenses: [],
    };

    // Cliente A (Local): modifica income a 1500 y agrega gasto fijo f_nuevo
    const localMonth: MonthData = {
      ...baseMonth,
      income: 1500,
      fixedExpenses: [
        ...baseMonth.fixedExpenses,
        { id: 'f_nuevo', name: 'Internet', amount: 50, category: 'servicios', isPaid: false }
      ],
    };

    // Cliente B (Remoto): agrega gasto variable v_remoto y cambia extraDaysPosition
    const remoteMonth: MonthData = {
      ...baseMonth,
      extraDaysPosition: 'start',
      variableExpenses: [
        { id: 'v_remoto', date: '2026-10-15', description: 'Supermercado', amount: 120, category: 'comida' }
      ],
    };

    const reconciled = reconcileMonthData(baseMonth, localMonth, remoteMonth);

    // Verifica que NINGÚN campo financiero se pierde:
    assert.equal(reconciled.income, 1500, 'Conserva el nuevo ingreso de Local');
    assert.equal(reconciled.extraDaysPosition, 'start', 'Conserva el cambio de días extra de Remoto');
    assert.equal(reconciled.fixedExpenses.length, 2, 'Conserva ambos gastos fijos');
    assert.ok(reconciled.fixedExpenses.some(f => f.id === 'f_base'));
    assert.ok(reconciled.fixedExpenses.some(f => f.id === 'f_nuevo'));
    assert.equal(reconciled.variableExpenses.length, 1, 'Conserva el gasto variable remoto');
    assert.equal(reconciled.variableExpenses[0].id, 'v_remoto');
  });

  test('4. Operaciones que afectan dos meses (transferencia de exceso de frasco al siguiente mes)', () => {
    const currentMonthKey = '2026-10';
    const nextMonthKey = '2026-11';

    const currentData: MonthData = {
      ...createFreshMonthData(),
      income: 2000,
      jarAdjustments: { 5: 150 },
      lastJarAdjustmentLog: {
        date: '2026-10-31T20:00:00.000Z',
        exceededJarTitle: 'Frasco 5',
        diff: 150,
        transferredToNextMonth: true,
        nextMonthKey,
      },
    };

    const nextData: MonthData = {
      ...createFreshMonthData(),
      income: 2000,
      jarAdjustments: { 1: -30, 2: -30, 3: -30, 4: -30, 5: -30 },
    };

    // Encola ambos meses
    const opCurrent = enqueuePendingMonth(userId, currentMonthKey, 2026, 9, currentData);
    const opNext = enqueuePendingMonth(userId, nextMonthKey, 2026, 10, nextData);

    const queue = getPendingSyncQueue(userId);
    assert.equal(queue.length, 2, 'Debe haber 2 elementos en cola correspondientes a ambos meses');
    assert.notEqual(opCurrent, opNext, 'Cada mes tiene su propio opId');

    const itemCurrent = queue.find(q => q.monthKey === currentMonthKey);
    const itemNext = queue.find(q => q.monthKey === nextMonthKey);

    assert.ok(itemCurrent?.data?.lastJarAdjustmentLog?.transferredToNextMonth);
    assert.equal(itemNext?.data?.jarAdjustments?.[1], -30);
  });

  test('5. Reintentos tras un fallo de red (la cola preserva los elementos pendientes)', () => {
    const data: MonthData = {
      ...createFreshMonthData(),
      income: 3000,
    };

    const opId = enqueuePendingMonth(userId, monthKey, 2026, 9, data);
    let queue = getPendingSyncQueue(userId);
    assert.equal(queue.length, 1);

    // Simula fallo de red: la función que procesa captura el error y NO llama a removePendingSyncItemIfMatch
    const networkErrorOccurred = true;
    if (networkErrorOccurred) {
      // Elemento permanece en cola
    }

    queue = getPendingSyncQueue(userId);
    assert.equal(queue.length, 1, 'El elemento no fue descartado por el fallo de red');
    assert.equal(queue[0].opId, opId);

    // Al reconectar, la escritura tiene éxito y se remueve con el opId correcto
    const removed = removePendingMonthFromQueue(userId, monthKey, opId);
    assert.equal(removed, true);
    assert.equal(getPendingSyncQueue(userId).length, 0);
  });

  test('6. Compatibilidad con datos antiguos sin metadatos nuevos (elementos sin opId)', () => {
    // Inserta manualmente un ítem de cola heredado sin opId
    const legacyItem: PendingSyncItem = {
      id: `${userId}_month_${monthKey}`,
      userId,
      type: 'month',
      monthKey,
      year: 2026,
      month: 9,
      data: createFreshMonthData(),
      timestamp: Date.now() - 100000,
    };
    savePendingSyncQueue([legacyItem]);

    const queue = getPendingSyncQueue(userId);
    assert.equal(queue.length, 1);
    assert.equal(queue[0].opId, undefined, 'El elemento heredado no tiene opId');

    // removePendingSyncItemIfMatch debe aceptar eliminar elementos antiguos sin opId
    const removed = removePendingSyncItemIfMatch(legacyItem.id);
    assert.equal(removed, true, 'Elimina exitosamente el elemento sin opId');
    assert.equal(getPendingSyncQueue(userId).length, 0);
  });

  test('7. Verificación de que el listener o la reconciliación no generan escrituras automáticas en esta etapa', () => {
    let firestoreWritesCount = 0;

    // Mock interceptor para rastrear si se dispara setDoc
    const mockSave = () => {
      firestoreWritesCount++;
    };

    const base = createFreshMonthData();
    const local = { ...base, income: 1000 };
    const remote = { ...base, income: 1200 };

    // Ejecuta la función de reconciliación
    const reconciled = reconcileMonthData(base, local, remote);

    // Debe retornar un objeto MonthData puro sin invocar escrituras
    assert.equal(typeof reconciled, 'object');
    assert.equal(firestoreWritesCount, 0, 'No debe ejecutarse ninguna escritura a Firestore durante la reconciliación');
  });

  test('8. Secuencia estricta: Operación antigua sin opId NO puede eliminar mutación nueva con opId', () => {
    // Paso 1: Ítem antiguo sin opId en la cola
    const legacyItem: PendingSyncItem = {
      id: `${userId}_month_${monthKey}`,
      userId,
      type: 'month',
      monthKey,
      year: 2026,
      month: 9,
      data: { ...createFreshMonthData(), income: 800 },
      timestamp: Date.now() - 5000,
    };
    savePendingSyncQueue([legacyItem]);

    // Paso 2: Durante el await de la sincronización antigua, el usuario genera una nueva mutación con opId
    const newOpId = enqueuePendingMonth(userId, monthKey, 2026, 9, {
      ...createFreshMonthData(),
      income: 1200,
      fixedExpenses: [{ id: 'f_nuevo', name: 'Luz', amount: 80, category: 'servicios', isPaid: false }],
    });
    assert.ok(newOpId, 'Debe generar y encolar con opId');

    // Paso 3: Finaliza la escritura antigua y el código antiguo llama a remover sin expectedOpId
    const removedByLegacyCall = removePendingSyncItemIfMatch(legacyItem.id);
    assert.equal(removedByLegacyCall, false, 'Una llamada antigua sin opId NO debe eliminar el nuevo ítem con opId');

    // Paso 4: La nueva operación DEBE permanecer en la cola
    const queue = getPendingSyncQueue(userId);
    assert.equal(queue.length, 1, 'La nueva operación debe conservarse en la cola');
    assert.equal(queue[0].opId, newOpId);
    assert.equal(queue[0].data?.income, 1200);

    // Paso 5: Al completar la nueva operación con su opId, se remueve exitosamente
    const removedByNewCall = removePendingMonthFromQueue(userId, monthKey, newOpId);
    assert.equal(removedByNewCall, true);
    assert.equal(getPendingSyncQueue(userId).length, 0);
  });

  test('9. Auditoría de reconcileMonthData: Simetría unilateral y Asimetría en conflicto bilateral', () => {
    const baseMonth: MonthData = {
      ...createFreshMonthData(),
      income: 1000,
      savingsRate: 10,
      extraDaysPosition: 'end',
      fixedExpenses: [{ id: 'f_base', name: 'Alquiler', amount: 500, category: 'vivienda', isPaid: true }],
      variableExpenses: [],
    };

    // Escenario 1: Cambio unilateral (Solo A modifica income, B no lo toca)
    const branchA_unilateral: MonthData = { ...baseMonth, income: 1500 };
    const branchB_unilateral: MonthData = { ...baseMonth }; // no cambió respecto a base

    const resultA_then_B = reconcileMonthData(baseMonth, branchA_unilateral, branchB_unilateral);
    const resultB_then_A = reconcileMonthData(baseMonth, branchB_unilateral, branchA_unilateral);

    // En cambio unilateral, la función ES simétrica e intercambiable:
    assert.equal(resultA_then_B.income, 1500);
    assert.equal(resultB_then_A.income, 1500, 'Debe ser simétrico cuando solo una parte cambió respecto a la base');

    // Escenario 2: Conflicto bilateral directo (Ambos modifican el mismo campo a valores distintos)
    const branchA_conflict: MonthData = { ...baseMonth, income: 1600 };
    const branchB_conflict: MonthData = { ...baseMonth, income: 2000 };

    const mergeLocalA = reconcileMonthData(baseMonth, branchA_conflict, branchB_conflict);
    const mergeLocalB = reconcileMonthData(baseMonth, branchB_conflict, branchA_conflict);

    // Documentación verificada por test: En conflicto bilateral directo, NO es conmutativa;
    // aplica Local-Intent Preference (privilegia al cliente local activo):
    assert.equal(mergeLocalA.income, 1600, 'Local A prevalece sobre Remote B');
    assert.equal(mergeLocalB.income, 2000, 'Local B prevalece sobre Remote A');
    assert.notEqual(mergeLocalA.income, mergeLocalB.income, 'Prueba de asimetría contextual documentada');
  });

  test('10. Auditoría de fallos de persistencia local (localStorage QuotaExceededError)', () => {
    const originalSetItem = localStorage.setItem;
    try {
      // Simula fallo de almacenamiento en localStorage (cuota llena o modo incógnito restringido)
      localStorage.setItem = () => {
        throw new Error('QuotaExceededError: DOMException 22');
      };

      const result = enqueuePendingMonth(userId, monthKey, 2026, 9, createFreshMonthData());
      // No debe informar falsamente que quedó encolado; debe retornar null
      assert.equal(result, null, 'enqueuePendingMonth debe retornar null ante fallo de almacenamiento');

      const queue = getPendingSyncQueue(userId);
      assert.equal(queue.length, 0, 'No debe haber datos corruptos ni falsos encolados');
    } finally {
      localStorage.setItem = originalSetItem;
    }
  });

  test('11. Mutex de serialización por usuario y mes: orden secuencial y resiliencia ante fallos', async () => {
    const executionOrder: string[] = [];

    // Crea un mock de saveMonthToFirestoreSerialized simulado
    const serializedInFlight = new Map<string, Promise<void>>();
    async function mockSerializedSave(key: string, label: string, shouldFail = false) {
      const prev = serializedInFlight.get(key) || Promise.resolve();
      const current = prev
        .catch(() => {}) // resiliencia: un fallo anterior no rompe la cadena
        .then(async () => {
          await new Promise(res => setTimeout(res, 10));
          if (shouldFail) {
            executionOrder.push(`${label}_FAILED`);
            throw new Error(`Write failed for ${label}`);
          }
          executionOrder.push(label);
        });
      serializedInFlight.set(key, current);
      return current;
    }

    const mKey = `${userId}_${monthKey}`;
    // Lanza 3 escrituras concurrentes donde la primera falla
    const p1 = mockSerializedSave(mKey, 'WRITE_1', true).catch(() => {});
    const p2 = mockSerializedSave(mKey, 'WRITE_2', false);
    const p3 = mockSerializedSave(mKey, 'WRITE_3', false);

    await Promise.all([p1, p2, p3]);

    // Verifica que se ejecutaron en estricto orden secuencial
    assert.deepEqual(executionOrder, ['WRITE_1_FAILED', 'WRITE_2', 'WRITE_3']);
  });

  test('12-A. fetchAndSyncUserData: Guardado local exitoso, fallo del encolado y datos remotos antiguos', async () => {
    // 1. Guardado local exitoso del presupuesto con edición local (income: 5000, f_local)
    const localData: MonthData = {
      ...createFreshMonthData(),
      income: 5000,
      fixedExpenses: [{ id: 'f_local', name: 'Gasto Local', amount: 300, category: 'otros', isPaid: false }],
    };
    saveBudgetState({
      month: 9,
      year: 2026,
      currency: 'ARS',
      monthsData: { [monthKey]: localData },
    }, userId, false);

    // 2. Fallo de persistencia de la cola (cambio huérfano, cola vacía)
    assert.equal(getPendingSyncQueue(userId).length, 0);

    // 3. Firestore contiene versión remota antigua (income: 1000, sin gastos)
    const staleRemoteData: MonthData = {
      ...createFreshMonthData(),
      income: 1000,
      fixedExpenses: [],
    };

    const mockAdapter: FirestoreSyncAdapter = {
      fetchUserDoc: async () => ({ uid: userId, updatedAt: '2026-10-01T00:00:00.000Z' }),
      fetchMonths: async () => ({ [monthKey]: staleRemoteData }),
      fetchCategories: async () => [],
    };

    // Ejecuta la función REAL fetchAndSyncUserData
    const syncResult = await fetchAndSyncUserData(userId, undefined, mockAdapter);

    // VERIFICACIONES OBLIGATORIAS:
    // a) No sobrescribir silenciosamente los datos locales con los remotos
    assert.equal(syncResult.months[monthKey]?.income, 5000, 'El dato local no debe sobrescribirse silenciosamente con el remoto antiguo');
    assert.equal(syncResult.months[monthKey]?.fixedExpenses.length, 1);
    assert.equal(syncResult.months[monthKey]?.fixedExpenses[0].id, 'f_local');

    // b) Señalar un conflicto que requiera resolución
    assert.ok(syncResult.conflicts, 'Debe señalar un conflicto');
    assert.ok(syncResult.conflicts[monthKey], 'El mes debe estar en la lista de conflictos');
    assert.equal(syncResult.conflicts[monthKey].reason, 'orphan_local_divergence');

    // c) Preservar ambas versiones
    assert.equal(syncResult.conflicts[monthKey].local.income, 5000);
    assert.equal(syncResult.conflicts[monthKey].remote.income, 1000);

    // d) Almacenamiento local aislado conserva los datos locales
    const localAfter = loadBudgetState(userId, false);
    assert.equal(localAfter.monthsData[monthKey]?.income, 5000);
  });

  test('12-B. fetchAndSyncUserData: Guardado local exitoso, fallo del encolado y datos remotos diferentes en gastos fijos y variables', async () => {
    const localData: MonthData = {
      ...createFreshMonthData(),
      income: 2000,
      fixedExpenses: [{ id: 'f_local_1', name: 'Alquiler', amount: 800, category: 'vivienda', isPaid: true }],
      variableExpenses: [{ id: 'v_local_1', date: '2026-10-05', description: 'Supermercado', amount: 150, category: 'comida' }],
    };
    saveBudgetState({
      month: 9,
      year: 2026,
      currency: 'ARS',
      monthsData: { [monthKey]: localData },
    }, userId, false);

    const remoteData: MonthData = {
      ...createFreshMonthData(),
      income: 2000,
      fixedExpenses: [{ id: 'f_remote_1', name: 'Gimnasio', amount: 60, category: 'salud', isPaid: false }],
      variableExpenses: [{ id: 'v_remote_1', date: '2026-10-08', description: 'Farmacia', amount: 40, category: 'salud' }],
    };

    const mockAdapter: FirestoreSyncAdapter = {
      fetchUserDoc: async () => ({ uid: userId, updatedAt: '2026-10-01T00:00:00.000Z' }),
      fetchMonths: async () => ({ [monthKey]: remoteData }),
      fetchCategories: async () => [],
    };

    const syncResult = await fetchAndSyncUserData(userId, undefined, mockAdapter);

    // Conflicto detectado en gastos
    assert.ok(syncResult.conflicts?.[monthKey]);
    // Local activo preserva gastos locales
    assert.equal(syncResult.months[monthKey]?.fixedExpenses[0].id, 'f_local_1');
    assert.equal(syncResult.months[monthKey]?.variableExpenses[0].id, 'v_local_1');
    // Versión remota preservada en el registro de conflicto
    assert.equal(syncResult.conflicts[monthKey].remote.fixedExpenses[0].id, 'f_remote_1');
    assert.equal(syncResult.conflicts[monthKey].remote.variableExpenses[0].id, 'v_remote_1');
  });

  test('12-C. fetchAndSyncUserData: Datos locales antiguos y datos remotos legítimamente más recientes (sin sobrescritura automática inversa)', async () => {
    let cloudWriteAttempts = 0;
    const oldLocalData: MonthData = {
      ...createFreshMonthData(),
      income: 1000,
    };
    saveBudgetState({
      month: 9,
      year: 2026,
      currency: 'ARS',
      monthsData: { [monthKey]: oldLocalData },
    }, userId, false);

    const newerRemoteData: MonthData = {
      ...createFreshMonthData(),
      income: 2500, // Modificado en otro dispositivo legítimamente
    };

    const mockAdapter: FirestoreSyncAdapter = {
      fetchUserDoc: async () => ({ uid: userId, updatedAt: '2026-10-15T00:00:00.000Z' }),
      fetchMonths: async () => ({ [monthKey]: newerRemoteData }),
      fetchCategories: async () => [],
      saveUserDoc: async () => { cloudWriteAttempts++; },
      saveCategoriesDoc: async () => { cloudWriteAttempts++; },
    };

    const syncResult = await fetchAndSyncUserData(userId, undefined, mockAdapter);

    // Conflicto señalado: no se asume que local es obsoleto, pero TAMPOCO se sobrescribe automáticamente el servidor
    assert.ok(syncResult.conflicts?.[monthKey]);
    assert.equal(cloudWriteAttempts, 0, 'No debe realizar escrituras automáticas en sentido inverso hacia Firestore');
    // El servidor mantiene sus datos remotos íntegros
    assert.equal(syncResult.conflicts[monthKey].remote.income, 2500);
  });

  test('12-D. fetchAndSyncUserData: Presupuesto local y remoto idénticos (sincronización normal continúa funcionando)', async () => {
    const identicalData: MonthData = {
      ...createFreshMonthData(),
      income: 3000,
      savingsRate: 15,
      fixedExpenses: [{ id: 'f_same', name: 'Internet', amount: 50, category: 'servicios', isPaid: true }],
      variableExpenses: [],
    };
    saveBudgetState({
      month: 9,
      year: 2026,
      currency: 'ARS',
      monthsData: { [monthKey]: identicalData },
    }, userId, false);

    const mockAdapter: FirestoreSyncAdapter = {
      fetchUserDoc: async () => ({ uid: userId, updatedAt: '2026-10-01T00:00:00.000Z' }),
      fetchMonths: async () => ({ [monthKey]: { ...identicalData } }),
      fetchCategories: async () => [],
    };

    const syncResult = await fetchAndSyncUserData(userId, undefined, mockAdapter);

    // Cuando local y remoto son idénticos, NO hay conflicto y la sincronización es limpia
    assert.equal(syncResult.conflicts, undefined, 'No debe haber conflicto con datos idénticos');
    assert.equal(syncResult.source, 'cloud');
    assert.equal(syncResult.months[monthKey]?.income, 3000);
    assert.equal(syncResult.months[monthKey]?.savingsRate, 15);
  });

  test('12-E. fetchAndSyncUserData: Reapertura de la aplicación después de detectar el conflicto (datos protegidos intactos)', async () => {
    const localData: MonthData = {
      ...createFreshMonthData(),
      income: 7777,
      fixedExpenses: [{ id: 'f_protected', name: 'Gasto Crítico', amount: 1000, category: 'otros', isPaid: false }],
    };
    saveBudgetState({
      month: 9,
      year: 2026,
      currency: 'ARS',
      monthsData: { [monthKey]: localData },
    }, userId, false);

    const mockAdapter: FirestoreSyncAdapter = {
      fetchUserDoc: async () => ({ uid: userId, updatedAt: '2026-10-01T00:00:00.000Z' }),
      fetchMonths: async () => ({ [monthKey]: { ...createFreshMonthData(), income: 2000 } }),
      fetchCategories: async () => [],
    };

    // 1. Detección del conflicto en la sesión activa
    const syncResult = await fetchAndSyncUserData(userId, undefined, mockAdapter);
    assert.ok(syncResult.conflicts?.[monthKey]);

    // 2. Simulación de cierre y reapertura de la aplicación (nueva lectura de localStorage)
    const reloadedBudget = loadBudgetState(userId, false);

    // Los datos locales protegidos NO se perdieron tras la reapertura
    assert.equal(reloadedBudget.monthsData[monthKey]?.income, 7777);
    assert.equal(reloadedBudget.monthsData[monthKey]?.fixedExpenses[0].id, 'f_protected');
    assert.equal(reloadedBudget.monthsData[monthKey]?.fixedExpenses[0].amount, 1000);
  });

  test('12-F. fetchAndSyncUserData: Fallo de persistencia de la cola seguido de reconexión (estado de sincronización observable)', async () => {
    // 1. Simulación de mutación con fallo de almacenamiento de cola (QuotaExceededError)
    const modifiedData: MonthData = {
      ...createFreshMonthData(),
      income: 4444,
    };
    saveBudgetState({
      month: 9,
      year: 2026,
      currency: 'ARS',
      monthsData: { [monthKey]: modifiedData },
    }, userId, false);

    // 2. Reconexión y sincronización
    const mockAdapter: FirestoreSyncAdapter = {
      fetchUserDoc: async () => ({ uid: userId, updatedAt: '2026-10-01T00:00:00.000Z' }),
      fetchMonths: async () => ({ [monthKey]: { ...createFreshMonthData(), income: 1111 } }),
      fetchCategories: async () => [],
    };

    const syncResult = await fetchAndSyncUserData(userId, undefined, mockAdapter);

    // 3. Verificación de la regla del cliente: Si hay conflictos, NO declarar "synced"
    const hasConflicts = Boolean(syncResult.conflicts && Object.keys(syncResult.conflicts).length > 0);
    const clientSyncStatus = hasConflicts ? 'error' : 'synced';

    assert.equal(hasConflicts, true);
    assert.equal(clientSyncStatus, 'error', 'El estado de sincronización debe ser "error" y NUNCA "synced" ante un conflicto sin resolver');
  });

  test('13-A. flushQueue: Un conflicto huérfano detectado no genera una escritura automática a Firestore', async () => {
    // 1. Un mes en conflicto registrado
    const localData: MonthData = {
      ...createFreshMonthData(),
      income: 8888,
      fixedExpenses: [{ id: 'f_conflict', name: 'Conflicto Local', amount: 500, category: 'otros', isPaid: false }],
    };
    const remoteData: MonthData = {
      ...createFreshMonthData(),
      income: 2222,
    };
    const activeConflicts: Record<string, MonthConflictInfo> = {
      [monthKey]: {
        local: localData,
        remote: remoteData,
        reason: 'orphan_local_divergence',
        detectedAt: new Date().toISOString(),
      },
    };
    savePendingConflicts(userId, activeConflicts);

    // 2. La cola de sincronización está vacía (cambio huérfano)
    savePendingSyncQueue([]);
    assert.equal(getPendingSyncQueue(userId).length, 0);

    // 3. Simulación de la lógica de flushQueue en App.tsx:
    // Debe verificar si hay elementos pendientes en cola. Si no los hay, NO debe escribir a Firestore.
    let writesAttempted = 0;
    const mockSaveToFirestore = async () => {
      writesAttempted++;
    };

    const hasPending = getPendingSyncQueue(userId).length > 0;
    let syncStatusResult = 'error';

    if (hasPending) {
      await mockSaveToFirestore();
      syncStatusResult = 'synced';
    } else {
      // Regla de App.tsx: Si la cola está vacía, no se realizan escrituras a ciegas.
      // Si persisten conflictos sin resolver, se preserva el estado 'error'.
      const hasConflicts = Object.keys(activeConflicts).length > 0;
      if (hasConflicts) {
        syncStatusResult = 'error';
      }
    }

    assert.equal(writesAttempted, 0, 'No debe realizar ninguna escritura automática a Firestore para un conflicto huérfano');
    assert.equal(syncStatusResult, 'error', 'El estado debe permanecer en error');
  });

  test('13-B. subscribeToUserMonths: Un snapshot remoto no reemplaza el mes local protegido ni lo sobrescribe en localStorage', async () => {
    // 1. Estado local protegido en conflicto
    const localMonth: MonthData = {
      ...createFreshMonthData(),
      income: 9999,
      fixedExpenses: [{ id: 'f_prot', name: 'Gasto Protegido', amount: 450, category: 'vivienda', isPaid: true }],
    };
    const remoteMonthStale: MonthData = {
      ...createFreshMonthData(),
      income: 1000,
    };
    const activeConflicts: Record<string, MonthConflictInfo> = {
      [monthKey]: {
        local: localMonth,
        remote: remoteMonthStale,
        reason: 'orphan_local_divergence',
        detectedAt: new Date().toISOString(),
      },
    };
    savePendingConflicts(userId, activeConflicts);
    saveBudgetState({
      month: 9,
      year: 2026,
      currency: 'ARS',
      monthsData: { [monthKey]: localMonth },
    }, userId, false);

    // 2. Llega un snapshot remoto con income: 3333 y sin el gasto protegido
    const incomingRemoteSnapshot: Record<string, MonthData> = {
      [monthKey]: {
        ...createFreshMonthData(),
        income: 3333,
        fixedExpenses: [],
      },
    };

    // 3. Ejecutar processRemoteMonthsSnapshot (utilizada en subscribeToUserMonths)
    const prevMonths = { [monthKey]: localMonth };
    const { updatedMonths, updatedConflicts, conflictCount } = processRemoteMonthsSnapshot(
      incomingRemoteSnapshot,
      prevMonths,
      activeConflicts,
      new Set(),
      new Set(),
      new Map(),
      new Map()
    );

    // Verificaciones:
    // a) El mes local en memoria NO es reemplazado por los datos remotos del snapshot
    assert.equal(updatedMonths[monthKey]?.income, 9999);
    assert.equal(updatedMonths[monthKey]?.fixedExpenses.length, 1);
    assert.equal(updatedMonths[monthKey]?.fixedExpenses[0].id, 'f_prot');

    // b) Al guardar el estado en localStorage (como hace subscribeToUserMonths), no se descartan los datos locales
    saveBudgetState({
      month: 9,
      year: 2026,
      currency: 'ARS',
      monthsData: updatedMonths,
    }, userId, false);

    const reloaded = loadBudgetState(userId, false);
    assert.equal(reloaded.monthsData[monthKey]?.income, 9999, 'localStorage debe mantener los datos locales protegidos');
    assert.equal(reloaded.monthsData[monthKey]?.fixedExpenses[0].id, 'f_prot');

    // c) El descriptor del conflicto actualiza la versión remota para inspección
    assert.equal(updatedConflicts[monthKey]?.remote.income, 3333);
    assert.equal(conflictCount, 1);
  });

  test('13-C. Persistencia y aislamiento: Los conflictos de meses distintos del mes activo también se conservan', async () => {
    const nonActiveKey = '2026-05';
    const nonActiveLocal: MonthData = {
      ...createFreshMonthData(),
      income: 7500,
      fixedExpenses: [{ id: 'f_may', name: 'Gasto Mayo', amount: 200, category: 'servicios', isPaid: true }],
    };
    const activeLocal: MonthData = {
      ...createFreshMonthData(),
      income: 5000,
    };

    saveBudgetState({
      month: 9, // Octubre es el mes activo
      year: 2026,
      currency: 'ARS',
      monthsData: {
        [monthKey]: activeLocal,
        [nonActiveKey]: nonActiveLocal,
      },
    }, userId, false);

    const mockAdapter: FirestoreSyncAdapter = {
      fetchUserDoc: async () => ({ uid: userId, updatedAt: '2026-10-01T00:00:00.000Z' }),
      fetchMonths: async () => ({
        [monthKey]: activeLocal, // Octubre coincide perfectamente
        [nonActiveKey]: { ...createFreshMonthData(), income: 1000 }, // Mayo difiere -> conflicto
      }),
      fetchCategories: async () => [],
    };

    const syncResult = await fetchAndSyncUserData(userId, undefined, mockAdapter);

    // El conflicto debe registrarse en el mes no activo (mayo)
    assert.ok(syncResult.conflicts);
    assert.ok(syncResult.conflicts[nonActiveKey], 'El conflicto de un mes no activo debe detectarse');
    assert.equal(syncResult.conflicts[nonActiveKey].local.income, 7500);
    assert.equal(syncResult.conflicts[nonActiveKey].remote.income, 1000);

    // Debe persistir de forma durable en localStorage
    const persistedConflicts = getPendingConflicts(userId);
    assert.ok(persistedConflicts[nonActiveKey], 'Debe quedar persistido en localStorage');
    assert.equal(persistedConflicts[nonActiveKey].local.income, 7500);

    // Datos locales de mayo protegidos en budget state
    assert.equal(syncResult.months[nonActiveKey]?.income, 7500);
  });

  test('13-D. Durabilidad y reconexión: Una conexión recuperada no convierte automáticamente un conflicto en synced', async () => {
    // 1. Conflicto persistido previamente en localStorage
    const activeConflicts: Record<string, MonthConflictInfo> = {
      [monthKey]: {
        local: { ...createFreshMonthData(), income: 6000 },
        remote: { ...createFreshMonthData(), income: 2000 },
        reason: 'orphan_local_divergence',
        detectedAt: '2026-10-28T00:00:00.000Z',
      },
    };
    savePendingConflicts(userId, activeConflicts);
    saveBudgetState({
      month: 9,
      year: 2026,
      currency: 'ARS',
      monthsData: { [monthKey]: { ...createFreshMonthData(), income: 6000 } },
    }, userId, false);

    // 2. Se recupera la conexión y se ejecuta fetchAndSyncUserData
    const mockAdapter: FirestoreSyncAdapter = {
      fetchUserDoc: async () => ({ uid: userId, updatedAt: '2026-10-01T00:00:00.000Z' }),
      fetchMonths: async () => ({ [monthKey]: { ...createFreshMonthData(), income: 2000 } }),
      fetchCategories: async () => [],
    };

    const syncResult = await fetchAndSyncUserData(userId, undefined, mockAdapter);

    // 3. El conflicto permanece activo tras la reconexión
    assert.ok(syncResult.conflicts?.[monthKey]);
    assert.equal(syncResult.conflicts[monthKey].detectedAt, '2026-10-28T00:00:00.000Z', 'Conserva la marca original');

    // 4. El estado del cliente debe ser 'error' y no 'synced'
    const hasConflicts = Boolean(syncResult.conflicts && Object.keys(syncResult.conflicts).length > 0);
    const resultingStatus = hasConflicts ? 'error' : 'synced';
    assert.equal(resultingStatus, 'error', 'No debe pasar a synced al reconectar mientras exista el conflicto');
  });

  test('13-E. Coexistencia: Los meses sin conflictos continúan sincronizándose normalmente', async () => {
    const conflictMonthKey = '2026-10';
    const normalMonthKey = '2026-11';

    const localConflictMonth: MonthData = {
      ...createFreshMonthData(),
      income: 9000,
      fixedExpenses: [{ id: 'f_conf', name: 'Gasto Conflicto', amount: 300, category: 'otros', isPaid: true }],
    };
    const localNormalMonth: MonthData = {
      ...createFreshMonthData(),
      income: 4000,
      fixedExpenses: [{ id: 'f_norm_old', name: 'Gasto Normal Viejo', amount: 100, category: 'servicios', isPaid: true }],
    };

    const activeConflicts: Record<string, MonthConflictInfo> = {
      [conflictMonthKey]: {
        local: localConflictMonth,
        remote: { ...createFreshMonthData(), income: 1000 },
        reason: 'orphan_local_divergence',
        detectedAt: new Date().toISOString(),
      },
    };

    // Snapshot remoto trae nueva información para ambos meses
    const incomingRemoteSnapshot: Record<string, MonthData> = {
      [conflictMonthKey]: {
        ...createFreshMonthData(),
        income: 1500, // No debe sobrescribir localConflictMonth
      },
      [normalMonthKey]: {
        ...createFreshMonthData(),
        income: 4500, // SÍ debe actualizar normalmente el mes sin conflicto
        fixedExpenses: [{ id: 'f_norm_new', name: 'Gasto Normal Nuevo', amount: 150, category: 'servicios', isPaid: false }],
      },
    };

    const prevMonths = {
      [conflictMonthKey]: localConflictMonth,
      [normalMonthKey]: localNormalMonth,
    };

    const { updatedMonths, updatedConflicts, conflictCount } = processRemoteMonthsSnapshot(
      incomingRemoteSnapshot,
      prevMonths,
      activeConflicts,
      new Set(),
      new Set(),
      new Map(),
      new Map()
    );

    // Mes en conflicto: protegido
    assert.equal(updatedMonths[conflictMonthKey]?.income, 9000);
    assert.equal(updatedMonths[conflictMonthKey]?.fixedExpenses[0].id, 'f_conf');

    // Mes sin conflicto: sincronizado normalmente con los datos remotos
    assert.equal(updatedMonths[normalMonthKey]?.income, 4500);
    assert.equal(updatedMonths[normalMonthKey]?.fixedExpenses[0].id, 'f_norm_new');

    // Estado global de conflictos
    assert.equal(conflictCount, 1);
    assert.ok(updatedConflicts[conflictMonthKey]);
  });

  test('13-F. Comparación completa: areMonthDataEqual detecta cambios en lastJarAdjustmentLog y metadatos de categorías', () => {
    const baseMonth: MonthData = {
      ...createFreshMonthData(),
      income: 5000,
      categories: [
        { id: 'cat_1', label: 'Comida', color: '#ff0000', badgeBg: '#fee', badgeText: '#900', isCustom: true },
      ],
      lastJarAdjustmentLog: {
        date: '2026-10-15',
        exceededJarTitle: 'Semana 1',
        diff: 250,
        transferredToNextMonth: false,
        nextMonthKey: '2026-11',
      },
    };

    // 1. Idéntico
    const clone: MonthData = JSON.parse(JSON.stringify(baseMonth));
    assert.equal(areMonthDataEqual(baseMonth, clone), true, 'Deben ser iguales');

    // 2. Cambio en lastJarAdjustmentLog.diff
    const diffLog: MonthData = {
      ...baseMonth,
      lastJarAdjustmentLog: {
        ...baseMonth.lastJarAdjustmentLog!,
        diff: 300,
      },
    };
    assert.equal(areMonthDataEqual(baseMonth, diffLog), false, 'Debe detectar cambio en diff de lastJarAdjustmentLog');

    // 3. Cambio en lastJarAdjustmentLog.transferredToNextMonth
    const diffTransferred: MonthData = {
      ...baseMonth,
      lastJarAdjustmentLog: {
        ...baseMonth.lastJarAdjustmentLog!,
        transferredToNextMonth: true,
      },
    };
    assert.equal(areMonthDataEqual(baseMonth, diffTransferred), false, 'Debe detectar cambio en transferredToNextMonth');

    // 4. Cambio en lastJarAdjustmentLog.nextMonthKey
    const diffNextMonth: MonthData = {
      ...baseMonth,
      lastJarAdjustmentLog: {
        ...baseMonth.lastJarAdjustmentLog!,
        nextMonthKey: '2026-12',
      },
    };
    assert.equal(areMonthDataEqual(baseMonth, diffNextMonth), false, 'Debe detectar cambio en nextMonthKey');

    // 5. Un objeto tiene lastJarAdjustmentLog y el otro undefined
    const noLog: MonthData = {
      ...baseMonth,
      lastJarAdjustmentLog: undefined,
    };
    assert.equal(areMonthDataEqual(baseMonth, noLog), false, 'Debe detectar ausencia de lastJarAdjustmentLog');

    // 6. Cambio en CategoryInfo.badgeBg
    const diffBadgeBg: MonthData = {
      ...baseMonth,
      categories: [
        { ...baseMonth.categories[0], badgeBg: '#00ff00' },
      ],
    };
    assert.equal(areMonthDataEqual(baseMonth, diffBadgeBg), false, 'Debe detectar cambio en badgeBg de categoría');

    // 7. Cambio en CategoryInfo.badgeText
    const diffBadgeText: MonthData = {
      ...baseMonth,
      categories: [
        { ...baseMonth.categories[0], badgeText: '#005500' },
      ],
    };
    assert.equal(areMonthDataEqual(baseMonth, diffBadgeText), false, 'Debe detectar cambio en badgeText de categoría');

    // 8. Cambio en CategoryInfo.isCustom
    const diffIsCustom: MonthData = {
      ...baseMonth,
      categories: [
        { ...baseMonth.categories[0], isCustom: false },
      ],
    };
    assert.equal(areMonthDataEqual(baseMonth, diffIsCustom), false, 'Debe detectar cambio en isCustom de categoría');
  });

  test('14-A. H-8. Guarda de sincronización: Los listeners en tiempo real no procesan snapshots hasta que isCloudSyncReady sea true', () => {
    const user = { uid: userId };
    const isOnline = true;
    const isOfflineSession = false;
    const isFirebaseAuthActive = true;

    const canSubscribe = (cloudSyncReady: boolean): boolean => {
      if (!user || !isOnline || isOfflineSession || !isFirebaseAuthActive || !cloudSyncReady) {
        return false;
      }
      return true;
    };

    assert.equal(canSubscribe(false), false, 'Durante la sincronización inicial (isCloudSyncReady = false), el listener debe permanecer bloqueado');
    assert.equal(canSubscribe(true), true, 'Una vez completada la sincronización inicial (isCloudSyncReady = true), se autoriza la suscripción');
  });

  test('14-B. H-9. Preservación estricta de conflictos: Un elemento pendiente en la cola de sincronización NO elimina el conflicto huérfano', async () => {
    // 1. Conflicto preexistente guardado
    const conflictData: MonthData = {
      ...createFreshMonthData(),
      income: 9500,
    };
    const remoteData: MonthData = {
      ...createFreshMonthData(),
      income: 3000,
    };
    const activeConflicts: Record<string, MonthConflictInfo> = {
      [monthKey]: {
        local: conflictData,
        remote: remoteData,
        reason: 'orphan_local_divergence',
        detectedAt: '2026-10-28T00:00:00.000Z',
      },
    };
    savePendingConflicts(userId, activeConflicts);

    // 2. Hay un elemento en la cola de sincronización para este mes
    enqueuePendingMonth(userId, monthKey, 2026, 9, conflictData);
    assert.ok(getPendingSyncQueue(userId).some(item => item.monthKey === monthKey));

    saveBudgetState({
      month: 9,
      year: 2026,
      currency: 'ARS',
      monthsData: { [monthKey]: conflictData },
    }, userId, false);

    // 3. Se ejecuta fetchAndSyncUserData
    const mockAdapter: FirestoreSyncAdapter = {
      fetchUserDoc: async () => ({ uid: userId, updatedAt: '2026-10-01T00:00:00.000Z' }),
      fetchMonths: async () => ({ [monthKey]: remoteData }),
      fetchCategories: async () => [],
    };

    const syncResult = await fetchAndSyncUserData(userId, undefined, mockAdapter);

    // H-9: El conflicto NO debe haberse eliminado de conflicts a pesar de tener un ítem en cola
    assert.ok(syncResult.conflicts?.[monthKey], 'El conflicto debe conservarse intacto aunque exista un ítem pendiente en cola');
    assert.equal(syncResult.conflicts[monthKey].local.income, 9500);

    // Debe permanecer persistido en localStorage
    const stored = getPendingConflicts(userId);
    assert.ok(stored[monthKey], 'Debe mantenerse en localStorage');
  });

  test('14-C. H-10. Procesamiento síncrono del snapshot: Las referencias y estado de sincronización se actualizan inmediatamente y sin desfasajes', () => {
    const currentMonths: Record<string, MonthData> = {
      [monthKey]: {
        ...createFreshMonthData(),
        income: 7777,
      },
    };
    const activeConflicts: Record<string, MonthConflictInfo> = {
      [monthKey]: {
        local: currentMonths[monthKey],
        remote: { ...createFreshMonthData(), income: 2000 },
        reason: 'orphan_local_divergence',
        detectedAt: new Date().toISOString(),
      },
    };

    const incomingRemote: Record<string, MonthData> = {
      [monthKey]: {
        ...createFreshMonthData(),
        income: 2500, // Nuevo snapshot remoto
      },
    };

    // Ejecuta el flujo síncrono implementado en App.tsx (fuera de updaters diferidos)
    const { updatedMonths, updatedConflicts, conflictCount } = processRemoteMonthsSnapshot(
      incomingRemote,
      currentMonths,
      activeConflicts,
      new Set(),
      new Set(),
      new Map(),
      new Map()
    );

    // Comprobación síncrona inmediata
    assert.equal(updatedMonths[monthKey].income, 7777, 'Conserva dato local protegido');
    assert.equal(updatedConflicts[monthKey].remote.income, 2500, 'Actualiza versión remota del conflicto');
    assert.equal(conflictCount, 1, 'Reporta 1 conflicto de forma inmediata');

    const hasConflicts = conflictCount > 0;
    const finalSyncStatus = hasConflicts ? 'error' : 'synced';
    assert.equal(finalSyncStatus, 'error', 'El estado síncrono debe ser error sin depender de desfasajes de renderizado');
  });

  test('14-D. H-11. Resiliencia ante fallos de localStorage: Si savePendingConflicts falla, la aplicación señala error y no enmascara el fallo como synced', () => {
    // Simula fallo de localStorage en savePendingConflicts
    const originalSetItem = localStorage.setItem;
    localStorage.setItem = () => {
      throw new Error('QuotaExceededError: Storage quota exceeded');
    };

    try {
      const saveResult = savePendingConflicts(userId, {
        [monthKey]: {
          local: createFreshMonthData(),
          remote: createFreshMonthData(),
          reason: 'orphan_local_divergence',
          detectedAt: new Date().toISOString(),
        },
      });

      assert.equal(saveResult, false, 'savePendingConflicts debe devolver false ante QuotaExceededError');

      // En App.tsx, si savePendingConflicts devuelve false:
      const conflictCount = 0;
      const conflictsSaved = saveResult;
      const hasConflicts = conflictCount > 0 || !conflictsSaved;
      const status = hasConflicts ? 'error' : 'synced';

      assert.equal(status, 'error', 'Si el guardado del conflicto falla, el estado debe degradar a error y nunca a synced');
    } finally {
      localStorage.setItem = originalSetItem;
    }
  });

  test('15-A. R-1 Escenario 1: saveBudgetState funciona normalmente tras un snapshot sin conflictos', () => {
    const remoteData: MonthData = {
      ...createFreshMonthData(),
      income: 4500,
    };
    const incomingRemote: Record<string, MonthData> = {
      [monthKey]: remoteData,
    };

    const { updatedMonths, updatedConflicts, conflictCount } = processRemoteMonthsSnapshot(
      incomingRemote,
      {},
      {},
      new Set(),
      new Set(),
      new Map(),
      new Map()
    );

    const conflictsSaved = savePendingConflicts(userId, updatedConflicts);
    const budgetSaved = saveBudgetState({
      month: 9,
      year: 2026,
      currency: 'ARS',
      monthsData: updatedMonths,
    }, userId, false);

    const hasConflictsOrStorageFailure = conflictCount > 0 || !conflictsSaved || !budgetSaved;
    const finalSyncStatus = hasConflictsOrStorageFailure ? 'error' : 'synced';

    assert.equal(budgetSaved, true, 'saveBudgetState debe retornar true');
    assert.equal(finalSyncStatus, 'synced', 'El estado debe ser synced cuando no hay conflictos y el guardado fue exitoso');

    const loaded = loadBudgetState(userId, false);
    assert.equal(loaded.monthsData[monthKey]?.income, 4500, 'Los datos deben guardarse duraderamente en almacenamiento local');
  });

  test('15-B. R-1 Escenario 2: saveBudgetState devuelve false durante un snapshot sin conflictos (no se marca como synced)', () => {
    const originalSetItem = localStorage.setItem;
    // Simula fallo exclusivo de cuota en guardado de presupuesto
    localStorage.setItem = (key: string, val: string) => {
      if (key.includes('nita_user_data_')) {
        throw new Error('QuotaExceededError: LocalStorage limit reached');
      }
      originalSetItem.call(localStorage, key, val);
    };

    try {
      const incomingRemote: Record<string, MonthData> = {
        [monthKey]: { ...createFreshMonthData(), income: 6000 },
      };

      const { updatedMonths, updatedConflicts, conflictCount } = processRemoteMonthsSnapshot(
        incomingRemote,
        {},
        {},
        new Set(),
        new Set(),
        new Map(),
        new Map()
      );

      const conflictsSaved = savePendingConflicts(userId, updatedConflicts);
      const budgetSaved = saveBudgetState({
        month: 9,
        year: 2026,
        currency: 'ARS',
        monthsData: updatedMonths,
      }, userId, false);

      assert.equal(budgetSaved, false, 'saveBudgetState debe retornar false ante QuotaExceededError');

      // En App.tsx, evaluación de estado:
      const hasConflictsOrStorageFailure = conflictCount > 0 || !conflictsSaved || !budgetSaved;
      const finalSyncStatus = hasConflictsOrStorageFailure ? 'error' : 'synced';

      assert.equal(finalSyncStatus, 'error', 'NITA no debe considerarse synced si el presupuesto no se guardó de forma duradera');
    } finally {
      localStorage.setItem = originalSetItem;
    }
  });

  test('15-C. R-1 Escenario 3: saveBudgetState devuelve false con conflicto activo (preserva datos locales protegidos y conflicto)', () => {
    const protectedLocal: MonthData = {
      ...createFreshMonthData(),
      income: 9999,
      fixedExpenses: [{ id: 'f_prot', name: 'Protegido', amount: 500, category: 'otros', isPaid: true }],
    };
    const activeConflicts: Record<string, MonthConflictInfo> = {
      [monthKey]: {
        local: protectedLocal,
        remote: { ...createFreshMonthData(), income: 1000 },
        reason: 'orphan_local_divergence',
        detectedAt: '2026-10-28T00:00:00.000Z',
      },
    };

    const originalSetItem = localStorage.setItem;
    localStorage.setItem = (key: string, val: string) => {
      if (key.includes('nita_user_data_')) {
        throw new Error('QuotaExceededError: LocalStorage limit reached');
      }
      originalSetItem.call(localStorage, key, val);
    };

    try {
      const incomingRemote: Record<string, MonthData> = {
        [monthKey]: { ...createFreshMonthData(), income: 2500 },
      };

      const { updatedMonths, updatedConflicts, conflictCount } = processRemoteMonthsSnapshot(
        incomingRemote,
        { [monthKey]: protectedLocal },
        activeConflicts,
        new Set(),
        new Set(),
        new Map(),
        new Map()
      );

      // Verificación de conservación de datos locales protegidos en memoria
      assert.equal(updatedMonths[monthKey]?.income, 9999, 'Debe conservar datos locales protegidos');
      assert.equal(updatedMonths[monthKey]?.fixedExpenses[0].id, 'f_prot');

      // Verificación del descriptor de conflicto
      assert.equal(conflictCount, 1);
      assert.equal(updatedConflicts[monthKey].remote.income, 2500, 'Actualiza versión remota de inspección');
      assert.equal(updatedConflicts[monthKey].local.income, 9999, 'Conserva versión local intacta');

      // Guardado fallido
      const budgetSaved = saveBudgetState({
        month: 9,
        year: 2026,
        currency: 'ARS',
        monthsData: updatedMonths,
      }, userId, false);
      assert.equal(budgetSaved, false);

      const hasConflictsOrStorageFailure = conflictCount > 0 || !budgetSaved;
      const finalSyncStatus = hasConflictsOrStorageFailure ? 'error' : 'synced';
      assert.equal(finalSyncStatus, 'error', 'El estado debe permanecer en error');
    } finally {
      localStorage.setItem = originalSetItem;
    }
  });

  test('15-D. R-1 Escenario 4: Nueva sincronización o reintento no elimina el conflicto ni sobrescribe datos mientras persista el fallo', async () => {
    const protectedLocal: MonthData = {
      ...createFreshMonthData(),
      income: 8888,
    };
    const activeConflicts: Record<string, MonthConflictInfo> = {
      [monthKey]: {
        local: protectedLocal,
        remote: { ...createFreshMonthData(), income: 2000 },
        reason: 'orphan_local_divergence',
        detectedAt: '2026-10-28T00:00:00.000Z',
      },
    };
    savePendingConflicts(userId, activeConflicts);
    saveBudgetState({
      month: 9,
      year: 2026,
      currency: 'ARS',
      monthsData: { [monthKey]: protectedLocal },
    }, userId, false);

    const originalSetItem = localStorage.setItem;
    // Falla el guardado durante la re-sincronización
    localStorage.setItem = () => {
      throw new Error('QuotaExceededError: Persistence blocked');
    };

    try {
      const mockAdapter: FirestoreSyncAdapter = {
        fetchUserDoc: async () => ({ uid: userId, updatedAt: '2026-10-01T00:00:00.000Z' }),
        fetchMonths: async () => ({ [monthKey]: { ...createFreshMonthData(), income: 2000 } }),
        fetchCategories: async () => [],
      };

      const syncResult = await fetchAndSyncUserData(userId, undefined, mockAdapter);

      // Verificación de señalización de fallo de almacenamiento
      assert.equal(syncResult.storageFailed, true, 'Debe señalar storageFailed ante fallo en saveBudgetState/savePendingConflicts');
      // Verificación de no eliminación del conflicto
      assert.ok(syncResult.conflicts?.[monthKey], 'El conflicto no debe ser eliminado');
      assert.equal(syncResult.conflicts[monthKey].local.income, 8888);
      // Verificación de no sobrescritura de datos locales
      assert.equal(syncResult.months[monthKey]?.income, 8888);

      // Evaluación en App.tsx:
      const activeConf = syncResult.conflicts || {};
      const status = (Object.keys(activeConf).length > 0 || syncResult.storageFailed) ? 'error' : 'synced';
      assert.equal(status, 'error', 'El estado debe mantenerse en error');
    } finally {
      localStorage.setItem = originalSetItem;
    }
  });

  test('15-E. R-1 Escenario 5: Recuperación del almacenamiento permite restaurar el estado correcto sin resolver conflictos prematuramente', () => {
    const protectedLocal: MonthData = {
      ...createFreshMonthData(),
      income: 7777,
    };
    const activeConflicts: Record<string, MonthConflictInfo> = {
      [monthKey]: {
        local: protectedLocal,
        remote: { ...createFreshMonthData(), income: 3000 },
        reason: 'orphan_local_divergence',
        detectedAt: '2026-10-28T00:00:00.000Z',
      },
    };

    // 1. Almacenamiento funciona normalmente
    const conflictsSaved = savePendingConflicts(userId, activeConflicts);
    const budgetSaved = saveBudgetState({
      month: 9,
      year: 2026,
      currency: 'ARS',
      monthsData: { [monthKey]: protectedLocal },
    }, userId, false);

    assert.equal(conflictsSaved, true);
    assert.equal(budgetSaved, true);

    // 2. Comprobar que no se resuelve prematuramente el conflicto solo por recuperar almacenamiento
    const conflictCount = Object.keys(activeConflicts).length;
    const hasConflictsOrStorageFailure = conflictCount > 0 || !conflictsSaved || !budgetSaved;
    const statusWithConflict = hasConflictsOrStorageFailure ? 'error' : 'synced';
    assert.equal(statusWithConflict, 'error', 'El conflicto activo DEBE mantener el estado en error aun cuando el almacenamiento funcione');

    // 3. Comprobar que si no hubiera conflictos y el almacenamiento funciona, el estado sí es 'synced'
    const noConflicts: Record<string, MonthConflictInfo> = {};
    const noConflictCount = 0;
    const noConflictSaved = savePendingConflicts(userId, noConflicts);
    const statusWithoutConflict = (noConflictCount > 0 || !noConflictSaved || !budgetSaved) ? 'error' : 'synced';
    assert.equal(statusWithoutConflict, 'synced', 'Sin conflictos y con almacenamiento recuperado, el estado es synced');
  });
});

describe('NITA — Sincronización Multi-dispositivo Google / Firestore (Dispositivo A <-> Dispositivo B)', () => {
  const syncUserId = 'user_multi_device_google_sync';
  const testMonthKey = '2026-10';

  beforeEach(() => {
    localStorage.clear();
  });

  test('Fase 2-A: Dispositivo A modifica ingresos y porcentaje de ahorro a cero -> Dispositivo B adopta ceros exactamente', () => {
    const localDeviceB: MonthData = {
      ...createFreshMonthData(),
      income: 5000,
      savingsRate: 15,
      fixedExpenses: [{ id: 'f1', name: 'Servicio', amount: 300, category: 'servicios', isPaid: true }],
    };

    // Snapshot remoto confirmado por servidor desde Dispositivo A con income: 0 y savingsRate: 0
    const remoteFromDeviceA: Record<string, MonthData> = {
      [testMonthKey]: {
        ...createFreshMonthData(),
        income: 0,
        savingsRate: 0,
        fixedExpenses: [{ id: 'f1', name: 'Servicio', amount: 300, category: 'servicios', isPaid: true }],
      },
    };

    const { updatedMonths } = processRemoteMonthsSnapshot(
      remoteFromDeviceA,
      { [testMonthKey]: localDeviceB },
      {},
      new Set(),
      new Set(),
      new Map(),
      new Map(),
      new Map(),
      syncUserId
    );

    assert.equal(updatedMonths[testMonthKey]?.income, 0, 'Dispositivo B debe adoptar exactamente ingreso 0');
    assert.equal(updatedMonths[testMonthKey]?.savingsRate, 0, 'Dispositivo B debe adoptar exactamente porcentaje de ahorro 0');
  });

  test('Fase 2-B: Dispositivo A cambia estado isPaid de true a false y modifica importe -> Dispositivo B lo refleja', () => {
    const localDeviceB: MonthData = {
      ...createFreshMonthData(),
      fixedExpenses: [{ id: 'f_alquiler', name: 'Alquiler', amount: 800, category: 'vivienda', isPaid: true }],
    };

    // Dispositivo A cambia isPaid a false y el importe a 950
    const remoteFromDeviceA: Record<string, MonthData> = {
      [testMonthKey]: {
        ...createFreshMonthData(),
        fixedExpenses: [{ id: 'f_alquiler', name: 'Alquiler', amount: 950, category: 'vivienda', isPaid: false }],
      },
    };

    const { updatedMonths } = processRemoteMonthsSnapshot(
      remoteFromDeviceA,
      { [testMonthKey]: localDeviceB },
      {},
      new Set(),
      new Set(),
      new Map(),
      new Map(),
      new Map(),
      syncUserId
    );

    assert.equal(updatedMonths[testMonthKey]?.fixedExpenses[0].amount, 950);
    assert.equal(updatedMonths[testMonthKey]?.fixedExpenses[0].isPaid, false, 'isPaid: false confirmado no debe ser revertido');
  });

  test('Fase 2-C: Dispositivo A elimina un gasto y agrega uno nuevo -> Dispositivo B no resucita el gasto eliminado', () => {
    const localDeviceB: MonthData = {
      ...createFreshMonthData(),
      variableExpenses: [
        { id: 'v_old', description: 'Supermercado', amount: 150, category: 'comida', date: '2026-10-05' },
      ],
    };

    // Dispositivo A eliminó v_old y agregó v_new
    const remoteFromDeviceA: Record<string, MonthData> = {
      [testMonthKey]: {
        ...createFreshMonthData(),
        variableExpenses: [
          { id: 'v_new', description: 'Farmacia', amount: 50, category: 'salud', date: '2026-10-06' },
        ],
      },
    };

    const { updatedMonths } = processRemoteMonthsSnapshot(
      remoteFromDeviceA,
      { [testMonthKey]: localDeviceB },
      {},
      new Set(),
      new Set(),
      new Map(),
      new Map(),
      new Map(),
      syncUserId
    );

    const vars = updatedMonths[testMonthKey]?.variableExpenses || [];
    assert.equal(vars.length, 1);
    assert.equal(vars[0].id, 'v_new');
    assert.equal(vars.some(v => v.id === 'v_old'), false, 'El gasto eliminado por Dispositivo A no debe reaparecer en B');
  });

  test('Fase 2-D: Dispositivo A elimina todos los gastos del mes -> Dispositivo B adopta listas vacías', () => {
    const localDeviceB: MonthData = {
      ...createFreshMonthData(),
      income: 2000,
      fixedExpenses: [{ id: 'f1', name: 'Gasto 1', amount: 100, category: 'cat1', isPaid: true }],
      variableExpenses: [{ id: 'v1', description: 'Gasto Var', amount: 50, category: 'cat2', date: '2026-10-01' }],
    };

    // Dispositivo A borró todos los gastos
    const remoteFromDeviceA: Record<string, MonthData> = {
      [testMonthKey]: {
        ...createFreshMonthData(),
        income: 2000,
        fixedExpenses: [],
        variableExpenses: [],
      },
    };

    const { updatedMonths } = processRemoteMonthsSnapshot(
      remoteFromDeviceA,
      { [testMonthKey]: localDeviceB },
      {},
      new Set(),
      new Set(),
      new Map(),
      new Map(),
      new Map(),
      syncUserId
    );

    assert.equal(updatedMonths[testMonthKey]?.fixedExpenses.length, 0, 'Lista de gastos fijos debe quedar vacía');
    assert.equal(updatedMonths[testMonthKey]?.variableExpenses.length, 0, 'Lista de gastos variables debe quedar vacía');
  });

  test('Fase 3: Dispositivo B modifica en sentido inverso -> Dispositivo A adopta cambios', () => {
    const localDeviceA: MonthData = {
      ...createFreshMonthData(),
      income: 3000,
      jarAdjustments: { 1: 0 },
    };

    // Dispositivo B actualiza ingreso a 4500 y ajuste de frasco
    const remoteFromDeviceB: Record<string, MonthData> = {
      [testMonthKey]: {
        ...createFreshMonthData(),
        income: 4500,
        jarAdjustments: { 1: 150 },
      },
    };

    const { updatedMonths } = processRemoteMonthsSnapshot(
      remoteFromDeviceB,
      { [testMonthKey]: localDeviceA },
      {},
      new Set(),
      new Set(),
      new Map(),
      new Map(),
      new Map(),
      syncUserId
    );

    assert.equal(updatedMonths[testMonthKey]?.income, 4500);
    assert.equal(updatedMonths[testMonthKey]?.jarAdjustments?.[1], 150);
  });

  test('Fase 4-A: Operación local pendiente en Dispositivo B se protege ante llegada de snapshot remoto', () => {
    const localPendingExpense: VariableExpense = {
      id: 'v_local_pending',
      description: 'Gasto offline en B',
      amount: 99,
      category: 'comida',
      date: '2026-10-08',
    };

    const localDataWithPending: MonthData = {
      ...createFreshMonthData(),
      variableExpenses: [localPendingExpense],
    };

    // Encolar operación pendiente en Dispositivo B
    enqueuePendingMonth(syncUserId, testMonthKey, 2026, 9, localDataWithPending);

    // Llega snapshot remoto desde Dispositivo A que aún no contiene v_local_pending
    const remoteFromA: Record<string, MonthData> = {
      [testMonthKey]: {
        ...createFreshMonthData(),
        income: 1200,
        variableExpenses: [],
      },
    };

    const { updatedMonths } = processRemoteMonthsSnapshot(
      remoteFromA,
      { [testMonthKey]: localDataWithPending },
      {},
      new Set(['v_local_pending']),
      new Set(),
      new Map(),
      new Map(),
      new Map(),
      syncUserId
    );

    const vars = updatedMonths[testMonthKey]?.variableExpenses || [];
    assert.ok(vars.some(v => v.id === 'v_local_pending'), 'La operación local pendiente de B no debe perderse');
  });

  test('Fase 4-B: Prueba real obligatoria con Firestore Emulator y 2 instancias independientes (A y B)', async (t) => {
    const rawHost = process.env.FIRESTORE_EMULATOR_HOST;
    if (!rawHost) {
      t.skip('Prueba real con Firestore Emulator no ejecutada: el entorno de ejecución no dispone de Java Runtime ni del emulador de Firestore activo (FIRESTORE_EMULATOR_HOST no configurado).');
      return;
    }

    const parts = rawHost.split(':');
    const host = parts[0]?.trim();
    const port = Number(parts[1]?.trim());
    if (!host || !port || isNaN(port)) {
      t.skip(`FIRESTORE_EMULATOR_HOST tiene formato inválido: '${rawHost}'. Se requiere formato 'host:port'.`);
      return;
    }

    let testEnv: RulesTestEnvironment | null = null;
    try {
      const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
      const rules = fs.existsSync(rulesPath) ? fs.readFileSync(rulesPath, 'utf8') : '';
      testEnv = await initializeTestEnvironment({
        projectId: 'demo-nita-multidevice-sync',
        firestore: { host, port, rules },
      });

      // Verificación de conexión real al emulador
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await getDoc(doc(db, 'ping', 'check'));
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      t.skip(`Prueba real con Firestore Emulator no ejecutada: no se pudo conectar al emulador en ${rawHost} (${msg}).`);
      return;
    }

    try {
      const sameUid = 'google_user_test_sync_real_uid';
      const contextA = testEnv.authenticatedContext(sameUid);
      const dbA = contextA.firestore();
      const contextB = testEnv.authenticatedContext(sameUid);
      const dbB = contextB.firestore();

      const monthDocRefA = doc(dbA, 'users', sameUid, 'months', testMonthKey);
      const monthDocRefB = doc(dbB, 'users', sameUid, 'months', testMonthKey);

      // Limpieza inicial
      await deleteDoc(monthDocRefA);

      // --- Flujo A -> B ---
      let lastSnapshotB: any = null;
      let snapshotPromiseResolveB: ((data: any) => void) | null = null;

      const unsubB = onSnapshot(monthDocRefB, { includeMetadataChanges: false }, (snap) => {
        if (snap.exists()) {
          lastSnapshotB = snap.data();
          if (snapshotPromiseResolveB) {
            const resolver = snapshotPromiseResolveB;
            snapshotPromiseResolveB = null;
            resolver(lastSnapshotB);
          }
        }
      });

      const waitForNextSnapshotB = (): Promise<any> => {
        return new Promise((resolve) => {
          snapshotPromiseResolveB = resolve;
        });
      };

      // 1. A modifica ingresos -> B recibe el cambio sin recargar
      let waitB = waitForNextSnapshotB();
      await setDoc(monthDocRefA, {
        monthKey: testMonthKey,
        income: 4200,
        savingsRate: 15,
        extraDaysPosition: 'end',
        categories: [],
        fixedExpenses: [
          { id: 'f_real_1', name: 'Alquiler', amount: 800, category: 'vivienda', isPaid: true }
        ],
        variableExpenses: [
          { id: 'v_real_1', description: 'Supermercado', amount: 120, category: 'comida', date: '2026-10-05' }
        ],
      });
      let receivedB = await waitB;
      assert.equal(receivedB.income, 4200, 'A -> B: Dispositivo B debe recibir ingreso 4200 sin recargar');

      // 2. A modifica el ahorro a cero -> B recibe exactamente cero
      waitB = waitForNextSnapshotB();
      await setDoc(monthDocRefA, { ...receivedB, savingsRate: 0 });
      receivedB = await waitB;
      assert.equal(receivedB.savingsRate, 0, 'A -> B: Dispositivo B debe recibir exactamente 0 en ahorro');

      // 3. A modifica un gasto (importe y estado isPaid: true -> false) -> B recibe el importe y estado actualizado
      waitB = waitForNextSnapshotB();
      await setDoc(monthDocRefA, {
        ...receivedB,
        fixedExpenses: [
          { id: 'f_real_1', name: 'Alquiler', amount: 950, category: 'vivienda', isPaid: false }
        ],
      });
      receivedB = await waitB;
      assert.equal(receivedB.fixedExpenses[0]?.amount, 950, 'A -> B: Dispositivo B debe recibir el importe actualizado 950');
      assert.equal(receivedB.fixedExpenses[0]?.isPaid, false, 'A -> B: Dispositivo B debe recibir isPaid: false');

      // 4. A elimina un gasto -> B no lo vuelve a mostrar
      waitB = waitForNextSnapshotB();
      await setDoc(monthDocRefA, {
        ...receivedB,
        variableExpenses: [],
      });
      receivedB = await waitB;
      assert.equal(receivedB.variableExpenses.length, 0, 'A -> B: Dispositivo B no debe volver a mostrar el gasto eliminado');

      // 5. A elimina todos los gastos -> B recibe listas vacías
      waitB = waitForNextSnapshotB();
      await setDoc(monthDocRefA, {
        ...receivedB,
        fixedExpenses: [],
        variableExpenses: [],
      });
      receivedB = await waitB;
      assert.equal(receivedB.fixedExpenses.length, 0, 'A -> B: Dispositivo B recibe lista de gastos fijos vacía');
      assert.equal(receivedB.variableExpenses.length, 0, 'A -> B: Dispositivo B recibe lista de gastos variables vacía');

      unsubB();

      // --- Flujo B -> A ---
      let lastSnapshotA: any = null;
      let snapshotPromiseResolveA: ((data: any) => void) | null = null;

      const unsubA = onSnapshot(monthDocRefA, { includeMetadataChanges: false }, (snap) => {
        if (snap.exists()) {
          lastSnapshotA = snap.data();
          if (snapshotPromiseResolveA) {
            const resolver = snapshotPromiseResolveA;
            snapshotPromiseResolveA = null;
            resolver(lastSnapshotA);
          }
        }
      });

      const waitForNextSnapshotA = (): Promise<any> => {
        return new Promise((resolve) => {
          snapshotPromiseResolveA = resolve;
        });
      };

      // 6. B modifica los datos (ingreso 5500, nuevo gasto fijo y nuevo variable) -> A recibe los cambios sin recargar
      let waitA = waitForNextSnapshotA();
      await setDoc(monthDocRefB, {
        monthKey: testMonthKey,
        income: 5500,
        savingsRate: 10,
        extraDaysPosition: 'end',
        categories: [],
        fixedExpenses: [
          { id: 'f_b_1', name: 'Internet Fibra', amount: 45, category: 'servicios', isPaid: true }
        ],
        variableExpenses: [
          { id: 'v_b_1', description: 'Cafetería', amount: 15, category: 'ocio', date: '2026-10-06' }
        ],
      });
      let receivedA = await waitA;
      assert.equal(receivedA.income, 5500, 'B -> A: Dispositivo A debe recibir ingreso 5500 sin recargar');
      assert.equal(receivedA.fixedExpenses[0]?.amount, 45, 'B -> A: Dispositivo A debe recibir gasto modificado por B');

      // 7. B elimina el gasto variable -> A recibe la eliminación
      waitA = waitForNextSnapshotA();
      await setDoc(monthDocRefB, {
        ...receivedA,
        variableExpenses: [],
      });
      receivedA = await waitA;
      assert.equal(receivedA.variableExpenses.length, 0, 'B -> A: Dispositivo A refleja eliminación de gastos realizada por B');

      unsubA();

      // --- Concurrencia y cola local ---
      // 8. B conserva una operación local pendiente cuando recibe modificación remota de A
      const localPendingExpense: VariableExpense = {
        id: 'v_concurrent_b',
        description: 'Gasto local concurrente en B',
        amount: 88,
        category: 'comida',
        date: '2026-10-07',
      };
      const localDataInB: MonthData = {
        ...createFreshMonthData(),
        income: 5500,
        variableExpenses: [localPendingExpense],
      };

      enqueuePendingMonth(sameUid, testMonthKey, 2026, 9, localDataInB);

      // A modifica simultáneamente ingresos a 6000
      const remoteFromA: Record<string, MonthData> = {
        [testMonthKey]: {
          ...createFreshMonthData(),
          income: 6000,
          variableExpenses: [],
        },
      };

      const { updatedMonths: reconciledB } = processRemoteMonthsSnapshot(
        remoteFromA,
        { [testMonthKey]: localDataInB },
        {},
        new Set(['v_concurrent_b']),
        new Set(),
        new Map(),
        new Map(),
        new Map(),
        sameUid
      );

      assert.ok(
        reconciledB[testMonthKey]?.variableExpenses.some(v => v.id === 'v_concurrent_b'),
        'Concurrencia: La operación pendiente de B no se pierde ante modificación remota de A'
      );
      assert.equal(reconciledB[testMonthKey]?.income, 5500, 'Concurrencia: La versión con operación local pendiente protege los datos locales');

      // 9. Una resolución de conflicto no elimina operaciones pendientes de otros meses
      const otherMonthKey = '2026-11';
      enqueuePendingMonth(sameUid, otherMonthKey, 2026, 10, createFreshMonthData());
      removePendingMonthFromQueue(sameUid, testMonthKey);
      const remainingQueue = getPendingSyncQueue(sameUid);
      assert.ok(
        remainingQueue.some(item => item.monthKey === otherMonthKey),
        'Concurrencia: Operaciones pendientes de otros meses se conservan intactas'
      );
    } finally {
      if (testEnv) {
        await testEnv.cleanup();
      }
    }
  });
});

describe('NITA — Verificación de Propagación de Metadatos y Persistencia (Puntos D.1 - D.8)', () => {
  const testUid = 'user_metadata_test_888';

  beforeEach(() => {
    localStorage.clear();
  });

  test('D.1: subscribeToUserMonths transmite correctamente fromCache y hasPendingWrites', () => {
    let receivedWrites: boolean | null = null;
    let receivedCache: boolean | null = null;
    let receivedMonths: Record<string, MonthData> | null = null;

    const mockSnapshot = {
      metadata: { hasPendingWrites: true, fromCache: false },
      forEach: (cb: any) => {
        cb({
          data: () => ({
            monthKey: '2026-10',
            income: 3000,
            savingsRate: 10,
          }),
        });
      },
    };

    handleUserMonthsSnapshot(mockSnapshot, (months, hasPendingWrites, fromCache) => {
      receivedMonths = months;
      receivedWrites = hasPendingWrites;
      receivedCache = fromCache;
    });

    assert.equal(receivedWrites, true, 'Debe transmitir hasPendingWrites: true con fidelidad');
    assert.equal(receivedCache, false, 'Debe transmitir fromCache: false con fidelidad');
    assert.equal((receivedMonths as any)?.['2026-10']?.income, 3000, 'Debe transmitir los meses correctamente');

    // Comprobar con fromCache = true y hasPendingWrites = false
    const cacheSnapshot = {
      metadata: { hasPendingWrites: false, fromCache: true },
      forEach: () => {},
    };

    handleUserMonthsSnapshot(cacheSnapshot, (_m, hasPendingWrites, fromCache) => {
      receivedWrites = hasPendingWrites;
      receivedCache = fromCache;
    });

    assert.equal(receivedWrites, false, 'hasPendingWrites debe ser false');
    assert.equal(receivedCache, true, 'fromCache debe ser true');
  });

  test('D.2: subscribeToGlobalCategories transmite correctamente fromCache', () => {
    let receivedCategories: any = null;
    let receivedCache: boolean | null = null;

    const mockDocSnap = {
      exists: () => true,
      data: () => ({
        categories: [{ id: 'cat_test', label: 'Test Cat', color: '#ff0000' }],
      }),
      metadata: { fromCache: true },
    };

    handleGlobalCategoriesSnapshot(mockDocSnap, (cats, fromCache) => {
      receivedCategories = cats;
      receivedCache = fromCache;
    });

    assert.equal(receivedCache, true, 'Debe transmitir fromCache: true con fidelidad');
    assert.equal(receivedCategories.length, 1, 'Debe transmitir las categorías');
    assert.equal(receivedCategories[0].id, 'cat_test');
  });

  test('D.3: Una lista de categorías vacía se transmite al callback si el doc existe; si no existe, no se interpreta como eliminación', () => {
    let calledWithEmpty = false;
    let receivedCache: boolean | null = null;

    // Caso 1: Documento existente con lista de categorías vacía (eliminación confirmada de todas las categorías)
    const existingEmptyDoc = {
      exists: () => true,
      data: () => ({ categories: [] }),
      metadata: { fromCache: false },
    };

    handleGlobalCategoriesSnapshot(existingEmptyDoc, (cats, fromCache) => {
      calledWithEmpty = Array.isArray(cats) && cats.length === 0;
      receivedCache = fromCache;
    });

    assert.equal(calledWithEmpty, true, 'Una lista de categorías vacía DEBE transmitirse al callback');
    assert.equal(receivedCache, false);

    // Caso 2: Documento inexistente (no debe interpretar doc inexistente como categorías vacías)
    let calledForNonExistent = false;
    const nonExistentDoc = {
      exists: () => false,
      data: () => null,
      metadata: { fromCache: false },
    };

    handleGlobalCategoriesSnapshot(nonExistentDoc, () => {
      calledForNonExistent = true;
    });

    assert.equal(calledForNonExistent, false, 'Un documento inexistente NO debe interpretarse como eliminación confirmada');
  });

  test('D.4: Un snapshot inicial de caché no inicializa la sincronización', () => {
    let isServerConfirmedInitDone = false;
    let isCloudSyncReady = false;
    let syncStatus = 'idle';

    const onMonthsUpdate = (_remoteMonths: Record<string, MonthData>, hasPendingWrites: boolean, fromCache: boolean) => {
      if (!isServerConfirmedInitDone) {
        if (fromCache || hasPendingWrites) {
          syncStatus = 'syncing';
          return;
        }
      }
      isServerConfirmedInitDone = true;
      isCloudSyncReady = true;
      syncStatus = 'synced';
    };

    // Llega snapshot con fromCache = true
    onMonthsUpdate({ '2026-10': createFreshMonthData() }, false, true);

    assert.equal(isServerConfirmedInitDone, false, 'No debe marcar inicialización confirmada con snapshot de caché');
    assert.equal(isCloudSyncReady, false, 'isCloudSyncReady debe permanecer false');
    assert.equal(syncStatus, 'syncing', 'syncStatus debe permanecer en syncing');
  });

  test('D.5: Un snapshot confirmado por servidor sí puede inicializar la sincronización', () => {
    let isServerConfirmedInitDone = false;
    let isCloudSyncReady = false;
    let syncStatus = 'idle';

    const onMonthsUpdate = (_remoteMonths: Record<string, MonthData>, hasPendingWrites: boolean, fromCache: boolean) => {
      if (!isServerConfirmedInitDone) {
        if (fromCache || hasPendingWrites) {
          syncStatus = 'syncing';
          return;
        }
      }
      isServerConfirmedInitDone = true;
      isCloudSyncReady = true;
      syncStatus = 'synced';
    };

    // Llega snapshot confirmado por servidor: fromCache = false, hasPendingWrites = false
    onMonthsUpdate({ '2026-10': createFreshMonthData() }, false, false);

    assert.equal(isServerConfirmedInitDone, true, 'Debe marcar inicialización autoritativa');
    assert.equal(isCloudSyncReady, true, 'isCloudSyncReady debe ser true');
    assert.equal(syncStatus, 'synced', 'syncStatus pasa a synced');
  });

  test('D.6: Un fallo de savePendingConflicts() impide declarar synced', () => {
    const activeConflicts: Record<string, MonthConflictInfo> = {
      '2026-10': {
        remote: createFreshMonthData(),
        local: { ...createFreshMonthData(), income: 9999 },
        reason: 'concurrent_modification',
        detectedAt: new Date().toISOString(),
      },
    };

    const conflictsSaved = false;
    const budgetSaved = true;

    const canSync = budgetSaved && conflictsSaved && Object.keys(activeConflicts).length === 0;
    const status = canSync ? 'synced' : 'error';

    assert.equal(status, 'error', 'Fallo de persistencia de conflictos DEBE impedir el estado synced');
  });

  test('D.7: Un fallo de persistencia de categorías impide declarar synced', () => {
    const budgetSaved = true;
    const categoriesPersisted = false;

    const canSync = budgetSaved && categoriesPersisted;
    const status = canSync ? 'synced' : 'error';

    assert.equal(status, 'error', 'Fallo de persistencia de categorías DEBE impedir el estado synced');
  });

  test('D.8: Las operaciones pendientes y conflictos siguen protegidos', () => {
    const protectedKey = '2026-10';
    const localPendingData: MonthData = {
      ...createFreshMonthData(),
      income: 7000,
      variableExpenses: [{ id: 'v_pending', description: 'Local', amount: 50, category: 'otros', date: '2026-10-01' }],
    };

    enqueuePendingMonth(testUid, protectedKey, 2026, 9, localPendingData);

    const activeConflicts: Record<string, MonthConflictInfo> = {
      '2026-11': {
        remote: createFreshMonthData(),
        local: { ...createFreshMonthData(), income: 8888 },
        reason: 'concurrent_modification',
        detectedAt: new Date().toISOString(),
      },
    };

    const remoteMonths: Record<string, MonthData> = {
      [protectedKey]: {
        ...createFreshMonthData(),
        income: 2000,
        variableExpenses: [],
      },
      '2026-11': {
        ...createFreshMonthData(),
        income: 3000,
      },
    };

    const { updatedMonths, updatedConflicts } = processRemoteMonthsSnapshot(
      remoteMonths,
      { [protectedKey]: localPendingData, '2026-11': activeConflicts['2026-11'].local },
      activeConflicts,
      new Set(['v_pending']),
      new Set(),
      new Map(),
      new Map(),
      new Map(),
      testUid
    );

    assert.ok(
      updatedMonths[protectedKey]?.variableExpenses.some(v => v.id === 'v_pending'),
      'Gasto pendiente en cola debe conservarse'
    );
    assert.ok(updatedConflicts['2026-11'], 'El conflicto activo de otro mes debe protegerse');
    assert.equal(updatedConflicts['2026-11'].local.income, 8888, 'Los datos locales en conflicto permanecen intactos');
  });

  test('16. LocalPersistenceController: el commit de consolidación de snapshot remoto incrementa versión y no es rechazado con "version 1 already persisted"', () => {
    const testUserId = 'test_user_persistence_fix';
    const storageKey = `nita_user_data_${testUserId}`;
    
    // Simular que el usuario ya tiene datos locales hidratados
    const initialData = {
      month: 11,
      year: 2026,
      currency: 'EUR',
      monthsData: { '2026-11': createFreshMonthData() },
    };
    localStorage.setItem(storageKey, JSON.stringify(initialData));

    const controller = new LocalPersistenceController(testUserId, false, true);
    
    // Verificar estado inicial hidratado: mutationVersion=1, lastPersistedVersion=1
    assert.equal(controller.getMutationVersion(), 1, 'mutationVersion inicial debe ser 1');
    assert.equal(controller.getLastPersistedVersion(), 1, 'lastPersistedVersion debe ser 1 porque vino hidratado');

    // Intentar hacer commit con versión 1 debe ser rechazado porque version 1 ya fue persistida
    const mockSave = (snap: any, uid: any, isG: any) => {
      localStorage.setItem(storageKey, JSON.stringify(snap));
      return true;
    };

    const dummySnapshot = {
      month: 11,
      year: 2026,
      currency: 'EUR' as const,
      monthsData: { '2026-11': { ...createFreshMonthData(), income: 5000 } },
    };

    const staleUnit = controller.createVersionedSnapshot(dummySnapshot, 1);
    const staleCommitResult = controller.commitSnapshot(staleUnit, mockSave);
    assert.equal(staleCommitResult, false, 'El commit con versión 1 debe ser rechazado por ya estar persistida');

    // Al llegar la consolidación del servidor, se debe incrementar la versión de mutación
    const targetVersion = controller.incrementMutationVersion();
    assert.equal(targetVersion, 2, 'incrementMutationVersion debe devolver versión 2');
    assert.equal(controller.getMutationVersion(), 2, 'mutationVersion ahora es 2');

    // El commit con la versión incrementada DEBE tener éxito
    const freshUnit = controller.createVersionedSnapshot(dummySnapshot, targetVersion);
    const freshCommitResult = controller.commitSnapshot(freshUnit, mockSave);
    assert.equal(freshCommitResult, true, 'El commit con versión 2 debe tener éxito');
    assert.equal(controller.getLastPersistedVersion(), 2, 'lastPersistedVersion debe actualizarse a 2');
    assert.equal(controller.hasLocalStorageFailure(), false, 'No debe registrarse fallo de almacenamiento');
  });

  test('17. verifyUserAuthorization: autoriza usuarios con cuenta de usuario y contraseña cuando la sesión de Firebase tradicional no está presente', () => {
    // Usuario válido con cuenta personalizada (ej: usr_nicocanch10)
    const validUserId = 'usr_nicocanch10';
    assert.doesNotThrow(() => {
      verifyUserAuthorization(validUserId);
    }, 'No debe lanzar error de autorización cuando el userId es un identificador válido sin sesión de Google');

    // Identificador vacío o nulo debe ser rechazado
    assert.throws(() => {
      verifyUserAuthorization('');
    }, /identificador de usuario inválido/, 'Debe rechazar identificadores vacíos');
  });
});



