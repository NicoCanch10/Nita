import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'demo-nita-ci-test';
if (!PROJECT_ID.startsWith('demo-')) {
  throw new Error(
    `[Security Guard Error] El PROJECT_ID de pruebas ('${PROJECT_ID}') debe comenzar con 'demo-' para garantizar el aislamiento absoluto del emulador y bloquear cualquier tráfico hacia Google Cloud.`
  );
}
const RULES_PATH = path.resolve(process.cwd(), 'firestore.rules');
const BLUEPRINT_PATH = path.resolve(process.cwd(), 'firebase-blueprint.json');

function buildValidMonthPayload(userId: string, monthKey = '2026-10', year = 2026, month = 9) {
  return {
    userId,
    monthKey,
    year,
    month,
    income: 500000,
    savingsRate: 15,
    extraDaysPosition: 'end',
    categories: [{ id: 'cat1', label: 'Supermercado', color: '#10b981' }],
    fixedExpenses: [
      { id: 'f1', name: 'Alquiler', amount: 150000, category: 'cat1', isPaid: true, dueDate: 10 },
    ],
    variableExpenses: [
      { id: 'v1', date: '2026-10-02', description: 'Compras', amount: 12000, category: 'cat1' },
    ],
    jarAdjustments: {},
    lastJarAdjustmentLog: null,
    updatedAt: new Date().toISOString(),
  };
}

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
      console.warn('Causa técnica: no se pudo inicializar o contactar el emulador de Firestore.');
      console.warn('Detalle:', msg);
      console.warn('----------------------------------------------------------------------');
      if (process.env.STRICT_RULES_EMULATOR === 'true') {
        throw new Error(`[Strict Rules Mode] Emulador no disponible: ${msg}`);
      }
    }
  });

  beforeEach(async () => {
    if (isEmulatorAvailable && testEnv) {
      await testEnv.clearFirestore();
    }
  });

  after(async () => {
    if (testEnv) {
      await testEnv.cleanup().catch(() => {});
    }
  });

  test('Configuración de reglas: el archivo firestore.rules existe, tiene sintaxis endurecida y sin bypasses legacy', () => {
    const rules = fs.readFileSync(RULES_PATH, 'utf8');
    assert.ok(rules.length > 500, 'El archivo firestore.rules debe contener contenido sustancial');
    assert.ok(rules.includes("rules_version = '2'"), 'Debe especificar rules_version 2');
    assert.ok(rules.includes('hasOnly'), 'Debe incluir validaciones de hasOnly');
    assert.ok(rules.includes('affectedKeys()'), 'Debe restringir claves modificadas en update');
    assert.ok(rules.includes('nita_password'), 'Debe validar provider nita_password para cuentas usr_*');
    assert.ok(rules.includes('minSessionEpoch'), 'Debe validar minSessionEpoch en /userSecurity/{uid}');
    assert.ok(rules.includes('match /accounts/{usernameLower}'), 'Debe definir bloqueo explícito para /accounts');
    assert.ok(rules.includes('match /accountSecrets/{usernameLower}'), 'Debe definir bloqueo explícito para /accountSecrets');
    assert.ok(rules.includes('match /userSecurity/{uid}'), 'Debe definir bloqueo explícito para /userSecurity');
    assert.ok(rules.includes('match /authRateLimits/{bucketKey}'), 'Debe definir bloqueo explícito para /authRateLimits');
    assert.strictEqual(
      rules.includes('|| (userId is string && userId.size() > 0)'),
      false,
      'NO debe existir el bypass legacy en isOwner()'
    );
    assert.strictEqual(
      rules.includes('|| docId.size() <= 64'),
      false,
      'NO debe permitir IDs arbitrarios en /categories/{docId}'
    );
    assert.strictEqual(
      rules.includes('|| exp.date.size() >= 8'),
      false,
      'NO debe existir el bypass de fecha en isValidVariableExpense()'
    );

    const blueprint = JSON.parse(fs.readFileSync(BLUEPRINT_PATH, 'utf8')) as {
      firestore?: Record<string, unknown>;
    };
    for (const expectedPath of [
      '/users/{userId}',
      '/users/{userId}/categories/global',
      '/users/{userId}/months/{monthKey}',
      '/accounts/{usernameLower}',
      '/accountSecrets/{usernameLower}',
      '/userSecurity/{uid}',
      '/authRateLimits/{bucketKey}',
    ]) {
      assert.ok(blueprint.firestore?.[expectedPath], `firebase-blueprint.json debe declarar ${expectedPath}`);
    }
  });

  test('1. Acceso de propietario a su perfil (/users/{userId}) -> PERMITIDO', async (t) => {
    if (!isEmulatorAvailable || !testEnv) {
      t.skip('Emulador de Firestore no disponible en este entorno');
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
      t.skip('Emulador de Firestore no disponible en este entorno');
      return;
    }
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'user_123'), {
        uid: 'user_123',
        updatedAt: new Date().toISOString(),
      });
    });
    const db = testEnv.unauthenticatedContext().firestore();
    const userRef = doc(db, 'users', 'user_123');
    await assertFails(getDoc(userRef));
    await assertFails(
      setDoc(userRef, {
        uid: 'user_123',
        updatedAt: new Date().toISOString(),
      })
    );
  });

  test('3. Acceso cruzado: Usuario B intenta leer perfil de Usuario A -> DENEGADO', async (t) => {
    if (!isEmulatorAvailable || !testEnv) {
      t.skip('Emulador de Firestore no disponible en este entorno');
      return;
    }
    const db = testEnv.authenticatedContext('user_B').firestore();
    const userRef = doc(db, 'users', 'user_A');
    await assertFails(getDoc(userRef));
  });

  test('4. Usuario B intenta escribir en perfil de Usuario A -> DENEGADO', async (t) => {
    if (!isEmulatorAvailable || !testEnv) {
      t.skip('Emulador de Firestore no disponible en este entorno');
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
      t.skip('Emulador de Firestore no disponible en este entorno');
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
      t.skip('Emulador de Firestore no disponible en este entorno');
      return;
    }
    const db = testEnv.authenticatedContext('user_123').firestore();
    const userRef = doc(db, 'users', 'user_123');
    await assertFails(deleteDoc(userRef));
  });

  test('7. Acceso legítimo a categorías globales (/users/{userId}/categories/global) -> PERMITIDO', async (t) => {
    if (!isEmulatorAvailable || !testEnv) {
      t.skip('Emulador de Firestore no disponible en este entorno');
      return;
    }
    const db = testEnv.authenticatedContext('user_123').firestore();
    const catsRef = doc(db, 'users', 'user_123', 'categories', 'global');
    await assertSucceeds(
      setDoc(catsRef, {
        userId: 'user_123',
        categories: [{ id: 'cat1', label: 'Supermercado', color: '#10b981' }],
        updatedAt: new Date().toISOString(),
      })
    );
    await assertSucceeds(getDoc(catsRef));
  });

  test('8. Creación de subcolección de categorías con ID no global (/categories/spam) -> DENEGADO', async (t) => {
    if (!isEmulatorAvailable || !testEnv) {
      t.skip('Emulador de Firestore no disponible en este entorno');
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
    await assertFails(getDoc(invalidCatRef));
  });

  test('9. Guardado de mes legítimo con coherencia temporal (2026-10 con year: 2026, month: 9) -> PERMITIDO', async (t) => {
    if (!isEmulatorAvailable || !testEnv) {
      t.skip('Emulador de Firestore no disponible en este entorno');
      return;
    }
    const db = testEnv.authenticatedContext('user_123').firestore();
    const monthRef = doc(db, 'users', 'user_123', 'months', '2026-10');
    await assertSucceeds(setDoc(monthRef, buildValidMonthPayload('user_123', '2026-10', 2026, 9)));
  });

  test('10. Mes con incoherencia temporal (monthKey: 2026-10 pero year: 2025 o month: 4) -> DENEGADO', async (t) => {
    if (!isEmulatorAvailable || !testEnv) {
      t.skip('Emulador de Firestore no disponible en este entorno');
      return;
    }
    const db = testEnv.authenticatedContext('user_123').firestore();
    const monthRef = doc(db, 'users', 'user_123', 'months', '2026-10');
    await assertFails(setDoc(monthRef, buildValidMonthPayload('user_123', '2026-10', 2025, 9)));
    await assertFails(setDoc(monthRef, buildValidMonthPayload('user_123', '2026-10', 2026, 4)));
  });

  test('11. Mes con ingreso negativo o tasa de ahorro > 100 -> DENEGADO', async (t) => {
    if (!isEmulatorAvailable || !testEnv) {
      t.skip('Emulador de Firestore no disponible en este entorno');
      return;
    }
    const db = testEnv.authenticatedContext('user_123').firestore();
    const monthRef = doc(db, 'users', 'user_123', 'months', '2026-10');
    await assertFails(
      setDoc(monthRef, {
        ...buildValidMonthPayload('user_123'),
        income: -500,
        savingsRate: 150,
      })
    );
  });

  test('12. Borrado de documento mensual -> DENEGADO', async (t) => {
    if (!isEmulatorAvailable || !testEnv) {
      t.skip('Emulador de Firestore no disponible en este entorno');
      return;
    }
    const db = testEnv.authenticatedContext('user_123').firestore();
    const monthRef = doc(db, 'users', 'user_123', 'months', '2026-10');
    await assertFails(deleteDoc(monthRef));
  });

  test('13. Lista con elemento inválido en posición posterior a la primera (índice 1 o cola con valor inválido) -> DENEGADO', async (t) => {
    if (!isEmulatorAvailable || !testEnv) {
      t.skip('Emulador de Firestore no disponible en este entorno');
      return;
    }
    const db = testEnv.authenticatedContext('user_123').firestore();
    const monthRef = doc(db, 'users', 'user_123', 'months', '2026-10');
    await assertFails(
      setDoc(monthRef, {
        ...buildValidMonthPayload('user_123'),
        fixedExpenses: [
          { id: 'f1', name: 'Alquiler', amount: 150000, category: 'cat1', isPaid: true },
          { id: 'f2', name: 'Servicio Malicioso', amount: -5000, category: 'cat1', isPaid: false },
        ],
      })
    );
    await assertFails(
      setDoc(monthRef, {
        ...buildValidMonthPayload('user_123'),
        variableExpenses: [
          { id: 'v1', date: '2026-10-01', description: 'OK', amount: 1000, category: 'cat1' },
          { id: 'v2', date: '2026-10-02', description: 'Malicioso', amount: -10, category: 'cat1' },
        ],
      })
    );
  });

  test('14. Gasto variable con fecha imposible en calendario (mes 13 o día 45) -> DENEGADO', async (t) => {
    if (!isEmulatorAvailable || !testEnv) {
      t.skip('Emulador de Firestore no disponible en este entorno');
      return;
    }
    const db = testEnv.authenticatedContext('user_123').firestore();
    const monthRef = doc(db, 'users', 'user_123', 'months', '2026-10');
    await assertFails(
      setDoc(monthRef, {
        ...buildValidMonthPayload('user_123'),
        variableExpenses: [
          { id: 'v1', date: '2026-13-45', description: 'Fecha imposible', amount: 12000, category: 'cat1' },
        ],
      })
    );
  });

  test('15. Inyección de campos adicionales no autorizados en mes -> DENEGADO', async (t) => {
    if (!isEmulatorAvailable || !testEnv) {
      t.skip('Emulador de Firestore no disponible en este entorno');
      return;
    }
    const db = testEnv.authenticatedContext('user_123').firestore();
    const monthRef = doc(db, 'users', 'user_123', 'months', '2026-10');
    await assertFails(
      setDoc(monthRef, {
        ...buildValidMonthPayload('user_123'),
        unauthorizedField: 'injected_data',
      })
    );
  });

  test('16. Actualización legítima parcial con merge: true en perfil de usuario -> PERMITIDO', async (t) => {
    if (!isEmulatorAvailable || !testEnv) {
      t.skip('Emulador de Firestore no disponible en este entorno');
      return;
    }
    const db = testEnv.authenticatedContext('user_123').firestore();
    const userRef = doc(db, 'users', 'user_123');
    await assertSucceeds(
      setDoc(userRef, {
        uid: 'user_123',
        email: 'user@example.com',
        currency: 'USD',
        updatedAt: new Date().toISOString(),
      })
    );
    await assertSucceeds(
      setDoc(
        userRef,
        {
          uid: 'user_123',
          currency: 'EUR',
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      )
    );
  });

  test('17. Intento de actualización con merge: true inyectando campo no autorizado -> DENEGADO', async (t) => {
    if (!isEmulatorAvailable || !testEnv) {
      t.skip('Emulador de Firestore no disponible en este entorno');
      return;
    }
    const db = testEnv.authenticatedContext('user_123').firestore();
    const userRef = doc(db, 'users', 'user_123');
    await assertSucceeds(
      setDoc(userRef, {
        uid: 'user_123',
        currency: 'USD',
        updatedAt: new Date().toISOString(),
      })
    );
    await assertFails(
      setDoc(
        userRef,
        {
          uid: 'user_123',
          role: 'superadmin',
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      )
    );
  });

  test('18. Verificación estática del catálogo de 23 monedas en firestore.rules', async (t) => {
    const rules = fs.readFileSync(RULES_PATH, 'utf8');
    const expectedCurrencies = [
      'ARS', 'BOB', 'BRL', 'BZD', 'CLP', 'COP', 'CRC', 'CUP', 'DOP', 'EUR',
      'GTQ', 'GYD', 'HNL', 'HTG', 'MXN', 'NIO', 'PAB', 'PEN', 'PYG', 'SRD',
      'USD', 'UYU', 'VES',
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
      t.skip('Emulador de Firestore no disponible en este entorno');
      return;
    }
    const db = testEnv.authenticatedContext('user_123').firestore();
    const userRef = doc(db, 'users', 'user_123');
    const validCurrencies = [
      'ARS', 'BOB', 'BRL', 'BZD', 'CLP', 'COP', 'CRC', 'CUP', 'DOP', 'EUR',
      'GTQ', 'GYD', 'HNL', 'HTG', 'MXN', 'NIO', 'PAB', 'PEN', 'PYG', 'SRD',
      'USD', 'UYU', 'VES',
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
      t.skip('Emulador de Firestore no disponible en este entorno');
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
      t.skip('Emulador de Firestore no disponible en este entorno');
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
      t.skip('Emulador de Firestore no disponible en este entorno');
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

  test('23. Colecciones privadas del backend (/accounts, /accountSecrets, /userSecurity, /authRateLimits) -> DENEGADO para todo cliente', async (t) => {
    if (!isEmulatorAvailable || !testEnv) {
      t.skip('Emulador de Firestore no disponible en este entorno');
      return;
    }
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const adminDb = ctx.firestore();
      await setDoc(doc(adminDb, 'accounts', 'alice'), { userId: 'usr_alice', usernameLower: 'alice' });
      await setDoc(doc(adminDb, 'accountSecrets', 'alice'), { userId: 'usr_alice', sessionEpoch: 1 });
      await setDoc(doc(adminDb, 'userSecurity', 'usr_alice'), {
        uid: 'usr_alice',
        usernameLower: 'alice',
        minSessionEpoch: 1,
      });
      await setDoc(doc(adminDb, 'authRateLimits', 'ip_1'), { attemptsInWindow: 1 });
    });

    const contexts = [
      testEnv.unauthenticatedContext(),
      testEnv.authenticatedContext('google_user_1'),
      testEnv.authenticatedContext('usr_alice', { provider: 'nita_password', sessionEpoch: 1 }),
    ];

    for (const ctx of contexts) {
      const db = ctx.firestore();
      await assertFails(getDoc(doc(db, 'accounts', 'alice')));
      await assertFails(getDocs(collection(db, 'accounts')));
      await assertFails(setDoc(doc(db, 'accounts', 'alice'), { userId: 'usr_alice' }));

      await assertFails(getDoc(doc(db, 'accountSecrets', 'alice')));
      await assertFails(getDocs(collection(db, 'accountSecrets')));
      await assertFails(setDoc(doc(db, 'accountSecrets', 'alice'), { sessionEpoch: 99 }));

      await assertFails(getDoc(doc(db, 'userSecurity', 'usr_alice')));
      await assertFails(getDocs(collection(db, 'userSecurity')));
      await assertFails(
        setDoc(doc(db, 'userSecurity', 'usr_alice'), { uid: 'usr_alice', minSessionEpoch: 1 })
      );

      await assertFails(getDoc(doc(db, 'authRateLimits', 'ip_1')));
      await assertFails(getDocs(collection(db, 'authRateLimits')));
      await assertFails(setDoc(doc(db, 'authRateLimits', 'ip_1'), { attemptsInWindow: 0 }));
    }
  });

  test('24. Cuenta propia usr_* con claims válidos y /userSecurity consistente -> PERMITIDO (CRUD + list)', async (t) => {
    if (!isEmulatorAvailable || !testEnv) {
      t.skip('Emulador de Firestore no disponible en este entorno');
      return;
    }
    const uid = 'usr_alice';
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const adminDb = ctx.firestore();
      await setDoc(doc(adminDb, 'userSecurity', uid), {
        uid,
        usernameLower: 'alice',
        minSessionEpoch: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
      await setDoc(doc(adminDb, 'users', uid), {
        uid,
        displayName: 'Alice',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
    });

    const db = testEnv
      .authenticatedContext(uid, { provider: 'nita_password', sessionEpoch: 1 })
      .firestore();

    await assertSucceeds(getDoc(doc(db, 'users', uid)));
    await assertSucceeds(
      setDoc(
        doc(db, 'users', uid),
        { uid, currency: 'ARS', language: 'es', updatedAt: new Date().toISOString() },
        { merge: true }
      )
    );
    await assertSucceeds(
      setDoc(doc(db, 'users', uid, 'categories', 'global'), {
        userId: uid,
        categories: [{ id: 'food', label: 'Comida', color: '#22c55e' }],
        updatedAt: new Date().toISOString(),
      })
    );
    await assertSucceeds(setDoc(doc(db, 'users', uid, 'months', '2026-10'), buildValidMonthPayload(uid)));
    await assertSucceeds(getDocs(collection(db, 'users', uid, 'months')));
  });

  test('25. Cuenta usr_* sin /userSecurity/{uid} (fail-closed) -> DENEGADO', async (t) => {
    if (!isEmulatorAvailable || !testEnv) {
      t.skip('Emulador de Firestore no disponible en este entorno');
      return;
    }
    const uid = 'usr_sin_security';
    const db = testEnv
      .authenticatedContext(uid, { provider: 'nita_password', sessionEpoch: 1 })
      .firestore();

    await assertFails(getDoc(doc(db, 'users', uid)));
    await assertFails(setDoc(doc(db, 'users', uid), { uid, updatedAt: new Date().toISOString() }));
    await assertFails(setDoc(doc(db, 'users', uid, 'months', '2026-10'), buildValidMonthPayload(uid)));
    await assertFails(getDocs(collection(db, 'users', uid, 'months')));
  });

  test('26. Cuenta usr_* sin provider nita_password o UID no-usr_* con provider nita_password -> DENEGADO', async (t) => {
    if (!isEmulatorAvailable || !testEnv) {
      t.skip('Emulador de Firestore no disponible en este entorno');
      return;
    }
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'userSecurity', 'usr_alice'), {
        uid: 'usr_alice',
        usernameLower: 'alice',
        minSessionEpoch: 1,
      });
    });

    const missingProviderDb = testEnv.authenticatedContext('usr_alice').firestore();
    await assertFails(getDoc(doc(missingProviderDb, 'users', 'usr_alice')));
    await assertFails(
      setDoc(doc(missingProviderDb, 'users', 'usr_alice', 'months', '2026-10'), buildValidMonthPayload('usr_alice'))
    );

    const forgedProviderDb = testEnv
      .authenticatedContext('google_uid_1', { provider: 'nita_password', sessionEpoch: 1 })
      .firestore();
    await assertFails(
      setDoc(doc(forgedProviderDb, 'users', 'google_uid_1'), {
        uid: 'google_uid_1',
        updatedAt: new Date().toISOString(),
      })
    );
  });

  test('27. Cuenta usr_* con sessionEpoch obsoleto (< minSessionEpoch tras cambio de contraseña) -> DENEGADO inmediatamente', async (t) => {
    if (!isEmulatorAvailable || !testEnv) {
      t.skip('Emulador de Firestore no disponible en este entorno');
      return;
    }
    const uid = 'usr_bob';
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const adminDb = ctx.firestore();
      await setDoc(doc(adminDb, 'userSecurity', uid), {
        uid,
        usernameLower: 'bob',
        minSessionEpoch: 2,
      });
      await setDoc(doc(adminDb, 'users', uid, 'months', '2026-10'), buildValidMonthPayload(uid));
    });

    const staleDb = testEnv
      .authenticatedContext(uid, { provider: 'nita_password', sessionEpoch: 1 })
      .firestore();
    await assertFails(getDoc(doc(staleDb, 'users', uid, 'months', '2026-10')));
    await assertFails(getDocs(collection(staleDb, 'users', uid, 'months')));
    await assertFails(setDoc(doc(staleDb, 'users', uid, 'months', '2026-11'), buildValidMonthPayload(uid, '2026-11', 2026, 10)));

    const freshDb = testEnv
      .authenticatedContext(uid, { provider: 'nita_password', sessionEpoch: 2 })
      .firestore();
    await assertSucceeds(getDoc(doc(freshDb, 'users', uid, 'months', '2026-10')));
    await assertSucceeds(setDoc(doc(freshDb, 'users', uid, 'months', '2026-11'), buildValidMonthPayload(uid, '2026-11', 2026, 10)));
  });

  test('28. Aislamiento cruzado entre usr_* y Google y bloqueo de listado global /users -> DENEGADO', async (t) => {
    if (!isEmulatorAvailable || !testEnv) {
      t.skip('Emulador de Firestore no disponible en este entorno');
      return;
    }
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const adminDb = ctx.firestore();
      await setDoc(doc(adminDb, 'userSecurity', 'usr_alice'), {
        uid: 'usr_alice',
        usernameLower: 'alice',
        minSessionEpoch: 1,
      });
      await setDoc(doc(adminDb, 'userSecurity', 'usr_bob'), {
        uid: 'usr_bob',
        usernameLower: 'bob',
        minSessionEpoch: 1,
      });
      await setDoc(doc(adminDb, 'users', 'usr_bob', 'months', '2026-10'), buildValidMonthPayload('usr_bob'));
      await setDoc(doc(adminDb, 'users', 'google_user_1', 'months', '2026-10'), buildValidMonthPayload('google_user_1'));
    });

    const aliceDb = testEnv
      .authenticatedContext('usr_alice', { provider: 'nita_password', sessionEpoch: 1 })
      .firestore();
    await assertFails(getDoc(doc(aliceDb, 'users', 'usr_bob', 'months', '2026-10')));
    await assertFails(getDocs(collection(aliceDb, 'users', 'usr_bob', 'months')));
    await assertFails(getDoc(doc(aliceDb, 'users', 'google_user_1', 'months', '2026-10')));
    await assertFails(getDocs(collection(aliceDb, 'users')));

    const googleDb = testEnv.authenticatedContext('google_user_1').firestore();
    await assertFails(getDoc(doc(googleDb, 'users', 'usr_alice')));
    await assertFails(getDocs(collection(googleDb, 'users')));
  });

  test('29. Inmutabilidad de campos (createdAt, userId, monthKey) y sesión anónima bloqueada -> DENEGADO', async (t) => {
    if (!isEmulatorAvailable || !testEnv) {
      t.skip('Emulador de Firestore no disponible en este entorno');
      return;
    }
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'user_123'), {
        uid: 'user_123',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
    });

    const db = testEnv.authenticatedContext('user_123').firestore();
    await assertFails(
      updateDoc(doc(db, 'users', 'user_123'), {
        createdAt: '2027-01-01T00:00:00.000Z',
        updatedAt: new Date().toISOString(),
      })
    );

    const anonDb = testEnv
      .authenticatedContext('anon_1', { firebase: { sign_in_provider: 'anonymous' } })
      .firestore();
    await assertFails(
      setDoc(doc(anonDb, 'users', 'anon_1'), {
        uid: 'anon_1',
        updatedAt: new Date().toISOString(),
      })
    );
  });

  test('30. /test/connection permite get puntual pero deniega list y write', async (t) => {
    if (!isEmulatorAvailable || !testEnv) {
      t.skip('Emulador de Firestore no disponible en este entorno');
      return;
    }
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(db, 'test', 'connection')));
    await assertFails(getDocs(collection(db, 'test')));
    await assertFails(setDoc(doc(db, 'test', 'connection'), { ok: true }));
  });

  // =========================================================================
  // ETAPA B-2.2D — Ampliación de cobertura de Firestore Rules (SOLO TESTS)
  // =========================================================================

  type AccountKind = 'google' | 'usr_';
  type WriteOperationKind = 'create' | 'update';
  type DiagnosticListTarget = 'categories' | 'fixedExpenses' | 'variableExpenses';
  type RuleOutcomeClassification =
    | 'ALLOWED'
    | 'CEL_EXPRESSION_LIMIT'
    | 'SECURITY_VALIDATION_DENIED'
    | 'OTHER_ERROR';

  interface DiagnosticWriteResult {
    operation: WriteOperationKind;
    uid: string;
    accountType: AccountKind;
    counts: {
      categories: number;
      fixedExpenses: number;
      variableExpenses: number;
    };
    allowed: boolean;
    classification: RuleOutcomeClassification;
    fullError: string | null;
  }

  const DEFAULT_CATEGORIES_11 = [
    { id: 'housing', label: 'Vivienda y Alquiler', color: '#4f46e5' },
    { id: 'services', label: 'Servicios', color: '#0284c7' },
    { id: 'debt', label: 'Tarjetas y Deudas', color: '#e11d48' },
    { id: 'food', label: 'Alimentación y Supermercado', color: '#16a34a' },
    { id: 'transport', label: 'Transporte y Combustible', color: '#d97706' },
    { id: 'health', label: 'Salud y Farmacia', color: '#0d9488' },
    { id: 'subscriptions', label: 'Suscripciones y Conectividad', color: '#7c3aed' },
    { id: 'leisure', label: 'Ocio, Salidas y Gustos', color: '#db2777' },
    { id: 'education', label: 'Educación y Cursos', color: '#2563eb' },
    { id: 'savings', label: 'Ahorro e Inversión', color: '#059669' },
    { id: 'other', label: 'Otros Gastos', color: '#64748b' },
  ];

  function buildDiagnosticCategories(count: number): Array<Record<string, unknown>> {
    const result: Array<Record<string, unknown>> = [];
    for (let i = 0; i < count; i++) {
      if (i < DEFAULT_CATEGORIES_11.length) {
        result.push({ ...DEFAULT_CATEGORIES_11[i] });
      } else {
        result.push({
          id: `cat_extra_${i}`,
          label: `Categoría Extra ${i + 1}`,
          color: '#64748b',
        });
      }
    }
    return result;
  }

  function buildDiagnosticFixedExpenses(count: number): Array<Record<string, unknown>> {
    const result: Array<Record<string, unknown>> = [];
    for (let i = 0; i < count; i++) {
      result.push({
        id: `f_diag_${i}`,
        name: `Gasto Fijo ${i + 1}`,
        amount: 1000 + i,
        category: 'housing',
        isPaid: i % 2 === 0,
      });
    }
    return result;
  }

  function buildDiagnosticVariableExpenses(count: number): Array<Record<string, unknown>> {
    const result: Array<Record<string, unknown>> = [];
    for (let i = 0; i < count; i++) {
      const day = String((i % 28) + 1).padStart(2, '0');
      result.push({
        id: `v_diag_${i}`,
        date: `2026-10-${day}`,
        description: `Gasto Variable ${i + 1}`,
        amount: 500 + i,
        category: 'food',
      });
    }
    return result;
  }

  function buildDiagnosticMonthPayload(
    userId: string,
    monthKey: string,
    year: number,
    month: number,
    counts: { categories: number; fixedExpenses: number; variableExpenses: number }
  ) {
    return {
      userId,
      monthKey,
      year,
      month,
      income: 500000,
      savingsRate: 15,
      extraDaysPosition: 'end',
      categories: buildDiagnosticCategories(counts.categories),
      fixedExpenses: buildDiagnosticFixedExpenses(counts.fixedExpenses),
      variableExpenses: buildDiagnosticVariableExpenses(counts.variableExpenses),
      jarAdjustments: {},
      lastJarAdjustmentLog: null,
      updatedAt: new Date().toISOString(),
    };
  }

  function classifyRuleError(err: unknown): {
    classification: RuleOutcomeClassification;
    fullError: string;
  } {
    const code = (err as { code?: string })?.code;
    const message = err instanceof Error ? err.message : String(err);
    const fullError = code ? `[${code}] ${message}` : message;

    if (/maximum of 1000 expressions|Unable to evaluate the expression/i.test(fullError)) {
      return { classification: 'CEL_EXPRESSION_LIMIT', fullError };
    }
    if (
      code === 'permission-denied' ||
      /PERMISSION_DENIED|false for '(create|update|get|list|delete)'/i.test(fullError)
    ) {
      return { classification: 'SECURITY_VALIDATION_DENIED', fullError };
    }
    return { classification: 'OTHER_ERROR', fullError };
  }

  async function setupAuthenticatedMonthContext(
    env: RulesTestEnvironment,
    accountType: AccountKind,
    uid: string
  ) {
    if (accountType === 'usr_') {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'userSecurity', uid), {
          uid,
          usernameLower: uid.replace(/^usr_/, ''),
          minSessionEpoch: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        });
      });
      return env.authenticatedContext(uid, { provider: 'nita_password', sessionEpoch: 1 }).firestore();
    }
    return env.authenticatedContext(uid).firestore();
  }

  async function seedBaselineMonthForUpdate(
    env: RulesTestEnvironment,
    uid: string,
    monthKey: string,
    year: number,
    month: number
  ) {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', uid, 'months', monthKey), {
        userId: uid,
        monthKey,
        year,
        month,
        income: 100000,
        savingsRate: 10,
        extraDaysPosition: 'end',
        categories: [],
        fixedExpenses: [],
        variableExpenses: [],
        jarAdjustments: {},
        lastJarAdjustmentLog: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
    });
  }

  async function assertMonthDocAbsentBeforeCreate(
    env: RulesTestEnvironment,
    uid: string,
    monthKey: string
  ) {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const preSnap = await getDoc(doc(ctx.firestore(), 'users', uid, 'months', monthKey));
      assert.equal(
        preSnap.exists(),
        false,
        `[Aislamiento CREATE] El documento /users/${uid}/months/${monthKey} no debe existir antes de setDoc()`
      );
    });
  }

  async function executeDiagnosticMonthWrite(
    env: RulesTestEnvironment,
    accountType: AccountKind,
    uid: string,
    operation: WriteOperationKind,
    monthKey: string,
    year: number,
    month: number,
    payload: ReturnType<typeof buildDiagnosticMonthPayload>
  ): Promise<DiagnosticWriteResult> {
    const db = await setupAuthenticatedMonthContext(env, accountType, uid);
    const monthRef = doc(db, 'users', uid, 'months', monthKey);

    if (operation === 'create') {
      await assertMonthDocAbsentBeforeCreate(env, uid, monthKey);
    } else {
      await seedBaselineMonthForUpdate(env, uid, monthKey, year, month);
      await env.withSecurityRulesDisabled(async (ctx) => {
        const seededSnap = await getDoc(doc(ctx.firestore(), 'users', uid, 'months', monthKey));
        assert.equal(
          seededSnap.exists(),
          true,
          `[Preparación UPDATE] El documento /users/${uid}/months/${monthKey} debe existir sembrado antes de updateDoc()`
        );
      });
    }

    const counts = {
      categories: payload.categories.length,
      fixedExpenses: payload.fixedExpenses.length,
      variableExpenses: payload.variableExpenses.length,
    };

    try {
      if (operation === 'create') {
        await setDoc(monthRef, payload);
      } else {
        await updateDoc(monthRef, {
          income: payload.income,
          categories: payload.categories,
          fixedExpenses: payload.fixedExpenses,
          variableExpenses: payload.variableExpenses,
          updatedAt: new Date().toISOString(),
        });
      }
      const res: DiagnosticWriteResult = {
        operation,
        uid,
        accountType,
        counts,
        allowed: true,
        classification: 'ALLOWED',
        fullError: null,
      };
      console.log(
        `[B-2.2D] op=${res.operation} | path=users/${uid}/months/${monthKey} (${res.accountType}) | counts=cat:${counts.categories},fix:${counts.fixedExpenses},var:${counts.variableExpenses} | result=ALLOWED`
      );
      return res;
    } catch (err: unknown) {
      const { classification, fullError } = classifyRuleError(err);
      const res: DiagnosticWriteResult = {
        operation,
        uid,
        accountType,
        counts,
        allowed: false,
        classification,
        fullError,
      };
      console.log(
        `[B-2.2D] op=${res.operation} | path=users/${uid}/months/${monthKey} (${res.accountType}) | counts=cat:${counts.categories},fix:${counts.fixedExpenses},var:${counts.variableExpenses} | result=REJECTED (${classification}) | error=${fullError}`
      );
      return res;
    }
  }

  function mutateInvalidElementAt(
    target: DiagnosticListTarget,
    payload: ReturnType<typeof buildDiagnosticMonthPayload>,
    badIndex: number
  ) {
    if (target === 'categories') {
      payload.categories[badIndex] = { id: '', label: 'Categoría Inválida', color: '#000000' };
    } else if (target === 'fixedExpenses') {
      payload.fixedExpenses[badIndex] = {
        id: `f_bad_${badIndex}`,
        name: 'Gasto Fijo Negativo',
        amount: -100,
        category: 'housing',
        isPaid: false,
      };
    } else {
      payload.variableExpenses[badIndex] = {
        id: `v_bad_${badIndex}`,
        date: '2026-10-01',
        description: 'Gasto Variable Negativo',
        amount: -50,
        category: 'food',
      };
    }
  }

  describe('B-2.2D (1) — Escrituras mensuales con 11 categorías y gastos fijos/variables (Google y usr_*, create y update)', () => {
    const scenarios: Array<{
      tag: string;
      label: string;
      categories: number;
      fixedExpenses: number;
      variableExpenses: number;
    }> = [
      { tag: 'c11_f0_v0', label: '11 categorías, 0 fijos, 0 variables', categories: 11, fixedExpenses: 0, variableExpenses: 0 },
      { tag: 'c11_f1_v1', label: '11 categorías, 1 fijo, 1 variable', categories: 11, fixedExpenses: 1, variableExpenses: 1 },
      { tag: 'c11_f5_v5', label: '11 categorías, 5 fijos, 5 variables', categories: 11, fixedExpenses: 5, variableExpenses: 5 },
      { tag: 'c11_f11_v11', label: '11 categorías, 11 fijos, 11 variables', categories: 11, fixedExpenses: 11, variableExpenses: 11 },
    ];

    const accounts: Array<{ accountType: AccountKind; prefix: string }> = [
      { accountType: 'google', prefix: 'google' },
      { accountType: 'usr_', prefix: 'usr' },
    ];

    const operations: WriteOperationKind[] = ['create', 'update'];

    for (const scenario of scenarios) {
      for (const acc of accounts) {
        for (const op of operations) {
          const uniqueUid = `${acc.prefix}_diag_b22d_1_${scenario.tag}_${op}`;
          test(`31. Payload válido [${scenario.label}] | ${acc.accountType} (${uniqueUid}) | ${op}`, async (t) => {
            if (!isEmulatorAvailable || !testEnv) {
              t.skip('Emulador de Firestore no disponible en este entorno');
              return;
            }
            const payload = buildDiagnosticMonthPayload(uniqueUid, '2026-10', 2026, 9, {
              categories: scenario.categories,
              fixedExpenses: scenario.fixedExpenses,
              variableExpenses: scenario.variableExpenses,
            });
            const res = await executeDiagnosticMonthWrite(
              testEnv,
              acc.accountType,
              uniqueUid,
              op,
              '2026-10',
              2026,
              9,
              payload
            );
            assert.equal(
              res.classification,
              'ALLOWED',
              `Se esperaba ALLOWED para payload válido (${scenario.label}, ${acc.accountType}, ${op}), pero resultó ${res.classification}: ${res.fullError}`
            );
          });
        }
      }
    }
  });

  describe('B-2.2D (2) — Listas de 12 elementos: cobertura de índices 5, 10 (intermedio) y 11 (cola)', () => {
    const listTargets: Array<{ target: DiagnosticListTarget; short: string }> = [
      { target: 'categories', short: 'cat' },
      { target: 'fixedExpenses', short: 'fix' },
      { target: 'variableExpenses', short: 'var' },
    ];
    const accounts: Array<{ accountType: AccountKind; prefix: string }> = [
      { accountType: 'google', prefix: 'google' },
      { accountType: 'usr_', prefix: 'usr' },
    ];
    const operations: WriteOperationKind[] = ['create', 'update'];

    for (const { target, short } of listTargets) {
      for (const acc of accounts) {
        for (const op of operations) {
          const validUid = `${acc.prefix}_diag_b22d_2_${short}_valid_${op}`;
          test(`32. Lista ${target} (12 válidos) | ${acc.accountType} (${validUid}) | ${op}`, async (t) => {
            if (!isEmulatorAvailable || !testEnv) {
              t.skip('Emulador de Firestore no disponible en este entorno');
              return;
            }
            const counts = {
              categories: target === 'categories' ? 12 : 0,
              fixedExpenses: target === 'fixedExpenses' ? 12 : 0,
              variableExpenses: target === 'variableExpenses' ? 12 : 0,
            };
            const payload = buildDiagnosticMonthPayload(validUid, '2026-11', 2026, 10, counts);
            const res = await executeDiagnosticMonthWrite(
              testEnv,
              acc.accountType,
              validUid,
              op,
              '2026-11',
              2026,
              10,
              payload
            );
            assert.equal(
              res.classification,
              'ALLOWED',
              `Lista válida de 12 ${target} (${acc.accountType}, ${op}) falló con ${res.classification}: ${res.fullError}`
            );
          });

          for (const badIndex of [10, 11, 5] as const) {
            const invalidUid = `${acc.prefix}_diag_b22d_2_${short}_idx${badIndex}_${op}`;
            test(`33. Lista ${target} (12 elementos, inválido exclusivamente en índice ${badIndex}) | ${acc.accountType} (${invalidUid}) | ${op}`, async (t) => {
              if (!isEmulatorAvailable || !testEnv) {
                t.skip('Emulador de Firestore no disponible en este entorno');
                return;
              }
              const counts = {
                categories: target === 'categories' ? 12 : 0,
                fixedExpenses: target === 'fixedExpenses' ? 12 : 0,
                variableExpenses: target === 'variableExpenses' ? 12 : 0,
              };
              const payload = buildDiagnosticMonthPayload(invalidUid, '2026-11', 2026, 10, counts);
              mutateInvalidElementAt(target, payload, badIndex);

              const res = await executeDiagnosticMonthWrite(
                testEnv,
                acc.accountType,
                invalidUid,
                op,
                '2026-11',
                2026,
                10,
                payload
              );

              if (res.classification === 'CEL_EXPRESSION_LIMIT') {
                assert.fail(
                  `[PRUEBA INCONCLUSA POR LÍMITE CEL] ${target}[${badIndex}] (${acc.accountType}, ${op}) fue rechazado por superar 1000 expresiones CEL y NO demuestra validación del elemento inválido: ${res.fullError}`
                );
              }

              assert.equal(
                res.classification,
                'SECURITY_VALIDATION_DENIED',
                `[BRECHA DE VALIDACIÓN] ${target}[${badIndex}] (${acc.accountType}, ${op}) obtuvo ${res.classification} en lugar de SECURITY_VALIDATION_DENIED: ${res.fullError}`
              );
            });
          }
        }
      }
    }
  });

  describe('B-2.2D (3) — Controles de seguridad invariantes en meses y listas', () => {
    test('34. Rechazo estricto de createdAt: null, updatedAt: null y claves desconocidas en elementos de mes -> DENEGADO', async (t) => {
      if (!isEmulatorAvailable || !testEnv) {
        t.skip('Emulador de Firestore no disponible en este entorno');
        return;
      }
      const uid = 'usr_sec_ctrl_b22d1';
      const db = await setupAuthenticatedMonthContext(testEnv, 'usr_', uid);

      const cases: Array<{ monthKey: string; monthIdx: number; patch: Record<string, unknown> }> = [
        { monthKey: '2026-01', monthIdx: 0, patch: { createdAt: null } },
        { monthKey: '2026-02', monthIdx: 1, patch: { updatedAt: null } },
        {
          monthKey: '2026-03',
          monthIdx: 2,
          patch: { categories: [{ id: 'cat1', label: 'Comida', color: '#10b981', unknownKey: 'x' }] },
        },
        {
          monthKey: '2026-04',
          monthIdx: 3,
          patch: { fixedExpenses: [{ id: 'f1', name: 'Alquiler', amount: 1000, category: 'cat1', isPaid: true, extra: 1 }] },
        },
        {
          monthKey: '2026-05',
          monthIdx: 4,
          patch: { variableExpenses: [{ id: 'v1', date: '2026-05-01', description: 'Café', amount: 500, category: 'cat1', extra: 1 }] },
        },
      ];

      for (const c of cases) {
        await assertMonthDocAbsentBeforeCreate(testEnv, uid, c.monthKey);
        const base = buildValidMonthPayload(uid, c.monthKey, 2026, c.monthIdx);
        const res = classifyRuleError(
          await setDoc(doc(db, 'users', uid, 'months', c.monthKey), {
            ...base,
            ...c.patch,
          }).catch((e) => e)
        );
        assert.equal(res.classification, 'SECURITY_VALIDATION_DENIED', res.fullError);
      }
    });

    test('35. Límites máximos de listas (101 categorías, 301 fijos, 1501 variables) e inmutabilidad en update de mes -> DENEGADO', async (t) => {
      if (!isEmulatorAvailable || !testEnv) {
        t.skip('Emulador de Firestore no disponible en este entorno');
        return;
      }
      const uid = 'usr_limits_ctrl_b22d1';
      const db = await setupAuthenticatedMonthContext(testEnv, 'usr_', uid);

      await assertMonthDocAbsentBeforeCreate(testEnv, uid, '2026-06');
      const overCat = buildDiagnosticMonthPayload(uid, '2026-06', 2026, 5, {
        categories: 101,
        fixedExpenses: 0,
        variableExpenses: 0,
      });
      assert.equal(
        classifyRuleError(await setDoc(doc(db, 'users', uid, 'months', '2026-06'), overCat).catch((e) => e))
          .classification,
        'SECURITY_VALIDATION_DENIED'
      );

      await assertMonthDocAbsentBeforeCreate(testEnv, uid, '2026-07');
      const overFixed = buildDiagnosticMonthPayload(uid, '2026-07', 2026, 6, {
        categories: 0,
        fixedExpenses: 301,
        variableExpenses: 0,
      });
      assert.equal(
        classifyRuleError(await setDoc(doc(db, 'users', uid, 'months', '2026-07'), overFixed).catch((e) => e))
          .classification,
        'SECURITY_VALIDATION_DENIED'
      );

      await assertMonthDocAbsentBeforeCreate(testEnv, uid, '2026-08');
      const overVar = buildDiagnosticMonthPayload(uid, '2026-08', 2026, 7, {
        categories: 0,
        fixedExpenses: 0,
        variableExpenses: 1501,
      });
      assert.equal(
        classifyRuleError(await setDoc(doc(db, 'users', uid, 'months', '2026-08'), overVar).catch((e) => e))
          .classification,
        'SECURITY_VALIDATION_DENIED'
      );

      // Inmutabilidad de createdAt, userId y monthKey en update mensual (ruta distinta sembrada previamente)
      await seedBaselineMonthForUpdate(testEnv, uid, '2026-09', 2026, 8);
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const seededSnap = await getDoc(doc(ctx.firestore(), 'users', uid, 'months', '2026-09'));
        assert.equal(seededSnap.exists(), true);
      });
      for (const patch of [
        { createdAt: '2027-01-01T00:00:00.000Z' },
        { userId: 'usr_otro' },
        { monthKey: '2026-12' },
      ]) {
        const res = classifyRuleError(
          await updateDoc(doc(db, 'users', uid, 'months', '2026-09'), {
            ...patch,
            updatedAt: new Date().toISOString(),
          }).catch((e) => e)
        );
        assert.equal(res.classification, 'SECURITY_VALIDATION_DENIED', res.fullError);
      }
    });
  });

  describe('B-2.2E — Diagnóstico de umbral CEL aislando cardinalidad de categories', () => {
    const accounts: Array<{ accountType: AccountKind; prefix: string }> = [
      { accountType: 'google', prefix: 'google' },
      { accountType: 'usr_', prefix: 'usr' },
    ];
    const operations: WriteOperationKind[] = ['create', 'update'];

    for (const categoryCount of Array.from({ length: 13 }, (_, index) => index)) {
      for (const acc of accounts) {
        for (const op of operations) {
          const uniqueUid = `${acc.prefix}_cel_threshold_c${categoryCount}_${op}`;
          test(`36. Umbral CEL categories=${categoryCount} | ${acc.accountType} | ${op}`, async (t) => {
            if (!isEmulatorAvailable || !testEnv) {
              t.skip('Emulador de Firestore no disponible en este entorno');
              return;
            }

            const payload = buildDiagnosticMonthPayload(uniqueUid, '2026-12', 2026, 11, {
              categories: categoryCount,
              fixedExpenses: 0,
              variableExpenses: 0,
            });

            const res = await executeDiagnosticMonthWrite(
              testEnv,
              acc.accountType,
              uniqueUid,
              op,
              '2026-12',
              2026,
              11,
              payload
            );

            // Diagnóstico observacional: ALLOWED, CEL_EXPRESSION_LIMIT o
            // SECURITY_VALIDATION_DENIED se registran sin ocultar el resultado.
            assert.ok(
              ['ALLOWED', 'CEL_EXPRESSION_LIMIT', 'SECURITY_VALIDATION_DENIED', 'OTHER_ERROR'].includes(res.classification),
              `Clasificación diagnóstica inesperada: ${res.classification}`
            );
          });
        }
      }
    }
  });
});
