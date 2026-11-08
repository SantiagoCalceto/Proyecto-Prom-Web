// Prueba de punta a punta (E2E) con Playwright: un navegador real recorre el portal
// como lo harían el administrador, el médico y el paciente.
//
// Arranca su propio servidor en un puerto libre con una base de datos vacía y temporal,
// así que no toca tus datos. Guarda capturas en tests/capturas/.
//
//   npm run test:e2e
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from 'playwright/test';
import { iniciar } from '../../src/app.js';

const CAPTURAS = join(dirname(fileURLToPath(import.meta.url)), '..', 'capturas');
mkdirSync(CAPTURAS, { recursive: true });

const ADMIN = { nombre: 'Laura', apellido: 'Pérez Gómez', documento: '1090111222', email: 'admin@neumoser.co', clave: 'ClaveAdmin2026' };
const MEDICO = { nombre: 'Carlos', apellido: 'Mora Ruiz', documento: '88222333', email: 'cmora@neumoser.co', clave: 'Pulmon2026x' };
const PACIENTE = { nombre: 'Ana María', apellido: 'García León', documento: '1093456789', email: 'ana.garcia@correo.com', clave: 'AnaGarcia2026', tel: '3157778899' };

let app; let dir; let navegador; let page; let BASE; let pdf;
const errores = [];
const est = { claveMedico: '', clavePaciente: '' };

const foto = async (p, nombre, completa = true) => { await p.waitForTimeout(300); await p.screenshot({ path: join(CAPTURAS, `${nombre}.png`), fullPage: completa }); };
const tostada = () => page.locator('.tostada').last();
const vigilar = (p) => {
  p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|status of 4/.test(m.text())) errores.push(m.text()); });
  p.on('pageerror', (e) => errores.push(String(e)));
};
async function ingresar(p, usuario, clave) {
  await p.goto(BASE + '/ingresar');
  await p.getByLabel('Correo o número de documento').fill(usuario);
  await p.locator('#lg-clave').fill(clave);
  await p.getByRole('button', { name: 'Ingresar', exact: true }).click();
}
async function salir(p) {
  await p.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(p).toHaveURL(BASE + '/');
}

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'neumoser-e2e-'));
  app = await iniciar({ dataDir: dir });
  BASE = app.url;
  pdf = join(dir, 'informe.pdf');
  writeFileSync(pdf, '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');
  navegador = await chromium.launch();
  const ctx = await navegador.newContext({ viewport: { width: 1366, height: 860 }, locale: 'es-CO' });
  page = await ctx.newPage();
  vigilar(page);
});

after(async () => {
  await navegador?.close();
  await app?.cerrar();
  rmSync(dir, { recursive: true, force: true });
});

test('1. configuración inicial del portal', async () => {
  await page.goto(BASE + '/');
  await expect(page).toHaveURL(BASE + '/configuracion');
  await page.getByRole('button', { name: 'Crear cuenta y entrar' }).click();
  await expect(page.locator('.error-campo').first()).toBeVisible();
  await foto(page, '01-configuracion-errores');
  await page.getByLabel('Nombres').fill(ADMIN.nombre);
  await page.getByLabel('Apellidos').fill(ADMIN.apellido);
  await page.getByLabel('Número de documento').fill(ADMIN.documento);
  await page.getByLabel('Correo electrónico').fill(ADMIN.email);
  await page.locator('#cf-clave').fill(ADMIN.clave);
  await page.getByRole('button', { name: 'Crear cuenta y entrar' }).click();
  await expect(page).toHaveURL(BASE + '/portal');
  await expect(page.getByText('Crea el primer servicio')).toBeVisible();
  await foto(page, '02-admin-resumen-vacio');
});

test('2. el administrador crea servicios, un médico y los datos de la clínica', async () => {
  await page.getByRole('link', { name: 'Servicios', exact: true }).click();
  await expect(page.getByText('Aún no hay servicios')).toBeVisible();
  for (const [nombre, dur, prep] of [['Espirometría', '30', 'No fumar 4 horas antes.'], ['Rehabilitación pulmonar', '45', 'Ropa cómoda.']]) {
    await page.getByRole('button', { name: 'Nuevo servicio' }).first().click();
    await page.getByLabel('Nombre').fill(nombre);
    await page.getByLabel('Duración de cada cita (minutos)').fill(dur);
    await page.getByLabel('Indicaciones de preparación').fill(prep);
    await page.getByRole('button', { name: 'Crear servicio' }).click();
    await expect(page.locator('.modal')).toHaveCount(0);
  }
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await foto(page, '03-admin-servicios');

  await page.getByRole('link', { name: 'Usuarios', exact: true }).click();
  await page.getByRole('button', { name: 'Nueva cuenta' }).first().click();
  const m = page.locator('.modal');
  await m.getByLabel('Tipo de cuenta').selectOption('medico');
  await m.getByLabel('Nombres').fill(MEDICO.nombre);
  await m.getByLabel('Apellidos').fill(MEDICO.apellido);
  await m.getByLabel('Número de documento').fill(MEDICO.documento);
  await m.getByLabel('Correo').fill(MEDICO.email);
  await m.getByLabel('Registro médico').fill('RM-54321');
  await m.getByText('Espirometría').click();
  await m.getByText('Rehabilitación pulmonar').click();
  await m.getByRole('button', { name: 'Crear cuenta' }).click();
  est.claveMedico = await page.locator('.clave-temporal code').innerText();
  assert.match(est.claveMedico, /^[A-Za-z2-9]{5}-[A-Za-z2-9]{5}$/);
  await foto(page, '04-admin-clave-temporal', false);
  await page.getByRole('button', { name: 'Listo, ya la anoté' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(2);

  await page.getByRole('link', { name: 'Datos de la clínica', exact: true }).click();
  await page.getByLabel('Dirección').fill('Av. 0 # 11-50, Cúcuta');
  await page.getByLabel('Teléfono').fill('(607) 571 0000');
  await page.getByRole('button', { name: 'Guardar datos' }).click();
  await expect(tostada()).toContainText('Datos guardados');
  await salir(page);
});

test('3. el médico cambia su contraseña temporal y publica su horario', async () => {
  await ingresar(page, MEDICO.email, est.claveMedico);
  await expect(page).toHaveURL(BASE + '/cambiar-clave');
  await page.locator('#cc-actual').fill(est.claveMedico);
  await page.locator('#cc-nueva').fill(MEDICO.clave);
  await page.getByLabel('Repite la nueva contraseña').fill(MEDICO.clave);
  await page.getByRole('button', { name: 'Guardar contraseña' }).click();
  await expect(page).toHaveURL(BASE + '/portal');
  await expect(page.getByText('Publica tu horario de atención')).toBeVisible();

  await page.getByRole('link', { name: 'Mi horario', exact: true }).click();
  await expect(page.locator('.dia-horario')).toHaveCount(7);
  for (const d of await page.locator('.dia-horario').all()) {
    await d.getByRole('button', { name: 'Agregar franja' }).click();
    await d.locator('input[type=time]').nth(1).fill('22:00');
    await d.locator('input[type=time]').nth(0).fill('06:00');
  }
  await page.getByRole('button', { name: 'Guardar horario' }).click();
  await expect(tostada()).toContainText('Horario guardado');
  await foto(page, '05-medico-horario');
  await salir(page);
});

test('4. un paciente se registra y agenda una cita', async () => {
  await page.goto(BASE + '/');
  await expect(page.locator('.servicio-fila')).toHaveCount(2);
  await foto(page, '06-inicio-publico');
  await page.getByRole('link', { name: 'Crear mi cuenta de paciente', exact: true }).click();
  await page.getByLabel('Nombres').fill(PACIENTE.nombre);
  await page.getByLabel('Apellidos').fill(PACIENTE.apellido);
  await page.getByLabel('Número de documento').fill(PACIENTE.documento);
  await page.getByLabel('Fecha de nacimiento').fill('1958-03-14');
  await page.getByLabel('Celular').fill(PACIENTE.tel);
  await page.getByLabel('Correo electrónico').fill(PACIENTE.email);
  await page.locator('#rg-clave').fill(PACIENTE.clave);
  await page.getByRole('button', { name: 'Crear mi cuenta' }).click();
  await expect(page.getByText('Debes aceptar la política')).toBeVisible();
  await page.getByText('Autorizo a Neumoser').click();
  await page.getByRole('button', { name: 'Crear mi cuenta' }).click();
  await expect(page).toHaveURL(BASE + '/portal');
  await expect(page.getByText('No tienes citas programadas')).toBeVisible();
  await foto(page, '07-paciente-inicio-vacio');

  for (const [servicio, dia] of [['Espirometría', 1], ['Rehabilitación', 2]]) {
    await page.getByRole('link', { name: 'Mis citas', exact: true }).click();
    await page.getByRole('link', { name: 'Agendar cita', exact: true }).first().click();
    await page.locator('.opcion', { hasText: servicio }).click();
    await page.locator('.opcion', { hasText: 'Carlos' }).click();
    await page.locator('.dia:not([disabled])').nth(dia).click();
    await page.locator('.hora:not([disabled])').nth(3).click();
    if (dia === 1) await foto(page, '08-agendar-calendario');
    await page.getByRole('button', { name: 'Continuar' }).click();
    await page.getByRole('button', { name: 'Agendar cita' }).click();
    await expect(tostada()).toContainText('Cita agendada');
  }
  await expect(page.locator('.item')).toHaveCount(2);

  await page.getByRole('link', { name: 'Inicio', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar asistencia' }).click();
  await expect(tostada()).toContainText('Asistencia confirmada');
  await foto(page, '09-paciente-inicio-con-cita');
  await salir(page);
});

test('5. el médico ve su agenda y carga un resultado', async () => {
  await ingresar(page, MEDICO.documento, MEDICO.clave);
  await page.getByRole('link', { name: 'Agenda', exact: true }).click();
  await expect(page.locator('.item')).toHaveCount(2);
  await foto(page, '10a-medico-agenda');
  await page.locator('.item').first().click();
  await foto(page, '10b-medico-detalle-cita', false);
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'Resultados cargados', exact: true }).click();
  await page.getByRole('link', { name: 'Cargar el primero', exact: true }).click();
  await page.getByLabel('Paciente', { exact: true }).fill('1093');
  await page.locator('.sugerencias button').first().click();
  await page.getByLabel('Nombre del examen').fill('Espirometría con broncodilatador');
  await page.getByLabel('Observaciones para el paciente').fill('Patrón obstructivo leve. Control en 6 meses.');
  await page.locator('#nr-arch').setInputFiles(pdf);
  await foto(page, '10-medico-cargar-resultado');
  await page.getByRole('button', { name: 'Publicar resultado' }).click();
  await expect(tostada()).toContainText('Resultado publicado');
  await salir(page);
});

test('6. el paciente abre y descarga su resultado, reprograma y cancela', async () => {
  await ingresar(page, PACIENTE.email, PACIENTE.clave);
  await expect(page.locator('[data-punto]')).toBeVisible();
  await page.getByRole('link', { name: 'Mis resultados', exact: true }).click();
  await expect(page.locator('.estado-nuevo')).toHaveCount(1);
  await page.locator('.item').first().click();
  await expect(page.locator('.cajon')).toContainText('Patrón obstructivo leve');
  const [descarga] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Descargar' }).click()]);
  assert.equal(descarga.suggestedFilename(), 'informe.pdf');
  await foto(page, '11-paciente-detalle-resultado', false);
  await page.keyboard.press('Escape');
  await expect(page.locator('.cajon')).toHaveCount(0);

  await page.getByRole('link', { name: 'Mis citas', exact: true }).click();
  await page.getByRole('link', { name: 'Cambiar fecha' }).first().click();
  await page.locator('.dia:not([disabled])').nth(3).click();
  await page.locator('.hora:not([disabled])').nth(2).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Confirmar cambio' }).click();
  await expect(tostada()).toContainText('Cita reprogramada');

  await page.getByRole('button', { name: 'Cancelar' }).last().click();
  await page.getByLabel('Motivo (opcional)').fill('Viaje fuera de la ciudad.');
  await page.getByRole('button', { name: 'Cancelar cita' }).click();
  await expect(tostada()).toContainText('Cita cancelada');
  await page.getByRole('tab', { name: 'Historial' }).click();
  await expect(page.getByText('Viaje fuera de la ciudad')).toBeVisible();
  await foto(page, '12-paciente-historial');
  await page.locator('[data-menu="/portal/notificaciones"]').click();
  await expect(page.locator('.notif').first()).toBeVisible();
  await foto(page, '12a-paciente-notificaciones');
  await salir(page);
});

test('7. recuperar contraseña con ayuda del administrador', async () => {
  await ingresar(page, PACIENTE.email, 'incorrecta1');
  await expect(page.locator('.aviso-error')).toContainText('no coinciden');
  await page.getByRole('link', { name: 'Olvidé mi contraseña', exact: true }).click();
  await page.getByLabel('Correo o número de documento').fill(PACIENTE.documento);
  await page.getByRole('button', { name: 'Enviar solicitud' }).click();
  await expect(page.getByText('Solicitud enviada')).toBeVisible();

  await ingresar(page, ADMIN.email, ADMIN.clave);
  await page.getByRole('link', { name: 'Usuarios', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await foto(page, '12b-admin-usuarios');
  await page.getByRole('link', { name: 'Solicitudes de acceso', exact: true }).click();
  await expect(page.locator('.item')).toHaveCount(1);
  await foto(page, '12c-admin-solicitudes');
  await page.getByRole('button', { name: 'Generar contraseña temporal' }).click();
  await page.getByRole('button', { name: 'Sí, generar contraseña' }).click();
  est.clavePaciente = await page.locator('.clave-temporal code').innerText();
  await page.getByRole('button', { name: 'Listo, ya la anoté' }).click();
  await salir(page);

  await ingresar(page, PACIENTE.documento, est.clavePaciente);
  await expect(page).toHaveURL(BASE + '/cambiar-clave');
});

test('8. funciona en celular con menú lateral', async () => {
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-CO' });
  const m = await ctx.newPage();
  vigilar(m);
  await m.goto(BASE + '/');
  await foto(m, '13-movil-inicio');
  await ingresar(m, MEDICO.email, MEDICO.clave);
  await expect(m).toHaveURL(BASE + '/portal');
  await expect(m.locator('.lateral')).not.toBeInViewport();
  await m.getByRole('button', { name: 'Abrir menú' }).click();
  await expect(m.locator('.lateral')).toBeInViewport();
  await foto(m, '14-movil-menu', false);
  await m.getByRole('link', { name: 'Pacientes', exact: true }).click();
  await expect(m.getByRole('heading', { name: 'Pacientes' })).toBeVisible();
  await m.goto(BASE + '/no-existe');
  await expect(m.getByText('Esta página no existe')).toBeVisible();
  await ctx.close();
});

test('9. el navegador no registró errores de JavaScript', () => {
  assert.deepEqual(errores, []);
});
