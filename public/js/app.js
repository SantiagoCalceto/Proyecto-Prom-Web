// Enrutador, marcos de página (público y portal) y arranque.
import { estado, get, post, registrarNavegador, refrescarNotificaciones } from './estado.js';
import { html, raw, icono, marca, iniciales, nombreCompleto, ROL, cargandoPagina, avisar } from './ui.js';
import * as pub from './vistas/publico.js';
import * as pac from './vistas/paciente.js';
import * as med from './vistas/medico.js';
import * as adm from './vistas/admin.js';
import * as com from './vistas/comun.js';

const porRol = (mapa) => mapa;

const RUTAS = [
  ['/', pub.inicio, { marco: 'publico' }],
  ['/ingresar', pub.ingresar, { marco: 'publico', invitado: true }],
  ['/registro', pub.registro, { marco: 'publico', invitado: true }],
  ['/recuperar', pub.recuperar, { marco: 'publico', invitado: true }],
  ['/configuracion', pub.configuracion, { marco: 'publico' }],
  ['/cambiar-clave', pub.cambiarClave, { marco: 'publico', sesion: true }],
  ['/portal', porRol({ paciente: pac.inicio, medico: med.inicio, admin: adm.inicio })],
  ['/portal/resultados', porRol({ paciente: pac.resultados, medico: med.resultados })],
  ['/portal/resultados/nuevo', porRol({ medico: med.nuevoResultado })],
  ['/portal/resultados/:id', porRol({ paciente: pac.resultados, medico: med.resultados })],
  ['/portal/citas', porRol({ paciente: pac.citas, admin: adm.citas })],
  ['/portal/citas/nueva', porRol({ paciente: pac.agendar })],
  ['/portal/citas/:id/reprogramar', porRol({ paciente: pac.agendar })],
  ['/portal/agenda', porRol({ medico: med.agenda })],
  ['/portal/pacientes', porRol({ medico: med.pacientes })],
  ['/portal/pacientes/:id', porRol({ medico: med.paciente })],
  ['/portal/horario', porRol({ medico: med.horario })],
  ['/portal/usuarios', porRol({ admin: adm.usuarios })],
  ['/portal/servicios', porRol({ admin: adm.servicios })],
  ['/portal/solicitudes', porRol({ admin: adm.solicitudes })],
  ['/portal/actividad', porRol({ admin: adm.actividad })],
  ['/portal/clinica', porRol({ admin: adm.clinica })],
  ['/portal/notificaciones', porRol({ paciente: com.notificaciones, medico: com.notificaciones, admin: com.notificaciones })],
  ['/portal/perfil', porRol({ paciente: com.perfil, medico: com.perfil, admin: com.perfil })],
  ['/portal/ayuda', porRol({ paciente: com.ayuda, medico: com.ayuda, admin: com.ayuda })],
].map(([patron, vista, meta = {}]) => {
  const claves = [];
  const re = new RegExp('^' + patron.replace(/:(\w+)/g, (_, k) => { claves.push(k); return '([^/]+)'; }) + '/?$');
  return { patron, re, claves, vista, meta: { marco: 'portal', ...meta } };
});

const MENUS = {
  paciente: [
    ['/portal', 'Inicio', 'inicio'],
    ['/portal/resultados', 'Mis resultados', 'resultados'],
    ['/portal/citas', 'Mis citas', 'citas'],
    ['/portal/notificaciones', 'Notificaciones', 'campana', 'notif'],
    ['Cuenta'],
    ['/portal/perfil', 'Mi perfil', 'perfil'],
    ['/portal/ayuda', 'Ayuda', 'ayuda'],
  ],
  medico: [
    ['/portal', 'Hoy', 'inicio'],
    ['/portal/agenda', 'Agenda', 'citas'],
    ['/portal/pacientes', 'Pacientes', 'pacientes'],
    ['/portal/resultados', 'Resultados cargados', 'resultados'],
    ['/portal/horario', 'Mi horario', 'reloj'],
    ['/portal/notificaciones', 'Notificaciones', 'campana', 'notif'],
    ['Cuenta'],
    ['/portal/perfil', 'Mi perfil', 'perfil'],
    ['/portal/ayuda', 'Ayuda', 'ayuda'],
  ],
  admin: [
    ['/portal', 'Resumen', 'inicio'],
    ['/portal/usuarios', 'Usuarios', 'usuarios'],
    ['/portal/servicios', 'Servicios', 'servicios'],
    ['/portal/citas', 'Citas', 'citas'],
    ['/portal/solicitudes', 'Solicitudes de acceso', 'llave'],
    ['/portal/actividad', 'Actividad', 'actividad'],
    ['/portal/clinica', 'Datos de la clínica', 'ubicacion'],
    ['/portal/notificaciones', 'Notificaciones', 'campana', 'notif'],
    ['Cuenta'],
    ['/portal/perfil', 'Mi perfil', 'perfil'],
    ['/portal/ayuda', 'Ayuda', 'ayuda'],
  ],
};

const raiz = document.getElementById('app');
let marcoActual = null; // 'publico' | 'portal:<rol>'
let contenido = null;

// ── Marco público ───────────────────────────────────────────
function marcoPublico() {
  const u = estado.usuario;
  raiz.innerHTML = String(html`
    <header class="cabecera"><div class="contenedor cabecera-int">
      ${marca('/')}
      <nav class="nav-publica" aria-label="Principal">
        <a class="enlace-nav" href="/#servicios" data-link>Servicios</a>
        <a class="enlace-nav" href="/#como-funciona" data-link>Cómo funciona</a>
        <a class="enlace-nav" href="/#contacto" data-link>Contacto</a>
        ${estado.servidor?.necesitaConfiguracion ? '' : u ? html`<a class="btn btn-sm" href="/portal" data-link>Ir a mi portal</a>`
            : html`<a class="btn btn-secundario btn-sm" href="/ingresar" data-link>Ingresar</a><a class="btn btn-sm" href="/registro" data-link>Crear cuenta</a>`}
      </nav>
    </div></header>
    <main id="principal" tabindex="-1"></main>`);
  contenido = raiz.querySelector('#principal');
}

// ── Marco del portal ────────────────────────────────────────
function marcoPortal() {
  const u = estado.usuario;
  const items = MENUS[u.rol].map(([href, txt, ic, extra]) => !txt
    ? html`<li class="menu-grupo" role="presentation">${href}</li>`
    : html`<li><a href="${href}" data-link data-menu="${href}">${icono(ic)}<span>${txt}</span>${extra === 'notif' ? html`<span class="contador" data-contador hidden></span>` : ''}</a></li>`);
  raiz.innerHTML = String(html`
    <div class="portal" data-menu="cerrado">
      <aside class="lateral" id="menu-lateral" aria-label="Menú del portal">
        ${marca('/portal')}
        <ul class="menu">${items}</ul>
        <div class="lateral-usuario">
          <span class="avatar" aria-hidden="true">${iniciales(u)}</span>
          <div><div class="nombre">${nombreCompleto(u)}</div><div class="rol">${ROL[u.rol]}</div></div>
          <button class="btn btn-fantasma btn-icono" type="button" data-salir aria-label="Cerrar sesión" title="Cerrar sesión">${icono('salir')}</button>
        </div>
      </aside>
      <div class="velo" data-cerrar-menu></div>
      <div class="area">
        <header class="area-cab">
          <button class="btn btn-fantasma btn-icono barra-movil" type="button" data-abrir-menu aria-controls="menu-lateral" aria-expanded="false" aria-label="Abrir menú">${icono('menu')}</button>
          <span class="migas" data-migas></span>
          <div class="acciones-cab">
            <a class="btn btn-fantasma btn-icono campana" href="/portal/notificaciones" data-link aria-label="Notificaciones">${icono('campana')}<span class="punto" data-punto hidden></span></a>
          </div>
        </header>
        <main class="contenido" id="principal" tabindex="-1"></main>
      </div>
    </div>`);
  contenido = raiz.querySelector('#principal');
  const portal = raiz.querySelector('.portal');
  const boton = raiz.querySelector('[data-abrir-menu]');
  const abrir = (si) => { portal.dataset.menu = si ? 'abierto' : 'cerrado'; boton.setAttribute('aria-expanded', String(si)); if (si) raiz.querySelector('.menu a')?.focus(); };
  boton.onclick = () => abrir(true);
  raiz.querySelector('[data-cerrar-menu]').onclick = () => abrir(false);
  raiz.querySelector('.lateral').addEventListener('click', (e) => { if (e.target.closest('a')) abrir(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && portal.dataset.menu === 'abierto') { abrir(false); boton.focus(); } });
  raiz.querySelector('[data-salir]').onclick = salir;
  pintarContador();
}

function pintarContador() {
  const n = estado.sinLeer;
  const c = raiz.querySelector('[data-contador]');
  const p = raiz.querySelector('[data-punto]');
  if (c) { c.hidden = !n; c.textContent = n > 99 ? '99+' : n; }
  if (p) { p.hidden = !n; p.textContent = n > 9 ? '9+' : n; }
  const campana = raiz.querySelector('.campana');
  campana?.setAttribute('aria-label', n ? `Notificaciones, ${n} sin leer` : 'Notificaciones');
}
document.addEventListener('notificaciones', pintarContador);

export async function salir() {
  try { await post('/api/auth/logout'); } catch { /* igual cerramos */ }
  estado.usuario = null; estado.sinLeer = 0;
  marcoActual = null;
  avisar('Cerraste sesión.');
  navegar('/', { reemplazar: true });
}

// ── Navegación ──────────────────────────────────────────────
function resolver(pathname) {
  for (const r of RUTAS) {
    const m = r.re.exec(pathname);
    if (m) { const params = {}; r.claves.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); }); return { r, params }; }
  }
  return null;
}

let navegando = 0;
export async function navegar(destino, { reemplazar = false, desdeHistorial = false } = {}) {
  const url = new URL(destino, location.origin);
  if (!desdeHistorial) {
    const mismo = url.pathname + url.search === location.pathname + location.search;
    if (reemplazar || mismo) history.replaceState({}, '', url); else history.pushState({}, '', url);
  }
  const turno = ++navegando;
  const encontrado = resolver(url.pathname);
  const s = estado.servidor;

  // Reglas de acceso
  if (s?.necesitaConfiguracion && url.pathname !== '/configuracion') return navegar('/configuracion', { reemplazar: true });
  if (!s?.necesitaConfiguracion && url.pathname === '/configuracion') return navegar(estado.usuario ? '/portal' : '/ingresar', { reemplazar: true });
  if (!encontrado) return pintarError(404);
  const { r, params } = encontrado;
  if (r.meta.invitado && estado.usuario) return navegar('/portal', { reemplazar: true });
  if ((r.meta.marco === 'portal' || r.meta.sesion) && !estado.usuario) {
    return navegar(`/ingresar?volver=${encodeURIComponent(url.pathname)}`, { reemplazar: true });
  }
  if (estado.usuario?.debe_cambiar_clave && url.pathname !== '/cambiar-clave' && r.meta.marco === 'portal') return navegar('/cambiar-clave', { reemplazar: true });

  let vista = r.vista;
  if (r.meta.marco === 'portal') {
    vista = r.vista[estado.usuario.rol];
    if (!vista) return pintarError(404);
    const clave = `portal:${estado.usuario.rol}:${estado.usuario.id}`;
    if (marcoActual !== clave) { marcoPortal(); marcoActual = clave; refrescarNotificaciones(); }
    raiz.querySelectorAll('[data-menu]').forEach((a) => {
      const h = a.dataset.menu;
      const activo = h === '/portal' ? url.pathname === '/portal' : url.pathname === h || url.pathname.startsWith(h + '/');
      if (activo) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  } else if (marcoActual !== 'publico:' + (estado.usuario?.id || 0)) {
    marcoPublico(); marcoActual = 'publico:' + (estado.usuario?.id || 0);
  }

  // Cada vista pinta en un contenedor nuevo; si el usuario navega antes de que termine, se descarta.
  const lienzo = document.createElement('div');
  lienzo.className = 'vista-entra';
  contenido.replaceChildren(lienzo);
  const ctx = {
    params, query: url.searchParams, hash: url.hash,
    titulo: (t) => { if (turno === navegando) document.title = `${t} | Neumoser`; const m = raiz.querySelector('[data-migas]'); if (m && turno === navegando) m.textContent = t; },
    vigente: () => turno === navegando,
  };
  try {
    await vista(lienzo, ctx);
  } catch (e) {
    if (turno !== navegando) return;
    console.error(e);
    if (e.status === 401 || (e.status === 403 && /temporal/.test(e.message))) return;
    lienzo.innerHTML = String(html`<div class="pagina-error">${raw('<div>')}${icono('alerta', 'width="40" height="40" style="margin:auto;color:var(--coral-600)"')}
      <h1>No pudimos cargar esta página</h1><p>${e.message || 'Ocurrió un error inesperado.'}</p>
      <button class="btn" type="button" data-reintentar>Intentar de nuevo</button>${raw('</div>')}</div>`);
    lienzo.querySelector('[data-reintentar]').onclick = () => navegar(location.pathname + location.search, { reemplazar: true });
  }
  if (turno !== navegando) return;
  if (url.hash) {
    const destinoHash = document.getElementById(url.hash.slice(1));
    if (destinoHash) { destinoHash.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); return; }
  }
  if (!desdeHistorial) { window.scrollTo(0, 0); contenido.focus({ preventScroll: true }); }
}
registrarNavegador(navegar);

function pintarError(codigo) {
  if (!marcoActual?.startsWith('publico') && !estado.usuario) { marcoPublico(); marcoActual = 'publico:0'; }
  if (!contenido) { marcoPublico(); marcoActual = 'publico:0'; }
  document.title = 'Página no encontrada | Neumoser';
  contenido.innerHTML = String(html`<div class="pagina-error"><div>
    <h1>Esta página no existe</h1>
    <p>Es posible que el enlace esté incompleto o que la página se haya movido.</p>
    <a class="btn" href="${estado.usuario ? '/portal' : '/'}" data-link>${estado.usuario ? 'Volver a mi portal' : 'Ir al inicio'}</a>
  </div></div>`);
}

// Interceptar enlaces internos
document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest('a[href]');
  if (!a || a.target || a.hasAttribute('download')) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.preventDefault();
  if (url.pathname === location.pathname && url.hash && url.search === location.search) {
    const t = document.getElementById(url.hash.slice(1));
    if (t) { history.replaceState({}, '', url); t.scrollIntoView({ behavior: 'smooth' }); return; }
  }
  navegar(url.pathname + url.search + url.hash);
});
window.addEventListener('popstate', () => navegar(location.pathname + location.search + location.hash, { desdeHistorial: true }));

// Notificaciones cada 45 s mientras la pestaña esté visible
setInterval(() => { if (document.visibilityState === 'visible' && estado.usuario) refrescarNotificaciones(); }, 45_000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refrescarNotificaciones(); });

// Cuando cambia el usuario (inicio/cierre de sesión), forzar a redibujar el marco.
document.addEventListener('sesion', () => { marcoActual = null; });

// ── Arranque ────────────────────────────────────────────────
(async function arrancar() {
  raiz.innerHTML = String(cargandoPagina());
  try {
    const [s, yo] = await Promise.all([get('/api/estado'), get('/api/auth/yo', { silencioso: true })]);
    estado.servidor = s;
    estado.usuario = yo.usuario;
  } catch (e) {
    raiz.innerHTML = String(html`<div class="pagina-error"><div><h1>No hay conexión con el portal</h1>
      <p>${e.message} Si eres quien administra el portal, verifica que el servidor esté encendido.</p>
      <button class="btn" type="button" data-recargar>Intentar de nuevo</button></div></div>`);
    raiz.querySelector('[data-recargar]').onclick = () => location.reload();
    return;
  }
  navegar(location.pathname + location.search + location.hash, { reemplazar: true });
})();
