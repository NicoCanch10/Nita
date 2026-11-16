import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { APP_VERSION, getNextAppVersion, isValidAppVersion } from '../src/utils/version';

describe('NITA — Numeración de Versiones', () => {
  test('La versión activa cumple el formato válido X.Y.Z con segmentos 1..9', () => {
    assert.equal(isValidAppVersion(APP_VERSION), true, `APP_VERSION "${APP_VERSION}" debe ser válida`);
    assert.equal(isValidAppVersion('1.1.0'), false);
    assert.equal(isValidAppVersion('1.1.10'), false);
  });

  test('Secuencia exacta: 1.1.1 -> 1.1.9 -> 1.2.1 y salto 1.9.9 -> 2.1.1', () => {
    const expectedSequence = [
      '1.1.1',
      '1.1.2',
      '1.1.3',
      '1.1.4',
      '1.1.5',
      '1.1.6',
      '1.1.7',
      '1.1.8',
      '1.1.9',
      '1.2.1',
    ];

    let v = '1.1.1';
    const generated = [v];
    for (let i = 1; i < expectedSequence.length; i++) {
      v = getNextAppVersion(v);
      generated.push(v);
    }

    assert.deepEqual(generated, expectedSequence);
    assert.equal(getNextAppVersion('1.2.9'), '1.3.1');
    assert.equal(getNextAppVersion('1.9.9'), '2.1.1');

    // Al avanzar desde la versión actual siempre produce una versión válida y distinta
    const nextFromCurrent = getNextAppVersion(APP_VERSION);
    assert.equal(isValidAppVersion(nextFromCurrent), true);
    assert.notEqual(nextFromCurrent, APP_VERSION);
  });
});
