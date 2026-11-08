// Crea el servidor HTTP de Neumoser sin ponerlo a escuchar.
// Se usa desde server.js y desde las pruebas (que lo arrancan en un puerto libre con una base temporal).
import { createServer } from 'node:http';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { buildApi } from './api.js';
import { HttpError, readBody, parseCookies, sendJson, serveStatic, SECURITY_HEADERS } from './http.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = join(ROOT, 'public');

export function crearApp({ dataDir, log = false } = {}) {
  const db = openDb(dataDir === ':memory:' ? ':memory:' : join(dataDir, 'neumoser.db'));
  const api = buildApi({ db, uploadsDir: join(dataDir === ':memory:' ? join(ROOT, 'data', 'tmp') : dataDir, 'archivos') });

  const server = createServer(async (req, res) => {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;

    if (!pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
      return serveStatic(PUBLIC_DIR, req, res, pathname);
    }

    const inicio = Date.now();
    const cookiesOut = [];
    try {
      const found = api.match(req.method, pathname);
      if (!found) throw new HttpError(404, 'Ruta no encontrada.');
      if (found.notAllowed) throw new HttpError(405, 'Método no permitido.');

      // Protección CSRF: las peticiones que modifican datos deben venir del propio portal.
      if (req.method !== 'GET' && req.headers['x-neumoser'] !== '1') throw new HttpError(403, 'Petición no permitida.');

      let body = {};
      if (req.method !== 'GET') {
        const raw = await readBody(req, found.route.opts.limite || 256 * 1024);
        if (raw.length) {
          try { body = JSON.parse(raw.toString('utf8')); }
          catch { throw new HttpError(400, 'El contenido enviado no es válido.'); }
        }
      }
      const ctx = {
        req, params: found.params, query: url.searchParams, body,
        cookies: parseCookies(req.headers.cookie),
        ip: req.socket.remoteAddress,
        secure: req.headers['x-forwarded-proto'] === 'https',
        setCookie: (c) => cookiesOut.push(c),
      };
      const result = await found.route.handler(ctx);
      if (cookiesOut.length) res.setHeader('Set-Cookie', cookiesOut);
      if (result && result.__raw) {
        res.writeHead(result.status, result.headers);
        return res.end(result.body);
      }
      sendJson(res, 200, result ?? { ok: true });
    } catch (err) {
      if (cookiesOut.length) res.setHeader('Set-Cookie', cookiesOut);
      if (err instanceof HttpError) {
        sendJson(res, err.status, { error: err.message, campos: err.fields });
      } else if (String(err?.message).includes('UNIQUE constraint failed')) {
        sendJson(res, 409, { error: 'Ese registro ya existe.' });
      } else {
        console.error(`[error] ${req.method} ${pathname}`, err);
        sendJson(res, 500, { error: 'Ocurrió un error en el servidor. Intenta de nuevo en un momento.' });
      }
    } finally {
      if (log) console.log(`${req.method} ${pathname} ${res.statusCode} ${Date.now() - inicio}ms`);
    }
  });

  server.on('close', () => { try { db.close(); } catch { /* ya cerrada */ } });
  return { server, db };
}

/** Arranca la app en un puerto libre. Devuelve { url, cerrar }. Pensado para pruebas. */
export function iniciar({ dataDir, puerto = 0 } = {}) {
  const { server, db } = crearApp({ dataDir });
  return new Promise((resolve) => {
    server.listen(puerto, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`, db,
        cerrar: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }),
      });
    });
  });
}
