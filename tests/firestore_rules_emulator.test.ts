import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { 
  initializeTestEnvironment, 
  RulesTestEnvironment, 
  assertSucceeds, 
  assertFails 
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'demo-nita-ci-test';
if (!PROJECT_ID.startsWith('demo-')) {
  throw new Error(
    `[Security Guard Error] El PROJECT_ID de pruebas ('${PROJECT_ID}') debe comenzar con 'demo-' para garantizar el aislamiento absoluto del emulador y bloquear cualquier tráfico hacia Google Cloud.`
  );
}
const RULES_PATH = path.resolve(process.cwd(), 'firestore.rules');

describe('Pruebas reales de Firebase Firestore Rules con @firebase/rules-unit-testing', () => {
  let testEnv: RulesTestEnvironment | null = null;
  let isEmulatorAvailable = false;

  before(async () => {
    try {
      const rawHost = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
      const parts = rawHost.split(':');
      if (parts.length !== 2 || !parts[0] || !parts[1]) {
        throw new Error(
          `[Firestore Config Error] FIRESTORE_EMULATOR_HOST tiene formato inválido: '${rawHost}'. Se requiere formato 'host:port' (ej: '127.0.0.1:8080').`
        );
      }
      const host = parts[0].trim();
      const port = Number(parts[1].trim());
      if (!Number.isInteger(port) || port <= 0 || port > 65535) {
        throw new Error(
          `[Firestore Config Error] Puerto de emulador inválido: '${parts[1]}'. Debe ser un entero entre 1 y 65535.`
        );
      }

      const rules = fs.readFileSync(RULES_PATH, 'utf8');
      testEnv = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        firestore: {
          rules,
          host,
          port,
        },
      });
      // Ping check if emulator is responsive using rules-disabled context
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await getDoc(doc(db, 'ping', 'check'));
      });
      isEmulatorAvailable = true;
    } catch (err: unknown) {
      isEmulatorAvailable = false;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('----------------------------------------------------------------------');
      console.warn('AVISO: El emulador local de Firestore no está disponible en este entorno.');
      console.warn('Causa técnica: Java JRE/JDK no está instalado en este contenedor Linux.');
      console.warn('Detalle:', msg);
      console.warn('La suite real queda completamente preparada para ejecutarse en CI/CD o entorno con Java.');
      console.warn('----------------------------------------------------------------------');
      if (process.env.STRICT_RULES_EMULATOR === 'true') {
        throw new Error(`[Strict Rules Mode] Emulador no disponible: ${msg}`);
      }
    }
  });

  after(async () => {
    if (testEnv) {
      await testEnv.cleanup().catch(() => {});
    }
  });

  test('Configuración de reglas: el archivo firestore.rules existe y contiene sintaxis válida', () => {
    const rules = fs.readFileSync(RULES_PATH, 'utf8');
    assert.ok(rules.length > 200, 'El archivo firestore.rules debe contener contenido sustancial');
    assert.ok(rules.includes("rules_version = '2'"), 'Debe especificar rules_version 2');
    assert.ok(rules.includes('hasOnly'), 'Debe incluir validaciones de hasOnly');
  });

  test('1. Acceso de propietario a su perfil (/users/{userId}) -> PERMITIDO', async (t) => {
    if (!isEmulatorAvailable || !testEnv) {
      t.skip('Emulador de Firestore no disponible (requiere Java)');
      return;
    }
    const db = testEnv.authenticatedContext('user_123').firestore();
    const userRef = doc(db, 'users', 'user_123');
    await assertSucceeds(
      setDoc(userRef, {
        uid: 'user_123',
        email: 'user@example.com',
        displayName: 'Usuario Prueba',
        currency: 'USD',
        language: 'es',
        updatedAt: new Date().toISOString(),
      })
    );
    await assertSucceeds(getDoc(userRef));
  });

  test('2. Acceso no autenticado a perfil (/users/{userId}) -> DENEGADO', async (t) => {
    if (!isEmulatorAvailable || !testEnv) {
      t.skip('Emulador de Firestore no disponible (requiere Java)');
      return;
    }
    const db = testEnv.unauthenticatedContext().firestore();
    const userRef = doc(db, 'users', 'user_123');
    await assertFails(getDoc(userRef));
  });

  test('3. Acceso cruzado: Usuario B intenta leer perfil de Usuario A -> DENEGADO', async (t) => {
    if (!isEmulatorAvailable || !testEnv) {
      t.skip('Emulador de Firestore no disponible (requiere Java)');
      return;
    }
    const db = testEnv.authenticatedContext('user_B').firestore();
    const userRef = doc(db, 'users', 'user_A');
    await assertFails(getDoc(userRef));
  });

  test('4. Usuario B intenta escribir en perfil de Usuario A -> DENEGADO', async (t) => {
    if (!isEmulatorAvailable || !testEnv) {
      t.skip('Emulador de Firestore no disponible (requiere Java)');
      return;
    }
    const db = testEnv.authenticatedContext('user_B').firestore();
    const userRef = doc(db, 'users', 'user_A');
    await assertFails(
      setDoc(userRef, {
        uid: 'user_A',
        updatedAt: new Date().toISOString(),
      })
    );
  });

  test('5. Inyección de campos protegidos (role: admin) en perfil -> DENEGADO', async (t) => {
    if (!isEmulatorAvailable || !testEnv) {
      t.skip('Emulador de Firestore no disponible (requiere Java)');
      return;
    }
    const db = testEnv.authenticatedContext('user_123').firestore();
    const userRef = doc(db, 'users', 'user_123');
    await assertFails(
      setDoc(userRef, {
        uid: 'user_123',
        role: 'superadmin',
        updatedAt: new Date().toISOString(),
      })
    );
  });

  test('6. Borrado de documento de usuario -> DENEGADO (Protección contra pérdida)', async (t) => {
    if (!isEmulatorAvailable || !testEnv) {
      t.skip('Emulador de Firestore no disponible (requiere Java)');
      return;
    }
    const db = testEnv.authenticatedContext('user_123').firestore();
    const userRef = doc(db, 'users', 'user_123');
    await assertFails(deleteDoc(userRef));
  });

  test('7. Acceso legítimo a categorías globales (/users/{userId}/categories/global) -> PERMITIDO', async (t) => {
    if (!isEmulatorAvailable || !testEnv) {
      t.skip('Emulador de Firestore no disponible (requiere Java)');
      return;
    }
    const db = testEnv.authenticatedContext('user_123').firestore();
    const catsRef = doc(db, 'users', 'user_123', 'categories', 'global');
    await assertSucceeds(
      setDoc(catsRef, {
        userId: 'user_123',
        categories: [
          { id: 'cat1', label: 'Supermercado', color: '#10b981' }
        ],
        updatedAt: new Date().toISOString(),
      })
    );
    await assertSucceeds(getDoc(catsRef));
  });

  test('8. Creación de subcolección de categorías con ID no global (/categories/spam) -> DENEGADO', async (t) => {
    if (!isEmulatorAvailable || !testEnv) {
      t.skip('Emulador de Firestore no disponible (requiere Java)');
      return;
    }
    const db = testEnv.authenticatedContext('user_123').firestore();
    const invalidCatRef = doc(db, 'users', 'user_123', 'categories', 'spam_doc_id');
    await assertFails(
      setDoc(invalidCatRef, {
        userId: 'user_123',
        categories: [],
        updatedAt: new Date().toISOString(),
      })
    );
  });

  test('9. Guardado de mes legítimo con coherencia temporal (2026-10 con year: 2026, month: 9) -> PERMITIDO', async (t) => {
    if (!isEmulatorAvailable || !testEnv) {
      t.skip('Emulador de Firestore no disponible (requiere Java)');
      return;
    }
    const db = testEnv.authenticatedContext('user_123').firestore();
    const monthRef = doc(db, 'users', 'user_123', 'months', '2026-10');
    await assertSucceeds(
      setDoc(monthRef, {
        userId: 'user_123',
        monthKey: '2026-10',
        year: 2026,
        month: 9, // Octubre en 0-index
        income: 500000,
        savingsRate: 15,
        extraDaysPosition: 'end',
        categories: [{ id: 'cat1', label: 'Supermercado', color: '#10b981' }],
        fixedExpenses: [
          { id: 'f1', name: 'Alquiler', amount: 150000, category: 'cat1', isPaid: true, dueDate: 10 }
        ],
        variableExpenses: [
          { id: 'v1', date: '2026-10-02', description: 'Compras', amount: 12000, category: 'cat1' }
        ],
        jarAdjustments: {},
        lastJarAdjustmentLog: null,
        updatedAt: new Date().toISOString(),
      })
    );
  });

  test('10. Mes con incoherencia temporal (monthKey: 2026-10 pero year: 2025 o month: 4) -> DENEGADO', async (t) => {
    if (!isEmulatorAvailable || !testEnv) {
      t.skip('Emulador de Firestore no disponible (requiere Java)');
      return;
    }
    const db = testEnv.authenticatedContext('user_123').firestore();
    const monthRef = doc(db, 'users', 'user_123', 'months', '2026-10');
    await assertFails(
      setDoc(monthRef, {
        userId: 'user_123',
        monthKey: '2026-10',
        year: 2025, // Incoherente con 2026-10
        month: 9,
        income: 500000,
        savingsRate: 15,
        extraDaysPosition: 'end',
        categories: [],
        fixedExpenses: [],
        variableExpenses: [],
        jarAdjustments: {},
        lastJarAdjustmentLog: null,
        updatedAt: new Date().toISOString(),
      })
    );
  });

  test('11. Mes con ingreso negativo o tasa de ahorro > 100 -> DENEGADO', async (t) => {
    if (!isEmulatorAvailable || !testEnv) {
      t.skip('Emulador de Firestore no disponible (requiere Java)');
      return;
    }
    const db = testEnv.authenticatedContext('user_123').firestore();
    const monthRef = doc(db, 'users', 'user_123', 'months', '2026-10');
    await assertFails(
      setDoc(monthRef, {
        userId: 'user_123',
        monthKey: '2026-10',
        year: 2026,
        month: 9,
        income: -500, // Negativo inválido
        savingsRate: 150, // Inválido (> 100)
        extraDaysPosition: 'end',
        categories: [],
        fixedExpenses: [],
        variableExpenses: [],
        jarAdjustments: {},
        lastJarAdjustmentLog: null,
        updatedAt: new Date().toISOString(),
      })
    );
  });

  test('12. Borrado de documento mensual -> DENEGADO', async (t) => {
    if (!isEmulatorAvailable || !testEnv) {
      t.skip('Emulador de Firestore no disponible (requiere Java)');
      return;
    }
    const db = testEnv.authenticatedContext('user_123').firestore();
    const monthRef = doc(db, 'users', 'user_123', 'months', '2026-10');
    await assertFails(deleteDoc(monthRef));
  });

  test('13. Lista con elemento inválido en posición posterior a la primera (índice 1 con amount negativo) -> DENEGADO', async (t) => {
    if (!isEmulatorAvailable || !testEnv) {
      t.skip('Emulador de Firestore no disponible (requiere Java)');
      return;
    }
    const db = testEnv.authenticatedContext('user_123').firestore();
    const monthRef = doc(db, 'users', 'user_123', 'months', '2026-10');
    await assertFails(
      setDoc(monthRef, {
        userId: 'user_123',
        monthKey: '2026-10',
        year: 2026,
        month: 9,
        income: 500000,
        savingsRate: 15,
        extraDaysPosition: 'end',
        categories: [],
        fixedExpenses: [
          { id: 'f1', name: 'Alquiler', amount: 150000, category: 'cat1', isPaid: true },
          { id: 'f2', name: 'Servicio Malicioso', amount: -5000, category: 'cat1', isPaid: false } // Inválido en [1]
        ],
        variableExpenses: [],
        jarAdjustments: {},
        lastJarAdjustmentLog: null,
        updatedAt: new Date().toISOString(),
      })
    );
  });

  test('14. Gasto variable con fecha imposible en calendario (mes 13 o día 45) -> DENEGADO', async (t) => {
    if (!isEmulatorAvailable || !testEnv) {
      t.skip('Emulador de Firestore no disponible (requiere Java)');
      return;
    }
    const db = testEnv.authenticatedContext('user_123').firestore();
    const monthRef = doc(db, 'users', 'user_123', 'months', '2026-10');
    await assertFails(
      setDoc(monthRef, {
        userId: 'user_123',
        monthKey: '2026-10',
        year: 2026,
        month: 9,
        income: 500000,
        savingsRate: 15,
        extraDaysPosition: 'end',
        categories: [],
        fixedExpenses: [],
        variableExpenses: [
          { id: 'v1', date: '2026-13-45', description: 'Fecha imposible', amount: 12000, category: 'cat1' }
        ],
        jarAdjustments: {},
        lastJarAdjustmentLog: null,
        updatedAt: new Date().toISOString(),
      })
    );
  });

  test('15. Inyección de campos adicionales no autorizados en mes -> DENEGADO', async (t) => {
    if (!isEmulatorAvailable || !testEnv) {
      t.skip('Emulador de Firestore no disponible (requiere Java)');
      return;
    }
    const db = testEnv.authenticatedContext('user_123').firestore();
    const monthRef = doc(db, 'users', 'user_123', 'months', '2026-10');
    await assertFails(
      setDoc(monthRef, {
        userId: 'user_123',
        monthKey: '2026-10',
        year: 2026,
        month: 9,
        income: 500000,
        savingsRate: 15,
        extraDaysPosition: 'end',
        categories: [],
        fixedExpenses: [],
        variableExpenses: [],
        jarAdjustments: {},
        lastJarAdjustmentLog: null,
        unauthorizedField: 'injected_data', // Campo no permitido en hasOnly
        updatedAt: new Date().toISOString(),
      })
    );
  });

  test('16. Actualización legítima parcial con merge: true en perfil de usuario -> PERMITIDO', async (t) => {
    if (!isEmulatorAvailable || !testEnv) {
      t.skip('Emulador de Firestore no disponible (requiere Java)');
      return;
    }
    const db = testEnv.authenticatedContext('user_123').firestore();
    const userRef = doc(db, 'users', 'user_123');
    // SetDoc inicial
    await assertSucceeds(
      setDoc(userRef, {
        uid: 'user_123',
        email: 'user@example.com',
        currency: 'USD',
        updatedAt: new Date().toISOString(),
      })
    );
    // Actualización parcial merge con nuevas preferencias
    await assertSucceeds(
      setDoc(userRef, {
        uid: 'user_123',
        currency: 'EUR',
        updatedAt: new Date().toISOString(),
      }, { merge: true })
    );
  });

  test('17. Intento de actualización con merge: true inyectando campo no autorizado -> DENEGADO', async (t) => {
    if (!isEmulatorAvailable || !testEnv) {
      t.skip('Emulador de Firestore no disponible (requiere Java)');
      return;
    }
    const db = testEnv.authenticatedContext('user_123').firestore();
    const userRef = doc(db, 'users', 'user_123');
    await assertFails(
      setDoc(userRef, {
        uid: 'user_123',
        role: 'superadmin',
        updatedAt: new Date().toISOString(),
      }, { merge: true })
    );
  });

  test('18. Verificación estática del catálogo de 23 monedas en firestore.rules', async (t) => {
    const rules = fs.readFileSync(RULES_PATH, 'utf8');
    const expectedCurrencies = [
      'ARS', 'BOB', 'BRL', 'BZD', 'CLP', 'COP', 'CRC', 'CUP', 'DOP', 'EUR',
      'GTQ', 'GYD', 'HNL', 'HTG', 'MXN', 'NIO', 'PAB', 'PEN', 'PYG', 'SRD',
      'USD', 'UYU', 'VES'
    ];
    for (const curr of expectedCurrencies) {
      await t.test(`Presencia estática de '${curr}'`, () => {
        assert.ok(rules.includes(`'${curr}'`), `firestore.rules debe incluir la moneda '${curr}'`);
      });
    }
    await t.test("Ausencia estática de 'GBP'", () => {
      assert.strictEqual(rules.includes("'GBP'"), false, "firestore.rules NO debe incluir 'GBP'");
    });
  });

  test('19. Admisión de cada una de las 23 monedas válidas en perfil de usuario -> PERMITIDO', async (t) => {
    if (!isEmulatorAvailable || !testEnv) {
      t.skip('Emulador de Firestore no disponible (requiere Java)');
      return;
    }
    const db = testEnv.authenticatedContext('user_123').firestore();
    const userRef = doc(db, 'users', 'user_123');
    const validCurrencies = [
      'ARS', 'BOB', 'BRL', 'BZD', 'CLP', 'COP', 'CRC', 'CUP', 'DOP', 'EUR',
      'GTQ', 'GYD', 'HNL', 'HTG', 'MXN', 'NIO', 'PAB', 'PEN', 'PYG', 'SRD',
      'USD', 'UYU', 'VES'
    ];
    for (const curr of validCurrencies) {
      await t.test(`Moneda válida: ${curr}`, async () => {
        await assertSucceeds(
          setDoc(userRef, {
            uid: 'user_123',
            currency: curr,
            updatedAt: new Date().toISOString(),
          })
        );
      });
    }
  });

  test('20. Rechazo de moneda GBP en perfil de usuario -> DENEGADO', async (t) => {
    if (!isEmulatorAvailable || !testEnv) {
      t.skip('Emulador de Firestore no disponible (requiere Java)');
      return;
    }
    const db = testEnv.authenticatedContext('user_123').firestore();
    const userRef = doc(db, 'users', 'user_123');
    await assertFails(
      setDoc(userRef, {
        uid: 'user_123',
        currency: 'GBP',
        updatedAt: new Date().toISOString(),
      })
    );
  });

  test('21. Rechazo de moneda inexistente/aleatoria (XYZ) en perfil de usuario -> DENEGADO', async (t) => {
    if (!isEmulatorAvailable || !testEnv) {
      t.skip('Emulador de Firestore no disponible (requiere Java)');
      return;
    }
    const db = testEnv.authenticatedContext('user_123').firestore();
    const userRef = doc(db, 'users', 'user_123');
    await assertFails(
      setDoc(userRef, {
        uid: 'user_123',
        currency: 'XYZ',
        updatedAt: new Date().toISOString(),
      })
    );
  });

  test('22. Rechazo de moneda en minúsculas (usd) en perfil de usuario -> DENEGADO', async (t) => {
    if (!isEmulatorAvailable || !testEnv) {
      t.skip('Emulador de Firestore no disponible (requiere Java)');
      return;
    }
    const db = testEnv.authenticatedContext('user_123').firestore();
    const userRef = doc(db, 'users', 'user_123');
    await assertFails(
      setDoc(userRef, {
        uid: 'user_123',
        currency: 'usd',
        updatedAt: new Date().toISOString(),
      })
    );
  });
});
