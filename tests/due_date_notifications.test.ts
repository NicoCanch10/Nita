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
  getExpenseNotifications, 
  DueDateAlertSettings, 
  DEFAULT_ALERT_SETTINGS 
} from '../src/utils/notifications';
import { FixedExpense } from '../src/types/budget';

describe('NITA — Notificaciones de vencimientos entre meses (Octubre vs Noviembre)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const settings: DueDateAlertSettings = {
    enabled: true,
    daysInAdvance: 3,
  };

  test('1. Cuando hoy es 28 de Octubre y el vencimiento es el 28 de Noviembre, no debe marcarse como "Vence hoy" sino a 31 días', () => {
    // Hoy en la realidad: 28 de Octubre de 2026 (mes 9 en 0-indexed)
    const mockToday = new Date(2026, 9, 28, 10, 0, 0);

    // Gasto configurado para el mes de Noviembre (mes 10 en 0-indexed) con vencimiento el día 28
    const expenses: FixedExpense[] = [
      {
        id: 'f_nov_28',
        name: 'Alquiler Noviembre',
        amount: 50000,
        category: 'housing',
        dueDate: 28,
        isPaid: false,
      },
    ];

    const notifications = getExpenseNotifications(
      expenses,
      null,
      settings,
      'es',
      2026,
      10, // Noviembre
      mockToday
    );

    // Con días de anticipación = 3, un vencimiento a 31 días NO debe disparar notificación preventiva ni falsa alarma de "vence hoy"
    assert.equal(notifications.length, 0, 'No debe disparar notificación 31 días antes');

    // Con anticipación máxima permitida (30 días), un vencimiento el 25 de Noviembre (a 28 días):
    const maxSettings: DueDateAlertSettings = { enabled: true, daysInAdvance: 30 };
    const maxNotifs = getExpenseNotifications(
      [
        {
          id: 'f_nov_25',
          name: 'Alquiler Noviembre',
          amount: 50000,
          category: 'housing',
          dueDate: 25,
          isPaid: false,
        },
      ],
      null,
      maxSettings,
      'es',
      2026,
      10,
      mockToday
    );

    assert.equal(maxNotifs.length, 1);
    assert.equal(maxNotifs[0].daysLeft, 28, 'Debe calcular exactamente 28 días de diferencia entre 28 de Octubre y 25 de Noviembre');
    assert.equal(maxNotifs[0].type, 'upcoming');
  });

  test('2. Cuando hoy es 28 de Octubre y el gasto vence el 5 de Noviembre, faltan 8 días (no debe marcarse como vencido hace 23 días)', () => {
    const mockToday = new Date(2026, 9, 28, 12, 0, 0);

    const expenses: FixedExpense[] = [
      {
        id: 'f_nov_5',
        name: 'Internet Noviembre',
        amount: 8000,
        category: 'services',
        dueDate: 5,
        isPaid: false,
      },
    ];

    const notifications = getExpenseNotifications(
      expenses,
      null,
      settings,
      'es',
      2026,
      10, // Noviembre
      mockToday
    );

    // 28 de Octubre a 5 de Noviembre = 3 días restantes de octubre (29, 30, 31) + 5 días de noviembre = 8 días
    // Con daysInAdvance = 3, no debe sonar aún
    assert.equal(notifications.length, 0, 'No debe notificar 8 días antes con ventana de 3 días');

    // Con anticipación = 10 días:
    const advance10Settings: DueDateAlertSettings = { enabled: true, daysInAdvance: 10 };
    const notifs10 = getExpenseNotifications(
      expenses,
      null,
      advance10Settings,
      'es',
      2026,
      10,
      mockToday
    );
    assert.equal(notifs10.length, 1);
    assert.equal(notifs10[0].daysLeft, 8, 'Debe indicar exactamente 8 días restantes');
    assert.equal(notifs10[0].type, 'upcoming');
    assert.equal(notifs10[0].message, 'Vence en 8 días');
  });

  test('3. Evolución en el tiempo: el gasto del 5 de Noviembre notifica en los días correspondientes de Noviembre', () => {
    const expenses: FixedExpense[] = [
      {
        id: 'f_nov_5',
        name: 'Gimnasio Noviembre',
        amount: 6000,
        category: 'health',
        dueDate: 5,
        isPaid: false,
      },
    ];

    // Escenario A: 2 de Noviembre (faltan 3 días) -> Notificación 'in_3_days'
    const todayNov2 = new Date(2026, 10, 2, 9, 0, 0);
    const notifsNov2 = getExpenseNotifications(expenses, null, settings, 'es', 2026, 10, todayNov2);
    assert.equal(notifsNov2.length, 1);
    assert.equal(notifsNov2[0].daysLeft, 3);
    assert.equal(notifsNov2[0].type, 'in_3_days');
    assert.equal(notifsNov2[0].message, 'Vence en 3 días');

    // Escenario B: 4 de Noviembre (falta 1 día) -> 'Vence mañana'
    const todayNov4 = new Date(2026, 10, 4, 9, 0, 0);
    const notifsNov4 = getExpenseNotifications(expenses, null, settings, 'es', 2026, 10, todayNov4);
    assert.equal(notifsNov4.length, 1);
    assert.equal(notifsNov4[0].daysLeft, 1);
    assert.equal(notifsNov4[0].message, 'Vence mañana');

    // Escenario C: 5 de Noviembre -> '¡Vence hoy!'
    const todayNov5 = new Date(2026, 10, 5, 9, 0, 0);
    const notifsNov5 = getExpenseNotifications(expenses, null, settings, 'es', 2026, 10, todayNov5);
    assert.equal(notifsNov5.length, 1);
    assert.equal(notifsNov5[0].daysLeft, 0);
    assert.equal(notifsNov5[0].type, 'today');
    assert.equal(notifsNov5[0].message, '¡Vence hoy!');

    // Escenario D: 6 de Noviembre -> 'overdue'
    const todayNov6 = new Date(2026, 10, 6, 9, 0, 0);
    const notifsNov6 = getExpenseNotifications(expenses, null, settings, 'es', 2026, 10, todayNov6);
    assert.equal(notifsNov6.length, 1);
    assert.equal(notifsNov6[0].daysLeft, -1);
    assert.equal(notifsNov6[0].type, 'overdue');
    assert.equal(notifsNov6[0].message, 'Vencido hace 1 día(s)');
  });

  test('4. Vencimiento el 1 de Noviembre estando en 28 de Octubre: faltan exactamente 4 días', () => {
    const mockToday = new Date(2026, 9, 28, 8, 0, 0);

    const expenses: FixedExpense[] = [
      {
        id: 'f_nov_1',
        name: 'Seguro Auto',
        amount: 15000,
        category: 'transport',
        dueDate: 1,
        isPaid: false,
      },
    ];

    // Con ventana de 5 días:
    const settings5: DueDateAlertSettings = { enabled: true, daysInAdvance: 5 };
    const notifs = getExpenseNotifications(expenses, null, settings5, 'es', 2026, 10, mockToday);

    assert.equal(notifs.length, 1);
    assert.equal(notifs[0].daysLeft, 4, 'Desde 28 de Octubre al 1 de Noviembre hay 4 días (29, 30, 31, 1)');
    assert.equal(notifs[0].message, 'Vence en 4 días');
  });

  test('5. Compatibilidad retroactiva: si no se provee year ni month, utiliza el mes en curso', () => {
    const expenses: FixedExpense[] = [
      {
        id: 'f_legacy',
        name: 'Gasto Legacy',
        amount: 2000,
        category: 'other',
        dueDate: 15,
        isPaid: false,
      },
    ];

    // Si se pasa referenceDay = 15:
    const notifs = getExpenseNotifications(expenses, 15, settings, 'es');
    assert.equal(notifs.length, 1);
    assert.equal(notifs[0].daysLeft, 0);
    assert.equal(notifs[0].type, 'today');
  });
});
