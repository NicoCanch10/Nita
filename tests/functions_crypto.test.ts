import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import {
  SCRYPT_PARAMS,
  ScryptConcurrencyLimiter,
  ScryptBusyError,
  InvalidCryptoInputError,
  constantTimeEqualStrings,
  createScryptCredential,
  verifyScryptCredential,
  isValidScryptV1Format,
  detectLegacyHashFormat,
  verifyLegacySha256,
  verifyLegacyFallbackHash,
  verifyLegacyCredential,
} from '../functions/src/crypto.ts';

const TEST_PEPPER = 'test-only-pepper-for-unit-suite-0123456789abcdef';

function legacyJsFallbackDigest(password: string, salt: string): string {
  const input = `${salt}:${password}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return `h_${Math.abs(hash).toString(16)}_${salt}`;
}

function legacySha256Digest(password: string, salt: string): string {
  return crypto
    .createHash('sha256')
    .update(Buffer.from(`${salt}:${password}`, 'utf8'))
    .digest('hex');
}

describe('NITA Backend Etapa 2A.1 — Pruebas Unitarias de Criptografía y Compatibilidad Heredada', () => {
  test('1. Parámetros efectivos de scrypt_v1 cumplen especificación obligatoria', () => {
    assert.equal(SCRYPT_PARAMS.algorithm, 'scrypt_v1');
    assert.equal(SCRYPT_PARAMS.N, 32768);
    assert.equal(SCRYPT_PARAMS.r, 8);
    assert.equal(SCRYPT_PARAMS.p, 1);
    assert.equal(SCRYPT_PARAMS.keylen, 64);
    assert.equal(SCRYPT_PARAMS.saltBytes, 16);
    assert.equal(SCRYPT_PARAMS.maxmem, 64 * 1024 * 1024);
    assert.equal(SCRYPT_PARAMS.maxConcurrent, 2);
  });

  test('2. Generación y verificación scrypt_v1 (salt CSPRNG único, formato versionado y pepper requerido)', async () => {
    const cred1 = await createScryptCredential('ClaveSegura#2026', TEST_PEPPER);
    const cred2 = await createScryptCredential('ClaveSegura#2026', TEST_PEPPER);

    assert.equal(cred1.kdfVersion, 'scrypt_v1');
    assert.equal(cred1.salt.length, 32);
    assert.notEqual(cred1.salt, cred2.salt);
    assert.notEqual(cred1.passwordHash, cred2.passwordHash);
    assert.equal(isValidScryptV1Format(cred1.passwordHash, cred1.salt), true);

    assert.equal(await verifyScryptCredential('ClaveSegura#2026', cred1.passwordHash, cred1.salt, TEST_PEPPER), true);
    assert.equal(await verifyScryptCredential('ClaveIncorrecta', cred1.passwordHash, cred1.salt, TEST_PEPPER), false);
    assert.equal(
      await verifyScryptCredential('ClaveSegura#2026', cred1.passwordHash, cred1.salt, 'otro-pepper-completamente-distinto-999'),
      false
    );

    await assert.rejects(() => createScryptCredential('ClaveSegura#2026', ''), /pepper/);
  });

  test('3. No aplica trim, normalización Unicode ni cambio de mayúsculas en contraseñas', async () => {
    const credSpace = await createScryptCredential(' miClave ', TEST_PEPPER);
    assert.equal(await verifyScryptCredential(' miClave ', credSpace.passwordHash, credSpace.salt, TEST_PEPPER), true);
    assert.equal(await verifyScryptCredential('miClave', credSpace.passwordHash, credSpace.salt, TEST_PEPPER), false);
    assert.equal(await verifyScryptCredential(' MICLAVE ', credSpace.passwordHash, credSpace.salt, TEST_PEPPER), false);

    // Unicode NFC vs NFD (misma apariencia visual, distintos bytes UTF-8)
    const nfc = 'contraseña_única';
    const nfd = nfc.normalize('NFD');
    assert.notEqual(nfc, nfd);
    const credNfc = await createScryptCredential(nfc, TEST_PEPPER);
    assert.equal(await verifyScryptCredential(nfc, credNfc.passwordHash, credNfc.salt, TEST_PEPPER), true);
    assert.equal(await verifyScryptCredential(nfd, credNfc.passwordHash, credNfc.salt, TEST_PEPPER), false);
  });

  test('4. Compatibilidad heredada SHA-256 UTF-8 (correcta, incorrecta, Unicode y emojis)', () => {
    const salt = '0123456789abcdef0123456789abcdef';
    const passwords = ['finanzas2026', '  conEspacios  ', 'C0ntr4señ@🔒🚀🇦🇷'];

    for (const pwd of passwords) {
      const stored = legacySha256Digest(pwd, salt);
      assert.equal(detectLegacyHashFormat(stored, salt), 'sha256');
      assert.equal(verifyLegacySha256(pwd, stored, salt), true);
      assert.equal(verifyLegacySha256(`${pwd}x`, stored, salt), false);
      assert.equal(verifyLegacyCredential(pwd, stored, salt).valid, true);
      assert.equal(verifyLegacyCredential(pwd, stored, salt).format, 'sha256');
    }
  });

  test('5. Compatibilidad heredada fallback h_... (UTF-16 charCodeAt, int32 signed, Unicode y emojis)', () => {
    const salt = 'fedcba9876543210fedcba9876543210';
    const passwords = ['miClave123', 'contraseña🔒', 'zz_negative_hash_probe_999999', 'a_b_c_ñ_€_🚀'];

    for (const pwd of passwords) {
      const stored = legacyJsFallbackDigest(pwd, salt);
      assert.equal(detectLegacyHashFormat(stored, salt), 'legacy_fallback');
      assert.equal(verifyLegacyFallbackHash(pwd, stored, salt), true);
      assert.equal(verifyLegacyFallbackHash(`${pwd}!`, stored, salt), false);
      assert.equal(verifyLegacyCredential(pwd, stored, salt).valid, true);
      assert.equal(verifyLegacyCredential(pwd, stored, salt).format, 'legacy_fallback');
    }
  });

  test('6. Rechazo seguro de hashes malformados, salt ausente, hashes truncados y formatos incompatibles', async () => {
    const validSalt = '0123456789abcdef0123456789abcdef';
    const validSha = legacySha256Digest('clave123', validSalt);

    // Salt ausente o vacío
    assert.equal(detectLegacyHashFormat(validSha, ''), 'malformed');
    assert.equal(detectLegacyHashFormat(validSha, null), 'malformed');
    assert.equal(verifyLegacySha256('clave123', validSha, ''), false);

    // Hash truncado (63 hex en SHA-256, 127 hex en scrypt)
    assert.equal(detectLegacyHashFormat(validSha.slice(0, 63), validSalt), 'malformed');
    assert.equal(verifyLegacySha256('clave123', validSha.slice(0, 63), validSalt), false);
    assert.equal(isValidScryptV1Format(`scrypt_v1$N=32768,r=8,p=1$${validSalt}$${'a'.repeat(127)}`, validSalt), false);

    // Salt en sufijo de h_... no coincide con campo salt
    const fallbackHash = legacyJsFallbackDigest('clave123', validSalt);
    assert.equal(detectLegacyHashFormat(fallbackHash, 'otro_salt_distinto'), 'malformed');
    assert.equal(verifyLegacyFallbackHash('clave123', fallbackHash, 'otro_salt_distinto'), false);

    // Formatos heredados incompatibles (bcrypt, argon2, sha256 en mayúsculas)
    for (const bad of [
      '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234',
      '$argon2id$v=19$m=65536,t=3,p=1$c2FsdA$aGFzaA',
      validSha.toUpperCase(),
      'h_nohex_' + validSalt,
      'texto_cualquiera',
    ]) {
      assert.equal(detectLegacyHashFormat(bad, validSalt), 'malformed');
      assert.equal(verifyLegacyCredential('clave123', bad, validSalt).valid, false);
    }
  });

  test('7. Comparación segura de longitudes variables y contraseñas de longitud extrema', async () => {
    // No debe lanzar RangeError con longitudes distintas
    assert.equal(constantTimeEqualStrings('corto', 'cadena_mucho_mas_larga_1234567890'), false);
    assert.equal(constantTimeEqualStrings('', 'abc'), false);
    assert.equal(constantTimeEqualStrings('igual_🔒', 'igual_🔒'), true);

    // Longitud máxima permitida (1024) y rechazo controlado (> 1024)
    const maxPwd = 'x'.repeat(1024);
    const credMax = await createScryptCredential(maxPwd, TEST_PEPPER);
    assert.equal(await verifyScryptCredential(maxPwd, credMax.passwordHash, credMax.salt, TEST_PEPPER), true);

    const tooLong = 'x'.repeat(1025);
    await assert.rejects(() => createScryptCredential(tooLong, TEST_PEPPER), InvalidCryptoInputError);
    assert.equal(await verifyScryptCredential(tooLong, credMax.passwordHash, credMax.salt, TEST_PEPPER), false);
  });

  test('8. Limitador de concurrencia scrypt: máximo 2 simultáneas y saturación controlada de cola', async () => {
    const limiter = new ScryptConcurrencyLimiter({
      maxConcurrent: 2,
      maxQueueSize: 2,
      queueTimeoutMs: 5000,
    });

    let currentRunning = 0;
    let observedMaxRunning = 0;
    const gateResolvers: Array<() => void> = [];

    const makeSlowTask = (id: number) =>
      limiter.run(
        () =>
          new Promise<number>((resolve) => {
            currentRunning += 1;
            if (currentRunning > observedMaxRunning) {
              observedMaxRunning = currentRunning;
            }
            gateResolvers.push(() => {
              currentRunning -= 1;
              resolve(id);
            });
          })
      );

    // 2 activas + 2 en cola = capacidad máxima (4)
    const p1 = makeSlowTask(1);
    const p2 = makeSlowTask(2);
    const p3 = makeSlowTask(3);
    const p4 = makeSlowTask(4);

    // La 5ta solicitud debe ser rechazada inmediatamente por saturación controlada
    await assert.rejects(() => makeSlowTask(5), ScryptBusyError);

    const statsDuringPeak = limiter.getStats();
    assert.equal(statsDuringPeak.active, 2);
    assert.equal(statsDuringPeak.queued, 2);
    assert.equal(statsDuringPeak.rejectedCount, 1);

    // Liberar tareas gradualmente
    while (gateResolvers.length > 0) {
      const fn = gateResolvers.shift();
      fn?.();
      await new Promise((r) => setTimeout(r, 5));
    }

    const results = await Promise.all([p1, p2, p3, p4]);
    assert.deepEqual(results, [1, 2, 3, 4]);
    assert.equal(observedMaxRunning, 2);
    assert.equal(limiter.getStats().active, 0);
    assert.equal(limiter.getStats().queued, 0);
  });
});
