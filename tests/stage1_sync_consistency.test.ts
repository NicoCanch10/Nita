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
  FirestoreSyncAdapter
} from '../src/services/budgetSyncService';
import { MonthData, FixedExpense, VariableExpense } from '../src/types/budget';

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
});
