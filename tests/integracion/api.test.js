// Pruebas de integración de la API: servidor real + base SQLite temporal.
// Verifican las reglas de negocio y de seguridad sin navegador.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { iniciar } from '../../src/app.js';
import { hoyLocal, sumarDias } from '../../src/time.js';

let app; let dir;

/** Cliente HTTP con su propia cookie de sesión, como si fuera un navegador distinto. */
function cliente() {
  let cookie = '';
  const llamar = async (metodo, ruta, cuerpo, { csrf = true } = {}) => {
    const res = await fetch(app.url + ruta, {
      method: metodo,
      headers: { ...(csrf ? { 'X-Neumoser': '1' } : {}), ...(cuerpo ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
    const tipo = res.headers.get('content-type') || '';
    const datos = tipo.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, datos, res };
  };
  return {
    get: (r) => llamar('GET', r),
    post: (r, c = {}, o) => llamar('POST', r, c, o),
    patch: (r, c = {}) => llamar('PATCH', r, c),
    put: (r, c = {}) => llamar('PUT', r, c),
    del: (r) => llamar('DELETE', r),
  };
}

const persona = (n, extra = {}) => ({
  nombre: `Nombre${n}`, apellido: `Apellido${n}`, tipo_documento: 'Cédula de ciudadanía',
  documento: `10900000${n}`, email: `persona${n}@correo.com`, telefono: `300000000${n}`,
  fecha_nacimiento: '1980-05-20', password: 'Clave12345', acepta_datos: true, ...extra,
});

const admin = cliente();
const medico = cliente();
const paciente = cliente();
const otroPaciente = cliente();
const anonimo = cliente();
let servicio; let medicoId; let pacienteId;
const manana = () => sumarDias(hoyLocal(), 1);

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'neumoser-api-'));
  app = await iniciar({ dataDir: dir });
});
after(async () => {
  await app.cerrar();
  rmSync(dir, { recursive: true, force: true });
});

describe('configuración inicial', () => {
  test('el portal nuevo pide configuración', async () => {
    const r = await anonimo.get('/api/estado');
    assert.equal(r.status, 200);
    assert.equal(r.datos.necesitaConfiguracion, true);
  });

  test('valida los datos del primer administrador', async () => {
    const r = await anonimo.post('/api/configuracion', { nombre: '', email: 'no-es-correo', documento: '1.2', password: 'corta' });
    assert.equal(r.status, 422);
    assert.ok(r.datos.campos.nombre);
    assert.ok(r.datos.campos.email);
    assert.ok(r.datos.campos.documento);
    assert.ok(r.datos.campos.password);
  });

  test('crea el administrador e inicia su sesión', async () => {
    const r = await admin.post('/api/configuracion', persona(1, { email: 'admin@neumoser.co' }));
    assert.equal(r.status, 200);
    assert.equal(r.datos.usuario.rol, 'admin');
    assert.equal(r.datos.usuario.password_hash, undefined, 'nunca se devuelve el hash');
    assert.equal((await admin.get('/api/auth/yo')).datos.usuario.email, 'admin@neumoser.co');
  });

  test('no se puede configurar dos veces', async () => {
    const r = await anonimo.post('/api/configuracion', persona(2));
    assert.equal(r.status, 409);
    assert.equal((await anonimo.get('/api/estado')).datos.necesitaConfiguracion, false);
  });
});

describe('administración de servicios y médicos', () => {
  test('crea un servicio y rechaza nombres duplicados', async () => {
    const r = await admin.post('/api/admin/servicios', { nombre: 'Espirometría', descripcion: 'Función pulmonar', duracion_min: 30, preparacion: 'No fumar' });
    assert.equal(r.status, 200);
    servicio = r.datos;
    const dup = await admin.post('/api/admin/servicios', { nombre: 'espirometría', duracion_min: 30 });
    assert.equal(dup.status, 422);
    assert.ok(dup.datos.campos.nombre);
  });

  test('valida la duración del servicio', async () => {
    const r = await admin.post('/api/admin/servicios', { nombre: 'Otro', duracion_min: 5 });
    assert.equal(r.status, 422);
    assert.ok(r.datos.campos.duracion_min);
  });

  test('crea un médico con contraseña temporal y servicios asignados', async () => {
    const r = await admin.post('/api/admin/usuarios', { ...persona(3), rol: 'medico', registro_medico: 'RM-1', servicios: [servicio.id] });
    assert.equal(r.status, 200);
    assert.match(r.datos.claveTemporal, /^[A-Za-z2-9]{5}-[A-Za-z2-9]{5}$/);
    assert.equal(r.datos.usuario.debe_cambiar_clave, true);
    medicoId = r.datos.usuario.id;

    const login = await medico.post('/api/auth/login', { usuario: 'persona3@correo.com', password: r.datos.claveTemporal });
    assert.equal(login.status, 200);
    // Con clave temporal no puede hacer nada más que cambiarla
    assert.equal((await medico.get('/api/resumen')).status, 403);
    const cambio = await medico.post('/api/auth/cambiar-clave', { actual: r.datos.claveTemporal, nueva: 'MedicoNueva1' });
    assert.equal(cambio.status, 200);
    assert.equal((await medico.get('/api/resumen')).status, 200);
  });

  test('el médico exige registro médico', async () => {
    const r = await admin.post('/api/admin/usuarios', { ...persona(4), rol: 'medico' });
    assert.equal(r.status, 422);
    assert.ok(r.datos.campos.registro_medico);
  });
});

describe('registro e inicio de sesión de pacientes', () => {
  test('exige aceptar el tratamiento de datos', async () => {
    const r = await paciente.post('/api/auth/registro', persona(5, { acepta_datos: false }));
    assert.equal(r.status, 422);
    assert.ok(r.datos.campos.acepta_datos);
  });

  test('registra un paciente y le da la bienvenida', async () => {
    const r = await paciente.post('/api/auth/registro', persona(5));
    assert.equal(r.status, 200);
    assert.equal(r.datos.usuario.rol, 'paciente');
    pacienteId = r.datos.usuario.id;
    const n = await paciente.get('/api/notificaciones');
    assert.equal(n.datos.sinLeer, 1);
    assert.equal(n.datos.items[0].tipo, 'bienvenida');
  });

  test('rechaza correo o documento ya registrados', async () => {
    const r = await anonimo.post('/api/auth/registro', persona(5));
    assert.equal(r.status, 422);
    assert.ok(r.datos.campos.email);
    assert.ok(r.datos.campos.documento);
  });

  test('permite ingresar con correo o con documento', async () => {
    const c = cliente();
    assert.equal((await c.post('/api/auth/login', { usuario: 'PERSONA5@correo.com', password: 'Clave12345' })).status, 200);
    const c2 = cliente();
    assert.equal((await c2.post('/api/auth/login', { usuario: '109000005', password: 'Clave12345' })).status, 200);
  });

  test('responde lo mismo si el usuario no existe o la clave está mal', async () => {
    const a = await anonimo.post('/api/auth/login', { usuario: 'nadie@correo.com', password: 'Clave12345' });
    const b = await anonimo.post('/api/auth/login', { usuario: 'persona5@correo.com', password: 'Mala12345' });
    assert.equal(a.status, 401); assert.equal(b.status, 401);
    assert.equal(a.datos.error, b.datos.error);
  });

  test('cerrar sesión invalida la cookie', async () => {
    const c = cliente();
    await c.post('/api/auth/login', { usuario: '109000005', password: 'Clave12345' });
    await c.post('/api/auth/logout');
    assert.equal((await c.get('/api/auth/yo')).datos.usuario, null);
  });
});

describe('horario del médico y disponibilidad', () => {
  test('rechaza franjas que se cruzan o con horas invertidas', async () => {
    let r = await medico.put('/api/medico/disponibilidad', { franjas: [{ dia_semana: 1, hora_inicio: '08:00', hora_fin: '12:00' }, { dia_semana: 1, hora_inicio: '11:00', hora_fin: '13:00' }] });
    assert.equal(r.status, 422);
    r = await medico.put('/api/medico/disponibilidad', { franjas: [{ dia_semana: 1, hora_inicio: '12:00', hora_fin: '08:00' }] });
    assert.equal(r.status, 422);
  });

  test('guarda el horario de toda la semana', async () => {
    const franjas = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dia_semana: d, hora_inicio: '08:00', hora_fin: '10:00' }));
    const r = await medico.put('/api/medico/disponibilidad', { franjas });
    assert.equal(r.status, 200);
    assert.equal(r.datos.length, 7);
  });

  test('divide la franja según la duración del servicio (2 h / 30 min = 4 horarios)', async () => {
    const r = await paciente.get(`/api/agenda/horas?servicio=${servicio.id}&medico=${medicoId}&fecha=${manana()}`);
    assert.equal(r.status, 200);
    assert.deepEqual(r.datos.map((h) => h.hora), ['08:00', '08:30', '09:00', '09:30']);
    assert.ok(r.datos.every((h) => h.estado === 'libre'));
  });

  test('no ofrece fechas pasadas ni más allá de 90 días', async () => {
    const ayer = sumarDias(hoyLocal(), -1);
    const lejos = sumarDias(hoyLocal(), 91);
    assert.deepEqual((await paciente.get(`/api/agenda/horas?servicio=${servicio.id}&medico=${medicoId}&fecha=${ayer}`)).datos, []);
    assert.deepEqual((await paciente.get(`/api/agenda/horas?servicio=${servicio.id}&medico=${medicoId}&fecha=${lejos}`)).datos, []);
  });
});

describe('citas', () => {
  let cita;
  test('el paciente agenda y el médico recibe una notificación', async () => {
    const r = await paciente.post('/api/citas', { servicio_id: servicio.id, medico_id: medicoId, inicio: `${manana()}T08:00`, motivo: 'Control' });
    assert.equal(r.status, 200);
    assert.equal(r.datos.estado, 'programada');
    assert.equal(r.datos.fin, `${manana()}T08:30`);
    cita = r.datos;
    const n = await medico.get('/api/notificaciones');
    assert.ok(n.datos.items.some((x) => x.tipo === 'cita_nueva'));
  });

  test('nadie más puede tomar el mismo horario', async () => {
    await otroPaciente.post('/api/auth/registro', persona(6));
    const r = await otroPaciente.post('/api/citas', { servicio_id: servicio.id, medico_id: medicoId, inicio: `${manana()}T08:00` });
    assert.equal(r.status, 409);
    const horas = await otroPaciente.get(`/api/agenda/horas?servicio=${servicio.id}&medico=${medicoId}&fecha=${manana()}`);
    assert.equal(horas.datos.find((h) => h.hora === '08:00').estado, 'ocupado');
  });

  test('no se puede agendar fuera del horario del médico', async () => {
    const r = await otroPaciente.post('/api/citas', { servicio_id: servicio.id, medico_id: medicoId, inicio: `${manana()}T15:00` });
    assert.equal(r.status, 409);
  });

  test('cada paciente solo ve sus propias citas', async () => {
    const mias = await paciente.get('/api/citas?vista=proximas');
    const ajenas = await otroPaciente.get('/api/citas?vista=proximas');
    assert.equal(mias.datos.length, 1);
    assert.equal(ajenas.datos.length, 0);
    assert.equal((await otroPaciente.post(`/api/citas/${cita.id}/cancelar`)).status, 404);
  });

  test('el paciente confirma su asistencia', async () => {
    const r = await paciente.post(`/api/citas/${cita.id}/confirmar`);
    assert.equal(r.datos.estado, 'confirmada');
    assert.equal((await paciente.post(`/api/citas/${cita.id}/confirmar`)).status, 409, 'no se confirma dos veces');
  });

  test('reprogramar libera el horario anterior', async () => {
    const r = await paciente.post(`/api/citas/${cita.id}/reprogramar`, { inicio: `${manana()}T09:00` });
    assert.equal(r.status, 200);
    assert.equal(r.datos.inicio, `${manana()}T09:00`);
    assert.equal(r.datos.estado, 'programada', 'vuelve a quedar por confirmar');
    const horas = await paciente.get(`/api/agenda/horas?servicio=${servicio.id}&medico=${medicoId}&fecha=${manana()}`);
    assert.equal(horas.datos.find((h) => h.hora === '08:00').estado, 'libre');
  });

  test('el médico no puede registrar la atención de una cita futura', async () => {
    const r = await medico.post(`/api/citas/${cita.id}/atencion`, { estado: 'atendida' });
    assert.equal(r.status, 409);
  });

  test('cancelar notifica al médico y la cita no se puede cancelar dos veces', async () => {
    const r = await paciente.post(`/api/citas/${cita.id}/cancelar`, { motivo: 'Viaje' });
    assert.equal(r.datos.estado, 'cancelada');
    assert.equal(r.datos.motivo_cancelacion, 'Viaje');
    assert.equal((await paciente.post(`/api/citas/${cita.id}/cancelar`)).status, 409);
    const n = await medico.get('/api/notificaciones');
    assert.ok(n.datos.items.some((x) => x.tipo === 'cita_cancelada'));
  });

  test('el médico no puede agendar citas a nombre de pacientes', async () => {
    const r = await medico.post('/api/citas', { servicio_id: servicio.id, medico_id: medicoId, inicio: `${manana()}T08:00` });
    assert.equal(r.status, 403);
  });
});

describe('resultados clínicos', () => {
  const pdf = Buffer.from('%PDF-1.4\n%prueba\n%%EOF').toString('base64');
  let resultado;

  test('solo acepta PDF, JPG o PNG y verifica la firma del PDF', async () => {
    let r = await medico.post('/api/resultados', { paciente_id: pacienteId, titulo: 'X', fecha_examen: hoyLocal(), archivo: { nombre: 'a.exe', tipo: 'application/x-msdownload', datos: 'AAAA' } });
    assert.equal(r.status, 422);
    r = await medico.post('/api/resultados', { paciente_id: pacienteId, titulo: 'X', fecha_examen: hoyLocal(), archivo: { nombre: 'falso.pdf', tipo: 'application/pdf', datos: Buffer.from('hola').toString('base64') } });
    assert.equal(r.status, 422);
    assert.match(r.datos.campos.archivo, /PDF válido/);
  });

  test('no acepta fechas de examen futuras', async () => {
    const r = await medico.post('/api/resultados', { paciente_id: pacienteId, titulo: 'X', fecha_examen: manana(), observaciones: 'x' });
    assert.equal(r.status, 422);
    assert.ok(r.datos.campos.fecha_examen);
  });

  test('el médico publica un resultado y el paciente recibe aviso', async () => {
    const r = await medico.post('/api/resultados', { paciente_id: pacienteId, servicio_id: servicio.id, titulo: 'Espirometría basal', fecha_examen: hoyLocal(), observaciones: 'Normal', archivo: { nombre: 'informe.pdf', tipo: 'application/pdf', datos: pdf } });
    assert.equal(r.status, 200);
    resultado = r.datos;
    const n = await paciente.get('/api/notificaciones');
    assert.ok(n.datos.items.some((x) => x.tipo === 'resultado_nuevo' && x.enlace === `/portal/resultados/${resultado.id}`));
  });

  test('el paciente descarga su archivo y queda marcado como visto', async () => {
    const lista = await paciente.get('/api/resultados');
    assert.equal(lista.datos[0].nuevo, true);
    const r = await paciente.get(`/api/resultados/${resultado.id}/archivo`);
    assert.equal(r.status, 200);
    assert.equal(r.res.headers.get('content-type'), 'application/pdf');
    assert.match(r.res.headers.get('content-disposition'), /attachment; filename\*=UTF-8''informe\.pdf/);
    assert.equal(r.datos.subarray(0, 5).toString(), '%PDF-');
    assert.equal((await paciente.get('/api/resultados')).datos[0].nuevo, false);
  });

  test('otro paciente y la administración no pueden ver el resultado', async () => {
    assert.equal((await otroPaciente.get(`/api/resultados/${resultado.id}`)).status, 404);
    assert.equal((await otroPaciente.get(`/api/resultados/${resultado.id}/archivo`)).status, 404);
    assert.equal((await admin.get(`/api/resultados/${resultado.id}`)).status, 403);
    assert.deepEqual((await otroPaciente.get('/api/resultados')).datos, []);
  });

  test('solo quien lo cargó puede eliminarlo', async () => {
    assert.equal((await paciente.del(`/api/resultados/${resultado.id}`)).status, 403);
    assert.equal((await medico.del(`/api/resultados/${resultado.id}`)).status, 200);
    assert.equal((await paciente.get(`/api/resultados/${resultado.id}`)).status, 404);
  });
});

describe('seguridad general', () => {
  test('sin sesión no se accede a datos privados', async () => {
    for (const r of ['/api/citas', '/api/resultados', '/api/notificaciones', '/api/admin/usuarios']) {
      assert.equal((await anonimo.get(r)).status, 401, r);
    }
  });

  test('un paciente no puede usar funciones de administración ni de médico', async () => {
    assert.equal((await paciente.get('/api/admin/usuarios')).status, 403);
    assert.equal((await paciente.post('/api/admin/servicios', { nombre: 'Hack', duracion_min: 30 })).status, 403);
    assert.equal((await paciente.put('/api/medico/disponibilidad', { franjas: [] })).status, 403);
  });

  test('rechaza peticiones sin la cabecera anti-CSRF', async () => {
    const r = await paciente.post('/api/notificaciones/leer-todas', {}, { csrf: false });
    assert.equal(r.status, 403);
  });

  test('no permite leer archivos fuera de la carpeta pública', async () => {
    const res = await fetch(app.url + '/%2e%2e/%2e%2e/package.json');
    const txt = await res.text();
    assert.doesNotMatch(txt, /"name": "neumoser-portal"/);
  });

  test('envía cabeceras de seguridad', async () => {
    const res = await fetch(app.url + '/');
    assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  });
});

describe('recuperación de contraseña', () => {
  let claveTemporal;
  test('la solicitud no revela si la cuenta existe', async () => {
    const a = await anonimo.post('/api/auth/recuperar', { usuario: 'no-existe@correo.com' });
    const b = await anonimo.post('/api/auth/recuperar', { usuario: 'persona5@correo.com' });
    assert.deepEqual(a.datos, b.datos);
  });

  test('el administrador ve la solicitud y genera una clave temporal', async () => {
    const s = await admin.get('/api/admin/solicitudes');
    const pend = s.datos.find((x) => x.estado === 'pendiente');
    assert.equal(pend.email, 'persona5@correo.com');
    const r = await admin.post(`/api/admin/usuarios/${pend.usuario_id}/restablecer-clave`);
    assert.equal(r.status, 200);
    claveTemporal = r.datos.claveTemporal;
    // La sesión anterior del paciente se cerró
    assert.equal((await paciente.get('/api/citas')).status, 401);
    const c = cliente();
    assert.equal((await c.post('/api/auth/login', { usuario: '109000005', password: r.datos.claveTemporal })).datos.usuario.debe_cambiar_clave, true);
    assert.equal((await admin.get('/api/admin/solicitudes')).datos.find((x) => x.id === pend.id).estado, 'atendida');
  });

  test('una cuenta desactivada no puede ingresar', async () => {
    assert.equal((await admin.patch(`/api/admin/usuarios/${pacienteId}`, { activo: false })).status, 200);
    const login = await cliente().post('/api/auth/login', { usuario: 'persona5@correo.com', password: claveTemporal });
    assert.equal(login.status, 403);
    assert.match(login.datos.error, /desactivada/);
    const otro = await cliente().post('/api/auth/login', { usuario: '109000006', password: 'Clave12345' });
    assert.equal(otro.status, 200, 'las demás cuentas siguen funcionando');
  });

  test('el último administrador no se puede desactivar a sí mismo', async () => {
    const yo = (await admin.get('/api/auth/yo')).datos.usuario;
    assert.equal((await admin.patch(`/api/admin/usuarios/${yo.id}`, { activo: false })).status, 409);
  });
});
