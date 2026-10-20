import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// In-memory mock for localStorage in Node test environment
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

if (typeof globalThis.localStorage === 'undefined') {
  (globalThis as any).localStorage = new MockLocalStorage();
}

import {
  loadBudgetState,
  saveBudgetState,
  loadGlobalCategories,
  saveGlobalCategories,
  LEGACY_STORAGE_KEY,
  LEGACY_CATEGORIES_STORAGE_KEY,
  GUEST_STORAGE_KEY,
  getUserStorageKey,
  getUserCategoriesKey,
  checkHasLegacyUnassignedData,
  exportLegacyDataBackup,
  explicitlyMigrateLegacyDataToUser,
  getInitialBudgetState
} from '../src/utils/storage';
import { getMonthKey, BudgetState } from '../src/types/budget';

describe('Seguridad NITA - Aislamiento de datos y protección de sesiones', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('1. Una cuenta A no puede leer los datos locales de una cuenta B', () => {
    const userA_uid = 'firebase_user_A';
    const userB_uid = 'firebase_user_B';

    const stateA: BudgetState = {
      month: 5,
      year: 2026,
      currency: 'USD',
      monthsData: {
        '2026-06': {
          income: 500000,
          savingsRate: 20,
          extraDaysPosition: 'end',
          categories: [{ id: 'catA', label: 'Inversiones Privadas A', color: '#10b981' }],
          fixedExpenses: [{ id: 'f1', name: 'Alquiler A', amount: 150000, category: 'catA', isPaid: true }],
          variableExpenses: [{ id: 'v1', date: '2026-06-01', description: 'Gasto Secreto A', amount: 25000, category: 'catA' }],
        }
      }
    };

    // User A guarda sus datos financieros
    saveBudgetState(stateA, userA_uid, false);

    // User B entra a la aplicación
    const stateB = loadBudgetState(userB_uid, false);

    // User B debe tener un estado limpio/inicial de su propia identidad y NUNCA los datos de A
    const currentOngoingKey = getMonthKey(new Date().getFullYear(), new Date().getMonth());
    assert.notDeepEqual(stateB.monthsData, stateA.monthsData, 'Cuenta B no debe tener los meses de Cuenta A');
    assert.equal(stateB.currency, 'ARS', 'Cuenta B debe iniciar en su moneda por defecto o propia');
    assert.equal(Boolean(stateB.monthsData['2026-06']), false, 'Cuenta B no debe ver el mes 2026-06 de Cuenta A');
    assert.equal(
      localStorage.getItem(getUserStorageKey(userB_uid)) !== localStorage.getItem(getUserStorageKey(userA_uid)),
      true,
      'Los archivos de almacenamiento físico en localStorage deben estar estrictamente separados por uid'
    );
  });

  test('2. Cerrar sesión impide que el modo invitado vea los datos de la cuenta anterior', () => {
    const userA_uid = 'firebase_user_A';

    const stateA: BudgetState = {
      month: 9,
      year: 2026,
      currency: 'USD',
      monthsData: {
        '2025-08': {
          income: 750000,
          savingsRate: 15,
          extraDaysPosition: 'end',
          categories: [{ id: 'catA', label: 'Sueldo Alto', color: '#6366f1' }],
          fixedExpenses: [{ id: 'fA', name: 'Hipoteca', amount: 200000, category: 'catA', isPaid: true }],
          variableExpenses: [],
        }
      }
    };

    saveBudgetState(stateA, userA_uid, false);

    // Se simula cierre de sesión: la identidad pasa a Modo Invitado (isGuest = true, userId = null)
    const guestState = loadBudgetState(null, true);

    // El modo invitado no debe heredar el mes 2025-08 ni los gastos del usuario autenticado
    assert.equal(Boolean(guestState.monthsData['2025-08']), false, 'El modo invitado no debe contener 2025-08 del usuario');
    const guestActiveMonth = guestState.monthsData[getMonthKey(new Date().getFullYear(), new Date().getMonth())];
    assert.equal(guestActiveMonth?.income || 0, 0, 'El modo invitado debe comenzar con ingresos en 0');
    assert.equal(guestActiveMonth?.fixedExpenses.length || 0, 0, 'El modo invitado debe comenzar sin gastos fijos del usuario');
  });

  test('3. Una cuenta nueva no importa datos locales genéricos automáticamente', () => {
    // Simulamos que el dispositivo tiene datos existentes en la clave legacy
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({
      currency: 'EUR',
      monthsData: {
        '2026-01': {
          income: 999999,
          fixedExpenses: [{ id: 'legacy_fix', name: 'Legacy Expense', amount: 50000, category: 'other' }]
        }
      }
    }));

    // Nueva cuenta inicia sesión
    const newUserId = 'firebase_brand_new_user';
    const loadedState = loadBudgetState(newUserId, false);

    // Debe comenzar vacía / por defecto
    assert.equal(Boolean(loadedState.monthsData['2026-01']), false, 'Una nueva cuenta no debe importar datos de la clave legacy');
    assert.equal(loadedState.currency, 'ARS', 'Una nueva cuenta no hereda la moneda EUR del legacy');
  });

  test('4. Un error de conexión no provoca que se muestren datos de otra cuenta', () => {
    const userA_uid = 'account_A';
    const userB_uid = 'account_B';

    // Account A guardó datos en su dispositivo
    saveBudgetState({
      month: 1,
      year: 2026,
      currency: 'USD',
      monthsData: {
        '2026-02': { income: 333333, savingsRate: 10, extraDaysPosition: 'end', categories: [], fixedExpenses: [], variableExpenses: [] }
      }
    }, userA_uid, false);

    // Account B entra estando offline (o con error de conexión en Firestore)
    // El cargador local para account B debe cargar SOLO lo que pertenezca a account B
    const offlineStateB = loadBudgetState(userB_uid, false);

    assert.equal(Boolean(offlineStateB.monthsData['2026-02']), false, 'Account B offline no puede ver meses de Account A');
    assert.notEqual(offlineStateB.monthsData['2026-02']?.income, 333333, 'Account B offline no puede ver ingresos de Account A');
  });

  test('5. Los datos guardados de cada cuenta siguen disponibles al volver a iniciar sesión con ella', () => {
    const userA_uid = 'persistent_account_A';

    const testMonthKey = getMonthKey(new Date().getFullYear(), new Date().getMonth());
    const originalState: BudgetState = {
      month: new Date().getMonth(),
      year: new Date().getFullYear(),
      currency: 'USD',
      monthsData: {
        [testMonthKey]: {
          income: 420000,
          savingsRate: 25,
          extraDaysPosition: 'end',
          categories: [{ id: 'catPersist', label: 'Ahorro', color: '#10b981' }],
          fixedExpenses: [{ id: 'fPersist', name: 'Gasto Legítimo A', amount: 80000, category: 'catPersist', isPaid: false }],
          variableExpenses: [],
        }
      }
    };

    // Guardar para cuenta A
    saveBudgetState(originalState, userA_uid, false);

    // Simular que otra cuenta B entra
    const userB_uid = 'persistent_account_B';
    const stateB = loadBudgetState(userB_uid, false);
    assert.notEqual(stateB.monthsData[testMonthKey]?.income, 420000);

    // Cuenta A vuelve a iniciar sesión
    const restoredStateA = loadBudgetState(userA_uid, false);
    assert.equal(restoredStateA.monthsData[testMonthKey]?.income, 420000, 'Ingreso original de A debe recuperarse');
    assert.equal(restoredStateA.monthsData[testMonthKey]?.fixedExpenses[0]?.name, 'Gasto Legítimo A', 'Gasto de A debe recuperarse intacto');
  });

  test('6. Las claves antiguas permanecen intactas y no se migran automáticamente', () => {
    const legacyAppContent = JSON.stringify({ legacy: true, data: 'Datos importantes v4' });
    const legacyCatsContent = JSON.stringify([{ id: 'leg_cat', label: 'Cat Antigua', color: '#ff0000' }]);

    localStorage.setItem(LEGACY_STORAGE_KEY, legacyAppContent);
    localStorage.setItem(LEGACY_CATEGORIES_STORAGE_KEY, legacyCatsContent);

    // Usuario inicia sesión
    const userLoggedIn = 'user_login_test';
    loadBudgetState(userLoggedIn, false);
    loadGlobalCategories(userLoggedIn, false);

    // Verificar que las claves legacy NO fueron modificadas ni borradas
    assert.equal(localStorage.getItem(LEGACY_STORAGE_KEY), legacyAppContent, 'LEGACY_STORAGE_KEY debe estar intacto');
    assert.equal(localStorage.getItem(LEGACY_CATEGORIES_STORAGE_KEY), legacyCatsContent, 'LEGACY_CATEGORIES_STORAGE_KEY debe estar intacto');

    // Verificar que la función de verificación detecta la presencia legacy sin tocarla
    assert.equal(checkHasLegacyUnassignedData(), true, 'Debe detectar datos antiguos no asignados');
    const backup = exportLegacyDataBackup();
    assert.equal(backup.appData, legacyAppContent, 'El backup debe coincidir');

    // La clave del usuario NO debe contener automáticamente los datos legacy
    const userStorage = localStorage.getItem(getUserStorageKey(userLoggedIn));
    assert.notEqual(userStorage, legacyAppContent, 'No debe haber migración automática a la cuenta');
  });
});
