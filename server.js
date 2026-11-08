// Servidor del portal Neumoser.
// Uso: npm start   (Node.js 22.5 o superior; sin dependencias externas)
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearApp } from './src/app.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.NEUMOSER_DATA || join(ROOT, 'data');

const { server } = crearApp({ dataDir: DATA_DIR, log: !!process.env.NEUMOSER_LOG });

server.listen(PORT, HOST, () => {
  console.log(`\n  Neumoser está corriendo en http://localhost:${PORT}\n  Base de datos: ${join(DATA_DIR, 'neumoser.db')}\n`);
});

const cerrar = () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 1500).unref(); };
process.on('SIGINT', cerrar);
process.on('SIGTERM', cerrar);
