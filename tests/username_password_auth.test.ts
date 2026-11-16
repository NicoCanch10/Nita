import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { 
  validateUsernameFormat, 
  validatePasswordFormat, 
  generateSalt, 
  hashPassword,
  registerUserAccount,
  signInUserAccount,
  isUsernameTaken,
  saveLocalAccount,
  getLocalAccounts
} from '../src/services/authAccountService.ts';

// Mock localStorage for Node test runner
const mockStorage: Record<string, string> = {};
(globalThis as any).window = globalThis;
(globalThis as any).localStorage = {
  getItem: (k: string) => mockStorage[k] || null,
  setItem: (k: string, v: string) => { mockStorage[k] = String(v); },
  removeItem: (k: string) => { delete mockStorage[k]; },
  clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }
};
Object.defineProperty(globalThis, 'navigator', {
  value: { onLine: false },
  writable: true,
  configurable: true,
});

describe('NITA — Autenticación con Usuario y Contraseña', () => {

  test('Validación de formato de nombre de usuario', () => {
    // Casos válidos
    assert.equal(validateUsernameFormat('nicolas').valid, true);
    assert.equal(validateUsernameFormat('user_123').valid, true);
    assert.equal(validateUsernameFormat('juan.perez').valid, true);
    assert.equal(validateUsernameFormat('ana-maria').valid, true);

    // Casos inválidos
    assert.equal(validateUsernameFormat('').valid, false);
    assert.equal(validateUsernameFormat('ab').valid, false); // < 3 chars
    assert.equal(validateUsernameFormat('a'.repeat(26)).valid, false); // > 25 chars
    assert.equal(validateUsernameFormat('usuario con espacios').valid, false);
    assert.equal(validateUsernameFormat('user@email').valid, false);
    assert.equal(validateUsernameFormat('user#special!').valid, false);
  });

  test('Validación de formato de contraseña', () => {
    // Casos válidos
    assert.equal(validatePasswordFormat('123456').valid, true);
    assert.equal(validatePasswordFormat('miClaveSegura2026').valid, true);

    // Casos inválidos
    assert.equal(validatePasswordFormat('').valid, false);
    assert.equal(validatePasswordFormat('12345').valid, false); // < 6 chars
  });

  test('Cifrado criptográfico de contraseñas con Salt único', async () => {
    const salt1 = generateSalt();
    const salt2 = generateSalt();
    assert.notEqual(salt1, salt2);

    const hash1 = await hashPassword('miPassword123', salt1);
    const hash2 = await hashPassword('miPassword123', salt2);
    // Mismo password con diferente salt debe dar diferente hash
    assert.notEqual(hash1, hash2);

    // Mismo password con mismo salt debe ser reproducible
    const hashReprod = await hashPassword('miPassword123', salt1);
    assert.equal(hash1, hashReprod);
  });

  test('Detección y prevención estricta de nombres de usuario repetidos (case-insensitive)', async () => {
    const username = 'MartinGomez';
    const password = 'claveSegura123';

    // 1. Registro inicial
    const user = await registerUserAccount(username, password);
    assert.equal(user.displayName, username);
    assert.equal(user.uid, 'usr_martingomez');

    // 2. Verificar que isUsernameTaken detecta el usuario tomado tanto en mayúsculas como en minúsculas
    const takenLower = await isUsernameTaken('martingomez');
    const takenUpper = await isUsernameTaken('MARTINGOMEZ');
    const takenMixed = await isUsernameTaken('MartinGomez');
    assert.equal(takenLower, true);
    assert.equal(takenUpper, true);
    assert.equal(takenMixed, true);

    // 3. Intento de re-registro con el mismo nombre debe fallar lanzando error explícito
    await assert.rejects(
      async () => {
        await registerUserAccount('martingomez', 'otraClave456');
      },
      /ya está en uso/
    );

    await assert.rejects(
      async () => {
        await registerUserAccount('MARTINGOMEZ', 'otraClave789');
      },
      /ya está en uso/
    );
  });

  test('Inicio de sesión exitoso con credenciales correctas', async () => {
    const username = 'laura_finanzas';
    const password = 'claveCorrecta2026';

    await registerUserAccount(username, password);

    // Login correcto
    const loggedInUser = await signInUserAccount(username, password);
    assert.equal(loggedInUser.displayName, username);
    assert.equal(loggedInUser.uid, 'usr_laura_finanzas');
  });

  test('Rechazo de inicio de sesión ante contraseña errónea o usuario inexistente', async () => {
    // Usuario no registrado
    await assert.rejects(
      async () => {
        await signInUserAccount('usuario_que_no_existe', 'cualquierClave');
      },
      /no está registrado/
    );

    // Contraseña equivocada
    await assert.rejects(
      async () => {
        await signInUserAccount('laura_finanzas', 'contraseñaIncorrecta');
      },
      /contraseña ingresada es incorrecta/
    );
  });

  test('Persistencia de sesión entre recargas y reinicios de la aplicación', async () => {
    const sessionRaw = localStorage.getItem('nita_active_user_session');
    assert.ok(sessionRaw, 'Debe existir una sesión activa guardada en localStorage');
    const session = JSON.parse(sessionRaw!);
    assert.equal(session.uid, 'usr_laura_finanzas');
    assert.equal(session.displayName, 'laura_finanzas');
    assert.equal(localStorage.getItem('nita_auth_choice'), 'password');
  });
});
