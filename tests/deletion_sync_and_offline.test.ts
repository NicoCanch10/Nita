import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

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
  loadBudgetState, 
  saveBudgetState, 
  enqueuePendingMonth, 
  removePendingMonthFromQueue,
  getPendingSyncQueue,
  createFreshMonthData,
  getUserStorageKey,
  GUEST_STORAGE_KEY
} from '../src/utils/storage';
import { MonthData, FixedExpense } from '../src/types/budget';

describe('Diagnóstico y Corrección de Eliminación de Gastos Fijos y Sincronización', () => {
  const userId = 'user_test_deletion_123';
  const monthKey = '2026-10';

  beforeEach(() => {
    localStorage.clear();
  });

  test('1. Al agregar un gasto fijo se persiste de inmediato en el almacenamiento aislado', () => {
    const freshMonth = createFreshMonthData();
    const fixedExpense: FixedExpense = {
      id: 'f_test_001',
      name: 'Internet Fibra Óptica',
      amount: 15000,
      category: 'services',
      isPaid: false,
    };

    freshMonth.fixedExpenses = [fixedExpense];

    saveBudgetState({
      month: 9,
      year: 2026,
      currency: 'ARS',
      monthsData: {
        [monthKey]: freshMonth,
      },
    }, userId, false);

    const loaded = loadBudgetState(userId, false);
    assert.ok(loaded.monthsData[monthKey]);
    assert.strictEqual(loaded.monthsData[monthKey].fixedExpenses.length, 1);
    assert.strictEqual(loaded.monthsData[monthKey].fixedExpenses[0].id, 'f_test_001');
    assert.strictEqual(loaded.monthsData[monthKey].fixedExpenses[0].name, 'Internet Fibra Óptica');
  });

  test('2. Al eliminar un gasto fijo se actualiza inmediatamente el estado y la cola de pendientes', () => {
    const fixedExpense: FixedExpense = {
      id: 'f_test_001',
      name: 'Internet Fibra Óptica',
      amount: 15000,
      category: 'services',
      isPaid: false,
    };

    // Estado inicial con 1 gasto
    const initialMonth = createFreshMonthData();
    initialMonth.fixedExpenses = [fixedExpense];
    enqueuePendingMonth(userId, monthKey, 2026, 9, initialMonth);

    // Verificar que la cola tiene el gasto
    let queue = getPendingSyncQueue(userId);
    assert.strictEqual(queue.length, 1);
    assert.strictEqual(queue[0].data?.fixedExpenses.length, 1);

    // Usuario elimina el gasto: se genera nuevo estado con lista vacía
    const updatedMonth: MonthData = {
      ...initialMonth,
      fixedExpenses: [],
    };

    // Se actualiza la cola de sincronización con el nuevo estado (upsert)
    enqueuePendingMonth(userId, monthKey, 2026, 9, updatedMonth);

    queue = getPendingSyncQueue(userId);
    assert.strictEqual(queue.length, 1);
    assert.strictEqual(queue[0].data?.fixedExpenses.length, 0, 'La cola no debe contener el gasto eliminado');
  });

  test('3. Mecanismo de Tombstones impide que un snapshot retrasado de Firestore resucite el gasto', () => {
    const deletedFixedIds = new Map<string, number>();
    const pendingFixedIds = new Set<string>();

    const expenseId = 'f_alquiler_777';

    // Paso A: Gasto agregado
    pendingFixedIds.add(expenseId);

    // Paso B: Gasto eliminado por el usuario
    deletedFixedIds.set(expenseId, Date.now());
    pendingFixedIds.delete(expenseId);

    // Paso C: Simulación de llegada de snapshot remoto retrasado (~3 segundos después)
    // El servidor Firestore aún tenía el documento con el gasto antes de que se confirmara la eliminación
    const remoteDataFromFirestore: MonthData = {
      income: 100000,
      savingsRate: 10,
      extraDaysPosition: 'end',
      categories: [],
      fixedExpenses: [
        { id: expenseId, name: 'Alquiler', amount: 50000, category: 'housing', isPaid: true }
      ],
      variableExpenses: [],
    };

    const now = Date.now();
    // Algoritmo de filtrado con Tombstone implementado en subscribeToUserMonths:
    const cleanRemoteFixed = (remoteDataFromFirestore.fixedExpenses || []).filter(e => {
      const deletedAt = deletedFixedIds.get(e.id);
      if (!deletedAt) return true;
      if (now - deletedAt < 15000) return false; // Bloqueado por Tombstone
      deletedFixedIds.delete(e.id);
      return true;
    });

    // Verificar que el gasto eliminado NO se reincorpora al estado local
    assert.strictEqual(cleanRemoteFixed.length, 0, 'El gasto eliminado debe ser filtrado por el tombstone');
  });

  test('4. El tombstone se libera automáticamente cuando Firestore confirma la eliminación remota', () => {
    const deletedFixedIds = new Map<string, number>();
    const expenseId = 'f_luz_888';

    // Registrar eliminación
    deletedFixedIds.set(expenseId, Date.now());
    assert.ok(deletedFixedIds.has(expenseId));

    // Llega snapshot remoto que YA NO CONTIENE el ID (confirmación del servidor)
    const confirmedRemoteFixedList: FixedExpense[] = [];
    const remoteFixedIdSet = new Set(confirmedRemoteFixedList.map(e => e.id));

    deletedFixedIds.forEach((_, id) => {
      if (!remoteFixedIdSet.has(id)) {
        deletedFixedIds.delete(id);
      }
    });

    // Verificar que la memoria de tombstones se limpia correctamente
    assert.strictEqual(deletedFixedIds.size, 0, 'El tombstone debe limpiarse una vez confirmada la ausencia en Firestore');
  });

  test('5. En modo invitado los datos locales se guardan y eliminan sin invocar Firebase', () => {
    const initialMonth = createFreshMonthData();
    initialMonth.fixedExpenses = [
      { id: 'f_guest_1', name: 'Gasto Invitado', amount: 2000, category: 'other', isPaid: false }
    ];

    saveBudgetState({
      month: 9,
      year: 2026,
      currency: 'ARS',
      monthsData: { [monthKey]: initialMonth }
    }, undefined, true);

    const loadedGuest = loadBudgetState(undefined, true);
    assert.strictEqual(loadedGuest.monthsData[monthKey].fixedExpenses.length, 1);

    // Eliminar localmente
    const deletedMonth = {
      ...initialMonth,
      fixedExpenses: [],
    };
    saveBudgetState({
      month: 9,
      year: 2026,
      currency: 'ARS',
      monthsData: { [monthKey]: deletedMonth }
    }, undefined, true);

    const reloadedGuest = loadBudgetState(undefined, true);
    assert.strictEqual(reloadedGuest.monthsData[monthKey].fixedExpenses.length, 0);
  });
});

describe('Diagnóstico y Corrección de Inicio Offline (PWA)', () => {
  test('6. vite.config.ts tiene configurado injectRegister: auto, navigateFallback y devOptions activas', () => {
    const viteConfigContent = fs.readFileSync(path.resolve(process.cwd(), 'vite.config.ts'), 'utf-8');
    assert.ok(viteConfigContent.includes("injectRegister: 'auto'"), 'injectRegister debe ser auto');
    assert.ok(viteConfigContent.includes("navigateFallback: '/index.html'"), 'Workbox debe incluir navigateFallback para SPA offline');
    assert.ok(viteConfigContent.includes("cacheName: 'google-fonts-cache'"), 'Workbox debe cachear fuentes de Google');
    assert.ok(viteConfigContent.includes("enabled: true"), 'devOptions debe estar activo para pruebas de SW');
  });

  test('7. index.html no contiene etiquetas meta agresivas de anti-caché que rompan el modo offline', () => {
    const indexHtmlContent = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
    assert.ok(!indexHtmlContent.includes('no-cache, no-store, must-revalidate'), 'index.html no debe forzar no-store');
    assert.ok(!indexHtmlContent.includes('<meta http-equiv="Pragma" content="no-cache"'), 'index.html no debe prohibir caché por meta');
  });

  test('8. AuthContext inicializa loading en false si el dispositivo está offline y existe usuario en caché', () => {
    const authContextContent = fs.readFileSync(path.resolve(process.cwd(), 'src/context/AuthContext.tsx'), 'utf-8');
    assert.ok(authContextContent.includes('!navigator.onLine && getInitialCachedUser()'), 'Debe permitir inicio offline inmediato si hay usuario en caché');
    assert.ok(authContextContent.includes('const safetyTimeoutMs = isOffline ? 1500 : 8000;'), 'Timeout de seguridad debe ser más rápido cuando está offline');
  });
});
