// Estado global mínimo, cliente de la API y navegación.
export const estado = {
  usuario: null,
  sinLeer: 0,
  servidor: null, // { hoy, ahora, necesitaConfiguracion }
};

export class ApiError extends Error {
  constructor(status, message, campos) { super(message); this.status = status; this.campos = campos; }
}

let navegador = () => {};
export const registrarNavegador = (fn) => { navegador = fn; };
export const ir = (ruta, opts) => navegador(ruta, opts);

export async function api(ruta, { metodo = 'GET', cuerpo, silencioso = false } = {}) {
  let res;
  try {
    res = await fetch(ruta, {
      method: metodo,
      credentials: 'same-origin',
      headers: { 'X-Neumoser': '1', ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
    });
  } catch {
    throw new ApiError(0, 'No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.');
  }
  let datos = null;
  try { datos = await res.json(); } catch { /* sin cuerpo */ }
  if (!res.ok) {
    const err = new ApiError(res.status, datos?.error || 'No se pudo completar la acción.', datos?.campos);
    if (!silencioso) {
      if (res.status === 401 && !ruta.startsWith('/api/auth/')) {
        estado.usuario = null;
        ir(`/ingresar?volver=${encodeURIComponent(location.pathname)}`, { reemplazar: true });
      } else if (res.status === 403 && /contraseña temporal/.test(err.message)) {
        ir('/cambiar-clave', { reemplazar: true });
      }
    }
    throw err;
  }
  return datos;
}

export const get = (r, o) => api(r, o);
export const post = (r, cuerpo = {}, o) => api(r, { ...o, metodo: 'POST', cuerpo });
export const patch = (r, cuerpo = {}) => api(r, { metodo: 'PATCH', cuerpo });
export const put = (r, cuerpo = {}) => api(r, { metodo: 'PUT', cuerpo });
export const del = (r) => api(r, { metodo: 'DELETE' });

export async function refrescarNotificaciones() {
  if (!estado.usuario) return;
  try {
    const n = await get('/api/notificaciones', { silencioso: true });
    estado.sinLeer = n.sinLeer;
    document.dispatchEvent(new CustomEvent('notificaciones', { detail: n }));
    return n;
  } catch { /* sin conexión: se reintenta luego */ }
}

export function iniciarSesion(usuario) {
  estado.usuario = usuario;
  if (estado.servidor) estado.servidor.necesitaConfiguracion = false;
  document.dispatchEvent(new Event('sesion'));
}
