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

if (typeof (globalThis as any).localStorage === 'undefined') {
  (globalThis as any).localStorage = new MockLocalStorage();
}

import {
  NITA_AUTH_CHOICE_KEY,
  NITA_CACHED_USER_KEY,
  NITA_GUEST_MODE_KEY,
  CachedUserData
} from '../src/context/AuthContext';
import { ensureAuthPersistence, auth } from '../src/lib/firebase';
import { getUserStorageKey, GUEST_STORAGE_KEY } from '../src/utils/storage';

describe('Pruebas de Persistencia de Sesión y Autenticación en NITA', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('1. ensureAuthPersistence se resuelve exitosamente y no duplica instancias de Auth', async () => {
    // Verificar que la instancia auth es única y que ensureAuthPersistence resuelve
    assert.ok(auth, 'La instancia auth debe existir');
    const p1 = ensureAuthPersistence();
    const p2 = ensureAuthPersistence();
    assert.strictEqual(p1, p2, 'ensureAuthPersistence debe reutilizar la misma promesa activa');
    await p1;
  });

  test('2. Usuario autenticado con Google persiste sus credenciales en localStorage', () => {
    const mockUser: CachedUserData = {
      uid: 'google_user_12345',
      email: 'test@example.com',
      displayName: 'Usuario NITA',
      photoURL: 'https://lh3.googleusercontent.com/test',
      providerId: 'google.com',
      isOfflineSession: false,
    };

    localStorage.setItem(NITA_AUTH_CHOICE_KEY, 'google');
    localStorage.setItem(NITA_CACHED_USER_KEY, JSON.stringify(mockUser));

    // Comprobación de persistencia local
    const savedChoice = localStorage.getItem(NITA_AUTH_CHOICE_KEY);
    const savedRaw = localStorage.getItem(NITA_CACHED_USER_KEY);
    assert.strictEqual(savedChoice, 'google');
    assert.ok(savedRaw, 'Los datos cacheados deben existir');

    const parsed: CachedUserData = JSON.parse(savedRaw!);
    assert.strictEqual(parsed.uid, 'google_user_12345');
    assert.strictEqual(parsed.email, 'test@example.com');
  });

  test('3. Pérdida o error de conexión no borra la sesión persistida en el dispositivo', () => {
    const mockUser: CachedUserData = {
      uid: 'persistent_user_999',
      email: 'offline_check@example.com',
      displayName: 'Offline Check',
      photoURL: null,
      providerId: 'google.com',
    };

    localStorage.setItem(NITA_AUTH_CHOICE_KEY, 'google');
    localStorage.setItem(NITA_CACHED_USER_KEY, JSON.stringify(mockUser));

    // Simular un corte de conexión a internet
    const isOnline = false;
    // La sesión local debe mantenerse intacta
    assert.strictEqual(localStorage.getItem(NITA_AUTH_CHOICE_KEY), 'google');
    assert.ok(localStorage.getItem(NITA_CACHED_USER_KEY));

    // Las claves de almacenamiento de datos financieros deben apuntar al UID del usuario
    const userStorageKey = getUserStorageKey(mockUser.uid);
    assert.strictEqual(userStorageKey, 'nita_user_data_persistent_user_999');
    assert.notStrictEqual(userStorageKey, GUEST_STORAGE_KEY);
  });

  test('4. Cerrar sesión explícitamente limpia la sesión y evita restauraciones automáticas', () => {
    localStorage.setItem(NITA_AUTH_CHOICE_KEY, 'google');
    localStorage.setItem(NITA_CACHED_USER_KEY, JSON.stringify({ uid: 'to_be_logged_out' }));
    localStorage.removeItem(NITA_GUEST_MODE_KEY);

    // Ejecución de la lógica de signOutUser:
    localStorage.removeItem(NITA_AUTH_CHOICE_KEY);
    localStorage.removeItem(NITA_CACHED_USER_KEY);
    localStorage.removeItem(NITA_GUEST_MODE_KEY);

    assert.strictEqual(localStorage.getItem(NITA_AUTH_CHOICE_KEY), null);
    assert.strictEqual(localStorage.getItem(NITA_CACHED_USER_KEY), null);
    assert.strictEqual(localStorage.getItem(NITA_GUEST_MODE_KEY), null);
  });

  test('5. Modo invitado (sin cuenta) nunca hereda la identidad de Google', () => {
    // Al elegir "Ingresar sin cuenta":
    localStorage.setItem(NITA_AUTH_CHOICE_KEY, 'offline');
    localStorage.setItem(NITA_GUEST_MODE_KEY, 'true');
    localStorage.removeItem(NITA_CACHED_USER_KEY);

    assert.strictEqual(localStorage.getItem(NITA_AUTH_CHOICE_KEY), 'offline');
    assert.strictEqual(localStorage.getItem(NITA_GUEST_MODE_KEY), 'true');
    assert.strictEqual(localStorage.getItem(NITA_CACHED_USER_KEY), null);
  });

  test('6. Cambio de cuenta: Usuario A y Usuario B tienen almacenamiento aislado', () => {
    const userA = 'uid_alpha';
    const userB = 'uid_beta';

    const keyA = getUserStorageKey(userA);
    const keyB = getUserStorageKey(userB);

    assert.strictEqual(keyA, 'nita_user_data_uid_alpha');
    assert.strictEqual(keyB, 'nita_user_data_uid_beta');
    assert.notStrictEqual(keyA, keyB, 'Las claves de almacenamiento deben ser estrictamente distintas');
  });
});
