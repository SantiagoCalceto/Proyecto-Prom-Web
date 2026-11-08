// Pruebas unitarias: enrutador y utilidades HTTP (src/http.js)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Router, parseCookies, HttpError, fail, SECURITY_HEADERS } from '../../src/http.js';

describe('Router', () => {
  const r = new Router();
  const h = () => 'ok';
  r.get('/api/citas', h);
  r.post('/api/citas', h);
  r.get('/api/citas/:id', h);
  r.post('/api/citas/:id/cancelar', h);

  test('encuentra una ruta exacta', () => {
    const m = r.match('GET', '/api/citas');
    assert.ok(m.route);
    assert.deepEqual(m.params, {});
  });
  test('extrae parámetros de la ruta', () => {
    assert.deepEqual(r.match('POST', '/api/citas/42/cancelar').params, { id: '42' });
  });
  test('decodifica parámetros con caracteres especiales', () => {
    assert.deepEqual(r.match('GET', '/api/citas/a%20b').params, { id: 'a b' });
  });
  test('acepta barra final', () => {
    assert.ok(r.match('GET', '/api/citas/').route);
  });
  test('distingue método no permitido de ruta inexistente', () => {
    assert.deepEqual(r.match('DELETE', '/api/citas'), { notAllowed: true });
    assert.equal(r.match('GET', '/api/no-existe'), null);
  });
  test('no confunde segmentos (un parámetro no atraviesa "/")', () => {
    assert.equal(r.match('GET', '/api/citas/1/2'), null);
  });
});

describe('parseCookies', () => {
  test('lee varias cookies y decodifica valores', () => {
    assert.deepEqual(parseCookies('nms=abc123; tema=oscuro; nombre=Ana%20Mar%C3%ADa'), { nms: 'abc123', tema: 'oscuro', nombre: 'Ana María' });
  });
  test('tolera cabecera vacía o ausente', () => {
    assert.deepEqual(parseCookies(''), {});
    assert.deepEqual(parseCookies(undefined), {});
  });
  test('conserva "=" dentro del valor', () => {
    assert.deepEqual(parseCookies('t=a=b=c'), { t: 'a=b=c' });
  });
});

describe('errores HTTP', () => {
  test('fail lanza HttpError con estado, mensaje y campos', () => {
    assert.throws(() => fail(422, 'Revisa los campos.', { email: 'Correo inválido' }), (e) =>
      e instanceof HttpError && e.status === 422 && e.message === 'Revisa los campos.' && e.fields.email === 'Correo inválido');
  });
});

describe('cabeceras de seguridad', () => {
  test('incluyen CSP sin scripts en línea y protección de tipo MIME', () => {
    assert.match(SECURITY_HEADERS['Content-Security-Policy'], /script-src 'self'(;|$)/);
    assert.doesNotMatch(SECURITY_HEADERS['Content-Security-Policy'], /script-src[^;]*unsafe-inline/);
    assert.equal(SECURITY_HEADERS['X-Content-Type-Options'], 'nosniff');
  });
});
