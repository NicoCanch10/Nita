import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateUsernameFormat,
  validatePasswordFormat,
  registerUserAccount,
  signInUserAccount,
  changeUserPassword,
  saveActiveSession,
  getActiveSession,
  mapAuthBackendError,
  AuthFlowError,
  MAX_PASSWORD_LENGTH,
  type AuthAccountDeps,
} from '../src/services/authAccountService.ts';

// Mock localStorage for Node test runner
const mockStorage: Record<string, string> = {};
(globalThis as any).window = globalThis;
(globalThis as any).localStorage = {
  getItem: (k: string) => (k in mockStorage ? mockStorage[k] : null),
  setItem: (k: string, v: string) => {
    mockStorage[k] = String(v);
  },
  removeItem: (k: string) => {
    delete mockStorage[k];
  },
  clear: () => {
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
  },
};

function createMockAuthDeps(options?: {
  online?: boolean;
  uid?: string | null;
  claims?: Record<string, unknown>;
  callableHandler?: (name: string, payload: unknown) => Promise<unknown>;
}): { deps: AuthAccountDeps; getCurrentUid: () => string | null; callableCalls: Array<{ name: string; payload: unknown }> } {
  let currentUid: string | null = options?.uid || null;
  let currentClaims: Record<string, unknown> = options?.claims || {
    provider: 'nita_password',
    sessionEpoch: 1,
  };
  const callableCalls: Array<{ name: string; payload: unknown }> = [];

  const mockUserFor = (uid: string) => ({
    uid,
    displayName: null,
    getIdTokenResult: async () => ({
      claims: currentClaims,
    }),
  });

  const fakeAuth = {
    get currentUser() {
      return currentUid ? mockUserFor(currentUid) : null;
    },
    async signInWithCustomToken(_token: string) {
      return { user: mockUserFor(currentUid || 'usr_unknown') };
    },
    async signOut() {
      currentUid = null;
    },
  };

  // Monkey-patch modular firebase/auth expectations by exposing compatible Auth shape if used via deps,
  // Note: registerUserAccount/signInUserAccount/changeUserPassword call firebase/auth signInWithCustomToken(targetAuth, token).
  // In Firebase SDK v13 modular, signInWithCustomToken expects a real Auth object or we test real Auth against the Emulator
  // in tests/frontend_auth_integration.test.ts. Here we focus unit checks on validation, error mapping, storage hygiene, and offline guards.
  return {
    deps: {
      authInstance: fakeAuth as any,
      isOnlineFn: () => options?.online ?? true,
      callableInvoker: async (name, payload) => {
        callableCalls.push({ name, payload });
        if (options?.callableHandler) {
          return (await options.callableHandler(name, payload)) as any;
        }
        return {} as any;
      },
    },
    getCurrentUid: () => currentUid,
    callableCalls,
  };
}

describe('NITA — Validación, Higiene Local y Mapeo de Errores Auth (Etapa 2A.2)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('Validación de formato de nombre de usuario', () => {
    assert.equal(validateUsernameFormat('nicolas').valid, true);
    assert.equal(validateUsernameFormat('user_123').valid, true);
    assert.equal(validateUsernameFormat('juan.perez').valid, true);
    assert.equal(validateUsernameFormat('ana-maria').valid, true);

    assert.equal(validateUsernameFormat('').valid, false);
    assert.equal(validateUsernameFormat('ab').valid, false);
    assert.equal(validateUsernameFormat('a'.repeat(26)).valid, false);
    assert.equal(validateUsernameFormat('usuario con espacios').valid, false);
    assert.equal(validateUsernameFormat('user@email').valid, false);
    assert.equal(validateUsernameFormat('user#special!').valid, false);
  });

  test('Validación de formato de contraseña (mínimo 6 y máximo 1024)', () => {
    assert.equal(validatePasswordFormat('123456').valid, true);
    assert.equal(validatePasswordFormat('miClaveSegura2026').valid, true);
    assert.equal(validatePasswordFormat('x'.repeat(MAX_PASSWORD_LENGTH)).valid, true);

    assert.equal(validatePasswordFormat('').valid, false);
    assert.equal(validatePasswordFormat('12345').valid, false);
    assert.equal(validatePasswordFormat('x'.repeat(MAX_PASSWORD_LENGTH + 1)).valid, false);
  });

  test('saveActiveSession guarda solo metadatos no sensibles y elimina nita_registered_accounts heredado', () => {
    localStorage.setItem(
      'nita_registered_accounts',
      JSON.stringify({ demo: { passwordHash: 'secret_sha256', salt: 'salt_123' } })
    );

    saveActiveSession({
      uid: 'usr_demo',
      displayName: 'Demo',
      email: null,
      photoURL: null,
      providerId: 'password',
      sessionEpoch: 2,
    });

    assert.equal(localStorage.getItem('nita_registered_accounts'), null, 'Debe limpiar caché heredado con hashes/salts');
    assert.equal(localStorage.getItem('nita_auth_choice'), 'password');

    const stored = getActiveSession();
    assert.equal(stored?.uid, 'usr_demo');
    assert.equal(stored?.displayName, 'Demo');
    assert.equal(stored?.sessionEpoch, 2);

    const serialized = JSON.stringify(stored);
    assert.equal(serialized.includes('passwordHash'), false);
    assert.equal(serialized.includes('salt'), false);
    assert.equal(serialized.includes('customToken'), false);
  });

  test('Bloquea registro e inicio de sesión cuando el dispositivo está offline sin invocar Cloud Functions', async () => {
    const { deps, callableCalls } = createMockAuthDeps({ online: false });

    await assert.rejects(
      async () => registerUserAccount('MartinGomez', 'claveSegura123', deps),
      (err: unknown) => {
        assert.ok(err instanceof AuthFlowError);
        assert.equal(err.isOfflineOrNetwork, true);
        assert.match(err.message, /conexión a internet/i);
        return true;
      }
    );

    await assert.rejects(
      async () => signInUserAccount('MartinGomez', 'claveSegura123', deps),
      (err: unknown) => {
        assert.ok(err instanceof AuthFlowError);
        assert.equal(err.isOfflineOrNetwork, true);
        assert.match(err.message, /conexión a internet/i);
        return true;
      }
    );

    assert.equal(callableCalls.length, 0, 'No debe invocar callables si el dispositivo está offline');
    assert.equal(localStorage.getItem('nita_active_user_session'), null, 'Nunca debe crear sesión falsa offline');
  });

  test('changeUserPassword rechaza si no hay sesión usr_* activa en Auth', async () => {
    const { deps } = createMockAuthDeps({ online: true, uid: null });

    await assert.rejects(
      async () => changeUserPassword('claveActual123', 'claveNueva456', deps),
      (err: unknown) => {
        assert.ok(err instanceof AuthFlowError);
        assert.equal(err.isSessionRevoked, true);
        return true;
      }
    );
  });

  test('Mapeo completo de errores de backend/Auth en español sin filtrar hashes, salts, tokens ni stack traces', () => {
    const cases: Array<{
      raw: { code?: string; message: string };
      op: 'register' | 'signin' | 'change_password';
      expectedMatch: RegExp;
      expectRevoked?: boolean;
      expectOffline?: boolean;
    }> = [
      {
        raw: { code: 'functions/already-exists', message: 'Duplicate' },
        op: 'register',
        expectedMatch: /ya está en uso/i,
      },
      {
        raw: { code: 'functions/unauthenticated', message: 'Usuario o contraseña incorrectos' },
        op: 'signin',
        expectedMatch: /incorrectos/i,
      },
      {
        raw: { code: 'functions/unauthenticated', message: 'La contraseña actual ingresada es incorrecta.' },
        op: 'change_password',
        expectedMatch: /contraseña actual ingresada es incorrecta/i,
        expectRevoked: false,
      },
      {
        raw: { code: 'functions/unauthenticated', message: 'Tu sesión actual fue revocada o es obsoleta.' },
        op: 'change_password',
        expectedMatch: /revocada o expiró/i,
        expectRevoked: true,
      },
      {
        raw: { code: 'functions/resource-exhausted', message: 'Too many requests' },
        op: 'signin',
        expectedMatch: /Demasiados intentos/i,
      },
      {
        raw: { code: 'functions/failed-precondition', message: 'userSecurity missing' },
        op: 'signin',
        expectedMatch: /inconsistencia de seguridad/i,
      },
      {
        raw: { code: 'functions/permission-denied', message: 'Not nita_password' },
        op: 'change_password',
        expectedMatch: /solo está disponible/i,
      },
      {
        raw: { code: 'auth/invalid-custom-token', message: 'Custom token expired' },
        op: 'signin',
        expectedMatch: /sesión segura con Firebase Authentication/i,
      },
      {
        raw: { code: 'auth/user-token-expired', message: 'Token expired' },
        op: 'change_password',
        expectedMatch: /expiró o fue revocada/i,
        expectRevoked: true,
      },
      {
        raw: { code: 'auth/id-token-revoked', message: 'Revoked' },
        op: 'change_password',
        expectedMatch: /expiró o fue revocada/i,
        expectRevoked: true,
      },
      {
        raw: { code: 'functions/unavailable', message: 'Failed to fetch scrypt token hash' },
        op: 'signin',
        expectedMatch: /conectarnos con el servidor/i,
        expectOffline: true,
      },
      {
        raw: { code: 'auth/network-request-failed', message: 'Network failed' },
        op: 'signin',
        expectedMatch: /conectarnos con el servidor/i,
        expectOffline: true,
      },
      {
        raw: { code: 'functions/internal', message: 'Internal stack trace: scrypt pepper hash leaked' },
        op: 'signin',
        expectedMatch: /No se pudo completar la operación/i,
      },
    ];

    for (const c of cases) {
      const mapped = mapAuthBackendError(Object.assign(new Error(c.raw.message), { code: c.raw.code }), c.op);
      assert.match(mapped.message, c.expectedMatch);
      assert.equal(mapped.isSessionRevoked, Boolean(c.expectRevoked));
      assert.equal(mapped.isOfflineOrNetwork, Boolean(c.expectOffline));
      assert.equal(/hash|salt|pepper|scrypt|customtoken|stack/i.test(mapped.message), false);
    }
  });
});
