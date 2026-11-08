// Pruebas unitarias: fechas y horas en hora de Colombia (src/time.js)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ahoraLocal, sumarMinutos, sumarDias, diaSemana, minutos, hhmm, esFecha, esFechaHora, esHora,
} from '../../src/time.js';

describe('ahoraLocal', () => {
  test('convierte UTC a hora de Bogotá (UTC-5)', () => {
    assert.equal(ahoraLocal(new Date('2026-06-15T17:45:00Z')), '2026-06-15T12:45');
  });
  test('cambia de día y de año cuando en UTC ya es el día siguiente', () => {
    assert.equal(ahoraLocal(new Date('2026-01-01T04:30:00Z')), '2025-12-31T23:30');
  });
  test('usa formato de 24 horas', () => {
    assert.equal(ahoraLocal(new Date('2026-03-10T05:05:00Z')), '2026-03-10T00:05');
  });
});

describe('sumarMinutos', () => {
  test('suma dentro del mismo día', () => assert.equal(sumarMinutos('2026-11-09T07:30', 45), '2026-11-09T08:15'));
  test('pasa a medianoche', () => assert.equal(sumarMinutos('2026-11-09T23:40', 30), '2026-11-10T00:10'));
  test('pasa de un mes a otro', () => assert.equal(sumarMinutos('2026-11-30T23:30', 60), '2026-12-01T00:30'));
  test('acepta minutos negativos', () => assert.equal(sumarMinutos('2026-11-09T08:00', -90), '2026-11-09T06:30'));
});

describe('sumarDias', () => {
  test('cambio de año', () => assert.equal(sumarDias('2026-12-31', 1), '2027-01-01'));
  test('febrero de año bisiesto', () => assert.equal(sumarDias('2028-02-28', 1), '2028-02-29'));
  test('febrero de año no bisiesto', () => assert.equal(sumarDias('2026-02-28', 1), '2026-03-01'));
  test('90 días, la ventana máxima para agendar', () => assert.equal(sumarDias('2026-11-08', 90), '2027-02-06'));
});

describe('diaSemana', () => {
  test('0 = domingo … 6 = sábado', () => {
    assert.equal(diaSemana('2026-11-08'), 0); // domingo
    assert.equal(diaSemana('2026-11-09'), 1); // lunes
    assert.equal(diaSemana('2026-11-14'), 6); // sábado
  });
});

describe('minutos y hhmm', () => {
  test('convierten en ambos sentidos', () => {
    assert.equal(minutos('07:30'), 450);
    assert.equal(hhmm(450), '07:30');
    assert.equal(hhmm(minutos('23:59')), '23:59');
    assert.equal(hhmm(0), '00:00');
  });
});

describe('validadores', () => {
  test('esFecha acepta fechas reales y rechaza imposibles', () => {
    assert.equal(esFecha('2026-11-08'), true);
    assert.equal(esFecha('2028-02-29'), true);
    assert.equal(esFecha('2026-02-29'), false);
    assert.equal(esFecha('2026-02-30'), false);
    assert.equal(esFecha('2026-13-01'), false);
    assert.equal(esFecha('08/11/2026'), false);
    assert.equal(esFecha(''), false);
    assert.equal(esFecha(null), false);
  });
  test('esFechaHora exige YYYY-MM-DDTHH:MM válido', () => {
    assert.equal(esFechaHora('2026-11-09T07:30'), true);
    assert.equal(esFechaHora('2026-11-09T24:00'), false);
    assert.equal(esFechaHora('2026-11-09T07:60'), false);
    assert.equal(esFechaHora('2026-11-09 07:30'), false);
    assert.equal(esFechaHora('2026-11-09T07:30:00'), false);
  });
  test('esHora valida HH:MM de 00:00 a 23:59', () => {
    for (const ok of ['00:00', '08:15', '23:59']) assert.equal(esHora(ok), true, ok);
    for (const mal of ['24:00', '7:30', '12:60', 'mediodía', '', undefined]) assert.equal(esHora(mal), false, String(mal));
  });
});
