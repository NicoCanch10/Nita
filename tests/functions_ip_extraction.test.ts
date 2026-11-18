import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { extractClientIp } from '../functions/src/index.ts';

describe('NITA Backend Etapa 2A.1.1 — Pruebas Unitarias de Extracción Confiable de IP (Corrección E)', () => {
  test('1. Prioriza rawRequest.ip sobre cualquier x-forwarded-for spoofeado por el cliente', () => {
    const ip = extractClientIp({
      rawRequest: {
        ip: '198.51.100.24',
        headers: {
          'x-forwarded-for': '203.0.113.99, 10.0.0.1',
        },
        socket: {
          remoteAddress: '10.0.0.2',
        },
      },
    });
    assert.equal(ip, '198.51.100.24');
  });

  test('2. Normaliza direcciones IPv4 mapeadas en IPv6 (::ffff:x.x.x.x) y conserva IPv6 nativo', () => {
    assert.equal(
      extractClientIp({
        rawRequest: {
          ip: '::ffff:127.0.0.1',
        },
      }),
      '127.0.0.1'
    );

    assert.equal(
      extractClientIp({
        rawRequest: {
          ip: ' 2001:db8:85a3::8a2e:370:7334 ',
        },
      }),
      '2001:db8:85a3::8a2e:370:7334'
    );
  });

  test('3. Usa socket.remoteAddress como respaldo únicamente si falta rawRequest.ip e ignora x-forwarded-for', () => {
    const ip = extractClientIp({
      rawRequest: {
        ip: '   ',
        headers: {
          'x-forwarded-for': '1.2.3.4',
        },
        socket: {
          remoteAddress: '::ffff:192.0.2.55',
        },
      },
    });
    assert.equal(ip, '192.0.2.55');
  });

  test('4. Devuelve "unknown" si faltan rawRequest.ip y socket.remoteAddress, incluso con x-forwarded-for presente', () => {
    assert.equal(
      extractClientIp({
        rawRequest: {
          headers: {
            'x-forwarded-for': '8.8.8.8',
          },
        },
      }),
      'unknown'
    );

    assert.equal(extractClientIp({}), 'unknown');
    assert.equal(extractClientIp({ rawRequest: undefined }), 'unknown');
  });

  test('5. Acota longitud máxima de IP a 128 caracteres y rechaza valores no string', () => {
    const oversized = 'a'.repeat(300);
    const extracted = extractClientIp({
      rawRequest: {
        ip: oversized,
      },
    });
    assert.equal(extracted.length, 128);

    assert.equal(
      extractClientIp({
        rawRequest: {
          ip: 12345,
          socket: { remoteAddress: null },
        },
      }),
      'unknown'
    );
  });
});
