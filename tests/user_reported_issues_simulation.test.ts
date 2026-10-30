import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Mock localStorage for Node test environment
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
  generateOpId,
  createFreshMonthData,
  saveBudgetState,
  loadBudgetState
} from '../src/utils/storage';
import { MonthData, FixedExpense, VariableExpense } from '../src/types/budget';
import { 
  fetchAndSyncUserData,
  processRemoteMonthsSnapshot,
  FirestoreSyncAdapter,
  areMonthDataEqual
} from '../src/services/budgetSyncService';

describe('Simulación de Casos Reportados por el Usuario (F5 Gastos Variables y Reversión isPaid)', () => {
  const userId = 'DQypCMwlYMczsZizFdvZILAHGaJ2';
  const monthKey = '2026-10';

  beforeEach(() => {
    (globalThis as any).localStorage.clear();
  });

  test('Simulación 1: Carga de Gastos Variables no desaparece al refrescar la página (F5)', async () => {
    // 1. Simulación del usuario cargando gastos variables en la sesión
    const initialMonth = createFreshMonthData();
    const varExpense1: VariableExpense = {
      id: 'v_super_123',
      date: '2026-10-29',
      description: 'Supermercado Coto',
      amount: 45000,
      category: 'comida'
    };
    const varExpense2: VariableExpense = {
      id: 'v_farmacia_456',
      date: '2026-10-29',
      description: 'Farmacia Farmacity',
      amount: 12000,
      category: 'salud'
    };

    const monthWithVariables: MonthData = {
      ...initialMonth,
      income: 500000,
      variableExpenses: [varExpense1, varExpense2]
    };

    // Guardado local antes del refresh
    saveBudgetState({
      month: 9,
      year: 2026,
      currency: 'ARS',
      monthsData: { [monthKey]: monthWithVariables }
    }, userId, false);

    // Encolado como cambio pendiente local
    const opId = generateOpId();
    enqueuePendingMonth(userId, monthKey, 2026, 9, monthWithVariables, opId);

    // 2. Simulación de F5 / Recarga de la página:
    // El usuario recarga la página. Firebase Auth aún tarda unos ms en responder,
    // pero el caché de usuario 'nita_cached_user' permite hidratar inmediatamente con userId.
    localStorage.setItem('nita_cached_user', JSON.stringify({ uid: userId, email: 'nicolaselchinotarzia@gmail.com' }));
    
    // Lectura en el frame 0 del reload
    const cachedUid = JSON.parse(localStorage.getItem('nita_cached_user')!).uid;
    const reloadedInitialState = loadBudgetState(cachedUid, false);

    assert.ok(reloadedInitialState.monthsData[monthKey], 'El mes debe existir tras la recarga');
    assert.equal(reloadedInitialState.monthsData[monthKey].variableExpenses.length, 2, 'Los gastos variables deben estar presentes en frame 0');

    // 3. Simulación de fetchAndSyncUserData tras la recarga cuando Firestore responde con estado anterior o vacío
    const staleRemoteData: MonthData = {
      ...initialMonth,
      income: 500000,
      variableExpenses: [] // El servidor aún no tenía los gastos variables recién agregados
    };

    const mockAdapter: FirestoreSyncAdapter = {
      fetchUserDoc: async () => ({ uid: userId, updatedAt: '2026-10-28T00:00:00.000Z' }),
      fetchMonths: async () => ({ [monthKey]: staleRemoteData }),
      fetchCategories: async () => [],
    };

    const syncResult = await fetchAndSyncUserData(userId, undefined, mockAdapter);

    // Verificación crítica: los gastos variables NO deben desaparecer ni volver a estar vacíos
    const syncedMonth = syncResult.months[monthKey];
    assert.ok(syncedMonth, 'El mes sincronizado debe existir');
    assert.equal(syncedMonth.variableExpenses.length, 2, 'Deben preservarse los 2 gastos variables');
    assert.equal(syncedMonth.variableExpenses[0].description, 'Supermercado Coto');
    assert.equal(syncedMonth.variableExpenses[0].amount, 45000);
    assert.equal(syncedMonth.variableExpenses[1].description, 'Farmacia Farmacity');
    assert.equal(syncedMonth.variableExpenses[1].amount, 12000);
  });

  test('Simulación 2: Gasto fijo marcado como pagado (isPaid: true) NO se revierte a los segundos por snapshot remoto', () => {
    // 1. Estado inicial del mes con un gasto fijo impago
    const fixedExpense: FixedExpense = {
      id: 'f_alquiler_789',
      name: 'Alquiler Depto',
      amount: 250000,
      category: 'vivienda',
      isPaid: false,
      dueDate: 10
    };

    const currentMonth: MonthData = {
      ...createFreshMonthData(),
      fixedExpenses: [{ ...fixedExpense, isPaid: true }] // Usuario local acaba de marcarlo como pagado
    };

    // 2. Registrar en modifiedFixedIds y en la cola de sincronización pendiente
    const modifiedFixedIds = new Map<string, number>();
    modifiedFixedIds.set(fixedExpense.id, Date.now());

    const pendingFixedIds = new Set<string>();
    const pendingExpenseIds = new Set<string>();
    const deletedFixedIds = new Map<string, number>();
    const deletedExpenseIds = new Map<string, number>();

    // El mes está en cola pendiente mientras viaja a Firestore
    enqueuePendingMonth(userId, monthKey, 2026, 9, currentMonth, generateOpId());

    // 3. Llega un snapshot remoto desde Firestore con isPaid: false (el servidor aún no procesó la escritura)
    const remoteMonthStale: MonthData = {
      ...createFreshMonthData(),
      fixedExpenses: [fixedExpense] // Remoto todavía tiene isPaid: false
    };

    const { updatedMonths } = processRemoteMonthsSnapshot(
      { [monthKey]: remoteMonthStale },
      { [monthKey]: currentMonth },
      {},
      pendingExpenseIds,
      pendingFixedIds,
      deletedExpenseIds,
      deletedFixedIds,
      modifiedFixedIds,
      userId
    );

    // 4. Verificación crítica: isPaid DEBE mantenerse en true
    const fixedResult = updatedMonths[monthKey].fixedExpenses.find(f => f.id === fixedExpense.id);
    assert.ok(fixedResult, 'El gasto fijo debe existir en el resultado reconciliado');
    assert.equal(fixedResult.isPaid, true, 'isPaid debe permanecer en TRUE y NO revertirse a false por el snapshot remoto');
  });

  test('Simulación 3: Gasto fijo marcado como pagado persiste tras recarga de página (F5) con cola pendiente', async () => {
    // 1. El usuario tiene un gasto fijo guardado localmente como pagado
    const fixedPaid: FixedExpense = {
      id: 'f_expensas_101',
      name: 'Expensas',
      amount: 60000,
      category: 'vivienda',
      isPaid: true
    };

    const localMonth: MonthData = {
      ...createFreshMonthData(),
      fixedExpenses: [fixedPaid]
    };

    saveBudgetState({
      month: 9,
      year: 2026,
      currency: 'ARS',
      monthsData: { [monthKey]: localMonth }
    }, userId, false);

    // Encolado pendiente
    enqueuePendingMonth(userId, monthKey, 2026, 9, localMonth, generateOpId());

    // 2. Simular recarga y sincronización inicial con snapshot remoto donde isPaid aún figura en false
    const remoteStaleMonth: MonthData = {
      ...createFreshMonthData(),
      fixedExpenses: [{ ...fixedPaid, isPaid: false }]
    };

    const mockAdapter: FirestoreSyncAdapter = {
      fetchUserDoc: async () => ({ uid: userId, updatedAt: '2026-10-28T00:00:00.000Z' }),
      fetchMonths: async () => ({ [monthKey]: remoteStaleMonth }),
      fetchCategories: async () => [],
    };

    const syncResult = await fetchAndSyncUserData(userId, undefined, mockAdapter);

    // 3. El resultado debe preservar isPaid: true del cambio pendiente local
    const finalFixed = syncResult.months[monthKey].fixedExpenses.find(f => f.id === fixedPaid.id);
    assert.ok(finalFixed, 'El gasto fijo debe existir');
    assert.equal(finalFixed.isPaid, true, 'El gasto fijo debe permanecer con isPaid: true tras el refresh');
  });

  test('Simulación 4: Sincronización multi-dispositivo bidireccional sin pérdida de datos', () => {
    // Dispositivo A tiene: gasto variable local recién cargado y gasto fijo pagado
    const localDataA: MonthData = {
      ...createFreshMonthData(),
      fixedExpenses: [
        { id: 'f_luz', name: 'Luz Edenor', amount: 35000, category: 'servicios', isPaid: true }
      ],
      variableExpenses: [
        { id: 'v_almuerzo', date: '2026-10-30', description: 'Almuerzo laboral', amount: 8500, category: 'comida' }
      ]
    };

    // Dispositivo B agregó simultáneamente otro gasto fijo y otro gasto variable en la nube
    const remoteDataB: MonthData = {
      ...createFreshMonthData(),
      fixedExpenses: [
        { id: 'f_luz', name: 'Luz Edenor', amount: 35000, category: 'servicios', isPaid: false }, // En B aún no vio el pago de A
        { id: 'f_gym', name: 'Gimnasio', amount: 20000, category: 'salud', isPaid: false } // Agregado en B
      ],
      variableExpenses: [
        { id: 'v_combustible', date: '2026-10-30', description: 'YPF Nafta', amount: 30000, category: 'transporte' } // Agregado en B
      ]
    };

    // Dispositivo A tiene el mes encolado mientras sube sus cambios
    enqueuePendingMonth(userId, monthKey, 2026, 9, localDataA, generateOpId());

    const modifiedFixedIds = new Map<string, number>();
    modifiedFixedIds.set('f_luz', Date.now());

    const { updatedMonths } = processRemoteMonthsSnapshot(
      { [monthKey]: remoteDataB },
      { [monthKey]: localDataA },
      {},
      new Set(),
      new Set(),
      new Map(),
      new Map(),
      modifiedFixedIds,
      userId
    );

    const merged = updatedMonths[monthKey];
    assert.ok(merged, 'El mes reconciliado debe existir');

    // 1. Gasto fijo f_luz debe mantener isPaid: true de A
    const luz = merged.fixedExpenses.find(f => f.id === 'f_luz');
    assert.ok(luz);
    assert.equal(luz.isPaid, true, 'f_luz debe tener isPaid: true');

    // 2. Gasto fijo f_gym de B debe incorporarse
    const gym = merged.fixedExpenses.find(f => f.id === 'f_gym');
    assert.ok(gym, 'f_gym de dispositivo B debe haberse incorporado');
    assert.equal(gym.amount, 20000);

    // 3. Gasto variable v_almuerzo de A debe permanecer
    const almuerzo = merged.variableExpenses.find(v => v.id === 'v_almuerzo');
    assert.ok(almuerzo, 'v_almuerzo de A debe permanecer');

    // 4. Gasto variable v_combustible de B debe haberse incorporado
    const nafta = merged.variableExpenses.find(v => v.id === 'v_combustible');
    assert.ok(nafta, 'v_combustible de B debe haberse incorporado');

    assert.equal(merged.fixedExpenses.length, 2, 'Deben existir 2 gastos fijos');
    assert.equal(merged.variableExpenses.length, 2, 'Deben existir 2 gastos variables');
  });
});
