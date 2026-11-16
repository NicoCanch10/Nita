import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { APP_VERSION, getNextAppVersion } from '../src/utils/version';

describe('NITA — Numeración de Versiones', () => {
  test('La versión inicial actual es 1.1.1', () => {
    assert.equal(APP_VERSION, '1.1.1');
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

    let v = APP_VERSION;
    const generated = [v];
    for (let i = 1; i < expectedSequence.length; i++) {
      v = getNextAppVersion(v);
      generated.push(v);
    }

    assert.deepEqual(generated, expectedSequence);
    assert.equal(getNextAppVersion('1.2.9'), '1.3.1');
    assert.equal(getNextAppVersion('1.9.9'), '2.1.1');
  });
});
