// Utilidades de interfaz: plantillas seguras, íconos, tostadas, modales, estados vacíos y de carga.

// ── Plantillas con escape automático ─────────────────────────
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(String(s ?? ''));
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const val = (v) => {
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(val).join('');
  if (v === false || v === null || v === undefined) return '';
  return esc(v);
};
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => { out += val(v) + strings[i + 1]; });
  return new Raw(out);
}

// ── Íconos (trazos de 24×24) ─────────────────────────────────
const P = {
  inicio: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>',
  resultados: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
  citas: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  campana: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8.5 3 8.5H3S6 15 6 8"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  ayuda: '<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4.5"/><path d="M12 17.5h.01"/>',
  perfil: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>',
  salir: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  pacientes: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.6c2 .7 3.5 2.4 3.5 5.4"/>',
  reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  subir: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  descargar: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  ojo: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12"/><circle cx="12" cy="12" r="3"/>',
  ojoNo: '<path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.4 0 10 8 10 8a17 17 0 0 1-2.16 3.19M6.6 6.6C3.8 8.4 2 12 2 12s3.6 8 10 8a9.7 9.7 0 0 0 5.4-1.6"/><path d="M14.1 14.1a3 3 0 1 1-4.2-4.2M2 2l20 20"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checkCirculo: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  alerta: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4.5M12 16h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  flecha: '<path d="m9 18 6-6-6-6"/>',
  atras: '<path d="m15 18-6-6 6-6"/>',
  buscar: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  usuarios: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><path d="M19 8v6M16 11h6"/>',
  servicios: '<path d="M12 3c-1.5 2.5-4 4-4 8a4 4 0 0 0 8 0c0-4-2.5-5.5-4-8"/><path d="M12 15v6M9 21h6"/>',
  pulmon: '<path d="M12 4v7"/><path d="M12 11c-1.5 1-2.5 1-3.5 0"/><path d="M12 11c1.5 1 2.5 1 3.5 0"/><path d="M8.5 7.5C6 8 3 11 3 16.5 3 19 4.5 20 6.5 20s3.5-1 3.5-4v-6.5c0-1.5-.5-2.2-1.5-2"/><path d="M15.5 7.5C18 8 21 11 21 16.5c0 2.5-1.5 3.5-3.5 3.5S14 19 14 16v-6.5c0-1.5.5-2.2 1.5-2"/>',
  llave: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.3-9.3M17 6l3 3M14.5 8.5 17 11"/>',
  actividad: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  editar: '<path d="M4 20h4L19 9a2.83 2.83 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  papelera: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M9 7V4h6v3"/>',
  copiar: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  escudo: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  telefono: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  ubicacion: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21"/><circle cx="12" cy="9.5" r="2.5"/>',
  archivo: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  calendarioCheck: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="m9 15 2 2 4-4"/>',
  repetir: '<path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  pausa: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  abajo: '<path d="m6 9 6 6 6-6"/>',
  estetoscopio: '<path d="M5 3v6a5 5 0 0 0 10 0V3"/><path d="M10 14v2a5 5 0 0 0 10 0v-3"/><circle cx="20" cy="11" r="2"/>',
};
export function icono(nombre, attrs = '') {
  return raw(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${attrs}>${P[nombre] || ''}</svg>`);
}

export const simbolo = raw(`<svg class="marca-simbolo" viewBox="0 0 40 40" aria-hidden="true">
  <circle cx="20" cy="20" r="19" fill="#0b4f4c"/>
  <circle cx="20" cy="20" r="13" fill="none" stroke="#8ee0d6" stroke-width="1.6" opacity=".55"/>
  <circle cx="20" cy="20" r="8" fill="none" stroke="#dff1ec" stroke-width="1.8"/>
  <path d="M20 9v8" stroke="#dff1ec" stroke-width="1.8" stroke-linecap="round"/>
</svg>`);

export const marca = (href = '/') => html`<a class="marca" href="${href}" data-link>
  ${simbolo}<span class="marca-texto"><span class="marca-nombre">Neumoser</span><span class="marca-sub">Neumología y Rehabilitación</span></span></a>`;

// ── Formatos ─────────────────────────────────────────────────
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const DIAS_SEMANA = DIAS;
const partes = (s) => { const [d] = s.split('T'); const [y, m, dd] = d.split('-').map(Number); return { y, m, d: dd, dow: new Date(Date.UTC(y, m - 1, dd)).getUTCDay() }; };
export const mesCorto = (s) => MESES[partes(s).m - 1].slice(0, 3);
export const diaNum = (s) => partes(s).d;
export const diaSem = (s) => DIAS[partes(s).dow];
export function fecha(s, { conDia = false, conAnio = true } = {}) {
  if (!s) return '';
  const p = partes(s);
  return `${conDia ? DIAS[p.dow] + ' ' : ''}${p.d} de ${MESES[p.m - 1]}${conAnio ? ' de ' + p.y : ''}`;
}
export function hora(s) {
  const t = s.includes('T') ? s.split('T')[1] : s;
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}
export const fechaHora = (s, o) => `${fecha(s, o)}, ${hora(s)}`;
export const nombreMes = (y, m) => `${MESES[m - 1]} de ${y}`;
export function hace(sqlUtc) {
  if (!sqlUtc) return '';
  const t = new Date(sqlUtc.replace(' ', 'T') + 'Z').getTime();
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'hace un momento';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  if (s < 86400 * 7) { const d = Math.round(s / 86400); return d === 1 ? 'ayer' : `hace ${d} días`; }
  return new Date(t).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
}
export const tamano = (b) => b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;
export const iniciales = (u) => `${(u.nombre || '?')[0]}${(u.apellido || '')[0] || ''}`.toUpperCase();
export const nombreCompleto = (u) => `${u.nombre} ${u.apellido}`;
export const ROL = { paciente: 'Paciente', medico: 'Personal médico', admin: 'Administrador' };
export const ESTADO_CITA = { programada: 'Por confirmar', confirmada: 'Confirmada', atendida: 'Atendida', cancelada: 'Cancelada', no_asistio: 'No asistió' };
export const estadoCita = (c) => html`<span class="estado estado-${c.estado}">${ESTADO_CITA[c.estado]}</span>`;

// ── Estados vacíos ───────────────────────────────────────────
const ILUS = {
  citas: `<rect x="22" y="18" width="76" height="62" rx="8" fill="#fff" stroke="#cfe3df" stroke-width="2"/><path d="M22 34h76" stroke="#cfe3df" stroke-width="2"/><path d="M40 12v12M80 12v12" stroke="#15807a" stroke-width="3" stroke-linecap="round"/><rect x="34" y="44" width="12" height="10" rx="2" fill="#e3efec"/><rect x="54" y="44" width="12" height="10" rx="2" fill="#e3efec"/><rect x="74" y="44" width="12" height="10" rx="2" fill="#15807a" opacity=".85"/><rect x="34" y="60" width="12" height="10" rx="2" fill="#e3efec"/><rect x="54" y="60" width="12" height="10" rx="2" fill="#e3efec"/>`,
  resultados: `<rect x="30" y="10" width="60" height="76" rx="7" fill="#fff" stroke="#cfe3df" stroke-width="2"/><path d="M42 30h36M42 42h36M42 54h22" stroke="#e3efec" stroke-width="5" stroke-linecap="round"/><circle cx="82" cy="70" r="15" fill="#0b4f4c"/><path d="m75 70 5 5 9-9" stroke="#8ee0d6" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  campana: `<circle cx="60" cy="48" r="34" fill="#f1f7f5"/><path d="M44 44a16 16 0 1 1 32 0c0 14 6 18 6 18H38s6-4 6-18" fill="#fff" stroke="#15807a" stroke-width="2.5" stroke-linejoin="round"/><path d="M55 70a5.5 5.5 0 0 0 10 0" stroke="#15807a" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,
  buscar: `<circle cx="54" cy="44" r="24" fill="#fff" stroke="#cfe3df" stroke-width="3"/><path d="m72 62 16 16" stroke="#15807a" stroke-width="6" stroke-linecap="round"/><path d="M45 44h18" stroke="#e3efec" stroke-width="5" stroke-linecap="round"/>`,
  personas: `<circle cx="46" cy="36" r="13" fill="#e3efec"/><path d="M22 82c0-14 11-22 24-22s24 8 24 22" fill="#e3efec"/><circle cx="76" cy="40" r="11" fill="#fff" stroke="#15807a" stroke-width="2.5"/><path d="M58 84c0-12 8-19 18-19s18 7 18 19" fill="#fff" stroke="#15807a" stroke-width="2.5"/>`,
  reloj: `<circle cx="60" cy="48" r="32" fill="#fff" stroke="#cfe3df" stroke-width="3"/><path d="M60 30v18l12 8" stroke="#15807a" stroke-width="4" stroke-linecap="round" fill="none"/>`,
  listo: `<circle cx="60" cy="48" r="32" fill="#e3f3ea"/><path d="m46 48 10 10 19-20" stroke="#1f6a48" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
};
export function vacio({ ilus = 'buscar', titulo, texto, accion = '', compacto = false }) {
  return html`<div class="vacio ${compacto ? 'vacio-compacto' : ''}" role="status">
    ${raw(`<svg class="vacio-ilus" viewBox="0 0 120 96" aria-hidden="true">${ILUS[ilus] || ILUS.buscar}</svg>`)}
    <h3>${titulo}</h3>${texto ? html`<p>${texto}</p>` : ''}${accion}</div>`;
}

// ── Esqueletos de carga ──────────────────────────────────────
export const esqLista = (n = 3) => html`<div aria-hidden="true">${Array.from({ length: n }, (_, i) => html`
  <div class="esq-item"><div class="esq esq-circulo"></div><div><div class="esq esq-linea" style="width:${raw(55 - i * 8)}%"></div><div class="esq esq-linea" style="width:${raw(32 + i * 6)}%;height:11px"></div></div></div>`)}</div>
  <span class="sr" role="status">Cargando…</span>`;
export const esqCifras = (n = 3) => html`<div class="cifras" aria-hidden="true">${Array.from({ length: n }, () => html`<div class="cifra"><div class="esq esq-cifra"></div><div class="esq esq-linea" style="width:70%;margin-top:.6rem"></div></div>`)}</div>`;
export const esqPanel = (n = 3, titulo = true) => html`<div class="panel panel-sin-pad">${titulo ? html`<div class="panel-cab"><div class="esq esq-titulo" style="margin-bottom:.5rem"></div></div>` : ''}${esqLista(n)}</div>`;
export const esqTabla = (filas = 5, cols = 4) => html`<div class="panel panel-sin-pad" aria-hidden="true"><table class="tabla"><tbody>${Array.from({ length: filas }, () => html`<tr>${Array.from({ length: cols }, (_, j) => html`<td><div class="esq esq-linea" style="width:${raw(j === 0 ? 70 : 50)}%"></div></td>`)}</tr>`)}</tbody></table></div><span class="sr" role="status">Cargando…</span>`;
export const cargandoPagina = () => html`<div class="cargando-pagina" role="status"><div class="respira-mini"></div><span class="sr">Cargando…</span></div>`;

// ── Botón ocupado ────────────────────────────────────────────
export async function ocupado(btn, fn) {
  if (!btn || btn.getAttribute('aria-busy') === 'true') return;
  btn.setAttribute('aria-busy', 'true');
  btn.disabled = true;
  const giro = document.createElement('span');
  giro.className = 'giro'; giro.setAttribute('aria-hidden', 'true');
  btn.appendChild(giro);
  try { return await fn(); }
  finally { btn.removeAttribute('aria-busy'); btn.disabled = false; giro.remove(); }
}

// ── Errores de formulario ────────────────────────────────────
export function limpiarErrores(form) {
  form.querySelectorAll('.error-campo').forEach((e) => e.remove());
  form.querySelectorAll('[aria-invalid]').forEach((e) => { e.removeAttribute('aria-invalid'); e.removeAttribute('aria-describedby'); });
  form.querySelector('.aviso-error[data-form]')?.remove();
}
export function mostrarErrores(form, err) {
  limpiarErrores(form);
  const campos = err?.campos || {};
  let primero = null;
  for (const [nombre, msg] of Object.entries(campos)) {
    const input = form.querySelector(`[name="${nombre}"]`);
    if (!input) continue;
    const id = `err-${nombre}-${Math.random().toString(36).slice(2, 7)}`;
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', id);
    const p = document.createElement('p');
    p.className = 'error-campo'; p.id = id;
    p.innerHTML = `${icono('alerta')}<span>${esc(msg)}</span>`;
    const ancla = input.closest('.clave-envoltura, .casilla, .chips-seleccion, .autocompletar') || input;
    ancla.after(p);
    primero ||= input;
  }
  if (!primero) {
    const a = document.createElement('div');
    a.className = 'aviso aviso-error'; a.dataset.form = '1'; a.setAttribute('role', 'alert');
    a.innerHTML = `${icono('alerta')}<p>${esc(err?.message || 'No se pudo completar la acción.')}</p>`;
    form.prepend(a);
  } else primero.focus();
}
export const datosForm = (form) => Object.fromEntries(new FormData(form).entries());

// ── Tostadas ─────────────────────────────────────────────────
let pila;
export function avisar(mensaje, tipo = 'exito') {
  pila ||= Object.assign(document.body.appendChild(document.createElement('div')), { className: 'tostadas' });
  pila.setAttribute('aria-live', 'polite');
  const t = document.createElement('div');
  t.className = `tostada ${tipo}`;
  t.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
  t.innerHTML = `${icono(tipo === 'error' ? 'alerta' : 'checkCirculo')}<span>${esc(mensaje)}</span><button type="button" aria-label="Cerrar aviso">${icono('x', 'width="16" height="16"')}</button>`;
  const quitar = () => { if (t.dataset.saliendo) return; t.dataset.saliendo = '1'; setTimeout(() => t.remove(), 170); };
  t.querySelector('button').onclick = quitar;
  pila.appendChild(t);
  while (pila.children.length > 3) pila.firstElementChild.remove();
  let timer = setTimeout(quitar, tipo === 'error' ? 6500 : 4000);
  t.onmouseenter = () => clearTimeout(timer);
  t.onmouseleave = () => { timer = setTimeout(quitar, 2500); };
}

// ── Modales y cajones con trampa de foco ─────────────────────
const enfocables = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
function capa({ clase, contenido, etiqueta, alCerrar, tipo = 'modal' }) {
  const previo = document.activeElement;
  const el = document.createElement('div');
  el.className = tipo === 'cajon' ? 'cajon-capa' : 'modal-capa';
  el.innerHTML = tipo === 'cajon'
    ? `<aside class="cajon ${clase || ''}" role="dialog" aria-modal="true" aria-label="${esc(etiqueta)}">${contenido}</aside>`
    : `<div class="modal ${clase || ''}" role="dialog" aria-modal="true" aria-label="${esc(etiqueta)}">${contenido}</div>`;
  document.body.appendChild(el);
  document.body.style.overflow = 'hidden';
  const caja = el.firstElementChild;
  let cerrado = false;
  const cerrar = (resultado) => {
    if (cerrado) return; cerrado = true;
    el.dataset.saliendo = '1';
    document.removeEventListener('keydown', teclado, true);
    setTimeout(() => {
      el.remove();
      if (!document.querySelector('.modal-capa, .cajon-capa')) document.body.style.overflow = '';
      if (previo && document.contains(previo)) previo.focus();
    }, tipo === 'cajon' ? 180 : 140);
    alCerrar?.(resultado);
  };
  const teclado = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); cerrar(); }
    if (e.key === 'Tab') {
      const f = [...caja.querySelectorAll(enfocables)].filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      const [a, z] = [f[0], f[f.length - 1]];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    }
  };
  document.addEventListener('keydown', teclado, true);
  el.addEventListener('mousedown', (e) => { if (e.target === el) cerrar(); });
  el.addEventListener('click', (e) => { if (e.target.closest('[data-cerrar]')) cerrar(); });
  requestAnimationFrame(() => {
    (caja.querySelector('[autofocus]') || caja.querySelector('input, select, textarea') || caja.querySelector(enfocables))?.focus();
  });
  return { el: caja, cerrar };
}
export const abrirModal = (opts) => capa({ ...opts, tipo: 'modal' });
export const abrirCajon = (opts) => capa({ ...opts, tipo: 'cajon' });

export const botonCerrar = html`<button type="button" class="btn btn-fantasma btn-icono" data-cerrar aria-label="Cerrar">${icono('x')}</button>`;

/** Diálogo de confirmación. Devuelve una promesa con true/false. */
export function confirmar({ titulo, texto, aceptar = 'Aceptar', cancelar = 'Volver', peligro = false, conMotivo = false, etiquetaMotivo = 'Motivo (opcional)' }) {
  return new Promise((resolve) => {
    let respuesta = false;
    const m = abrirModal({
      etiqueta: titulo,
      alCerrar: () => resolve(respuesta),
      contenido: String(html`
        <div class="modal-icono ${peligro ? 'coral' : ''}">${icono(peligro ? 'alerta' : 'info')}</div>
        <h2>${titulo}</h2>
        <p class="texto" style="margin-top:.5rem">${texto}</p>
        ${conMotivo ? html`<div class="campo" style="margin-top:1rem;margin-bottom:0"><label for="motivo-conf">${etiquetaMotivo}</label><textarea id="motivo-conf" class="control" rows="2" maxlength="300"></textarea></div>` : ''}
        <div class="modal-acciones">
          <button type="button" class="btn btn-secundario" data-cerrar>${cancelar}</button>
          <button type="button" class="btn ${peligro ? 'btn-peligro-lleno' : ''}" data-aceptar ${conMotivo ? '' : 'autofocus'}>${aceptar}</button>
        </div>`),
    });
    m.el.querySelector('[data-aceptar]').onclick = () => {
      respuesta = conMotivo ? { motivo: m.el.querySelector('#motivo-conf').value } : true;
      m.cerrar();
    };
  });
}

// Mostrar/ocultar contraseña y medidor de fuerza
export function activarClaves(raiz) {
  raiz.querySelectorAll('.clave-envoltura').forEach((w) => {
    const input = w.querySelector('input'); const b = w.querySelector('button');
    b.onclick = () => {
      const ver = input.type === 'password';
      input.type = ver ? 'text' : 'password';
      b.setAttribute('aria-label', ver ? 'Ocultar contraseña' : 'Mostrar contraseña');
      b.innerHTML = String(icono(ver ? 'ojoNo' : 'ojo'));
    };
  });
  raiz.querySelectorAll('[data-medidor]').forEach((input) => {
    const m = raiz.querySelector(`#${input.dataset.medidor}`);
    const txt = m?.nextElementSibling;
    input.addEventListener('input', () => {
      const v = input.value;
      let n = 0;
      if (v.length >= 8) n++;
      if (/\d/.test(v) && /[a-zA-Z]/.test(v)) n++;
      if (/[A-Z]/.test(v) && /[a-z]/.test(v)) n++;
      if (/[^\w\s]/.test(v) || v.length >= 12) n++;
      if (!v) n = 0;
      m.dataset.nivel = n;
      if (txt) txt.textContent = ['Usa al menos 8 caracteres con letras y números.', 'Débil: agrega letras y números.', 'Aceptable.', 'Buena.', 'Muy segura.'][n];
    });
  });
}
export const campoClave = ({ nombre = 'password', id, etiqueta = 'Contraseña', autocompletar = 'current-password', medidor = false, placeholder = '' }) => html`
  <div class="campo">
    <label for="${id}">${etiqueta}</label>
    <div class="clave-envoltura">
      <input class="control" type="password" id="${id}" name="${nombre}" autocomplete="${autocompletar}" required ${medidor ? raw(`data-medidor="med-${id}" minlength="8"`) : ''} placeholder="${placeholder}">
      <button type="button" aria-label="Mostrar contraseña">${icono('ojo')}</button>
    </div>
    ${medidor ? html`<div class="medidor-clave" id="med-${id}" data-nivel="0" aria-hidden="true"><span></span><span></span><span></span><span></span></div><p class="ayuda" aria-live="polite">Usa al menos 8 caracteres con letras y números.</p>` : ''}
  </div>`;

export function debounce(fn, ms = 250) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); avisar('Copiado al portapapeles.'); }
  catch { avisar('No se pudo copiar. Selecciona el texto y cópialo manualmente.', 'error'); }
}
