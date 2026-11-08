// Pruebas unitarias: contraseñas, tokens y límite de intentos (src/auth.js)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword, verifyPassword, sha256, newToken, tempPassword, passwordProblem,
  tooManyAttempts, registerFailure, clearFailures,
} from '../../src/auth.js';

describe('hashPassword / verifyPassword', () => {
  test('el hash usa scrypt y no contiene la contraseña en texto plano', () => {
    const h = hashPassword('Secreta123');
    assert.match(h, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    assert.ok(!h.includes('Secreta123'));
  });

  test('verifica la contraseña correcta', () => {
    const h = hashPassword('Secreta123');
    assert.equal(verifyPassword('Secreta123', h), true);
  });

  test('rechaza una contraseña incorrecta, aunque difiera en una letra', () => {
    const h = hashPassword('Secreta123');
    assert.equal(verifyPassword('secreta123', h), false);
    assert.equal(verifyPassword('Secreta124', h), false);
    assert.equal(verifyPassword('', h), false);
  });

  test('la misma contraseña produce hashes distintos (sal aleatoria)', () => {
    assert.notEqual(hashPassword('Igual1234'), hashPassword('Igual1234'));
  });

  test('un hash mal formado nunca se acepta', () => {
    assert.equal(verifyPassword('x', 'texto-cualquiera'), false);
    assert.equal(verifyPassword('x', 'md5$abc$def'), false);
    assert.equal(verifyPassword('x', ''), false);
    assert.equal(verifyPassword('x', null), false);
  });
});

describe('passwordProblem', () => {
  const casos = [
    ['corta', 'Ab1', /al menos 8/],
    ['sin números', 'abcdefghij', /letras y números/],
    ['sin letras', '1234567890', /letras y números/],
    ['demasiado larga', 'a1'.repeat(65), /demasiado larga/],
    ['no es texto', 12345678, /al menos 8/],
  ];
  for (const [nombre, clave, esperado] of casos) {
    test(`rechaza una contraseña ${nombre}`, () => assert.match(passwordProblem(clave), esperado));
  }
  test('acepta letras con tildes y ñ combinadas con números', () => {
    assert.equal(passwordProblem('Montaña2026'), null);
    assert.equal(passwordProblem('clave1234'), null);
  });
});

describe('tempPassword', () => {
  test('tiene formato XXXXX-XXXXX sin caracteres ambiguos (0, O, 1, l, I)', () => {
    for (let i = 0; i < 200; i++) {
      const p = tempPassword();
      assert.match(p, /^[A-Za-z2-9]{5}-[A-Za-z2-9]{5}$/);
      assert.doesNotMatch(p, /[0O1lI]/);
    }
  });
  test('no se repite', () => {
    const set = new Set(Array.from({ length: 500 }, tempPassword));
    assert.equal(set.size, 500);
  });
});

describe('tokens de sesión', () => {
  test('newToken genera 32 bytes en base64url y son únicos', () => {
    const a = newToken(); const b = newToken();
    assert.match(a, /^[A-Za-z0-9_-]{43}$/);
    assert.notEqual(a, b);
  });
  test('sha256 es determinista', () => {
    assert.equal(sha256('neumoser'), sha256('neumoser'));
    assert.equal(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('límite de intentos de inicio de sesión', () => {
  test('bloquea después de 8 fallos y se libera al limpiar', () => {
    const k = `prueba-${Math.random()}`;
    for (let i = 0; i < 7; i++) registerFailure(k);
    assert.equal(tooManyAttempts(k), false);
    registerFailure(k);
    assert.equal(tooManyAttempts(k), true);
    clearFailures(k);
    assert.equal(tooManyAttempts(k), false);
  });
  test('una clave sin fallos no está bloqueada', () => {
    assert.equal(tooManyAttempts('nunca-fallo'), false);
  });
});
