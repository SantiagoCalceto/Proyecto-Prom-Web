// Vistas del personal médico: hoy, agenda, pacientes, resultados y horario.
import { estado, get, post, put, ir } from '../estado.js';
import {
  html, raw, icono, avisar, ocupado, vacio, esqLista, esqCifras, esqPanel, esqTabla, fecha, fechaHora, hora, hace, debounce,
  mesCorto, diaNum, diaSem, estadoCita, confirmar, abrirModal, botonCerrar, mostrarErrores, datosForm, tamano, iniciales, DIAS_SEMANA,
} from '../ui.js';
import { cabecera, abrirResultado } from './comun.js';

const ACTIVAS = ['programada', 'confirmada'];
const ahora = () => estado.servidor?.ahora || '';

// Modal con el detalle de una cita y sus acciones según el momento
function abrirCita(c, alCambiar) {
  const empezo = c.inicio <= ahoraLocalCliente();
  const puedeRegistrar = empezo && c.estado !== 'cancelada';
  const puedeCancelar = ACTIVAS.includes(c.estado) && !empezo;
  const m = abrirModal({
    etiqueta: 'Detalle de la cita', clase: 'ancho',
    contenido: String(html`
      <div class="modal-cab"><div><h2>${c.servicio}</h2><p class="ayuda">${fechaHora(c.inicio, { conDia: true })}</p></div>${botonCerrar}</div>
      <dl class="datos">
        <dt>Paciente</dt><dd><a href="/portal/pacientes/${c.paciente_id}" data-link data-cerrar>${c.paciente_nombre} ${c.paciente_apellido}</a>, ${c.paciente_documento}</dd>
        ${c.paciente_telefono ? html`<dt>Celular</dt><dd><a href="tel:${c.paciente_telefono}">${c.paciente_telefono}</a></dd>` : ''}
        <dt>Estado</dt><dd>${estadoCita(c)}</dd>
        <dt>Motivo</dt><dd>${c.motivo || 'Sin especificar'}</dd>
        ${c.motivo_cancelacion ? html`<dt>Cancelación</dt><dd>${c.motivo_cancelacion}</dd>` : ''}
      </dl>
      ${puedeRegistrar ? html`<form data-form novalidate style="margin-top:1.25rem">
        <div class="campo"><label for="at-notas">Notas de la atención <span class="opcional">(solo las ve el personal médico)</span></label>
          <textarea class="control" id="at-notas" name="notas" rows="3" maxlength="2000">${c.notas_medico || ''}</textarea></div>
        <div class="modal-acciones" style="justify-content:flex-start;margin-top:0">
          <button class="btn" type="submit" value="atendida">${icono('check')}<span>Marcar atendida</span></button>
          <button class="btn btn-secundario" type="submit" value="no_asistio"><span>No asistió</span></button>
          <a class="btn btn-fantasma" href="/portal/resultados/nuevo?paciente=${c.paciente_id}&cita=${c.id}" data-link data-cerrar>${icono('subir')}<span>Cargar resultado</span></a>
        </div></form>`
      : html`<div class="modal-acciones">
          ${puedeCancelar ? html`<button class="btn btn-peligro" type="button" data-cancelar>Cancelar cita</button>` : ''}
          <a class="btn btn-secundario" href="/portal/resultados/nuevo?paciente=${c.paciente_id}&cita=${c.id}" data-link data-cerrar>${icono('subir')}<span>Cargar resultado</span></a>
          <button class="btn" type="button" data-cerrar>Listo</button></div>`}`),
  });
  const form = m.el.querySelector('[data-form]');
  if (form) form.onsubmit = (e) => {
    e.preventDefault();
    const b = e.submitter;
    ocupado(b, async () => {
      try {
        await post(`/api/citas/${c.id}/atencion`, { estado: b.value, notas: form.notas.value });
        avisar(b.value === 'atendida' ? 'Atención registrada.' : 'Inasistencia registrada.');
        m.cerrar(); alCambiar?.();
      } catch (err) { mostrarErrores(form, err); }
    });
  };
  m.el.querySelector('[data-cancelar]')?.addEventListener('click', async (e) => {
    const r = await confirmar({ titulo: 'Cancelar la cita', peligro: true, aceptar: 'Cancelar cita', cancelar: 'Volver', conMotivo: true, etiquetaMotivo: 'Motivo para el paciente', texto: `Avisaremos a ${c.paciente_nombre} que su cita fue cancelada.` });
    if (!r) return;
    try { await post(`/api/citas/${c.id}/cancelar`, { motivo: r.motivo }); avisar('Cita cancelada. El paciente recibió un aviso.'); m.cerrar(); alCambiar?.(); }
    catch (err) { avisar(err.message, 'error'); }
  });
}

// Hora local de la clínica según el reloj del servidor al cargar + tiempo transcurrido
const t0 = Date.now();
function ahoraLocalCliente() {
  const base = ahora();
  if (!base) return '';
  const [d, t] = base.split('T');
  const ms = Date.UTC(...d.split('-').map((n, i) => i === 1 ? n - 1 : +n), ...t.split(':').map(Number)) + (Date.now() - t0);
  return new Date(ms).toISOString().slice(0, 16);
}

const filaCita = (c, { conFecha = false } = {}) => html`<button class="item" type="button" data-cita="${c.id}">
  <div class="mini-fecha" aria-hidden="true">${conFecha ? html`<span class="d">${diaNum(c.inicio)}</span><span class="m">${mesCorto(c.inicio)}</span>` : html`<span class="d" style="font-size:1rem">${c.inicio.slice(11)}</span>`}</div>
  <div><div class="titulo">${c.paciente_nombre} ${c.paciente_apellido}</div>
    <div class="meta">${c.servicio}, ${conFecha ? `${diaSem(c.inicio)} ` : ''}${hora(c.inicio)}${c.motivo ? `. ${c.motivo}` : ''}</div></div>
  <div class="lado">${ACTIVAS.includes(c.estado) && c.fin < ahoraLocalCliente() ? html`<span class="estado estado-no_asistio">Por registrar</span>` : estadoCita(c)}${icono('flecha', 'class="flecha"')}</div></button>`;

// ── Hoy ─────────────────────────────────────────────────────
export async function inicio(el, ctx) {
  ctx.titulo('Hoy');
  const u = estado.usuario;
  el.innerHTML = String(html`${cabecera(`Hola, ${u.nombre}`, fecha(estado.servidor.hoy, { conDia: true }), html`<a class="btn" href="/portal/resultados/nuevo" data-link>${icono('subir')}<span>Cargar resultado</span></a>`)}
    <div data-avisos></div><div data-cifras>${esqCifras(4)}</div><div data-hoy>${esqPanel(3)}</div>`);
  const cargar = async () => {
    const r = await get('/api/resumen');
    if (!ctx.vigente()) return;
    el.querySelector('[data-avisos]').innerHTML = String(html`
      ${!r.servicios.length ? html`<div class="aviso aviso-ambar">${icono('info')}<div><p><strong>Aún no tienes servicios asignados.</strong></p><p>Pide a la administración que te asigne los servicios que atiendes para aparecer al agendar.</p></div></div>` : ''}
      ${!r.tieneHorario ? html`<div class="aviso">${icono('reloj')}<div><p><strong>Publica tu horario de atención.</strong> Sin horario, los pacientes no pueden agendar contigo.</p><p><a href="/portal/horario" data-link>Configurar mi horario</a></p></div></div>` : ''}`);
    el.querySelector('[data-cifras]').innerHTML = String(html`<div class="cifras">
      <div class="cifra"><div class="valor">${r.hoy.length}</div><div class="rotulo">Citas hoy</div></div>
      <a class="cifra" href="/portal/agenda" data-link><div class="valor">${r.semana}</div><div class="rotulo">Próximos 7 días</div></a>
      <a class="cifra ${r.porRegistrar ? 'alerta' : ''}" href="/portal/agenda?vista=registrar" data-link><div class="valor">${r.porRegistrar}</div><div class="rotulo">Atenciones por registrar</div></a>
      <a class="cifra" href="/portal/resultados" data-link><div class="valor">${r.resultadosMes}</div><div class="rotulo">Resultados en 30 días</div></a></div>`);
    const box = el.querySelector('[data-hoy]');
    box.innerHTML = String(html`<section class="panel panel-sin-pad"><div class="panel-cab"><h2>Agenda de hoy</h2><a href="/portal/agenda" data-link>Ver agenda completa</a></div>
      ${r.hoy.length ? html`<div style="margin-top:.75rem">${r.hoy.map((c) => filaCita(c))}</div>`
        : vacio({ ilus: 'citas', compacto: true, titulo: 'No tienes citas hoy', texto: r.tieneHorario ? 'Cuando un paciente agende para hoy, aparecerá aquí.' : 'Publica tu horario para que los pacientes puedan agendar contigo.' })}</section>`);
    box.querySelectorAll('[data-cita]').forEach((b) => b.onclick = () => abrirCita(r.hoy.find((c) => c.id === Number(b.dataset.cita)), cargar));
  };
  await cargar();
}

// ── Agenda ──────────────────────────────────────────────────
export async function agenda(el, ctx) {
  ctx.titulo('Agenda');
  const vista = ['proximas', 'dia', 'registrar', 'historial'].includes(ctx.query.get('vista')) ? ctx.query.get('vista') : 'proximas';
  const dia = ctx.query.get('fecha') || estado.servidor.hoy;
  el.innerHTML = String(html`${cabecera('Agenda', 'Tus citas con pacientes. Abre una cita para registrar la atención o cancelarla.')}
    <div style="display:flex;gap:.75rem;flex-wrap:wrap;align-items:center;margin-bottom:1.25rem">
      <div class="pestanas" role="tablist" aria-label="Vista de agenda">
        ${[['proximas', 'Próximas'], ['dia', 'Por día'], ['registrar', 'Por registrar'], ['historial', 'Historial']].map(([k, t]) => html`<a role="tab" href="/portal/agenda?vista=${k}" data-link aria-selected="${vista === k}">${t}</a>`)}
      </div>
      ${vista === 'dia' ? html`<div style="display:flex;gap:.35rem;align-items:center">
        <button class="btn btn-secundario btn-icono" type="button" data-dia="-1" aria-label="Día anterior">${icono('atras')}</button>
        <label class="sr" for="ag-fecha">Fecha</label><input class="control" type="date" id="ag-fecha" value="${dia}" style="width:auto;min-height:40px">
        <button class="btn btn-secundario btn-icono" type="button" data-dia="1" aria-label="Día siguiente">${icono('flecha')}</button></div>` : ''}
    </div>
    <div class="panel panel-sin-pad" data-lista>${esqLista(4)}</div>`);
  const irDia = (f) => ir(`/portal/agenda?vista=dia&fecha=${f}`, { reemplazar: true });
  el.querySelector('#ag-fecha')?.addEventListener('change', (e) => e.target.value && irDia(e.target.value));
  el.querySelectorAll('[data-dia]').forEach((b) => b.onclick = () => {
    const d = new Date(dia + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + Number(b.dataset.dia)); irDia(d.toISOString().slice(0, 10));
  });
  const cargar = async () => {
    const q = vista === 'dia' ? `fecha=${dia}` : vista === 'registrar' ? 'vista=historial' : `vista=${vista}`;
    let filas = await get(`/api/citas?${q}`);
    if (vista === 'registrar') filas = filas.filter((c) => ACTIVAS.includes(c.estado));
    if (!ctx.vigente()) return;
    const lista = el.querySelector('[data-lista]');
    if (!filas.length) {
      const msg = {
        proximas: ['No tienes citas próximas', 'Las citas que agenden tus pacientes aparecerán aquí.'],
        dia: [`Sin citas el ${fecha(dia, { conDia: true, conAnio: false })}`, 'Usa las flechas para ver otro día.'],
        registrar: ['Todo al día', 'No tienes atenciones pendientes por registrar.'],
        historial: ['Aún no hay historial', 'Aquí verás las citas atendidas, canceladas y las inasistencias.'],
      }[vista];
      lista.innerHTML = String(vacio({ ilus: vista === 'registrar' ? 'listo' : 'citas', titulo: msg[0], texto: msg[1] }));
      return;
    }
    lista.innerHTML = String(html`${filas.map((c) => filaCita(c, { conFecha: vista !== 'dia' }))}`);
    lista.querySelectorAll('[data-cita]').forEach((b) => b.onclick = () => abrirCita(filas.find((c) => c.id === Number(b.dataset.cita)), cargar));
  };
  await cargar();
}

// ── Pacientes ───────────────────────────────────────────────
export async function pacientes(el, ctx) {
  ctx.titulo('Pacientes');
  el.innerHTML = String(html`${cabecera('Pacientes', 'Tus pacientes recientes. Busca por nombre o documento para encontrar a cualquier paciente de la clínica.')}
    <form class="filtros" role="search" data-f><div class="buscador">${icono('buscar')}<label class="sr" for="pc-q">Buscar paciente</label>
      <input class="control" id="pc-q" name="q" type="search" placeholder="Nombre o número de documento" autocomplete="off"></div></form>
    <div data-lista>${esqTabla(5, 4)}</div>`);
  const input = el.querySelector('#pc-q');
  const cargar = async () => {
    const qv = input.value.trim();
    const filas = await get(`/api/medico/pacientes?q=${encodeURIComponent(qv)}`);
    if (!ctx.vigente()) return;
    const box = el.querySelector('[data-lista]');
    if (!filas.length) {
      box.innerHTML = String(html`<div class="panel">${qv
        ? vacio({ ilus: 'buscar', titulo: `Sin coincidencias para “${qv}”`, texto: 'Revisa el número de documento o escribe solo el primer nombre.' })
        : vacio({ ilus: 'personas', titulo: 'Aún no tienes pacientes', texto: 'Cuando un paciente agende contigo aparecerá aquí. También puedes buscar a cualquier paciente registrado.' })}</div>`);
      return;
    }
    box.innerHTML = String(html`<div class="panel panel-sin-pad"><div class="tabla-envoltura"><table class="tabla tabla-tarjetas">
      <thead><tr><th>Paciente</th><th>Documento</th><th>Celular</th><th>Última cita contigo</th><th>Resultados</th></tr></thead>
      <tbody>${filas.map((p) => html`<tr>
        <td data-col="principal"><a class="persona" href="/portal/pacientes/${p.id}" data-link style="text-decoration:none;color:inherit"><span class="avatar" aria-hidden="true">${iniciales(p)}</span><span><strong>${p.nombre} ${p.apellido}</strong>${p.eps ? html`<br><span class="sub">${p.eps}</span>` : ''}</span></a></td>
        <td>${p.documento}</td><td>${p.telefono || '—'}</td><td>${p.ultima_cita ? fecha(p.ultima_cita) : 'Ninguna'}</td><td>${p.resultados}</td></tr>`)}</tbody></table></div></div>`);
  };
  input.addEventListener('input', debounce(cargar, 280));
  el.querySelector('[data-f]').onsubmit = (e) => { e.preventDefault(); cargar(); };
  await cargar();
}

export async function paciente(el, ctx) {
  ctx.titulo('Paciente');
  el.innerHTML = String(html`${esqPanel(2)}`);
  const r = await get(`/api/medico/pacientes/${ctx.params.id}`);
  if (!ctx.vigente()) return;
  const p = r.paciente;
  ctx.titulo(`${p.nombre} ${p.apellido}`);
  const edad = p.fecha_nacimiento ? Math.floor((Date.parse(estado.servidor.hoy) - Date.parse(p.fecha_nacimiento)) / (365.25 * 864e5)) : null;
  el.innerHTML = String(html`
    <a class="btn btn-fantasma btn-sm" href="/portal/pacientes" data-link style="margin-bottom:1rem">${icono('atras')}<span>Pacientes</span></a>
    ${cabecera(`${p.nombre} ${p.apellido}`, `${p.tipo_documento} ${p.documento}${edad !== null ? `, ${edad} años` : ''}`,
      html`<a class="btn" href="/portal/resultados/nuevo?paciente=${p.id}" data-link>${icono('subir')}<span>Cargar resultado</span></a>`)}
    <div class="rejilla-2">
      <div class="columna">
        <section class="panel panel-sin-pad"><div class="panel-cab"><h2>Resultados</h2></div>
          ${r.resultados.length ? html`<div style="margin-top:.75rem">${r.resultados.map((x) => html`<button class="item" type="button" data-res="${x.id}">
            <span class="icono-item" aria-hidden="true">${icono('resultados')}</span><div><div class="titulo">${x.titulo}</div><div class="meta">${fecha(x.fecha_examen)}, ${x.medico_nombre} ${x.medico_apellido}</div></div>
            <div class="lado">${x.nuevo ? html`<span class="estado">Sin abrir por el paciente</span>` : ''}${icono('flecha', 'class="flecha"')}</div></button>`)}</div>`
          : vacio({ ilus: 'resultados', compacto: true, titulo: 'Sin resultados', texto: 'Este paciente todavía no tiene resultados cargados.' })}
        </section>
        <section class="panel panel-sin-pad"><div class="panel-cab"><h2>Citas contigo</h2></div>
          ${r.citas.length ? html`<div style="margin-top:.75rem">${r.citas.map((c) => filaCita(c, { conFecha: true }))}</div>`
          : vacio({ ilus: 'citas', compacto: true, titulo: 'Sin citas contigo', texto: 'Este paciente no ha agendado citas contigo.' })}
        </section>
      </div>
      <aside class="panel"><h2 style="font-size:var(--t-lg);margin-bottom:1rem">Datos de contacto</h2>
        <dl class="datos">
          <dt>Celular</dt><dd>${p.telefono ? html`<a href="tel:${p.telefono}">${p.telefono}</a>` : '—'}</dd>
          <dt>Correo</dt><dd style="word-break:break-all"><a href="mailto:${p.email}">${p.email}</a></dd>
          <dt>Nacimiento</dt><dd>${p.fecha_nacimiento ? fecha(p.fecha_nacimiento) : '—'}</dd>
          <dt>EPS</dt><dd>${p.eps || '—'}</dd>
        </dl></aside>
    </div>`);
  el.querySelectorAll('[data-res]').forEach((b) => b.onclick = () => abrirResultado(b.dataset.res, { puedeEliminar: true, alCerrar: (x) => x === 'eliminado' && ir(location.pathname, { reemplazar: true }) }));
  el.querySelectorAll('[data-cita]').forEach((b) => b.onclick = () => abrirCita(r.citas.find((c) => c.id === Number(b.dataset.cita)), () => ir(location.pathname, { reemplazar: true })));
}

// ── Resultados cargados ─────────────────────────────────────
export async function resultados(el, ctx) {
  ctx.titulo('Resultados cargados');
  el.innerHTML = String(html`${cabecera('Resultados cargados', 'Informes que has publicado. Puedes abrirlos o eliminarlos si te equivocaste.', html`<a class="btn" href="/portal/resultados/nuevo" data-link>${icono('subir')}<span>Cargar resultado</span></a>`)}
    <form class="filtros" role="search" data-f><div class="buscador">${icono('buscar')}<label class="sr" for="rs-q">Buscar</label><input class="control" id="rs-q" name="q" type="search" placeholder="Paciente, documento o examen"></div></form>
    <div class="panel panel-sin-pad" data-lista>${esqLista(4)}</div>`);
  const input = el.querySelector('#rs-q');
  const cargar = async () => {
    const filas = await get(`/api/resultados?q=${encodeURIComponent(input.value.trim())}`);
    if (!ctx.vigente()) return;
    const lista = el.querySelector('[data-lista]');
    if (!filas.length) {
      lista.innerHTML = String(input.value.trim()
        ? vacio({ ilus: 'buscar', titulo: 'Sin coincidencias', texto: 'Prueba con el documento del paciente o el nombre del examen.' })
        : vacio({ ilus: 'resultados', titulo: 'Aún no has cargado resultados', texto: 'Carga el PDF o la imagen del informe; el paciente recibe un aviso de inmediato.', accion: html`<a class="btn" href="/portal/resultados/nuevo" data-link>${icono('subir')}<span>Cargar el primero</span></a>` }));
      return;
    }
    lista.innerHTML = String(html`${filas.map((x) => html`<button class="item" type="button" data-res="${x.id}">
      <span class="icono-item" aria-hidden="true">${icono('resultados')}</span>
      <div><div class="titulo">${x.titulo}</div><div class="meta">${x.paciente_nombre} ${x.paciente_apellido} (${x.paciente_documento}), examen del ${fecha(x.fecha_examen)}</div></div>
      <div class="lado">${x.nuevo ? html`<span class="estado">Sin abrir</span>` : html`<span class="estado estado-confirmada">Visto</span>`}${icono('flecha', 'class="flecha"')}</div></button>`)}`);
    lista.querySelectorAll('[data-res]').forEach((b) => b.onclick = () => abrirResultado(b.dataset.res, { puedeEliminar: true, alCerrar: (x) => x === 'eliminado' && cargar() }));
  };
  input.addEventListener('input', debounce(cargar, 280));
  el.querySelector('[data-f]').onsubmit = (e) => { e.preventDefault(); cargar(); };
  await cargar();
  if (ctx.params.id) abrirResultado(ctx.params.id, { puedeEliminar: true, alCerrar: () => history.replaceState({}, '', '/portal/resultados') });
}

// ── Cargar resultado ────────────────────────────────────────
export async function nuevoResultado(el, ctx) {
  ctx.titulo('Cargar resultado');
  const st = { paciente: null, archivo: null };
  el.innerHTML = String(html`
    <a class="btn btn-fantasma btn-sm" href="/portal/resultados" data-link style="margin-bottom:1rem">${icono('atras')}<span>Resultados cargados</span></a>
    ${cabecera('Cargar un resultado', 'El paciente recibirá un aviso en cuanto lo publiques.')}
    <form class="panel" style="max-width:760px" novalidate data-form>
      <div class="campo autocompletar">
        <label for="nr-pac">Paciente</label>
        <input class="control" id="nr-pac" autocomplete="off" placeholder="Escribe el nombre o el documento" role="combobox" aria-expanded="false" aria-controls="nr-sug" aria-autocomplete="list">
        <input type="hidden" name="paciente_id">
        <ul class="sugerencias" id="nr-sug" role="listbox" hidden></ul>
      </div>
      <div class="fila-campos">
        <div class="campo"><label for="nr-serv">Servicio <span class="opcional">(opcional)</span></label><select class="control" id="nr-serv" name="servicio_id"><option value="">Sin servicio asociado</option></select></div>
        <div class="campo"><label for="nr-cita">Cita relacionada <span class="opcional">(opcional)</span></label><select class="control" id="nr-cita" name="cita_id" disabled><option value="">Primero elige el paciente</option></select></div>
      </div>
      <div class="fila-campos">
        <div class="campo"><label for="nr-tit">Nombre del examen</label><input class="control" id="nr-tit" name="titulo" required maxlength="120" placeholder="Por ejemplo: Espirometría con broncodilatador"></div>
        <div class="campo"><label for="nr-fecha">Fecha del examen</label><input class="control" type="date" id="nr-fecha" name="fecha_examen" value="${estado.servidor.hoy}" max="${estado.servidor.hoy}" required></div>
      </div>
      <div class="campo"><label for="nr-obs">Observaciones para el paciente <span class="opcional">(opcional si adjuntas archivo)</span></label>
        <textarea class="control" id="nr-obs" name="observaciones" rows="4" maxlength="4000" placeholder="Interpretación, recomendaciones o próximos pasos."></textarea></div>
      <div class="campo">
        <span class="etiqueta" id="nr-arch-lbl">Archivo del informe</span>
        <input type="file" id="nr-arch" name="archivo" accept="application/pdf,image/jpeg,image/png" class="sr" aria-labelledby="nr-arch-lbl">
        <div data-archivo></div>
      </div>
      <div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-top:.5rem">
        <button class="btn btn-lg" type="submit">${icono('subir')}<span>Publicar resultado</span></button>
        <a class="btn btn-secundario btn-lg" href="/portal/resultados" data-link>Cancelar</a>
      </div>
    </form>`);
  const form = el.querySelector('[data-form]');
  const input = el.querySelector('#nr-pac');
  const sug = el.querySelector('#nr-sug');
  const fileInput = el.querySelector('#nr-arch');
  const zona = el.querySelector('[data-archivo]');

  get('/api/servicios').then((ss) => {
    form.servicio_id.insertAdjacentHTML('beforeend', String(html`${ss.map((s) => html`<option value="${s.id}">${s.nombre}</option>`)}`));
  }).catch(() => {});

  async function elegirPaciente(p) {
    st.paciente = p;
    form.paciente_id.value = p.id;
    input.value = `${p.nombre} ${p.apellido}, ${p.documento}`;
    sug.hidden = true; input.setAttribute('aria-expanded', 'false');
    const sel = form.cita_id;
    sel.disabled = true; sel.innerHTML = '<option>Cargando citas…</option>';
    const d = await get(`/api/medico/pacientes/${p.id}`);
    const citas = d.citas.filter((c) => c.estado !== 'cancelada');
    sel.innerHTML = String(html`<option value="">Sin cita asociada</option>${citas.map((c) => html`<option value="${c.id}" data-servicio="${c.servicio_id}">${c.servicio}, ${fechaHora(c.inicio)}</option>`)}`);
    sel.disabled = !citas.length;
    const pre = ctx.query.get('cita');
    if (pre && citas.some((c) => String(c.id) === pre)) { sel.value = pre; sel.dispatchEvent(new Event('change')); }
  }
  form.cita_id.addEventListener('change', () => {
    const o = form.cita_id.selectedOptions[0];
    if (o?.dataset.servicio) {
      form.servicio_id.value = o.dataset.servicio;
      if (!form.titulo.value) form.titulo.value = form.servicio_id.selectedOptions[0]?.textContent || '';
    }
  });

  let activo = -1; let opciones = [];
  const buscar = debounce(async () => {
    const qv = input.value.trim();
    st.paciente = null; form.paciente_id.value = '';
    if (qv.length < 2) { sug.hidden = true; input.setAttribute('aria-expanded', 'false'); return; }
    opciones = await get(`/api/medico/pacientes?q=${encodeURIComponent(qv)}`);
    activo = -1;
    sug.innerHTML = opciones.length
      ? String(html`${opciones.map((p, i) => html`<li role="option" id="nr-op-${i}"><button type="button" tabindex="-1" data-i="${i}"><strong>${p.nombre} ${p.apellido}</strong><span class="sub">${p.tipo_documento} ${p.documento}</span></button></li>`)}`)
      : String(html`<li style="padding:.75rem;color:var(--gris-500);font-size:var(--t-sm)">Ningún paciente coincide. Verifica el documento.</li>`);
    sug.hidden = false; input.setAttribute('aria-expanded', 'true');
  }, 220);
  input.addEventListener('input', buscar);
  input.addEventListener('keydown', (e) => {
    if (sug.hidden || !opciones.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      activo = (activo + (e.key === 'ArrowDown' ? 1 : -1) + opciones.length) % opciones.length;
      sug.querySelectorAll('button').forEach((b, i) => b.toggleAttribute('data-activo', i === activo));
      input.setAttribute('aria-activedescendant', `nr-op-${activo}`);
    } else if (e.key === 'Enter' && activo >= 0) { e.preventDefault(); elegirPaciente(opciones[activo]); }
    else if (e.key === 'Escape') { sug.hidden = true; }
  });
  sug.addEventListener('mousedown', (e) => { const b = e.target.closest('[data-i]'); if (b) { e.preventDefault(); elegirPaciente(opciones[Number(b.dataset.i)]); } });
  input.addEventListener('blur', () => setTimeout(() => { sug.hidden = true; input.setAttribute('aria-expanded', 'false'); }, 120));

  const pid = ctx.query.get('paciente');
  if (pid) get(`/api/medico/pacientes/${pid}`).then((d) => elegirPaciente(d.paciente)).catch(() => {});

  // Archivo
  const pintarArchivo = () => {
    zona.innerHTML = st.archivo
      ? String(html`<div class="archivo-elegido"><span class="icono-item" aria-hidden="true">${icono('archivo')}</span><div style="flex:1;min-width:0"><div class="nombre">${st.archivo.name}</div><div class="ayuda">${tamano(st.archivo.size)}</div></div>
          <button class="btn btn-fantasma btn-sm" type="button" data-quitar>Quitar</button></div>`)
      : String(html`<label class="zona-archivo" for="nr-arch" data-zona>${icono('subir')}<span><strong>Elige un archivo</strong> o arrástralo aquí</span><span class="ayuda">PDF, JPG o PNG, máximo 10 MB</span></label>`);
    zona.querySelector('[data-quitar]')?.addEventListener('click', () => { st.archivo = null; fileInput.value = ''; pintarArchivo(); });
    const z = zona.querySelector('[data-zona]');
    if (z) {
      z.tabIndex = 0;
      z.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
      ['dragenter', 'dragover'].forEach((t) => z.addEventListener(t, (e) => { e.preventDefault(); z.classList.add('sobre'); }));
      ['dragleave', 'drop'].forEach((t) => z.addEventListener(t, () => z.classList.remove('sobre')));
      z.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer.files[0]) tomar(e.dataTransfer.files[0]); });
    }
  };
  const tomar = (f) => {
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(f.type)) return avisar('Solo se aceptan archivos PDF, JPG o PNG.', 'error');
    if (f.size > 10 * 1024 * 1024) return avisar('El archivo supera 10 MB.', 'error');
    st.archivo = f; pintarArchivo();
  };
  fileInput.addEventListener('change', () => fileInput.files[0] && tomar(fileInput.files[0]));
  pintarArchivo();

  const base64 = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(f); });

  form.onsubmit = (e) => {
    e.preventDefault();
    if (!form.paciente_id.value) return mostrarErrores(form, { campos: { paciente_id: 'Busca y elige al paciente de la lista.' } }) || input.focus();
    ocupado(form.querySelector('[type=submit]'), async () => {
      try {
        const d = datosForm(form);
        delete d.archivo;
        const cuerpo = { ...d, archivo: st.archivo ? { nombre: st.archivo.name, tipo: st.archivo.type, datos: await base64(st.archivo) } : null };
        const r = await post('/api/resultados', cuerpo);
        avisar(`Resultado publicado. ${r.paciente_nombre} ya puede verlo.`);
        ir(`/portal/pacientes/${r.paciente_id}`);
      } catch (err) {
        mostrarErrores(form, err);
      }
    });
  };
}

// ── Horario semanal ─────────────────────────────────────────
export async function horario(el, ctx) {
  ctx.titulo('Mi horario');
  el.innerHTML = String(html`${cabecera('Mi horario de atención', 'Define en qué horas atiendes cada día. Los pacientes verán los horarios libres según la duración de cada servicio.')}${esqPanel(5, false)}`);
  const franjas = await get('/api/medico/disponibilidad');
  if (!ctx.vigente()) return;
  const ORDEN = [1, 2, 3, 4, 5, 6, 0];
  const st = Object.fromEntries(ORDEN.map((d) => [d, franjas.filter((f) => f.dia_semana === d).map((f) => ({ i: f.hora_inicio, f: f.hora_fin }))]));
  let sucio = false;
  el.innerHTML = String(html`${cabecera('Mi horario de atención', 'Define en qué horas atiendes cada día. Los pacientes verán los horarios libres según la duración de cada servicio.',
      html`<button class="btn btn-secundario" type="button" data-copiar>${icono('copiar')}<span>Copiar lunes a días hábiles</span></button>`)}
    <form class="panel" data-form novalidate><div class="semana" data-semana></div>
      <div style="display:flex;gap:.75rem;align-items:center;flex-wrap:wrap;margin-top:1rem;padding-top:1.25rem;border-top:1px solid var(--linea-suave)">
        <button class="btn btn-lg" type="submit"><span>Guardar horario</span></button><span class="ayuda" data-estado-guardado></span></div></form>`);
  const sem = el.querySelector('[data-semana]');
  const marcarSucio = () => { sucio = true; el.querySelector('[data-estado-guardado]').textContent = 'Tienes cambios sin guardar.'; };
  const pintar = () => {
    sem.innerHTML = String(html`${ORDEN.map((d) => html`<div class="dia-horario" data-d="${d}">
      <div class="nombre-dia">${DIAS_SEMANA[d][0].toUpperCase() + DIAS_SEMANA[d].slice(1)}</div>
      <div class="franjas">
        ${st[d].length ? st[d].map((f, k) => html`<div class="franja">
          <label class="sr" for="h-${d}-${k}-i">Desde</label><input class="control" type="time" id="h-${d}-${k}-i" value="${f.i}" step="900" data-k="${k}" data-c="i">
          <span aria-hidden="true">a</span>
          <label class="sr" for="h-${d}-${k}-f">Hasta</label><input class="control" type="time" id="h-${d}-${k}-f" value="${f.f}" step="900" data-k="${k}" data-c="f">
          <button class="btn btn-fantasma btn-icono" type="button" data-quitar="${k}" aria-label="Quitar franja">${icono('x')}</button></div>`)
          : html`<span class="sin-atencion">No atiendes este día.</span>`}
        <div><button class="btn btn-fantasma btn-sm" type="button" data-agregar>${icono('mas')}<span>Agregar franja</span></button></div>
      </div></div>`)}`);
  };
  pintar();
  sem.addEventListener('input', (e) => {
    const inp = e.target.closest('input[type=time]'); if (!inp) return;
    const d = inp.closest('[data-d]').dataset.d;
    st[d][inp.dataset.k][inp.dataset.c] = inp.value; marcarSucio();
  });
  sem.addEventListener('click', (e) => {
    const fila = e.target.closest('[data-d]'); if (!fila) return;
    const d = fila.dataset.d;
    if (e.target.closest('[data-agregar]')) {
      const ult = st[d][st[d].length - 1];
      st[d].push(ult ? { i: ult.f, f: ult.f < '17:00' ? '18:00' : '20:00' } : { i: '08:00', f: '12:00' });
      marcarSucio(); pintar();
      sem.querySelector(`[data-d="${d}"] .franja:last-of-type input`)?.focus();
    }
    const q = e.target.closest('[data-quitar]');
    if (q) { st[d].splice(Number(q.dataset.quitar), 1); marcarSucio(); pintar(); }
  });
  el.querySelector('[data-copiar]').onclick = () => {
    if (!st[1].length) return avisar('Primero agrega las franjas del lunes.', 'error');
    for (const d of [2, 3, 4, 5]) st[d] = st[1].map((f) => ({ ...f }));
    marcarSucio(); pintar(); avisar('Copiado de martes a viernes. Recuerda guardar.');
  };
  const form = el.querySelector('[data-form]');
  form.onsubmit = (e) => {
    e.preventDefault();
    const lista = ORDEN.flatMap((d) => st[d].map((f) => ({ dia_semana: d, hora_inicio: f.i, hora_fin: f.f })));
    ocupado(form.querySelector('[type=submit]'), async () => {
      try {
        await put('/api/medico/disponibilidad', { franjas: lista });
        sucio = false;
        el.querySelector('[data-estado-guardado]').textContent = 'Guardado. Los pacientes ya ven estos horarios.';
        avisar('Horario guardado.');
      } catch (err) { avisar(err.message, 'error'); }
    });
  };
  const aviso = (e) => { if (sucio) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', aviso);
}
