// Base de datos SQLite usando el módulo nativo de Node (node:sqlite, Node >= 22.5).
// No requiere instalar dependencias.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  migrate(db);
  return db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      rol             TEXT NOT NULL CHECK (rol IN ('paciente','medico','admin')),
      nombre          TEXT NOT NULL,
      apellido        TEXT NOT NULL,
      tipo_documento  TEXT NOT NULL,
      documento       TEXT NOT NULL UNIQUE,
      email           TEXT NOT NULL UNIQUE COLLATE NOCASE,
      telefono        TEXT,
      fecha_nacimiento TEXT,
      eps             TEXT,
      registro_medico TEXT,
      password_hash   TEXT NOT NULL,
      debe_cambiar_clave INTEGER NOT NULL DEFAULT 0,
      activo          INTEGER NOT NULL DEFAULT 1,
      creado_en       TEXT NOT NULL DEFAULT (datetime('now')),
      ultimo_acceso   TEXT
    );

    CREATE TABLE IF NOT EXISTS sesiones (
      token_hash  TEXT PRIMARY KEY,
      usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      expira_en   TEXT NOT NULL,
      creado_en   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS servicios (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre        TEXT NOT NULL UNIQUE COLLATE NOCASE,
      descripcion   TEXT NOT NULL DEFAULT '',
      duracion_min  INTEGER NOT NULL DEFAULT 30 CHECK (duracion_min BETWEEN 10 AND 240),
      preparacion   TEXT NOT NULL DEFAULT '',
      activo        INTEGER NOT NULL DEFAULT 1,
      creado_en     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS medico_servicios (
      medico_id   INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      servicio_id INTEGER NOT NULL REFERENCES servicios(id) ON DELETE CASCADE,
      PRIMARY KEY (medico_id, servicio_id)
    );

    -- Horario semanal de atención de cada médico (dia: 0 = domingo ... 6 = sábado)
    CREATE TABLE IF NOT EXISTS disponibilidad (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      medico_id   INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      dia_semana  INTEGER NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
      hora_inicio TEXT NOT NULL,
      hora_fin    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS citas (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      paciente_id  INTEGER NOT NULL REFERENCES usuarios(id),
      medico_id    INTEGER NOT NULL REFERENCES usuarios(id),
      servicio_id  INTEGER NOT NULL REFERENCES servicios(id),
      inicio       TEXT NOT NULL,   -- 'YYYY-MM-DDTHH:MM' hora local de la clínica
      fin          TEXT NOT NULL,
      estado       TEXT NOT NULL DEFAULT 'programada'
                   CHECK (estado IN ('programada','confirmada','cancelada','atendida','no_asistio')),
      motivo       TEXT NOT NULL DEFAULT '',
      notas_medico TEXT NOT NULL DEFAULT '',
      cancelada_por INTEGER REFERENCES usuarios(id),
      motivo_cancelacion TEXT,
      creado_en    TEXT NOT NULL DEFAULT (datetime('now')),
      actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_citas_medico ON citas(medico_id, inicio);
    CREATE INDEX IF NOT EXISTS idx_citas_paciente ON citas(paciente_id, inicio);

    CREATE TABLE IF NOT EXISTS resultados (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      paciente_id    INTEGER NOT NULL REFERENCES usuarios(id),
      medico_id      INTEGER NOT NULL REFERENCES usuarios(id),
      servicio_id    INTEGER REFERENCES servicios(id),
      cita_id        INTEGER REFERENCES citas(id),
      titulo         TEXT NOT NULL,
      fecha_examen   TEXT NOT NULL,
      observaciones  TEXT NOT NULL DEFAULT '',
      archivo_nombre TEXT,
      archivo_ruta   TEXT,
      archivo_tipo   TEXT,
      archivo_bytes  INTEGER,
      visto_en       TEXT,
      creado_en      TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_resultados_paciente ON resultados(paciente_id, fecha_examen);

    CREATE TABLE IF NOT EXISTS notificaciones (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      tipo        TEXT NOT NULL,
      titulo      TEXT NOT NULL,
      mensaje     TEXT NOT NULL,
      enlace      TEXT,
      leida       INTEGER NOT NULL DEFAULT 0,
      creado_en   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_notif_usuario ON notificaciones(usuario_id, leida);

    CREATE TABLE IF NOT EXISTS solicitudes_clave (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      estado      TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','atendida','descartada')),
      creado_en   TEXT NOT NULL DEFAULT (datetime('now')),
      atendida_por INTEGER REFERENCES usuarios(id),
      atendida_en TEXT
    );

    CREATE TABLE IF NOT EXISTS auditoria (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      accion      TEXT NOT NULL,
      detalle     TEXT NOT NULL DEFAULT '',
      creado_en   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ajustes (
      clave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    );
  `);
}

// Ejecuta fn dentro de una transacción.
export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
