// Vistas del paciente: inicio, resultados, citas y asistente para agendar.
import { estado, get, post, ir } from '../estado.js';
import {
  html, raw, icono, avisar, ocupado, vacio, esqLista, esqCifras, esqPanel, fecha, fechaHora, hora, hace, debounce,
  mesCorto, diaNum, diaSem, estadoCita, confirmar, nombreMes, DIAS_SEMANA, mostrarErrores,
} from '../ui.js';
import { cabecera, itemCita, abrirResultado } from './comun.js';

const saludo = () => { const h = Number((estado.servidor?.ahora || '').slice(11, 13)); return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'; };

// ── Inicio ──────────────────────────────────────────────────
export async function inicio(el, ctx) {
  ctx.titulo('Inicio');
  const u = estado.usuario;
  el.innerHTML = String(html`${cabecera(`${saludo()}, ${u.nombre}`, 'Esto es lo más importante de tu cuenta hoy.')}
    <div data-destacada><div class="esq" style="height:170px;border-radius:var(--r-lg);margin-bottom:1.25rem"></div></div>
    <div data-cifras>${esqCifras(3)}</div>
    <div data-ultimos>${esqPanel(3)}</div>`);
  const r = await get('/api/resumen');
  if (!ctx.vigente()) return;
  const d = el.querySelector('[data-destacada]');
  if (r.proxima) {
    const c = r.proxima;
    d.innerHTML = String(html`<section class="cita-destacada" aria-label="Tu próxima cita" style="margin-bottom:1.25rem">
      <div class="fecha-bloque" aria-hidden="true"><div class="mes">${mesCorto(c.inicio)}</div><div class="dia">${diaNum(c.inicio)}</div><div class="sem">${diaSem(c.inicio)}</div></div>
      <div>
        <p style="font-size:var(--t-sm);color:#8fbdb4">Tu próxima cita</p>
        <h2>${c.servicio}, ${hora(c.inicio)}</h2>
        <p class="detalle">${fecha(c.inicio, { conDia: true })}, con ${c.medico_nombre} ${c.medico_apellido}. ${c.estado === 'confirmada' ? 'Ya confirmaste tu asistencia.' : ''}</p>
        <div class="acciones">
          ${c.estado === 'programada' ? html`<button class="btn btn-sm" type="button" data-confirmar>${icono('check')}<span>Confirmar asistencia</span></button>` : ''}
          <a class="btn btn-secundario btn-sm" href="/portal/citas/${c.id}/reprogramar" data-link>${icono('repetir')}<span>Cambiar fecha</span></a>
        </div>
        ${c.preparacion ? html`<p class="prep"><strong>Cómo prepararte:</strong> ${c.preparacion}</p>` : ''}
      </div></section>`);
    d.querySelector('[data-confirmar]')?.addEventListener('click', (e) => ocupado(e.currentTarget, async () => {
      try { await post(`/api/citas/${c.id}/confirmar`); avisar('Asistencia confirmada.'); ir('/portal', { reemplazar: true }); }
      catch (err) { avisar(err.message, 'error'); }
    }));
  } else {
    d.innerHTML = String(html`<div class="panel" style="margin-bottom:1.25rem">${vacio({ ilus: 'citas', compacto: true, titulo: 'No tienes citas programadas', texto: 'Agenda tu próximo examen o sesión de terapia en menos de un minuto.', accion: html`<a class="btn" href="/portal/citas/nueva" data-link>${icono('mas')}<span>Agendar cita</span></a>` })}</div>`);
  }
  el.querySelector('[data-cifras]').innerHTML = String(html`<div class="cifras">
    <a class="cifra" href="/portal/citas" data-link><div class="valor">${r.citasProximas}</div><div class="rotulo">${r.citasProximas === 1 ? 'Cita próxima' : 'Citas próximas'}</div></a>
    <a class="cifra ${r.resultadosNuevos ? 'alerta' : ''}" href="/portal/resultados" data-link><div class="valor">${r.resultadosNuevos}</div><div class="rotulo">${r.resultadosNuevos === 1 ? 'Resultado sin revisar' : 'Resultados sin revisar'}</div></a>
    <a class="cifra" href="/portal/resultados" data-link><div class="valor">${r.resultadosTotal}</div><div class="rotulo">Resultados en tu historial</div></a>
  </div>`);
  el.querySelector('[data-ultimos]').innerHTML = String(html`<section class="panel panel-sin-pad">
    <div class="panel-cab"><h2>Resultados recientes</h2>${r.resultadosTotal ? html`<a href="/portal/resultados" data-link>Ver todos</a>` : ''}</div>
    ${r.ultimosResultados.length
      ? html`<div style="margin-top:.75rem">${r.ultimosResultados.map(itemResultado)}</div>`
      : vacio({ ilus: 'resultados', compacto: true, titulo: 'Aún no tienes resultados', texto: 'Cuando tu médico cargue el informe de un examen, aparecerá aquí y te enviaremos un aviso.' })}
  </section>`);
}

const itemResultado = (r) => html`<a class="item" href="/portal/resultados/${r.id}" data-link>
  <span class="icono-item" aria-hidden="true">${icono('resultados')}</span>
  <div><div class="titulo">${r.titulo}</div><div class="meta">${fecha(r.fecha_examen)}${r.servicio ? `, ${r.servicio}` : ''}, ${r.medico_nombre} ${r.medico_apellido}</div></div>
  <div class="lado">${r.nuevo ? html`<span class="estado estado-nuevo">Nuevo</span>` : ''}${icono('flecha', 'class="flecha"')}</div></a>`;

// ── Resultados ──────────────────────────────────────────────
export async function resultados(el, ctx) {
  ctx.titulo('Mis resultados');
  el.innerHTML = String(html`${cabecera('Mis resultados', 'Todos los informes que la clínica ha cargado a tu nombre, del más reciente al más antiguo.')}
    <form class="filtros" data-filtros role="search">
      <div class="buscador">${icono('buscar')}<label class="sr" for="fr-q">Buscar</label><input class="control" id="fr-q" name="q" placeholder="Buscar por examen o palabra clave" type="search"></div>
      <div class="campo"><label class="sr" for="fr-s">Servicio</label><select class="control" id="fr-s" name="servicio"><option value="">Todos los servicios</option></select></div>
      <div class="campo"><label for="fr-d" class="ayuda">Desde</label><input class="control" type="date" id="fr-d" name="desde"></div>
      <div class="campo"><label for="fr-h" class="ayuda">Hasta</label><input class="control" type="date" id="fr-h" name="hasta"></div>
    </form>
    <div class="panel panel-sin-pad" data-lista aria-live="polite">${esqLista(4)}</div>`);
  const form = el.querySelector('[data-filtros]');
  get('/api/servicios').then((ss) => {
    form.servicio.insertAdjacentHTML('beforeend', String(html`${ss.map((s) => html`<option value="${s.id}">${s.nombre}</option>`)}`));
  }).catch(() => {});
  let total = null;
  const cargar = async () => {
    const p = new URLSearchParams(Object.entries(Object.fromEntries(new FormData(form))).filter(([, v]) => v));
    const lista = el.querySelector('[data-lista]');
    lista.setAttribute('aria-busy', 'true');
    const filas = await get(`/api/resultados?${p}`);
    lista.removeAttribute('aria-busy');
    if (!ctx.vigente()) return;
    const filtrando = [...p.keys()].length > 0;
    if (!filtrando) total = filas.length;
    if (!filas.length) {
      lista.innerHTML = String(filtrando && total
        ? vacio({ ilus: 'buscar', titulo: 'Ningún resultado coincide', texto: 'Prueba con otra palabra o amplía el rango de fechas.', accion: html`<button class="btn btn-secundario" type="button" data-limpiar>Quitar filtros</button>` })
        : vacio({ ilus: 'resultados', titulo: 'Aún no tienes resultados', texto: 'Cuando tu médico cargue el informe de un examen, aparecerá aquí y recibirás un aviso. Puedes ver o descargar cada informe.', accion: html`<a class="btn btn-secundario" href="/portal/citas/nueva" data-link>Agendar un examen</a>` }));
      lista.querySelector('[data-limpiar]')?.addEventListener('click', () => { form.reset(); cargar(); });
      return;
    }
    lista.innerHTML = String(html`${filas.map(itemResultado)}`);
  };
  form.addEventListener('input', debounce(cargar, 280));
  form.addEventListener('submit', (e) => { e.preventDefault(); cargar(); });
  await cargar();
  if (ctx.params.id) {
    abrirResultado(ctx.params.id, { alCerrar: () => { if (location.pathname.startsWith('/portal/resultados/')) { history.replaceState({}, '', '/portal/resultados'); cargar(); } } });
  }
}

// ── Citas ───────────────────────────────────────────────────
export async function citas(el, ctx) {
  ctx.titulo('Mis citas');
  const vista = ctx.query.get('vista') === 'historial' ? 'historial' : 'proximas';
  el.innerHTML = String(html`${cabecera('Mis citas', 'Consulta, confirma, cambia o cancela tus citas.', html`<a class="btn" href="/portal/citas/nueva" data-link>${icono('mas')}<span>Agendar cita</span></a>`)}
    <div class="pestanas" role="tablist" aria-label="Tipo de citas" style="margin-bottom:1.25rem">
      <a role="tab" href="/portal/citas" data-link aria-selected="${vista === 'proximas'}">Próximas</a>
      <a role="tab" href="/portal/citas?vista=historial" data-link aria-selected="${vista === 'historial'}">Historial</a>
    </div>
    <div class="panel panel-sin-pad" data-lista role="tabpanel">${esqLista(3)}</div>`);
  const lista = el.querySelector('[data-lista]');
  const filas = await get(`/api/citas?vista=${vista}`);
  if (!ctx.vigente()) return;
  if (!filas.length) {
    lista.innerHTML = String(vista === 'proximas'
      ? vacio({ ilus: 'citas', titulo: 'No tienes citas próximas', texto: 'Elige el examen o la terapia, el profesional y el horario que te sirva.', accion: html`<a class="btn" href="/portal/citas/nueva" data-link>${icono('mas')}<span>Agendar cita</span></a>` })
      : vacio({ ilus: 'reloj', titulo: 'Tu historial está vacío', texto: 'Aquí verás las citas a las que asististe y las que se cancelaron.' }));
    return;
  }
  lista.innerHTML = String(html`${filas.map((c) => {
    const activa = ['programada', 'confirmada'].includes(c.estado) && !c.pasada;
    return html`<div class="item" data-cita="${c.id}">
      <div class="mini-fecha" aria-hidden="true"><span class="d">${diaNum(c.inicio)}</span><span class="m">${mesCorto(c.inicio)}</span></div>
      <div><div class="titulo">${c.servicio} ${estadoCita(c)}</div>
        <div class="meta">${fecha(c.inicio, { conDia: true })}, ${hora(c.inicio)}, con ${c.medico_nombre} ${c.medico_apellido}</div>
        ${c.motivo ? html`<div class="meta">Motivo: ${c.motivo}</div>` : ''}
        ${c.estado === 'cancelada' && c.motivo_cancelacion ? html`<div class="meta">Cancelada: ${c.motivo_cancelacion}</div>` : ''}
        ${activa && c.preparacion ? html`<div class="meta" style="color:var(--pino-700)">Preparación: ${c.preparacion}</div>` : ''}
      </div>
      <div class="lado">${activa ? html`
        ${c.estado === 'programada' ? html`<button class="btn btn-sm" type="button" data-accion="confirmar">Confirmar</button>` : ''}
        <a class="btn btn-secundario btn-sm" href="/portal/citas/${c.id}/reprogramar" data-link>Cambiar fecha</a>
        <button class="btn btn-peligro btn-sm" type="button" data-accion="cancelar">Cancelar</button>` : ''}</div>
    </div>`;
  })}`);
  lista.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    const c = filas.find((x) => x.id === Number(b.closest('[data-cita]').dataset.cita));
    if (b.dataset.accion === 'confirmar') {
      return ocupado(b, async () => {
        try { await post(`/api/citas/${c.id}/confirmar`); avisar('Asistencia confirmada.'); ir(location.pathname + location.search, { reemplazar: true }); }
        catch (err) { avisar(err.message, 'error'); }
      });
    }
    const r = await confirmar({
      titulo: 'Cancelar esta cita', peligro: true, aceptar: 'Cancelar cita', cancelar: 'Conservar cita', conMotivo: true,
      texto: `${c.servicio} del ${fecha(c.inicio, { conDia: true })} a las ${hora(c.inicio)} con ${c.medico_nombre} ${c.medico_apellido}. El horario quedará libre para otro paciente.`,
    });
    if (!r) return;
    ocupado(b, async () => {
      try { await post(`/api/citas/${c.id}/cancelar`, { motivo: r.motivo }); avisar('Cita cancelada.'); ir(location.pathname + location.search, { reemplazar: true }); }
      catch (err) { avisar(err.message, 'error'); }
    });
  });
}

// ── Asistente para agendar / reprogramar ────────────────────
export async function agendar(el, ctx) {
  const reprogramando = ctx.params.id ? Number(ctx.params.id) : null;
  ctx.titulo(reprogramando ? 'Cambiar fecha de cita' : 'Agendar cita');
  const st = { paso: 1, servicio: null, medico: null, fecha: null, inicio: null, mes: (estado.servidor?.hoy || '').slice(0, 7), cita: null };
  el.innerHTML = String(html`${cabecera(reprogramando ? 'Cambiar fecha de la cita' : 'Agendar una cita', reprogramando ? 'Elige el nuevo día y la nueva hora.' : 'Cuatro pasos. Puedes volver atrás en cualquier momento.',
    html`<a class="btn btn-fantasma" href="/portal/citas" data-link>${icono('atras')}<span>Volver a mis citas</span></a>`)}
    <ol class="pasos-agenda" data-pasos></ol>
    <div data-paso>${esqPanel(3, false)}</div>`);
  const cont = el.querySelector('[data-paso]');

  if (reprogramando) {
    const lista = await get('/api/citas?vista=proximas');
    st.cita = lista.find((c) => c.id === reprogramando);
    if (!st.cita) { cont.innerHTML = String(html`<div class="panel">${vacio({ ilus: 'citas', titulo: 'Esta cita ya no se puede cambiar', texto: 'Puede que ya haya pasado o que se haya cancelado.', accion: html`<a class="btn" href="/portal/citas" data-link>Ver mis citas</a>` })}</div>`); return; }
    const servicios = await get('/api/servicios');
    st.servicio = servicios.find((s) => s.id === st.cita.servicio_id) || { id: st.cita.servicio_id, nombre: st.cita.servicio, duracion_min: st.cita.duracion_min };
    st.medico = { id: st.cita.medico_id, nombre: st.cita.medico_nombre, apellido: st.cita.medico_apellido };
    st.paso = 3;
  }

  const ETAPAS = reprogramando ? ['Nueva fecha', 'Confirmar'] : ['Servicio', 'Profesional', 'Fecha y hora', 'Confirmar'];
  const pintarPasos = () => {
    const actual = reprogramando ? st.paso - 2 : st.paso;
    el.querySelector('[data-pasos]').innerHTML = String(html`${ETAPAS.map((t, i) => html`<li data-estado="${i + 1 < actual ? 'hecho' : i + 1 === actual ? 'actual' : ''}" ${i + 1 === actual ? raw('aria-current="step"') : ''}>
      <span class="num">${i + 1 < actual ? icono('check', 'width="14" height="14"') : i + 1}</span>${t}</li>`)}`);
  };
  const pintar = () => { pintarPasos(); [null, paso1, paso2, paso3, paso4][st.paso](); };

  async function paso1() {
    cont.innerHTML = String(esqPanel(3, false));
    const ss = await get('/api/servicios');
    if (!ctx.vigente()) return;
    if (!ss.length) { cont.innerHTML = String(html`<div class="panel">${vacio({ ilus: 'citas', titulo: 'Todavía no hay servicios para agendar', texto: 'La clínica aún no ha publicado servicios en el portal. Intenta más tarde o comunícate con la recepción.' })}</div>`); return; }
    cont.innerHTML = String(html`<div class="panel"><h2 style="font-size:var(--t-lg);margin-bottom:1rem">¿Qué necesitas?</h2>
      <div class="opciones">${ss.map((s) => html`<button class="opcion" type="button" data-id="${s.id}" ${s.medicos ? '' : 'disabled'} aria-pressed="${st.servicio?.id === s.id}">
        <span class="titulo">${s.nombre}</span><span class="meta">${s.descripcion || ''}</span>
        <span class="meta">${s.duracion_min} min${s.medicos ? '' : ', sin profesionales disponibles'}</span></button>`)}</div></div>`);
    cont.querySelectorAll('.opcion').forEach((b) => b.onclick = () => { st.servicio = ss.find((s) => s.id === Number(b.dataset.id)); st.medico = null; st.fecha = null; st.inicio = null; st.paso = 2; pintar(); });
  }

  async function paso2() {
    cont.innerHTML = String(esqPanel(2, false));
    const ms = await get(`/api/servicios/${st.servicio.id}/medicos`);
    if (!ctx.vigente()) return;
    cont.innerHTML = String(html`<div class="panel">
      <div class="panel-cab"><h2>¿Con quién?</h2><button class="btn btn-fantasma btn-sm" type="button" data-atras>${icono('atras')}<span>Cambiar servicio</span></button></div>
      <p class="ayuda" style="margin:-.5rem 0 1rem">${st.servicio.nombre}, ${st.servicio.duracion_min} minutos.</p>
      ${ms.length ? html`<div class="opciones">${ms.map((m) => html`<button class="opcion" type="button" data-id="${m.id}" ${m.franjas ? '' : 'disabled'} aria-pressed="${st.medico?.id === m.id}">
          <span class="titulo">${m.nombre} ${m.apellido}</span><span class="meta">${m.franjas ? (m.registro_medico ? `Registro ${m.registro_medico}` : 'Personal médico') : 'Aún no publica horarios'}</span></button>`)}</div>`
        : vacio({ ilus: 'personas', compacto: true, titulo: 'Nadie atiende este servicio por ahora', texto: 'Elige otro servicio o comunícate con la clínica.' })}
    </div>`);
    cont.querySelector('[data-atras]').onclick = () => { st.paso = 1; pintar(); };
    cont.querySelectorAll('.opcion').forEach((b) => b.onclick = () => { st.medico = ms.find((m) => m.id === Number(b.dataset.id)); st.fecha = null; st.inicio = null; st.paso = 3; pintar(); });
  }

  async function paso3() {
    cont.innerHTML = String(html`<div class="agenda-rejilla">
      <div class="panel">
        <div class="panel-cab"><h2>Elige el día</h2>${reprogramando ? '' : html`<button class="btn btn-fantasma btn-sm" type="button" data-atras>${icono('atras')}<span>Cambiar profesional</span></button>`}</div>
        <p class="ayuda" style="margin:-.5rem 0 1rem">${st.servicio.nombre} con ${st.medico.nombre} ${st.medico.apellido}. Los días resaltados tienen horarios libres.</p>
        <div data-cal></div>
      </div>
      <div class="panel" data-horas-panel><h2 style="font-size:var(--t-lg)">Elige la hora</h2><div data-horas style="margin-top:1rem"><p class="ayuda">Primero toca un día del calendario.</p></div></div>
    </div>`);
    cont.querySelector('[data-atras]')?.addEventListener('click', () => { st.paso = 2; pintar(); });
    await pintarCalendario();
    if (st.fecha) await pintarHoras();
  }

  async function pintarCalendario() {
    const cal = cont.querySelector('[data-cal]');
    const [y, m] = st.mes.split('-').map(Number);
    cal.innerHTML = String(html`<div class="calendario-cab"><button class="btn btn-secundario btn-icono" type="button" data-mes="-1" aria-label="Mes anterior">${icono('atras')}</button>
      <h3 aria-live="polite">${nombreMes(y, m)}</h3><button class="btn btn-secundario btn-icono" type="button" data-mes="1" aria-label="Mes siguiente">${icono('flecha')}</button></div>
      <div class="calendario" aria-busy="true">${['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((d, i) => html`<div class="dsem" aria-hidden="true" title="${DIAS_SEMANA[i]}">${d}</div>`)}
      ${Array.from({ length: 35 }, () => html`<div class="esq" style="aspect-ratio:1;border-radius:var(--r-sm)"></div>`)}</div>`);
    const params = new URLSearchParams({ servicio: st.servicio.id, medico: st.medico.id, mes: st.mes });
    const r = await get(`/api/agenda/dias?${params}`);
    if (!cal.isConnected) return;
    const primero = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const diasMes = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const celdas = [];
    for (let i = 0; i < primero; i++) celdas.push(html`<span aria-hidden="true"></span>`);
    for (let d = 1; d <= diasMes; d++) {
      const f = `${st.mes}-${String(d).padStart(2, '0')}`;
      const libres = r.dias[f];
      const habil = libres > 0;
      celdas.push(html`<button type="button" class="dia ${libres !== undefined ? 'con-cupo' : ''} ${libres === 0 ? 'lleno' : ''} ${f === r.hoy ? 'hoy' : ''}" data-fecha="${f}" ${habil ? '' : 'disabled'} aria-pressed="${st.fecha === f}"
        aria-label="${fecha(f, { conDia: true })}${habil ? `, ${libres} ${libres === 1 ? 'horario libre' : 'horarios libres'}` : libres === 0 ? ', sin cupos' : ', sin atención'}">
        <span>${d}</span>${libres !== undefined ? html`<span class="libres">${libres ? libres : 'lleno'}</span>` : ''}</button>`);
    }
    const grid = cal.querySelector('.calendario');
    grid.removeAttribute('aria-busy');
    grid.innerHTML = String(html`${['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((d, i) => html`<div class="dsem" aria-hidden="true" title="${DIAS_SEMANA[i]}">${d}</div>`)}${celdas}`);
    const minMes = r.hoy.slice(0, 7); const maxMes = r.maximo.slice(0, 7);
    cal.querySelector('[data-mes="-1"]').disabled = st.mes <= minMes;
    cal.querySelector('[data-mes="1"]').disabled = st.mes >= maxMes;
    cal.querySelectorAll('[data-mes]').forEach((b) => b.onclick = () => {
      const [yy, mm] = st.mes.split('-').map(Number);
      const dt = new Date(Date.UTC(yy, mm - 1 + Number(b.dataset.mes), 1));
      st.mes = dt.toISOString().slice(0, 7);
      pintarCalendario();
    });
    grid.querySelectorAll('.dia:not(:disabled)').forEach((b) => b.onclick = () => {
      st.fecha = b.dataset.fecha; st.inicio = null;
      grid.querySelectorAll('.dia').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      pintarHoras();
    });
    if (!Object.values(r.dias).some((n) => n > 0) && !cal.querySelector('.sin-cupo-mes')) {
      cal.insertAdjacentHTML('beforeend', String(html`<p class="ayuda sin-cupo-mes" style="margin-top:1rem">No quedan horarios libres en ${nombreMes(y, m)}. ${st.mes < maxMes ? 'Revisa el mes siguiente.' : ''}</p>`));
    }
  }

  async function pintarHoras() {
    const box = cont.querySelector('[data-horas]');
    box.innerHTML = String(html`<div class="horas">${Array.from({ length: 8 }, () => html`<div class="esq" style="height:44px"></div>`)}</div>`);
    const params = new URLSearchParams({ servicio: st.servicio.id, medico: st.medico.id, fecha: st.fecha, ...(reprogramando ? { ignorar: reprogramando } : {}) });
    const hs = await get(`/api/agenda/horas?${params}`);
    if (!box.isConnected) return;
    const libres = hs.filter((h) => h.estado === 'libre');
    const motivo = { ocupado: 'ocupado', pasado: 'ya pasó', cruce: 'tienes otra cita' };
    box.innerHTML = String(html`<p class="ayuda" style="margin-bottom:.75rem">${fecha(st.fecha, { conDia: true })}: ${libres.length} ${libres.length === 1 ? 'horario libre' : 'horarios libres'}.</p>
      <div class="horas" role="group" aria-label="Horas disponibles">${hs.map((h) => html`<button type="button" class="hora" data-inicio="${h.inicio}" ${h.estado === 'libre' ? '' : 'disabled'} aria-pressed="${st.inicio === h.inicio}"
        aria-label="${hora(h.inicio)}${h.estado === 'libre' ? '' : `, ${motivo[h.estado]}`}" title="${h.estado === 'libre' ? '' : motivo[h.estado]}">${hora(h.inicio)}</button>`)}</div>
      <button class="btn btn-bloque" type="button" data-seguir style="margin-top:1.25rem" ${st.inicio ? '' : 'disabled'}><span>Continuar</span></button>`);
    box.querySelectorAll('.hora:not(:disabled)').forEach((b) => b.onclick = () => {
      st.inicio = b.dataset.inicio;
      box.querySelectorAll('.hora').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      box.querySelector('[data-seguir]').disabled = false;
    });
    box.querySelector('[data-seguir]').onclick = () => { st.paso = 4; pintar(); };
  }

  function paso4() {
    cont.innerHTML = String(html`<div class="panel" style="max-width:640px">
      <h2 style="font-size:var(--t-lg)">${reprogramando ? 'Confirma el cambio' : 'Revisa y confirma'}</h2>
      <div class="resumen-reserva"><dl class="datos">
        <dt>Servicio</dt><dd>${st.servicio.nombre}</dd>
        <dt>Profesional</dt><dd>${st.medico.nombre} ${st.medico.apellido}</dd>
        ${reprogramando ? html`<dt>Fecha anterior</dt><dd style="text-decoration:line-through;color:var(--gris-500)">${fechaHora(st.cita.inicio, { conDia: true })}</dd>` : ''}
        <dt>${reprogramando ? 'Nueva fecha' : 'Fecha'}</dt><dd>${fecha(st.inicio, { conDia: true })}</dd>
        <dt>Hora</dt><dd>${hora(st.inicio)} (duración ${st.servicio.duracion_min} min)</dd>
      </dl></div>
      ${st.servicio.preparacion ? html`<div class="aviso aviso-ambar" style="margin-top:1rem">${icono('info')}<p><strong>Cómo prepararte:</strong> ${st.servicio.preparacion}</p></div>` : ''}
      <form novalidate data-form style="margin-top:1.25rem">
        ${reprogramando ? '' : html`<div class="campo"><label for="ag-motivo">Motivo de la consulta <span class="opcional">(opcional)</span></label>
          <textarea class="control" id="ag-motivo" name="motivo" rows="3" maxlength="500" placeholder="Por ejemplo: control anual, me lo ordenó mi neumólogo…"></textarea></div>`}
        <div style="display:flex;gap:.6rem;flex-wrap:wrap">
          <button class="btn btn-secundario" type="button" data-atras>${icono('atras')}<span>Cambiar hora</span></button>
          <button class="btn" type="submit"><span>${reprogramando ? 'Confirmar cambio' : 'Agendar cita'}</span></button>
        </div>
      </form></div>`);
    cont.querySelector('[data-atras]').onclick = () => { st.paso = 3; pintar(); };
    const form = cont.querySelector('[data-form]');
    form.onsubmit = (e) => {
      e.preventDefault();
      ocupado(form.querySelector('[type=submit]'), async () => {
        try {
          if (reprogramando) await post(`/api/citas/${reprogramando}/reprogramar`, { inicio: st.inicio });
          else await post('/api/citas', { servicio_id: st.servicio.id, medico_id: st.medico.id, inicio: st.inicio, motivo: form.motivo?.value || '' });
          avisar(reprogramando ? 'Cita reprogramada.' : 'Cita agendada.');
          ir('/portal/citas', { reemplazar: true });
        } catch (err) {
          if (err.status === 409) { avisar(err.message, 'error'); st.inicio = null; st.paso = 3; pintar(); }
          else mostrarErrores(form, err);
        }
      });
    };
  }

  pintar();
}
