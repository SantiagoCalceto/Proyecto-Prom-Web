// API REST del portal Neumoser.
import { writeFileSync, mkdirSync, readFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Router, fail } from './http.js';
import { tx } from './db.js';
import {
  hashPassword, verifyPassword, sha256, newToken, tempPassword, passwordProblem,
  tooManyAttempts, registerFailure, clearFailures,
} from './auth.js';
import {
  ahoraLocal, hoyLocal, sumarMinutos, sumarDias, diaSemana, minutos, hhmm,
  esFecha, esFechaHora, esHora,
} from './time.js';

const ROLES = ['paciente', 'medico', 'admin'];
const TIPOS_DOC = ['Cédula de ciudadanía', 'Tarjeta de identidad', 'Cédula de extranjería', 'Pasaporte', 'Registro civil', 'Permiso por protección temporal'];
const ESTADOS_ACTIVOS = "('programada','confirmada')";
const ANTICIPACION_MIN = 60;      // no se puede agendar con menos de 1 hora
const VENTANA_DIAS = 90;          // ni a más de 90 días
const MAX_ARCHIVO = 10 * 1024 * 1024;
const TIPOS_ARCHIVO = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png' };

// ── Validación ──────────────────────────────────────────────
function texto(body, campo, { max = 120, requerido = true, etiqueta = campo, min = 1 } = {}, errores) {
  let v = body?.[campo];
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string') v = String(v);
  v = v.trim().replace(/\s+/g, ' ');
  if (!v && requerido) errores[campo] = `Escribe ${etiqueta}.`;
  else if (v && v.length < min) errores[campo] = `${cap(etiqueta)} es demasiado corto.`;
  else if (v.length > max) errores[campo] = `${cap(etiqueta)} admite máximo ${max} caracteres.`;
  return v;
}
function textoLargo(body, campo, max = 2000) {
  const v = typeof body?.[campo] === 'string' ? body[campo].trim() : '';
  return v.slice(0, max);
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const entero = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
function siHayErrores(errores) {
  if (Object.keys(errores).length) fail(422, 'Revisa los campos marcados.', errores);
}

function datosPersona(body, errores, { conClave = true } = {}) {
  const d = {
    nombre: texto(body, 'nombre', { etiqueta: 'el nombre', max: 60 }, errores),
    apellido: texto(body, 'apellido', { etiqueta: 'el apellido', max: 60 }, errores),
    tipo_documento: texto(body, 'tipo_documento', { etiqueta: 'el tipo de documento' }, errores),
    documento: String(body?.documento ?? '').replace(/[\s.]/g, ''),
    email: texto(body, 'email', { etiqueta: 'el correo', max: 120 }, errores).toLowerCase(),
    telefono: String(body?.telefono ?? '').replace(/[^\d+]/g, ''),
    fecha_nacimiento: String(body?.fecha_nacimiento ?? '').trim(),
    eps: texto(body, 'eps', { requerido: false, max: 80 }, errores),
  };
  if (d.tipo_documento && !TIPOS_DOC.includes(d.tipo_documento)) errores.tipo_documento = 'Elige un tipo de documento de la lista.';
  if (!/^[A-Za-z0-9]{4,15}$/.test(d.documento)) errores.documento = 'El documento debe tener entre 4 y 15 letras o números, sin puntos.';
  if (d.email && !EMAIL_RE.test(d.email)) errores.email = 'Escribe un correo válido, por ejemplo nombre@correo.com.';
  if (d.telefono && !/^\+?\d{7,13}$/.test(d.telefono)) errores.telefono = 'Escribe un teléfono de 7 a 13 dígitos.';
  if (d.fecha_nacimiento) {
    if (!esFecha(d.fecha_nacimiento) || d.fecha_nacimiento > hoyLocal() || d.fecha_nacimiento < '1900-01-01') errores.fecha_nacimiento = 'Escribe una fecha de nacimiento válida.';
  }
  if (conClave) {
    const p = passwordProblem(body?.password);
    if (p) errores.password = p;
  }
  return d;
}

// ── Formatos de salida ──────────────────────────────────────
function usuarioPublico(u) {
  if (!u) return null;
  return {
    id: u.id, rol: u.rol, nombre: u.nombre, apellido: u.apellido,
    tipo_documento: u.tipo_documento, documento: u.documento, email: u.email,
    telefono: u.telefono || '', fecha_nacimiento: u.fecha_nacimiento || '', eps: u.eps || '',
    registro_medico: u.registro_medico || '', debe_cambiar_clave: !!u.debe_cambiar_clave,
    activo: !!u.activo, creado_en: u.creado_en, ultimo_acceso: u.ultimo_acceso,
  };
}

export function buildApi({ db, uploadsDir }) {
  mkdirSync(uploadsDir, { recursive: true });
  const r = new Router();

  const q = {
    one: (sql, ...p) => db.prepare(sql).get(...p),
    all: (sql, ...p) => db.prepare(sql).all(...p),
    run: (sql, ...p) => db.prepare(sql).run(...p),
  };

  const auditar = (usuarioId, accion, detalle = '') =>
    q.run('INSERT INTO auditoria (usuario_id, accion, detalle) VALUES (?,?,?)', usuarioId ?? null, accion, detalle);
  const notificar = (usuarioId, tipo, titulo, mensaje, enlace = null) =>
    q.run('INSERT INTO notificaciones (usuario_id, tipo, titulo, mensaje, enlace) VALUES (?,?,?,?,?)', usuarioId, tipo, titulo, mensaje, enlace);
  const notificarAdmins = (tipo, titulo, mensaje, enlace) => {
    for (const a of q.all("SELECT id FROM usuarios WHERE rol='admin' AND activo=1")) notificar(a.id, tipo, titulo, mensaje, enlace);
  };
  const nombreDe = (u) => `${u.nombre} ${u.apellido}`;
  const fechaLegible = (s) => {
    const [d, t] = s.split('T');
    const f = new Date(d + 'T12:00:00Z').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
    if (!t) return f;
    const [h, m] = t.split(':').map(Number);
    const hora = `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`;
    return `${f}, ${hora}`;
  };

  // ── Sesión ────────────────────────────────────────────────
  function crearSesion(ctx, usuario, recordar) {
    const token = newToken();
    const horas = recordar ? 24 * 30 : 12;
    const expira = new Date(Date.now() + horas * 3600_000).toISOString();
    q.run('INSERT INTO sesiones (token_hash, usuario_id, expira_en) VALUES (?,?,?)', sha256(token), usuario.id, expira);
    q.run("UPDATE usuarios SET ultimo_acceso = datetime('now') WHERE id = ?", usuario.id);
    const secure = ctx.secure ? '; Secure' : '';
    ctx.setCookie(`nms=${token}; Path=/; HttpOnly; SameSite=Lax${recordar ? `; Max-Age=${horas * 3600}` : ''}${secure}`);
  }

  function usuarioDeSesion(ctx) {
    const token = ctx.cookies.nms;
    if (!token) return null;
    const row = q.one(`SELECT u.* FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
                       WHERE s.token_hash = ? AND s.expira_en > ? AND u.activo = 1`, sha256(token), new Date().toISOString());
    return row || null;
  }

  // Envuelve un handler exigiendo sesión y (opcionalmente) rol.
  const con = (roles, handler) => (ctx) => {
    const u = usuarioDeSesion(ctx);
    if (!u) fail(401, 'Tu sesión terminó. Inicia sesión de nuevo.');
    if (roles && !roles.includes(u.rol)) fail(403, 'Tu cuenta no tiene permiso para esta acción.');
    // Mientras deba cambiar la contraseña, solo puede hacer eso.
    if (u.debe_cambiar_clave && !handler.permiteClaveTemporal) fail(403, 'Debes cambiar tu contraseña temporal antes de continuar.');
    ctx.user = u;
    return handler(ctx);
  };
  const permitirTemporal = (h) => { h.permiteClaveTemporal = true; return h; };

  // ── Estado y configuración inicial ────────────────────────
  const hayAdmin = () => !!q.one("SELECT 1 FROM usuarios WHERE rol='admin' LIMIT 1");

  r.get('/api/estado', () => ({ necesitaConfiguracion: !hayAdmin(), hoy: hoyLocal(), ahora: ahoraLocal() }));

  r.post('/api/configuracion', (ctx) => {
    if (hayAdmin()) fail(409, 'El portal ya fue configurado. Inicia sesión con la cuenta de administrador.');
    const e = {};
    const d = datosPersona(ctx.body, e);
    siHayErrores(e);
    const u = tx(db, () => {
      if (hayAdmin()) fail(409, 'El portal ya fue configurado.');
      const res = q.run(`INSERT INTO usuarios (rol,nombre,apellido,tipo_documento,documento,email,telefono,password_hash)
                         VALUES ('admin',?,?,?,?,?,?,?)`, d.nombre, d.apellido, d.tipo_documento, d.documento, d.email, d.telefono || null, hashPassword(ctx.body.password));
      return q.one('SELECT * FROM usuarios WHERE id=?', res.lastInsertRowid);
    });
    auditar(u.id, 'configuracion_inicial', 'Se creó la primera cuenta de administrador');
    crearSesion(ctx, u, false);
    return { usuario: usuarioPublico(u) };
  });

  r.get('/api/publico/servicios', () => q.all(`
    SELECT s.id, s.nombre, s.descripcion, s.duracion_min, s.preparacion,
           (SELECT COUNT(*) FROM medico_servicios ms JOIN usuarios u ON u.id = ms.medico_id
             WHERE ms.servicio_id = s.id AND u.activo = 1) AS medicos
    FROM servicios s WHERE s.activo = 1 ORDER BY s.nombre`));

  const CAMPOS_CLINICA = { direccion: 200, telefono: 40, correo: 120, horario: 300 };
  const leerClinica = () => {
    const out = {};
    for (const k of Object.keys(CAMPOS_CLINICA)) out[k] = q.one('SELECT valor FROM ajustes WHERE clave = ?', `clinica.${k}`)?.valor || '';
    return out;
  };
  r.get('/api/publico/clinica', () => leerClinica());

  // ── Autenticación ─────────────────────────────────────────
  function verificarUnicos(d, e, excluirId = 0) {
    if (d.email && q.one('SELECT 1 FROM usuarios WHERE email = ? AND id <> ?', d.email, excluirId)) e.email = 'Ya existe una cuenta con este correo.';
    if (d.documento && q.one('SELECT 1 FROM usuarios WHERE documento = ? AND id <> ?', d.documento, excluirId)) e.documento = 'Ya existe una cuenta con este documento.';
  }

  r.post('/api/auth/registro', (ctx) => {
    const e = {};
    const d = datosPersona(ctx.body, e);
    if (!d.fecha_nacimiento && !e.fecha_nacimiento) e.fecha_nacimiento = 'Escribe tu fecha de nacimiento.';
    if (!d.telefono && !e.telefono) e.telefono = 'Escribe un teléfono de contacto.';
    if (ctx.body?.acepta_datos !== true) e.acepta_datos = 'Debes aceptar la política de tratamiento de datos para crear la cuenta.';
    verificarUnicos(d, e);
    siHayErrores(e);
    const res = q.run(`INSERT INTO usuarios (rol,nombre,apellido,tipo_documento,documento,email,telefono,fecha_nacimiento,eps,password_hash)
                       VALUES ('paciente',?,?,?,?,?,?,?,?,?)`,
      d.nombre, d.apellido, d.tipo_documento, d.documento, d.email, d.telefono, d.fecha_nacimiento, d.eps || null, hashPassword(ctx.body.password));
    const u = q.one('SELECT * FROM usuarios WHERE id = ?', res.lastInsertRowid);
    notificar(u.id, 'bienvenida', 'Tu cuenta está lista', 'Ya puedes agendar citas. Cuando tu médico cargue un resultado, te avisaremos aquí.', '/portal/citas/nueva');
    auditar(u.id, 'registro_paciente', `${nombreDe(u)} (${u.documento})`);
    crearSesion(ctx, u, false);
    return { usuario: usuarioPublico(u) };
  });

  r.post('/api/auth/login', (ctx) => {
    const ident = String(ctx.body?.usuario ?? '').trim().toLowerCase();
    const password = String(ctx.body?.password ?? '');
    const llave = `${ctx.ip}|${ident}`;
    if (!ident || !password) fail(422, 'Escribe tu correo o documento y tu contraseña.');
    if (tooManyAttempts(llave)) fail(429, 'Demasiados intentos fallidos. Espera 15 minutos o pide a la clínica que restablezca tu contraseña.');
    const u = q.one('SELECT * FROM usuarios WHERE email = ? OR documento = ?', ident, ident.toUpperCase());
    if (!u || !verifyPassword(password, u.password_hash)) {
      registerFailure(llave);
      fail(401, 'El correo, documento o contraseña no coinciden.');
    }
    if (!u.activo) fail(403, 'Esta cuenta está desactivada. Comunícate con la clínica.');
    clearFailures(llave);
    crearSesion(ctx, u, ctx.body?.recordar === true);
    auditar(u.id, 'inicio_sesion');
    return { usuario: usuarioPublico(u) };
  });

  r.post('/api/auth/logout', (ctx) => {
    if (ctx.cookies.nms) q.run('DELETE FROM sesiones WHERE token_hash = ?', sha256(ctx.cookies.nms));
    ctx.setCookie('nms=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    return { ok: true };
  });

  r.get('/api/auth/yo', (ctx) => ({ usuario: usuarioPublico(usuarioDeSesion(ctx)) }));

  r.post('/api/auth/recuperar', (ctx) => {
    const ident = String(ctx.body?.usuario ?? '').trim().toLowerCase();
    if (!ident) fail(422, 'Escribe tu correo o número de documento.', { usuario: 'Escribe tu correo o número de documento.' });
    const u = q.one('SELECT * FROM usuarios WHERE (email = ? OR documento = ?) AND activo = 1', ident, ident.toUpperCase());
    if (u && !q.one("SELECT 1 FROM solicitudes_clave WHERE usuario_id = ? AND estado = 'pendiente'", u.id)) {
      q.run('INSERT INTO solicitudes_clave (usuario_id) VALUES (?)', u.id);
      notificarAdmins('solicitud_clave', 'Solicitud de restablecimiento', `${nombreDe(u)} pidió restablecer su contraseña.`, '/portal/solicitudes');
      auditar(u.id, 'solicitud_clave');
    }
    // Misma respuesta exista o no la cuenta, para no revelar quién está registrado.
    return { ok: true };
  });

  r.post('/api/auth/cambiar-clave', con(null, permitirTemporal((ctx) => {
    const { actual, nueva } = ctx.body || {};
    if (!verifyPassword(String(actual ?? ''), ctx.user.password_hash)) fail(422, 'La contraseña actual no es correcta.', { actual: 'La contraseña actual no es correcta.' });
    const p = passwordProblem(nueva);
    if (p) fail(422, p, { nueva: p });
    if (actual === nueva) fail(422, 'La nueva contraseña debe ser distinta a la actual.', { nueva: 'La nueva contraseña debe ser distinta a la actual.' });
    q.run('UPDATE usuarios SET password_hash = ?, debe_cambiar_clave = 0 WHERE id = ?', hashPassword(nueva), ctx.user.id);
    // Cierra las demás sesiones
    q.run('DELETE FROM sesiones WHERE usuario_id = ? AND token_hash <> ?', ctx.user.id, sha256(ctx.cookies.nms));
    auditar(ctx.user.id, 'cambio_clave');
    return { usuario: usuarioPublico(q.one('SELECT * FROM usuarios WHERE id = ?', ctx.user.id)) };
  })));

  // ── Perfil ────────────────────────────────────────────────
  r.patch('/api/perfil', con(null, (ctx) => {
    const e = {};
    const b = ctx.body || {};
    const email = texto(b, 'email', { etiqueta: 'el correo' }, e).toLowerCase();
    const telefono = String(b.telefono ?? '').replace(/[^\d+]/g, '');
    const eps = texto(b, 'eps', { requerido: false, max: 80 }, e);
    if (email && !EMAIL_RE.test(email)) e.email = 'Escribe un correo válido.';
    if (telefono && !/^\+?\d{7,13}$/.test(telefono)) e.telefono = 'Escribe un teléfono de 7 a 13 dígitos.';
    if (ctx.user.rol === 'paciente' && !telefono) e.telefono = 'Escribe un teléfono de contacto.';
    if (email && q.one('SELECT 1 FROM usuarios WHERE email = ? AND id <> ?', email, ctx.user.id)) e.email = 'Ese correo ya lo usa otra cuenta.';
    siHayErrores(e);
    q.run('UPDATE usuarios SET email = ?, telefono = ?, eps = ? WHERE id = ?', email, telefono || null, eps || null, ctx.user.id);
    auditar(ctx.user.id, 'perfil_actualizado');
    return { usuario: usuarioPublico(q.one('SELECT * FROM usuarios WHERE id = ?', ctx.user.id)) };
  }));

  // ── Notificaciones ────────────────────────────────────────
  r.get('/api/notificaciones', con(null, (ctx) => {
    const items = q.all('SELECT * FROM notificaciones WHERE usuario_id = ? ORDER BY id DESC LIMIT 100', ctx.user.id)
      .map((n) => ({ ...n, leida: !!n.leida }));
    return { items, sinLeer: items.filter((n) => !n.leida).length };
  }));
  r.post('/api/notificaciones/leer-todas', con(null, (ctx) => {
    q.run('UPDATE notificaciones SET leida = 1 WHERE usuario_id = ?', ctx.user.id);
    return { ok: true };
  }));
  r.post('/api/notificaciones/:id/leer', con(null, (ctx) => {
    q.run('UPDATE notificaciones SET leida = 1 WHERE id = ? AND usuario_id = ?', entero(ctx.params.id), ctx.user.id);
    return { ok: true };
  }));

  // ── Servicios y médicos (para agendar) ────────────────────
  r.get('/api/servicios', con(null, () => q.all(`
    SELECT s.*, (SELECT COUNT(*) FROM medico_servicios ms JOIN usuarios u ON u.id = ms.medico_id
                  WHERE ms.servicio_id = s.id AND u.activo = 1) AS medicos
    FROM servicios s WHERE s.activo = 1 ORDER BY s.nombre`)));

  r.get('/api/servicios/:id/medicos', con(null, (ctx) => q.all(`
    SELECT u.id, u.nombre, u.apellido, u.registro_medico,
           (SELECT COUNT(*) FROM disponibilidad d WHERE d.medico_id = u.id) AS franjas
    FROM medico_servicios ms JOIN usuarios u ON u.id = ms.medico_id
    WHERE ms.servicio_id = ? AND u.activo = 1 AND u.rol = 'medico'
    ORDER BY u.nombre, u.apellido`, entero(ctx.params.id))));

  // Calcula los horarios libres de un médico para un servicio en una fecha.
  function horarios(medicoId, servicio, fecha, { ignorarCitaId = 0, pacienteId = 0 } = {}) {
    const ahora = ahoraLocal();
    const limiteMin = sumarMinutos(ahora, ANTICIPACION_MIN);
    const limiteMax = sumarDias(hoyLocal(), VENTANA_DIAS);
    if (fecha < hoyLocal() || fecha > limiteMax) return [];
    const franjas = q.all('SELECT * FROM disponibilidad WHERE medico_id = ? AND dia_semana = ? ORDER BY hora_inicio', medicoId, diaSemana(fecha));
    if (!franjas.length) return [];
    const ocupadas = q.all(`SELECT inicio, fin FROM citas WHERE medico_id = ? AND estado IN ${ESTADOS_ACTIVOS}
                            AND substr(inicio,1,10) = ? AND id <> ?`, medicoId, fecha, ignorarCitaId);
    const delPaciente = pacienteId ? q.all(`SELECT inicio, fin FROM citas WHERE paciente_id = ? AND estado IN ${ESTADOS_ACTIVOS}
                            AND substr(inicio,1,10) = ? AND id <> ?`, pacienteId, fecha, ignorarCitaId) : [];
    const out = [];
    const vistos = new Set();
    for (const f of franjas) {
      for (let m = minutos(f.hora_inicio); m + servicio.duracion_min <= minutos(f.hora_fin); m += servicio.duracion_min) {
        const inicio = `${fecha}T${hhmm(m)}`;
        if (vistos.has(inicio)) continue;
        vistos.add(inicio);
        const fin = sumarMinutos(inicio, servicio.duracion_min);
        const choca = (c) => c.inicio < fin && c.fin > inicio;
        let estado = 'libre';
        if (inicio < limiteMin) estado = 'pasado';
        else if (ocupadas.some(choca)) estado = 'ocupado';
        else if (delPaciente.some(choca)) estado = 'cruce';
        out.push({ inicio, hora: hhmm(m), estado });
      }
    }
    return out.sort((a, b) => a.inicio.localeCompare(b.inicio));
  }

  function servicioDe(id) {
    const s = q.one('SELECT * FROM servicios WHERE id = ? AND activo = 1', entero(id));
    if (!s) fail(404, 'Ese servicio ya no está disponible.');
    return s;
  }
  function medicoDe(id, servicioId) {
    const m = q.one(`SELECT u.* FROM usuarios u JOIN medico_servicios ms ON ms.medico_id = u.id
                     WHERE u.id = ? AND ms.servicio_id = ? AND u.rol='medico' AND u.activo = 1`, entero(id), servicioId);
    if (!m) fail(404, 'Ese médico no atiende este servicio.');
    return m;
  }

  r.get('/api/agenda/dias', con(null, (ctx) => {
    const s = servicioDe(ctx.query.get('servicio'));
    const m = medicoDe(ctx.query.get('medico'), s.id);
    const mes = ctx.query.get('mes');
    if (!/^\d{4}-\d{2}$/.test(mes || '')) fail(422, 'Mes inválido.');
    const dias = {};
    for (let d = `${mes}-01`; d.startsWith(mes); d = sumarDias(d, 1)) {
      const hs = horarios(m.id, s, d, { pacienteId: ctx.user.rol === 'paciente' ? ctx.user.id : 0 });
      if (hs.length) dias[d] = hs.filter((h) => h.estado === 'libre').length;
    }
    return { dias, hoy: hoyLocal(), maximo: sumarDias(hoyLocal(), VENTANA_DIAS) };
  }));

  r.get('/api/agenda/horas', con(null, (ctx) => {
    const s = servicioDe(ctx.query.get('servicio'));
    const m = medicoDe(ctx.query.get('medico'), s.id);
    const fecha = ctx.query.get('fecha');
    if (!esFecha(fecha)) fail(422, 'Fecha inválida.');
    return horarios(m.id, s, fecha, { ignorarCitaId: entero(ctx.query.get('ignorar')) || 0, pacienteId: ctx.user.rol === 'paciente' ? ctx.user.id : 0 });
  }));

  // ── Citas ─────────────────────────────────────────────────
  const SELECT_CITA = `
    SELECT c.*, s.nombre AS servicio, s.duracion_min, s.preparacion,
           p.nombre AS paciente_nombre, p.apellido AS paciente_apellido, p.documento AS paciente_documento, p.telefono AS paciente_telefono,
           m.nombre AS medico_nombre, m.apellido AS medico_apellido
    FROM citas c JOIN servicios s ON s.id = c.servicio_id
    JOIN usuarios p ON p.id = c.paciente_id JOIN usuarios m ON m.id = c.medico_id`;

  function citaVisible(id, u) {
    const c = q.one(`${SELECT_CITA} WHERE c.id = ?`, entero(id));
    if (!c) fail(404, 'No encontramos esa cita.');
    if (u.rol === 'paciente' && c.paciente_id !== u.id) fail(404, 'No encontramos esa cita.');
    if (u.rol === 'medico' && c.medico_id !== u.id) fail(404, 'No encontramos esa cita.');
    return c;
  }

  r.get('/api/citas', con(null, (ctx) => {
    const where = [];
    const params = [];
    const u = ctx.user;
    if (u.rol === 'paciente') { where.push('c.paciente_id = ?'); params.push(u.id); }
    if (u.rol === 'medico') { where.push('c.medico_id = ?'); params.push(u.id); }
    const pacienteId = entero(ctx.query.get('paciente'));
    if (pacienteId && u.rol !== 'paciente') { where.push('c.paciente_id = ?'); params.push(pacienteId); }
    const vista = ctx.query.get('vista');
    const ahora = ahoraLocal();
    if (vista === 'proximas') { where.push(`c.estado IN ${ESTADOS_ACTIVOS} AND c.fin >= ?`); params.push(ahora); }
    if (vista === 'historial') { where.push(`(c.estado NOT IN ${ESTADOS_ACTIVOS} OR c.fin < ?)`); params.push(ahora); }
    const fecha = ctx.query.get('fecha');
    if (fecha && esFecha(fecha)) { where.push('substr(c.inicio,1,10) = ?'); params.push(fecha); }
    const estado = ctx.query.get('estado');
    if (estado) { where.push('c.estado = ?'); params.push(estado); }
    const texto = (ctx.query.get('q') || '').trim();
    if (texto) {
      where.push("(p.nombre || ' ' || p.apellido LIKE ? OR p.documento LIKE ? OR m.nombre || ' ' || m.apellido LIKE ? OR s.nombre LIKE ?)");
      const like = `%${texto}%`; params.push(like, like, like, like);
    }
    const orden = vista === 'historial' ? 'DESC' : 'ASC';
    const filas = q.all(`${SELECT_CITA} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.inicio ${orden} LIMIT 300`, ...params);
    return filas.map((c) => ({ ...c, pasada: c.fin < ahora }));
  }));

  r.post('/api/citas', con(['paciente', 'admin'], (ctx) => {
    const b = ctx.body || {};
    const s = servicioDe(b.servicio_id);
    const m = medicoDe(b.medico_id, s.id);
    const pacienteId = ctx.user.rol === 'paciente' ? ctx.user.id : entero(b.paciente_id);
    const paciente = q.one("SELECT * FROM usuarios WHERE id = ? AND rol = 'paciente' AND activo = 1", pacienteId);
    if (!paciente) fail(422, 'Elige un paciente.');
    if (!esFechaHora(b.inicio)) fail(422, 'Elige un día y una hora.');
    const motivo = textoLargo(b, 'motivo', 500);
    const cita = tx(db, () => {
      const h = horarios(m.id, s, b.inicio.slice(0, 10), { pacienteId: paciente.id }).find((x) => x.inicio === b.inicio);
      if (!h) fail(409, 'Ese horario no está en la agenda del médico. Elige otro.');
      if (h.estado === 'ocupado') fail(409, 'Alguien acaba de tomar ese horario. Elige otro.');
      if (h.estado === 'cruce') fail(409, 'Ya tienes otra cita a esa misma hora.');
      if (h.estado === 'pasado') fail(409, 'Ese horario ya no se puede reservar. Elige uno con al menos una hora de anticipación.');
      const res = q.run('INSERT INTO citas (paciente_id, medico_id, servicio_id, inicio, fin, motivo) VALUES (?,?,?,?,?,?)',
        paciente.id, m.id, s.id, b.inicio, sumarMinutos(b.inicio, s.duracion_min), motivo);
      return q.one(`${SELECT_CITA} WHERE c.id = ?`, res.lastInsertRowid);
    });
    notificar(m.id, 'cita_nueva', 'Nueva cita en tu agenda', `${nombreDe(paciente)}, ${s.nombre}, ${fechaLegible(cita.inicio)}.`, '/portal/agenda');
    if (ctx.user.rol === 'admin') notificar(paciente.id, 'cita_nueva', 'La clínica te agendó una cita', `${s.nombre} con ${nombreDe(m)}, ${fechaLegible(cita.inicio)}.`, '/portal/citas');
    auditar(ctx.user.id, 'cita_creada', `#${cita.id} ${s.nombre} ${cita.inicio}`);
    return cita;
  }));

  r.post('/api/citas/:id/cancelar', con(null, (ctx) => {
    const c = citaVisible(ctx.params.id, ctx.user);
    if (!['programada', 'confirmada'].includes(c.estado)) fail(409, 'Esta cita ya no se puede cancelar.');
    if (c.inicio < ahoraLocal()) fail(409, 'Esta cita ya empezó; no se puede cancelar.');
    const motivo = textoLargo(ctx.body, 'motivo', 300);
    q.run("UPDATE citas SET estado='cancelada', cancelada_por=?, motivo_cancelacion=?, actualizado_en=datetime('now') WHERE id=?", ctx.user.id, motivo || null, c.id);
    const quien = ctx.user.rol === 'paciente' ? 'El paciente' : ctx.user.rol === 'medico' ? 'El médico' : 'La clínica';
    const msg = `${c.servicio}, ${fechaLegible(c.inicio)}.${motivo ? ` Motivo: ${motivo}` : ''}`;
    if (ctx.user.id !== c.paciente_id) notificar(c.paciente_id, 'cita_cancelada', `${quien} canceló tu cita`, msg, '/portal/citas');
    if (ctx.user.id !== c.medico_id) notificar(c.medico_id, 'cita_cancelada', `${quien} canceló una cita`, `${c.paciente_nombre} ${c.paciente_apellido}, ${msg}`, '/portal/agenda');
    auditar(ctx.user.id, 'cita_cancelada', `#${c.id}`);
    return citaVisible(c.id, ctx.user);
  }));

  r.post('/api/citas/:id/reprogramar', con(['paciente', 'admin'], (ctx) => {
    const c = citaVisible(ctx.params.id, ctx.user);
    if (!['programada', 'confirmada'].includes(c.estado)) fail(409, 'Esta cita ya no se puede cambiar.');
    if (c.inicio < ahoraLocal()) fail(409, 'Esta cita ya empezó; no se puede cambiar.');
    const inicio = ctx.body?.inicio;
    if (!esFechaHora(inicio)) fail(422, 'Elige el nuevo día y hora.');
    const s = q.one('SELECT * FROM servicios WHERE id = ?', c.servicio_id);
    tx(db, () => {
      const h = horarios(c.medico_id, s, inicio.slice(0, 10), { ignorarCitaId: c.id, pacienteId: c.paciente_id }).find((x) => x.inicio === inicio);
      if (!h || h.estado !== 'libre') fail(409, 'Ese horario ya no está libre. Elige otro.');
      q.run("UPDATE citas SET inicio=?, fin=?, estado='programada', actualizado_en=datetime('now') WHERE id=?", inicio, sumarMinutos(inicio, s.duracion_min), c.id);
    });
    notificar(c.medico_id, 'cita_reprogramada', 'Cita reprogramada', `${c.paciente_nombre} ${c.paciente_apellido} movió su cita de ${fechaLegible(c.inicio)} a ${fechaLegible(inicio)}.`, '/portal/agenda');
    if (ctx.user.rol === 'admin') notificar(c.paciente_id, 'cita_reprogramada', 'La clínica cambió tu cita', `${c.servicio}: ahora es el ${fechaLegible(inicio)}.`, '/portal/citas');
    auditar(ctx.user.id, 'cita_reprogramada', `#${c.id} ${c.inicio} → ${inicio}`);
    return citaVisible(c.id, ctx.user);
  }));

  r.post('/api/citas/:id/confirmar', con(['paciente'], (ctx) => {
    const c = citaVisible(ctx.params.id, ctx.user);
    if (c.estado !== 'programada') fail(409, 'Esta cita no está pendiente de confirmación.');
    if (c.inicio < ahoraLocal()) fail(409, 'Esta cita ya empezó.');
    q.run("UPDATE citas SET estado='confirmada', actualizado_en=datetime('now') WHERE id=?", c.id);
    notificar(c.medico_id, 'cita_confirmada', 'Asistencia confirmada', `${c.paciente_nombre} ${c.paciente_apellido} confirmó su cita del ${fechaLegible(c.inicio)}.`, '/portal/agenda');
    return citaVisible(c.id, ctx.user);
  }));

  r.post('/api/citas/:id/atencion', con(['medico'], (ctx) => {
    const c = citaVisible(ctx.params.id, ctx.user);
    const estado = ctx.body?.estado;
    if (!['atendida', 'no_asistio'].includes(estado)) fail(422, 'Estado inválido.');
    if (!['programada', 'confirmada', 'atendida', 'no_asistio'].includes(c.estado)) fail(409, 'Esta cita fue cancelada.');
    if (c.inicio > ahoraLocal()) fail(409, 'Solo puedes registrar la atención cuando llegue la hora de la cita.');
    q.run("UPDATE citas SET estado=?, notas_medico=?, actualizado_en=datetime('now') WHERE id=?", estado, textoLargo(ctx.body, 'notas', 2000), c.id);
    auditar(ctx.user.id, 'cita_atencion', `#${c.id} ${estado}`);
    return citaVisible(c.id, ctx.user);
  }));

  // ── Resultados clínicos ───────────────────────────────────
  const SELECT_RES = `
    SELECT r.id, r.paciente_id, r.medico_id, r.servicio_id, r.cita_id, r.titulo, r.fecha_examen, r.observaciones,
           r.archivo_nombre, r.archivo_tipo, r.archivo_bytes, r.visto_en, r.creado_en,
           s.nombre AS servicio, m.nombre AS medico_nombre, m.apellido AS medico_apellido,
           p.nombre AS paciente_nombre, p.apellido AS paciente_apellido, p.documento AS paciente_documento
    FROM resultados r LEFT JOIN servicios s ON s.id = r.servicio_id
    JOIN usuarios m ON m.id = r.medico_id JOIN usuarios p ON p.id = r.paciente_id`;

  r.get('/api/resultados', con(['paciente', 'medico'], (ctx) => {
    const where = []; const params = [];
    if (ctx.user.rol === 'paciente') { where.push('r.paciente_id = ?'); params.push(ctx.user.id); }
    else {
      const pid = entero(ctx.query.get('paciente'));
      if (pid) { where.push('r.paciente_id = ?'); params.push(pid); }
      else { where.push('r.medico_id = ?'); params.push(ctx.user.id); }
    }
    const sid = entero(ctx.query.get('servicio'));
    if (sid) { where.push('r.servicio_id = ?'); params.push(sid); }
    const desde = ctx.query.get('desde'); const hasta = ctx.query.get('hasta');
    if (esFecha(desde)) { where.push('r.fecha_examen >= ?'); params.push(desde); }
    if (esFecha(hasta)) { where.push('r.fecha_examen <= ?'); params.push(hasta); }
    const texto = (ctx.query.get('q') || '').trim();
    if (texto) {
      const like = `%${texto}%`;
      where.push("(r.titulo LIKE ? OR r.observaciones LIKE ? OR s.nombre LIKE ? OR p.nombre || ' ' || p.apellido LIKE ? OR p.documento LIKE ?)");
      params.push(like, like, like, like, like);
    }
    return q.all(`${SELECT_RES} WHERE ${where.join(' AND ')} ORDER BY r.fecha_examen DESC, r.id DESC LIMIT 300`, ...params)
      .map((x) => ({ ...x, nuevo: !x.visto_en }));
  }));

  r.post('/api/resultados', con(['medico'], (ctx) => {
    const b = ctx.body || {};
    const e = {};
    const paciente = q.one("SELECT * FROM usuarios WHERE id = ? AND rol = 'paciente'", entero(b.paciente_id));
    if (!paciente) e.paciente_id = 'Elige el paciente.';
    const titulo = texto(b, 'titulo', { etiqueta: 'el nombre del examen', max: 120 }, e);
    const fecha = String(b.fecha_examen ?? '');
    if (!esFecha(fecha) || fecha > hoyLocal()) e.fecha_examen = 'Escribe la fecha en que se hizo el examen (no puede ser futura).';
    const servicio = b.servicio_id ? q.one('SELECT * FROM servicios WHERE id = ?', entero(b.servicio_id)) : null;
    const observaciones = textoLargo(b, 'observaciones', 4000);
    let archivo = null;
    if (b.archivo?.datos) {
      const tipo = String(b.archivo.tipo || '');
      if (!TIPOS_ARCHIVO[tipo]) e.archivo = 'Solo se aceptan archivos PDF, JPG o PNG.';
      else {
        const buf = Buffer.from(String(b.archivo.datos), 'base64');
        if (buf.length > MAX_ARCHIVO) e.archivo = 'El archivo supera 10 MB.';
        else if (tipo === 'application/pdf' && buf.subarray(0, 5).toString() !== '%PDF-') e.archivo = 'El archivo no parece un PDF válido.';
        else archivo = { buf, tipo, nombre: String(b.archivo.nombre || 'resultado').replace(/[^\w.\- áéíóúñÁÉÍÓÚÑ()]/g, '_').slice(0, 120) };
      }
    }
    if (!archivo && !observaciones && !e.archivo) e.archivo = 'Adjunta el archivo del resultado o escribe las observaciones.';
    let citaId = entero(b.cita_id);
    if (citaId && !q.one('SELECT 1 FROM citas WHERE id = ? AND paciente_id = ? AND medico_id = ?', citaId, paciente?.id, ctx.user.id)) citaId = null;
    siHayErrores(e);
    let ruta = null;
    if (archivo) {
      ruta = randomUUID() + TIPOS_ARCHIVO[archivo.tipo];
      writeFileSync(join(uploadsDir, ruta), archivo.buf);
    }
    const res = q.run(`INSERT INTO resultados (paciente_id, medico_id, servicio_id, cita_id, titulo, fecha_examen, observaciones,
                       archivo_nombre, archivo_ruta, archivo_tipo, archivo_bytes) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      paciente.id, ctx.user.id, servicio?.id ?? null, citaId, titulo, fecha, observaciones,
      archivo?.nombre ?? null, ruta, archivo?.tipo ?? null, archivo?.buf.length ?? null);
    notificar(paciente.id, 'resultado_nuevo', 'Tienes un resultado nuevo', `${titulo}, cargado por ${nombreDe(ctx.user)}.`, `/portal/resultados/${res.lastInsertRowid}`);
    auditar(ctx.user.id, 'resultado_cargado', `#${res.lastInsertRowid} para ${paciente.documento}`);
    return q.one(`${SELECT_RES} WHERE r.id = ?`, res.lastInsertRowid);
  }, ), { limite: 15 * 1024 * 1024 });

  function resultadoVisible(id, u) {
    const x = q.one('SELECT * FROM resultados WHERE id = ?', entero(id));
    if (!x || (u.rol === 'paciente' && x.paciente_id !== u.id) || u.rol === 'admin') fail(404, 'No encontramos ese resultado.');
    return x;
  }

  r.get('/api/resultados/:id', con(['paciente', 'medico'], (ctx) => {
    const x = resultadoVisible(ctx.params.id, ctx.user);
    if (ctx.user.rol === 'paciente' && !x.visto_en) q.run("UPDATE resultados SET visto_en = datetime('now') WHERE id = ?", x.id);
    const out = q.one(`${SELECT_RES} WHERE r.id = ?`, x.id);
    return { ...out, nuevo: !out.visto_en };
  }));

  r.get('/api/resultados/:id/archivo', con(['paciente', 'medico'], (ctx) => {
    const x = resultadoVisible(ctx.params.id, ctx.user);
    if (!x.archivo_ruta) fail(404, 'Este resultado no tiene archivo adjunto.');
    const file = join(uploadsDir, x.archivo_ruta);
    if (!existsSync(file)) fail(404, 'El archivo ya no está disponible. Pide a la clínica que lo cargue de nuevo.');
    if (ctx.user.rol === 'paciente' && !x.visto_en) q.run("UPDATE resultados SET visto_en = datetime('now') WHERE id = ?", x.id);
    auditar(ctx.user.id, 'resultado_descargado', `#${x.id}`);
    const inline = ctx.query.get('ver') === '1';
    return {
      __raw: true, status: 200, body: readFileSync(file),
      headers: {
        'Content-Type': x.archivo_tipo, 'Cache-Control': 'private, no-store',
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(x.archivo_nombre)}`,
      },
    };
  }));

  r.delete('/api/resultados/:id', con(['medico'], (ctx) => {
    const x = resultadoVisible(ctx.params.id, ctx.user);
    if (x.medico_id !== ctx.user.id) fail(403, 'Solo quien cargó el resultado puede eliminarlo.');
    q.run('DELETE FROM resultados WHERE id = ?', x.id);
    if (x.archivo_ruta) { try { unlinkSync(join(uploadsDir, x.archivo_ruta)); } catch {} }
    auditar(ctx.user.id, 'resultado_eliminado', `#${x.id}`);
    return { ok: true };
  }));

  // ── Resumen según el rol ──────────────────────────────────
  r.get('/api/resumen', con(null, (ctx) => {
    const u = ctx.user; const ahora = ahoraLocal(); const hoy = hoyLocal();
    if (u.rol === 'paciente') {
      return {
        proxima: q.one(`${SELECT_CITA} WHERE c.paciente_id = ? AND c.estado IN ${ESTADOS_ACTIVOS} AND c.fin >= ? ORDER BY c.inicio LIMIT 1`, u.id, ahora) || null,
        citasProximas: q.one(`SELECT COUNT(*) n FROM citas WHERE paciente_id = ? AND estado IN ${ESTADOS_ACTIVOS} AND fin >= ?`, u.id, ahora).n,
        resultadosNuevos: q.one('SELECT COUNT(*) n FROM resultados WHERE paciente_id = ? AND visto_en IS NULL', u.id).n,
        resultadosTotal: q.one('SELECT COUNT(*) n FROM resultados WHERE paciente_id = ?', u.id).n,
        ultimosResultados: q.all(`${SELECT_RES} WHERE r.paciente_id = ? ORDER BY r.fecha_examen DESC, r.id DESC LIMIT 3`, u.id).map((x) => ({ ...x, nuevo: !x.visto_en })),
      };
    }
    if (u.rol === 'medico') {
      return {
        hoy: q.all(`${SELECT_CITA} WHERE c.medico_id = ? AND substr(c.inicio,1,10) = ? AND c.estado <> 'cancelada' ORDER BY c.inicio`, u.id, hoy),
        semana: q.one(`SELECT COUNT(*) n FROM citas WHERE medico_id = ? AND estado IN ${ESTADOS_ACTIVOS} AND inicio >= ? AND inicio < ?`, u.id, ahora, sumarDias(hoy, 7)).n,
        porRegistrar: q.one(`SELECT COUNT(*) n FROM citas WHERE medico_id = ? AND estado IN ${ESTADOS_ACTIVOS} AND fin < ?`, u.id, ahora).n,
        resultadosMes: q.one("SELECT COUNT(*) n FROM resultados WHERE medico_id = ? AND creado_en >= datetime('now','-30 days')", u.id).n,
        tieneHorario: !!q.one('SELECT 1 FROM disponibilidad WHERE medico_id = ?', u.id),
        servicios: q.all('SELECT s.id, s.nombre FROM medico_servicios ms JOIN servicios s ON s.id = ms.servicio_id WHERE ms.medico_id = ? ORDER BY s.nombre', u.id),
      };
    }
    return {
      pacientes: q.one("SELECT COUNT(*) n FROM usuarios WHERE rol='paciente'").n,
      medicos: q.one("SELECT COUNT(*) n FROM usuarios WHERE rol='medico' AND activo=1").n,
      servicios: q.one('SELECT COUNT(*) n FROM servicios WHERE activo=1').n,
      citasHoy: q.one(`SELECT COUNT(*) n FROM citas WHERE substr(inicio,1,10) = ? AND estado <> 'cancelada'`, hoy).n,
      citasSemana: q.one(`SELECT COUNT(*) n FROM citas WHERE estado IN ${ESTADOS_ACTIVOS} AND inicio >= ? AND inicio < ?`, ahora, sumarDias(hoy, 7)).n,
      solicitudes: q.one("SELECT COUNT(*) n FROM solicitudes_clave WHERE estado='pendiente'").n,
      medicosSinHorario: q.all(`SELECT id, nombre, apellido FROM usuarios u WHERE rol='medico' AND activo=1
                                AND NOT EXISTS (SELECT 1 FROM disponibilidad d WHERE d.medico_id = u.id)`),
      serviciosSinMedico: q.all(`SELECT id, nombre FROM servicios s WHERE activo=1 AND NOT EXISTS
                                (SELECT 1 FROM medico_servicios ms JOIN usuarios u ON u.id=ms.medico_id WHERE ms.servicio_id=s.id AND u.activo=1)`),
      actividad: q.all(`SELECT a.*, u.nombre, u.apellido, u.rol FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id ORDER BY a.id DESC LIMIT 8`),
    };
  }));

  // ── Médico: pacientes y horario ───────────────────────────
  r.get('/api/medico/pacientes', con(['medico', 'admin'], (ctx) => {
    const texto = (ctx.query.get('q') || '').trim();
    const like = `%${texto}%`;
    const base = `SELECT u.id, u.nombre, u.apellido, u.tipo_documento, u.documento, u.telefono, u.email, u.fecha_nacimiento, u.eps,
                  (SELECT MAX(inicio) FROM citas c WHERE c.paciente_id = u.id AND c.medico_id = ?) AS ultima_cita,
                  (SELECT COUNT(*) FROM resultados r WHERE r.paciente_id = u.id) AS resultados
                  FROM usuarios u WHERE u.rol = 'paciente' AND u.activo = 1`;
    if (texto) return q.all(`${base} AND (u.nombre || ' ' || u.apellido LIKE ? OR u.documento LIKE ?) ORDER BY u.nombre LIMIT 50`, ctx.user.id, like, like);
    // Sin búsqueda: pacientes con citas con este médico
    return q.all(`${base} AND EXISTS (SELECT 1 FROM citas c WHERE c.paciente_id = u.id AND c.medico_id = ?) ORDER BY ultima_cita DESC LIMIT 100`, ctx.user.id, ctx.user.id);
  }));

  r.get('/api/medico/pacientes/:id', con(['medico'], (ctx) => {
    const p = q.one("SELECT * FROM usuarios WHERE id = ? AND rol = 'paciente'", entero(ctx.params.id));
    if (!p) fail(404, 'No encontramos ese paciente.');
    return {
      paciente: usuarioPublico(p),
      citas: q.all(`${SELECT_CITA} WHERE c.paciente_id = ? AND c.medico_id = ? ORDER BY c.inicio DESC LIMIT 50`, p.id, ctx.user.id),
      resultados: q.all(`${SELECT_RES} WHERE r.paciente_id = ? ORDER BY r.fecha_examen DESC LIMIT 50`, p.id),
    };
  }));

  r.get('/api/medico/disponibilidad', con(['medico'], (ctx) =>
    q.all('SELECT dia_semana, hora_inicio, hora_fin FROM disponibilidad WHERE medico_id = ? ORDER BY dia_semana, hora_inicio', ctx.user.id)));

  r.put('/api/medico/disponibilidad', con(['medico'], (ctx) => {
    const franjas = Array.isArray(ctx.body?.franjas) ? ctx.body.franjas : fail(422, 'Formato inválido.');
    if (franjas.length > 50) fail(422, 'Demasiadas franjas.');
    const limpias = [];
    for (const f of franjas) {
      const dia = Number(f.dia_semana);
      if (!Number.isInteger(dia) || dia < 0 || dia > 6 || !esHora(f.hora_inicio) || !esHora(f.hora_fin)) fail(422, 'Revisa las horas: usa el formato HH:MM.');
      if (f.hora_inicio >= f.hora_fin) fail(422, 'En cada franja, la hora de inicio debe ser anterior a la hora de fin.');
      limpias.push({ dia, i: f.hora_inicio, f: f.hora_fin });
    }
    limpias.sort((a, b) => a.dia - b.dia || a.i.localeCompare(b.i));
    for (let k = 1; k < limpias.length; k++) {
      if (limpias[k].dia === limpias[k - 1].dia && limpias[k].i < limpias[k - 1].f) fail(422, 'Hay franjas que se cruzan el mismo día. Ajusta las horas.');
    }
    tx(db, () => {
      q.run('DELETE FROM disponibilidad WHERE medico_id = ?', ctx.user.id);
      for (const f of limpias) q.run('INSERT INTO disponibilidad (medico_id, dia_semana, hora_inicio, hora_fin) VALUES (?,?,?,?)', ctx.user.id, f.dia, f.i, f.f);
    });
    auditar(ctx.user.id, 'horario_actualizado', `${limpias.length} franjas`);
    return q.all('SELECT dia_semana, hora_inicio, hora_fin FROM disponibilidad WHERE medico_id = ? ORDER BY dia_semana, hora_inicio', ctx.user.id);
  }));

  // ── Administración ────────────────────────────────────────
  const soloAdmin = (h) => con(['admin'], h);

  r.get('/api/admin/usuarios', soloAdmin((ctx) => {
    const where = []; const params = [];
    const rol = ctx.query.get('rol');
    if (ROLES.includes(rol)) { where.push('u.rol = ?'); params.push(rol); }
    const texto = (ctx.query.get('q') || '').trim();
    if (texto) { const like = `%${texto}%`; where.push("(u.nombre || ' ' || u.apellido LIKE ? OR u.documento LIKE ? OR u.email LIKE ?)"); params.push(like, like, like); }
    const filas = q.all(`SELECT u.* FROM usuarios u ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY u.creado_en DESC LIMIT 500`, ...params);
    const servs = q.all('SELECT ms.medico_id, s.id, s.nombre FROM medico_servicios ms JOIN servicios s ON s.id = ms.servicio_id');
    return filas.map((u) => ({ ...usuarioPublico(u), servicios: servs.filter((s) => s.medico_id === u.id).map(({ id, nombre }) => ({ id, nombre })) }));
  }));

  function asignarServicios(medicoId, ids) {
    const validos = (Array.isArray(ids) ? ids : []).map(entero).filter(Boolean)
      .filter((id) => q.one('SELECT 1 FROM servicios WHERE id = ?', id));
    q.run('DELETE FROM medico_servicios WHERE medico_id = ?', medicoId);
    for (const id of new Set(validos)) q.run('INSERT INTO medico_servicios (medico_id, servicio_id) VALUES (?,?)', medicoId, id);
  }

  r.post('/api/admin/usuarios', soloAdmin((ctx) => {
    const b = ctx.body || {};
    const e = {};
    const rol = b.rol;
    if (!['medico', 'admin', 'paciente'].includes(rol)) e.rol = 'Elige el tipo de cuenta.';
    const d = datosPersona(b, e, { conClave: false });
    const registro = texto(b, 'registro_medico', { requerido: rol === 'medico', etiqueta: 'el registro médico', max: 30 }, e);
    verificarUnicos(d, e);
    siHayErrores(e);
    const clave = tempPassword();
    const id = tx(db, () => {
      const res = q.run(`INSERT INTO usuarios (rol,nombre,apellido,tipo_documento,documento,email,telefono,fecha_nacimiento,eps,registro_medico,password_hash,debe_cambiar_clave)
                         VALUES (?,?,?,?,?,?,?,?,?,?,?,1)`, rol, d.nombre, d.apellido, d.tipo_documento, d.documento, d.email,
        d.telefono || null, d.fecha_nacimiento || null, d.eps || null, registro || null, hashPassword(clave));
      if (rol === 'medico') asignarServicios(res.lastInsertRowid, b.servicios);
      return res.lastInsertRowid;
    });
    const u = q.one('SELECT * FROM usuarios WHERE id = ?', id);
    const etiqueta = { medico: 'médico', admin: 'administrador', paciente: 'paciente' }[rol];
    notificar(u.id, 'bienvenida', 'Bienvenido a Neumoser', rol === 'medico'
      ? 'Configura tu horario de atención para que los pacientes puedan agendar contigo.'
      : 'Tu cuenta fue creada por la administración de la clínica.', rol === 'medico' ? '/portal/horario' : null);
    auditar(ctx.user.id, 'usuario_creado', `${etiqueta}: ${nombreDe(u)} (${u.documento})`);
    return { usuario: usuarioPublico(u), claveTemporal: clave };
  }));

  r.patch('/api/admin/usuarios/:id', soloAdmin((ctx) => {
    const u = q.one('SELECT * FROM usuarios WHERE id = ?', entero(ctx.params.id));
    if (!u) fail(404, 'No encontramos esa cuenta.');
    const b = ctx.body || {};
    if (b.activo !== undefined) {
      if (u.id === ctx.user.id) fail(409, 'No puedes desactivar tu propia cuenta.');
      if (!b.activo && u.rol === 'admin' && q.one("SELECT COUNT(*) n FROM usuarios WHERE rol='admin' AND activo=1").n <= 1) fail(409, 'Debe quedar al menos un administrador activo.');
      q.run('UPDATE usuarios SET activo = ? WHERE id = ?', b.activo ? 1 : 0, u.id);
      if (!b.activo) q.run('DELETE FROM sesiones WHERE usuario_id = ?', u.id);
      auditar(ctx.user.id, b.activo ? 'usuario_activado' : 'usuario_desactivado', `${nombreDe(u)} (${u.documento})`);
    }
    if (b.datos) {
      const e = {};
      const d = datosPersona({ ...usuarioPublico(u), ...b.datos }, e, { conClave: false });
      const registro = texto(b.datos, 'registro_medico', { requerido: u.rol === 'medico', etiqueta: 'el registro médico', max: 30 }, e);
      verificarUnicos(d, e, u.id);
      siHayErrores(e);
      q.run(`UPDATE usuarios SET nombre=?, apellido=?, tipo_documento=?, documento=?, email=?, telefono=?, eps=?, registro_medico=? WHERE id=?`,
        d.nombre, d.apellido, d.tipo_documento, d.documento, d.email, d.telefono || null, d.eps || null, registro || null, u.id);
      auditar(ctx.user.id, 'usuario_editado', `${d.nombre} ${d.apellido}`);
    }
    if (b.servicios !== undefined && u.rol === 'medico') {
      asignarServicios(u.id, b.servicios);
      auditar(ctx.user.id, 'servicios_asignados', nombreDe(u));
    }
    const out = q.one('SELECT * FROM usuarios WHERE id = ?', u.id);
    return { ...usuarioPublico(out), servicios: q.all('SELECT s.id, s.nombre FROM medico_servicios ms JOIN servicios s ON s.id=ms.servicio_id WHERE ms.medico_id=?', u.id) };
  }));

  r.post('/api/admin/usuarios/:id/restablecer-clave', soloAdmin((ctx) => {
    const u = q.one('SELECT * FROM usuarios WHERE id = ?', entero(ctx.params.id));
    if (!u) fail(404, 'No encontramos esa cuenta.');
    const clave = tempPassword();
    q.run('UPDATE usuarios SET password_hash = ?, debe_cambiar_clave = 1 WHERE id = ?', hashPassword(clave), u.id);
    q.run('DELETE FROM sesiones WHERE usuario_id = ?', u.id);
    q.run("UPDATE solicitudes_clave SET estado='atendida', atendida_por=?, atendida_en=datetime('now') WHERE usuario_id=? AND estado='pendiente'", ctx.user.id, u.id);
    auditar(ctx.user.id, 'clave_restablecida', `${nombreDe(u)} (${u.documento})`);
    return { claveTemporal: clave };
  }));

  r.get('/api/admin/solicitudes', soloAdmin(() => q.all(`
    SELECT s.*, u.nombre, u.apellido, u.documento, u.email, u.telefono, u.rol
    FROM solicitudes_clave s JOIN usuarios u ON u.id = s.usuario_id
    ORDER BY (s.estado = 'pendiente') DESC, s.id DESC LIMIT 200`)));

  r.post('/api/admin/solicitudes/:id/descartar', soloAdmin((ctx) => {
    q.run("UPDATE solicitudes_clave SET estado='descartada', atendida_por=?, atendida_en=datetime('now') WHERE id=? AND estado='pendiente'", ctx.user.id, entero(ctx.params.id));
    return { ok: true };
  }));

  r.get('/api/admin/servicios', soloAdmin(() => q.all(`
    SELECT s.*, (SELECT COUNT(*) FROM medico_servicios ms JOIN usuarios u ON u.id=ms.medico_id WHERE ms.servicio_id = s.id AND u.activo=1) AS medicos,
           (SELECT COUNT(*) FROM citas c WHERE c.servicio_id = s.id) AS citas
    FROM servicios s ORDER BY s.activo DESC, s.nombre`)));

  function datosServicio(b, e) {
    const d = {
      nombre: texto(b, 'nombre', { etiqueta: 'el nombre del servicio', max: 80 }, e),
      descripcion: texto(b, 'descripcion', { requerido: false, max: 300 }, e),
      preparacion: textoLargo(b, 'preparacion', 600),
      duracion_min: Number(b.duracion_min),
    };
    if (!Number.isInteger(d.duracion_min) || d.duracion_min < 10 || d.duracion_min > 240) e.duracion_min = 'La duración debe estar entre 10 y 240 minutos.';
    return d;
  }

  r.post('/api/admin/servicios', soloAdmin((ctx) => {
    const e = {};
    const d = datosServicio(ctx.body, e);
    if (d.nombre && q.one('SELECT 1 FROM servicios WHERE nombre = ?', d.nombre)) e.nombre = 'Ya existe un servicio con ese nombre.';
    siHayErrores(e);
    const res = q.run('INSERT INTO servicios (nombre, descripcion, duracion_min, preparacion) VALUES (?,?,?,?)', d.nombre, d.descripcion, d.duracion_min, d.preparacion);
    auditar(ctx.user.id, 'servicio_creado', d.nombre);
    return q.one('SELECT * FROM servicios WHERE id = ?', res.lastInsertRowid);
  }));

  r.patch('/api/admin/servicios/:id', soloAdmin((ctx) => {
    const s = q.one('SELECT * FROM servicios WHERE id = ?', entero(ctx.params.id));
    if (!s) fail(404, 'No encontramos ese servicio.');
    const b = ctx.body || {};
    if (b.activo !== undefined) {
      q.run('UPDATE servicios SET activo = ? WHERE id = ?', b.activo ? 1 : 0, s.id);
      auditar(ctx.user.id, b.activo ? 'servicio_activado' : 'servicio_pausado', s.nombre);
    } else {
      const e = {};
      const d = datosServicio({ ...s, ...b }, e);
      if (d.nombre && q.one('SELECT 1 FROM servicios WHERE nombre = ? AND id <> ?', d.nombre, s.id)) e.nombre = 'Ya existe un servicio con ese nombre.';
      siHayErrores(e);
      q.run('UPDATE servicios SET nombre=?, descripcion=?, duracion_min=?, preparacion=? WHERE id=?', d.nombre, d.descripcion, d.duracion_min, d.preparacion, s.id);
      auditar(ctx.user.id, 'servicio_editado', d.nombre);
    }
    return q.one('SELECT * FROM servicios WHERE id = ?', s.id);
  }));

  r.put('/api/admin/clinica', soloAdmin((ctx) => {
    const e = {};
    const b = ctx.body || {};
    const correo = String(b.correo ?? '').trim();
    if (correo && !EMAIL_RE.test(correo)) e.correo = 'Escribe un correo válido.';
    siHayErrores(e);
    for (const [k, max] of Object.entries(CAMPOS_CLINICA)) {
      const v = textoLargo(b, k, max);
      q.run('INSERT INTO ajustes (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor', `clinica.${k}`, v);
    }
    auditar(ctx.user.id, 'clinica_actualizada');
    return leerClinica();
  }));

  r.get('/api/admin/auditoria', soloAdmin((ctx) => {
    const antes = entero(ctx.query.get('antes'));
    return q.all(`SELECT a.*, u.nombre, u.apellido, u.rol FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id
                  ${antes ? 'WHERE a.id < ?' : ''} ORDER BY a.id DESC LIMIT 50`, ...(antes ? [antes] : []));
  }));

  r.get('/api/admin/pacientes', soloAdmin((ctx) => {
    const like = `%${(ctx.query.get('q') || '').trim()}%`;
    return q.all(`SELECT id, nombre, apellido, documento, telefono FROM usuarios WHERE rol='paciente' AND activo=1
                  AND (nombre || ' ' || apellido LIKE ? OR documento LIKE ?) ORDER BY nombre LIMIT 20`, like, like);
  }));

  return r;
}
