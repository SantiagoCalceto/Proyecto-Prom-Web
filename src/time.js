// Todas las fechas de citas se manejan en hora local de la clínica (Colombia, UTC-5, sin horario de verano).
export const ZONA = process.env.NEUMOSER_TZ || 'America/Bogota';

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** Fecha y hora actual de la clínica como 'YYYY-MM-DDTHH:MM'. */
export function ahoraLocal(date = new Date()) {
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export const hoyLocal = () => ahoraLocal().slice(0, 10);

const toUTC = (s) => {
  const [d, t = '00:00'] = s.split('T');
  const [y, m, dd] = d.split('-').map(Number);
  const [hh, mm] = t.split(':').map(Number);
  return Date.UTC(y, m - 1, dd, hh, mm);
};
const fromUTC = (ms) => new Date(ms).toISOString().slice(0, 16);

export const sumarMinutos = (s, min) => fromUTC(toUTC(s) + min * 60_000);
export const sumarDias = (fecha, dias) => fromUTC(toUTC(fecha) + dias * 86_400_000).slice(0, 10);
export const diaSemana = (fecha) => new Date(toUTC(fecha)).getUTCDay();
export const minutos = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
export const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export const esFecha = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(toUTC(s)) && fromUTC(toUTC(s)).slice(0, 10) === s;
export const esFechaHora = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) && fromUTC(toUTC(s)) === s;
export const esHora = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
