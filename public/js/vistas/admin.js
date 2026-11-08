// Vistas de administración: resumen, usuarios, servicios, citas, solicitudes, actividad y datos de la clínica.
import { estado, get, post, patch, put, ir } from '../estado.js';
import {
  html, raw, icono, avisar, ocupado, vacio, esqLista, esqCifras, esqPanel, esqTabla, fecha, fechaHora, hora, hace, debounce,
  estadoCita, confirmar, abrirModal, botonCerrar, mostrarErrores, datosForm, iniciales, ROL, copiar,
} from '../ui.js';
import { cabecera } from './comun.js';

const TIPOS_DOC = ['Cédula de ciudadanía', 'Tarjeta de identidad', 'Cédula de extranjería', 'Pasaporte', 'Registro civil', 'Permiso por protección temporal'];
const ACCIONES = {
  configuracion_inicial: 'configuró el portal', registro_paciente: 'se registró como paciente', inicio_sesion: 'ingresó al portal',
  solicitud_clave: 'pidió restablecer su contraseña', cambio_clave: 'cambió su contraseña', perfil_actualizado: 'actualizó su perfil',
  cita_creada: 'agendó una cita', cita_cancelada: 'canceló una cita', cita_reprogramada: 'reprogramó una cita', cita_atencion: 'registró una atención',
  resultado_cargado: 'cargó un resultado', resultado_descargado: 'descargó un resultado', resultado_eliminado: 'eliminó un resultado',
  horario_actualizado: 'actualizó su horario', usuario_creado: 'creó una cuenta', usuario_editado: 'editó una cuenta',
  usuario_activado: 'reactivó una cuenta', usuario_desactivado: 'desactivó una cuenta', servicios_asignados: 'asignó servicios',
  clave_restablecida: 'restableció una contraseña', servicio_creado: 'creó un servicio', servicio_editado: 'editó un servicio',
  servicio_pausado: 'pausó un servicio', servicio_activado: 'reactivó un servicio', clinica_actualizada: 'actualizó los datos de la clínica',
};
const OCULTAR_DETALLE = new Set(['resultado_cargado', 'resultado_descargado', 'resultado_eliminado']);
const filaActividad = (a) => html`<li>
  <span class="avatar" aria-hidden="true">${a.nombre ? iniciales(a) : '?'}</span>
  <span><strong>${a.nombre ? `${a.nombre} ${a.apellido}` : 'Cuenta eliminada'}</strong> ${ACCIONES[a.accion] || a.accion}${a.detalle && !OCULTAR_DETALLE.has(a.accion) && a.accion !== 'inicio_sesion' ? html`<span style="color:var(--gris-500)">: ${a.detalle}</span>` : ''}</span>
  <span class="cuando">${hace(a.creado_en)}</span></li>`;

function mostrarClave({ titulo, persona, clave }) {
  const m = abrirModal({
    etiqueta: titulo,
    contenido: String(html`<div class="modal-icono">${icono('llave')}</div><h2>${titulo}</h2>
      <p class="texto" style="margin-top:.5rem">Entrega esta contraseña temporal a <strong>${persona}</strong> por un medio seguro. Al ingresar, el portal le pedirá crear una nueva.</p>
      <div class="clave-temporal"><code>${clave}</code><button class="btn btn-secundario btn-sm" type="button" data-copiar>${icono('copiar')}<span>Copiar</span></button></div>
      <div class="aviso aviso-ambar">${icono('alerta')}<p>No la podrás volver a ver. Si se pierde, genera otra.</p></div>
      <div class="modal-acciones"><button class="btn" type="button" data-cerrar autofocus>Listo, ya la anoté</button></div>`),
  });
  m.el.querySelector('[data-copiar]').onclick = () => copiar(clave);
}

// ── Resumen ─────────────────────────────────────────────────
export async function inicio(el, ctx) {
  ctx.titulo('Resumen');
  el.innerHTML = String(html`${cabecera(`Hola, ${estado.usuario.nombre}`, 'Estado general del portal de la clínica.')}<div data-c>${esqCifras(4)}</div><div class="rejilla-2"><div data-pend>${esqPanel(3)}</div><div data-act>${esqPanel(4)}</div></div>`);
  const [r, clinica] = await Promise.all([get('/api/resumen'), get('/api/publico/clinica')]);
  if (!ctx.vigente()) return;
  el.querySelector('[data-c]').innerHTML = String(html`<div class="cifras">
    <a class="cifra" href="/portal/usuarios?rol=paciente" data-link><div class="valor">${r.pacientes}</div><div class="rotulo">Pacientes registrados</div></a>
    <a class="cifra" href="/portal/usuarios?rol=medico" data-link><div class="valor">${r.medicos}</div><div class="rotulo">Médicos activos</div></a>
    <a class="cifra" href="/portal/citas" data-link><div class="valor">${r.citasHoy}</div><div class="rotulo">Citas hoy</div></a>
    <a class="cifra" href="/portal/citas" data-link><div class="valor">${r.citasSemana}</div><div class="rotulo">Citas próximos 7 días</div></a>
    <a class="cifra ${r.solicitudes ? 'alerta' : ''}" href="/portal/solicitudes" data-link><div class="valor">${r.solicitudes}</div><div class="rotulo">Solicitudes de acceso</div></a></div>`);
  const pend = [];
  if (!r.servicios) pend.push(['servicios', 'Crea el primer servicio', 'Los pacientes necesitan al menos un servicio para agendar.', '/portal/servicios', 'Crear servicio']);
  if (!r.medicos) pend.push(['usuarios', 'Registra al personal médico', 'Crea las cuentas de los médicos y asígnales sus servicios.', '/portal/usuarios?nueva=medico', 'Registrar médico']);
  for (const s of r.serviciosSinMedico) pend.push(['servicios', `${s.nombre} no tiene médicos`, 'Asígnalo a un médico desde Usuarios para que se pueda agendar.', '/portal/usuarios?rol=medico', 'Asignar']);
  for (const m of r.medicosSinHorario) pend.push(['reloj', `${m.nombre} ${m.apellido} no ha publicado horario`, 'Sin horario no aparece disponible para agendar. Pídele que lo configure en Mi horario.', '', '']);
  if (!clinica.direccion && !clinica.telefono) pend.push(['ubicacion', 'Completa los datos de la clínica', 'Dirección, teléfono y horario aparecen en la página de inicio.', '/portal/clinica', 'Completar']);
  el.querySelector('[data-pend]').innerHTML = String(html`<section class="panel panel-sin-pad"><div class="panel-cab"><h2>Pendientes</h2></div>
    ${pend.length ? html`<div style="margin-top:.75rem">${pend.map(([ic, t, d, href, b]) => html`<div class="item"><span class="icono-item ambar" aria-hidden="true">${icono(ic)}</span>
      <div><div class="titulo">${t}</div><div class="meta">${d}</div></div><div class="lado">${href ? html`<a class="btn btn-secundario btn-sm" href="${href}" data-link>${b}</a>` : ''}</div></div>`)}</div>`
      : vacio({ ilus: 'listo', compacto: true, titulo: 'Todo está configurado', texto: 'Los pacientes pueden agendar con todos los servicios publicados.' })}</section>`);
  el.querySelector('[data-act]').innerHTML = String(html`<section class="panel"><div class="panel-cab"><h2>Actividad reciente</h2><a href="/portal/actividad" data-link>Ver todo</a></div>
    ${r.actividad.length ? html`<ul class="actividad">${r.actividad.map(filaActividad)}</ul>` : vacio({ ilus: 'reloj', compacto: true, titulo: 'Sin actividad', texto: '' })}</section>`);
}

// ── Usuarios ────────────────────────────────────────────────
function formularioUsuario({ u = null, servicios, rol = 'medico' }) {
  const r = u?.rol || rol;
  const sel = new Set((u?.servicios || []).map((s) => s.id));
  return html`<form novalidate data-form>
    ${u ? '' : html`<div class="campo"><label for="us-rol">Tipo de cuenta</label><select class="control" id="us-rol" name="rol">
      ${[['medico', 'Personal médico'], ['admin', 'Administrador'], ['paciente', 'Paciente (registro en recepción)']].map(([v, t]) => html`<option value="${v}" ${v === r ? 'selected' : ''}>${t}</option>`)}</select></div>`}
    <div class="fila-campos">
      <div class="campo"><label for="us-n">Nombres</label><input class="control" id="us-n" name="nombre" value="${u?.nombre || ''}" required></div>
      <div class="campo"><label for="us-a">Apellidos</label><input class="control" id="us-a" name="apellido" value="${u?.apellido || ''}" required></div>
    </div>
    <div class="fila-campos">
      <div class="campo"><label for="us-td">Tipo de documento</label><select class="control" id="us-td" name="tipo_documento">${TIPOS_DOC.map((t) => html`<option ${t === (u?.tipo_documento || 'Cédula de ciudadanía') ? 'selected' : ''}>${t}</option>`)}</select></div>
      <div class="campo"><label for="us-d">Número de documento</label><input class="control" id="us-d" name="documento" value="${u?.documento || ''}" inputmode="numeric" required></div>
    </div>
    <div class="fila-campos">
      <div class="campo"><label for="us-e">Correo</label><input class="control" type="email" id="us-e" name="email" value="${u?.email || ''}" required></div>
      <div class="campo"><label for="us-t">Celular <span class="opcional">(opcional)</span></label><input class="control" type="tel" id="us-t" name="telefono" value="${u?.telefono || ''}"></div>
    </div>
    <div data-solo="paciente" ${r === 'paciente' ? '' : 'hidden'}>
      <div class="fila-campos">
        ${u ? '' : html`<div class="campo"><label for="us-fn">Fecha de nacimiento <span class="opcional">(opcional)</span></label><input class="control" type="date" id="us-fn" name="fecha_nacimiento" max="${estado.servidor.hoy}"></div>`}
        <div class="campo"><label for="us-eps">EPS <span class="opcional">(opcional)</span></label><input class="control" id="us-eps" name="eps" value="${u?.eps || ''}"></div>
      </div>
    </div>
    <div data-solo="medico" ${r === 'medico' ? '' : 'hidden'}>
      <div class="campo"><label for="us-rm">Registro médico</label><input class="control" id="us-rm" name="registro_medico" value="${u?.registro_medico || ''}" placeholder="Número de tarjeta profesional o ReTHUS"></div>
      <fieldset class="campo" style="border:0;padding:0"><legend class="etiqueta" style="margin-bottom:.5rem">Servicios que atiende</legend>
        ${servicios.length ? html`<div class="chips-seleccion" data-servicios>${servicios.map((s) => html`<label><input type="checkbox" value="${s.id}" ${sel.has(s.id) ? 'checked' : ''}>${s.nombre}</label>`)}</div>`
          : html`<p class="ayuda">Aún no hay servicios. Créalos en <a href="/portal/servicios" data-link data-cerrar>Servicios</a> y luego asígnalos.</p>`}
      </fieldset>
    </div>
    <div class="modal-acciones"><button class="btn btn-secundario" type="button" data-cerrar>Cancelar</button><button class="btn" type="submit"><span>${u ? 'Guardar cambios' : 'Crear cuenta'}</span></button></div>
  </form>`;
}

export async function usuarios(el, ctx) {
  ctx.titulo('Usuarios');
  const rol = ['paciente', 'medico', 'admin'].includes(ctx.query.get('rol')) ? ctx.query.get('rol') : '';
  el.innerHTML = String(html`${cabecera('Usuarios', 'Pacientes, personal médico y administradores del portal.', html`<button class="btn" type="button" data-nueva>${icono('mas')}<span>Nueva cuenta</span></button>`)}
    <div style="display:flex;gap:.75rem;flex-wrap:wrap;align-items:center;margin-bottom:1.25rem">
      <div class="pestanas" role="tablist" aria-label="Filtrar por rol">
        ${[['', 'Todos'], ['paciente', 'Pacientes'], ['medico', 'Médicos'], ['admin', 'Administradores']].map(([k, t]) => html`<a role="tab" href="/portal/usuarios${k ? `?rol=${k}` : ''}" data-link aria-selected="${rol === k}">${t}</a>`)}
      </div>
      <div class="buscador" style="max-width:360px">${icono('buscar')}<label class="sr" for="us-q">Buscar</label><input class="control" id="us-q" type="search" placeholder="Nombre, documento o correo"></div>
    </div>
    <div data-lista>${esqTabla(6, 5)}</div>`);
  let servicios = [];
  const input = el.querySelector('#us-q');
  let filas = [];
  const cargar = async () => {
    [filas, servicios] = await Promise.all([get(`/api/admin/usuarios?rol=${rol}&q=${encodeURIComponent(input.value.trim())}`), servicios.length ? servicios : get('/api/admin/servicios')]);
    if (!ctx.vigente()) return;
    const box = el.querySelector('[data-lista]');
    if (!filas.length) {
      box.innerHTML = String(html`<div class="panel">${input.value.trim()
        ? vacio({ ilus: 'buscar', titulo: 'Nadie coincide con la búsqueda', texto: 'Prueba con el número de documento o el correo.' })
        : vacio({ ilus: 'personas', titulo: rol === 'medico' ? 'Aún no hay personal médico' : rol === 'paciente' ? 'Aún no hay pacientes registrados' : 'Sin cuentas', texto: rol === 'paciente' ? 'Los pacientes se registran solos desde la página de inicio, o puedes registrarlos tú en recepción.' : 'Crea la cuenta y entrega la contraseña temporal.', accion: html`<button class="btn" type="button" data-nueva>${icono('mas')}<span>Nueva cuenta</span></button>` })}</div>`);
      box.querySelector('[data-nueva]')?.addEventListener('click', () => nueva());
      return;
    }
    box.innerHTML = String(html`<div class="panel panel-sin-pad"><div class="tabla-envoltura"><table class="tabla tabla-tarjetas">
      <thead><tr><th>Persona</th><th>Rol</th><th>Documento</th><th>Contacto</th><th>Estado</th><th><span class="sr">Acciones</span></th></tr></thead>
      <tbody>${filas.map((u) => html`<tr data-id="${u.id}">
        <td data-col="principal"><div class="persona"><span class="avatar" aria-hidden="true">${iniciales(u)}</span><span><strong>${u.nombre} ${u.apellido}</strong>${u.id === estado.usuario.id ? ' (tú)' : ''}
          ${u.servicios?.length ? html`<br><span class="chips" style="margin-top:.25rem">${u.servicios.map((s) => html`<span class="chip">${s.nombre}</span>`)}</span>` : u.rol === 'medico' ? html`<br><span class="sub" style="color:var(--ambar-700)">Sin servicios asignados</span>` : ''}</span></div></td>
        <td>${ROL[u.rol]}</td>
        <td>${u.documento}</td>
        <td class="correo">${u.email}${u.telefono ? html`<br><span class="sub">${u.telefono}</span>` : ''}</td>
        <td>${u.activo ? (u.debe_cambiar_clave ? html`<span class="estado estado-programada">Clave temporal</span>` : html`<span class="estado estado-confirmada">Activa</span>`) : html`<span class="estado estado-inactivo">Desactivada</span>`}</td>
        <td class="acciones-celda"><div>
          <button class="btn btn-fantasma btn-sm" type="button" data-accion="editar">${icono('editar')}<span>Editar</span></button>
          <button class="btn btn-fantasma btn-sm" type="button" data-accion="clave">${icono('llave')}<span>Clave</span></button>
          ${u.id !== estado.usuario.id ? html`<button class="btn btn-fantasma btn-sm" type="button" data-accion="activo">${u.activo ? 'Desactivar' : 'Reactivar'}</button>` : ''}
        </div></td></tr>`)}</tbody></table></div></div>`);
  };
  const nueva = (r = 'medico') => {
    const m = abrirModal({ etiqueta: 'Nueva cuenta', clase: 'ancho', contenido: String(html`<div class="modal-cab"><h2>Nueva cuenta</h2>${botonCerrar}</div>${formularioUsuario({ servicios: servicios.filter((s) => s.activo), rol: r })}`) });
    const form = m.el.querySelector('[data-form]');
    form.rol.addEventListener('change', () => form.querySelectorAll('[data-solo]').forEach((x) => { x.hidden = x.dataset.solo !== form.rol.value; }));
    form.onsubmit = (e) => {
      e.preventDefault();
      const d = datosForm(form);
      d.servicios = [...form.querySelectorAll('[data-servicios] input:checked')].map((i) => Number(i.value));
      ocupado(form.querySelector('[type=submit]'), async () => {
        try {
          const r2 = await post('/api/admin/usuarios', d);
          m.cerrar();
          avisar('Cuenta creada.');
          mostrarClave({ titulo: 'Cuenta creada', persona: `${r2.usuario.nombre} ${r2.usuario.apellido}`, clave: r2.claveTemporal });
          cargar();
        } catch (err) { mostrarErrores(form, err); }
      });
    };
  };
  el.querySelector('[data-nueva]').onclick = () => nueva(rol || 'medico');
  el.querySelector('[data-lista]').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-accion]'); if (!b) return;
    const u = filas.find((x) => x.id === Number(b.closest('[data-id]').dataset.id));
    if (b.dataset.accion === 'editar') {
      const m = abrirModal({ etiqueta: 'Editar cuenta', clase: 'ancho', contenido: String(html`<div class="modal-cab"><div><h2>Editar cuenta</h2><p class="ayuda">${ROL[u.rol]}</p></div>${botonCerrar}</div>${formularioUsuario({ u, servicios })}`) });
      const form = m.el.querySelector('[data-form]');
      form.onsubmit = (ev) => {
        ev.preventDefault();
        const d = datosForm(form);
        const cuerpo = { datos: d };
        if (u.rol === 'medico') cuerpo.servicios = [...form.querySelectorAll('[data-servicios] input:checked')].map((i) => Number(i.value));
        ocupado(form.querySelector('[type=submit]'), async () => {
          try { await patch(`/api/admin/usuarios/${u.id}`, cuerpo); m.cerrar(); avisar('Cambios guardados.'); cargar(); }
          catch (err) { mostrarErrores(form, err); }
        });
      };
    } else if (b.dataset.accion === 'clave') {
      if (!await confirmar({ titulo: 'Generar contraseña temporal', texto: `La contraseña actual de ${u.nombre} ${u.apellido} dejará de funcionar y se cerrarán sus sesiones. Verifica su identidad antes de continuar.`, aceptar: 'Generar contraseña' })) return;
      try { const r = await post(`/api/admin/usuarios/${u.id}/restablecer-clave`); mostrarClave({ titulo: 'Contraseña restablecida', persona: `${u.nombre} ${u.apellido}`, clave: r.claveTemporal }); cargar(); }
      catch (err) { avisar(err.message, 'error'); }
    } else if (b.dataset.accion === 'activo') {
      if (u.activo && !await confirmar({ titulo: 'Desactivar cuenta', peligro: true, aceptar: 'Desactivar', texto: `${u.nombre} ${u.apellido} no podrá ingresar al portal. Su información y su historial se conservan y puedes reactivarla cuando quieras.` })) return;
      ocupado(b, async () => {
        try { await patch(`/api/admin/usuarios/${u.id}`, { activo: !u.activo }); avisar(u.activo ? 'Cuenta desactivada.' : 'Cuenta reactivada.'); cargar(); }
        catch (err) { avisar(err.message, 'error'); }
      });
    }
  });
  input.addEventListener('input', debounce(cargar, 280));
  await cargar();
  if (ctx.query.get('nueva')) nueva(ctx.query.get('nueva'));
}

// ── Servicios ───────────────────────────────────────────────
export async function servicios(el, ctx) {
  ctx.titulo('Servicios');
  el.innerHTML = String(html`${cabecera('Servicios', 'Exámenes y terapias que los pacientes pueden agendar en línea.', html`<button class="btn" type="button" data-nuevo>${icono('mas')}<span>Nuevo servicio</span></button>`)}<div data-lista>${esqTabla(4, 4)}</div>`);
  let filas = [];
  const formulario = (s) => html`<form novalidate data-form>
    <div class="campo"><label for="sv-n">Nombre</label><input class="control" id="sv-n" name="nombre" value="${s?.nombre || ''}" maxlength="80" required placeholder="Por ejemplo: Espirometría"></div>
    <div class="campo"><label for="sv-d">Descripción para el paciente <span class="opcional">(opcional)</span></label><input class="control" id="sv-d" name="descripcion" value="${s?.descripcion || ''}" maxlength="300" placeholder="Qué es y para qué sirve, en una frase."></div>
    <div class="campo"><label for="sv-t">Duración de cada cita (minutos)</label><input class="control" type="number" id="sv-t" name="duracion_min" value="${s?.duracion_min || 30}" min="10" max="240" step="5" required style="max-width:160px"></div>
    <div class="campo"><label for="sv-p">Indicaciones de preparación <span class="opcional">(opcional)</span></label><textarea class="control" id="sv-p" name="preparacion" rows="3" maxlength="600" placeholder="Por ejemplo: no fumar 4 horas antes y traer la lista de medicamentos.">${s?.preparacion || ''}</textarea>
      <p class="ayuda">El paciente las ve al agendar y en su próxima cita.</p></div>
    <div class="modal-acciones"><button class="btn btn-secundario" type="button" data-cerrar>Cancelar</button><button class="btn" type="submit"><span>${s ? 'Guardar cambios' : 'Crear servicio'}</span></button></div></form>`;
  const editar = (s) => {
    const m = abrirModal({ etiqueta: s ? 'Editar servicio' : 'Nuevo servicio', clase: 'ancho', contenido: String(html`<div class="modal-cab"><h2>${s ? 'Editar servicio' : 'Nuevo servicio'}</h2>${botonCerrar}</div>${formulario(s)}`) });
    const form = m.el.querySelector('[data-form]');
    form.onsubmit = (e) => {
      e.preventDefault();
      const d = datosForm(form); d.duracion_min = Number(d.duracion_min);
      ocupado(form.querySelector('[type=submit]'), async () => {
        try {
          if (s) await patch(`/api/admin/servicios/${s.id}`, d); else await post('/api/admin/servicios', d);
          m.cerrar(); avisar(s ? 'Servicio actualizado.' : 'Servicio creado. Ahora asígnalo a los médicos que lo atienden.'); cargar();
        } catch (err) { mostrarErrores(form, err); }
      });
    };
  };
  const cargar = async () => {
    filas = await get('/api/admin/servicios');
    if (!ctx.vigente()) return;
    const box = el.querySelector('[data-lista]');
    if (!filas.length) {
      box.innerHTML = String(html`<div class="panel">${vacio({ ilus: 'citas', titulo: 'Aún no hay servicios', texto: 'Crea los exámenes y terapias de la clínica, como espirometría, polisomnografía o rehabilitación pulmonar.', accion: html`<button class="btn" type="button" data-nuevo>${icono('mas')}<span>Crear el primero</span></button>` })}</div>`);
      box.querySelector('[data-nuevo]').onclick = () => editar(null);
      return;
    }
    box.innerHTML = String(html`<div class="panel panel-sin-pad"><div class="tabla-envoltura"><table class="tabla tabla-tarjetas">
      <thead><tr><th>Servicio</th><th>Duración</th><th>Médicos</th><th>Citas</th><th>Estado</th><th><span class="sr">Acciones</span></th></tr></thead>
      <tbody>${filas.map((s) => html`<tr data-id="${s.id}">
        <td data-col="principal"><strong>${s.nombre}</strong>${s.descripcion ? html`<br><span class="sub">${s.descripcion}</span>` : ''}</td>
        <td>${s.duracion_min} min</td>
        <td>${s.medicos ? s.medicos : html`<span style="color:var(--ambar-700)">Ninguno</span>`}</td>
        <td>${s.citas}</td>
        <td>${s.activo ? html`<span class="estado estado-confirmada">Publicado</span>` : html`<span class="estado estado-inactivo">Pausado</span>`}</td>
        <td class="acciones-celda"><div><button class="btn btn-fantasma btn-sm" type="button" data-accion="editar">${icono('editar')}<span>Editar</span></button>
          <button class="btn btn-fantasma btn-sm" type="button" data-accion="activo">${s.activo ? html`${icono('pausa')}<span>Pausar</span>` : html`${icono('play')}<span>Publicar</span>`}</button></div></td></tr>`)}</tbody></table></div></div>`);
  };
  el.querySelector('[data-nuevo]').onclick = () => editar(null);
  el.querySelector('[data-lista]').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-accion]'); if (!b) return;
    const s = filas.find((x) => x.id === Number(b.closest('[data-id]').dataset.id));
    if (b.dataset.accion === 'editar') return editar(s);
    if (s.activo && !await confirmar({ titulo: `Pausar ${s.nombre}`, texto: 'Los pacientes dejarán de verlo al agendar. Las citas ya programadas se mantienen.', aceptar: 'Pausar servicio' })) return;
    ocupado(b, async () => {
      try { await patch(`/api/admin/servicios/${s.id}`, { activo: !s.activo }); avisar(s.activo ? 'Servicio pausado.' : 'Servicio publicado.'); cargar(); }
      catch (err) { avisar(err.message, 'error'); }
    });
  });
  await cargar();
}

// ── Citas (todas) ───────────────────────────────────────────
export async function citas(el, ctx) {
  ctx.titulo('Citas');
  el.innerHTML = String(html`${cabecera('Citas', 'Todas las citas de la clínica.')}
    <form class="filtros" data-f role="search">
      <div class="buscador">${icono('buscar')}<label class="sr" for="ac-q">Buscar</label><input class="control" id="ac-q" name="q" type="search" placeholder="Paciente, documento, médico o servicio"></div>
      <div class="campo"><label class="sr" for="ac-v">Periodo</label><select class="control" id="ac-v" name="vista"><option value="proximas">Próximas</option><option value="historial">Historial</option><option value="">Todas</option></select></div>
      <div class="campo"><label class="sr" for="ac-e">Estado</label><select class="control" id="ac-e" name="estado"><option value="">Cualquier estado</option>
        ${[['programada', 'Por confirmar'], ['confirmada', 'Confirmada'], ['atendida', 'Atendida'], ['no_asistio', 'No asistió'], ['cancelada', 'Cancelada']].map(([v, t]) => html`<option value="${v}">${t}</option>`)}</select></div>
      <div class="campo"><label class="sr" for="ac-f">Fecha</label><input class="control" type="date" id="ac-f" name="fecha"></div>
    </form><div data-lista>${esqTabla(6, 5)}</div>`);
  const form = el.querySelector('[data-f]');
  let filas = [];
  const cargar = async () => {
    const p = new URLSearchParams(Object.entries(Object.fromEntries(new FormData(form))).filter(([, v]) => v));
    filas = await get(`/api/citas?${p}`);
    if (!ctx.vigente()) return;
    const box = el.querySelector('[data-lista]');
    if (!filas.length) { box.innerHTML = String(html`<div class="panel">${vacio({ ilus: 'citas', titulo: 'No hay citas con estos filtros', texto: 'Cambia el periodo o el estado para ver otras citas.' })}</div>`); return; }
    box.innerHTML = String(html`<div class="panel panel-sin-pad"><div class="tabla-envoltura"><table class="tabla tabla-tarjetas">
      <thead><tr><th>Fecha</th><th>Paciente</th><th>Servicio y médico</th><th>Estado</th><th><span class="sr">Acciones</span></th></tr></thead>
      <tbody>${filas.map((c) => html`<tr data-id="${c.id}">
        <td data-col="principal"><strong>${fecha(c.inicio, { conDia: true })}</strong><br><span class="sub">${hora(c.inicio)}</span></td>
        <td>${c.paciente_nombre} ${c.paciente_apellido}<br><span class="sub">${c.paciente_documento}${c.paciente_telefono ? `, ${c.paciente_telefono}` : ''}</span></td>
        <td>${c.servicio}<br><span class="sub">${c.medico_nombre} ${c.medico_apellido}</span></td>
        <td>${estadoCita(c)}</td>
        <td class="acciones-celda"><div>${['programada', 'confirmada'].includes(c.estado) && !c.pasada ? html`<button class="btn btn-peligro btn-sm" type="button" data-cancelar>Cancelar</button>` : ''}</div></td></tr>`)}</tbody></table></div></div>`);
  };
  el.querySelector('[data-lista]').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-cancelar]'); if (!b) return;
    const c = filas.find((x) => x.id === Number(b.closest('[data-id]').dataset.id));
    const r = await confirmar({ titulo: 'Cancelar la cita', peligro: true, conMotivo: true, etiquetaMotivo: 'Motivo para el paciente', aceptar: 'Cancelar cita', texto: `${c.servicio} de ${c.paciente_nombre} ${c.paciente_apellido} el ${fechaHora(c.inicio, { conDia: true })}. Avisaremos al paciente y al médico.` });
    if (!r) return;
    ocupado(b, async () => {
      try { await post(`/api/citas/${c.id}/cancelar`, { motivo: r.motivo }); avisar('Cita cancelada.'); cargar(); }
      catch (err) { avisar(err.message, 'error'); }
    });
  });
  form.addEventListener('input', debounce(cargar, 280));
  form.onsubmit = (e) => { e.preventDefault(); cargar(); };
  await cargar();
}

// ── Solicitudes de restablecimiento ─────────────────────────
export async function solicitudes(el, ctx) {
  ctx.titulo('Solicitudes de acceso');
  el.innerHTML = String(html`${cabecera('Solicitudes de acceso', 'Personas que olvidaron su contraseña. Verifica su identidad por teléfono antes de entregar una contraseña temporal.')}<div class="panel panel-sin-pad" data-lista>${esqLista(3)}</div>`);
  const cargar = async () => {
    const filas = await get('/api/admin/solicitudes');
    if (!ctx.vigente()) return;
    const box = el.querySelector('[data-lista]');
    if (!filas.length) { box.innerHTML = String(vacio({ ilus: 'listo', titulo: 'No hay solicitudes', texto: 'Cuando alguien use “Olvidé mi contraseña”, aparecerá aquí.' })); return; }
    box.innerHTML = String(html`${filas.map((s) => html`<div class="item" data-id="${s.id}">
      <span class="icono-item ${s.estado === 'pendiente' ? 'ambar' : ''}" aria-hidden="true">${icono('llave')}</span>
      <div><div class="titulo">${s.nombre} ${s.apellido} <span class="estado ${s.estado === 'pendiente' ? 'estado-no_asistio' : s.estado === 'atendida' ? 'estado-confirmada' : 'estado-inactivo'}">${{ pendiente: 'Pendiente', atendida: 'Atendida', descartada: 'Descartada' }[s.estado]}</span></div>
        <div class="meta">${ROL[s.rol]}, ${s.documento}${s.telefono ? html`, <a href="tel:${s.telefono}">${s.telefono}</a>` : ''}, ${s.email}</div>
        <div class="meta">Solicitada ${hace(s.creado_en)}</div></div>
      <div class="lado">${s.estado === 'pendiente' ? html`<button class="btn btn-sm" type="button" data-accion="clave" data-u="${s.usuario_id}">Generar contraseña temporal</button><button class="btn btn-fantasma btn-sm" type="button" data-accion="descartar">Descartar</button>` : ''}</div>
    </div>`)}`);
    box.querySelectorAll('[data-accion]').forEach((b) => b.onclick = async () => {
      const s = filas.find((x) => x.id === Number(b.closest('[data-id]').dataset.id));
      if (b.dataset.accion === 'descartar') {
        await post(`/api/admin/solicitudes/${s.id}/descartar`); avisar('Solicitud descartada.'); return cargar();
      }
      if (!await confirmar({ titulo: '¿Verificaste la identidad?', texto: `Antes de continuar, confirma por teléfono que hablas con ${s.nombre} ${s.apellido} (documento ${s.documento}).`, aceptar: 'Sí, generar contraseña' })) return;
      try { const r = await post(`/api/admin/usuarios/${s.usuario_id}/restablecer-clave`); mostrarClave({ titulo: 'Contraseña restablecida', persona: `${s.nombre} ${s.apellido}`, clave: r.claveTemporal }); cargar(); }
      catch (err) { avisar(err.message, 'error'); }
    });
  };
  await cargar();
}

// ── Actividad ───────────────────────────────────────────────
export async function actividad(el, ctx) {
  ctx.titulo('Actividad');
  el.innerHTML = String(html`${cabecera('Actividad', 'Registro de acciones en el portal, del más reciente al más antiguo.')}<div class="panel" data-lista>${esqLista(6)}</div>`);
  const box = el.querySelector('[data-lista]');
  let items = [];
  const mas = async () => {
    const nuevos = await get(`/api/admin/auditoria${items.length ? `?antes=${items[items.length - 1].id}` : ''}`);
    if (!ctx.vigente()) return;
    items = items.concat(nuevos);
    box.innerHTML = String(items.length
      ? html`<ul class="actividad">${items.map(filaActividad)}</ul>${nuevos.length === 50 ? html`<button class="btn btn-secundario" type="button" data-mas style="margin-top:1rem">Cargar más</button>` : ''}`
      : vacio({ ilus: 'reloj', titulo: 'Sin actividad registrada', texto: '' }));
    box.querySelector('[data-mas]')?.addEventListener('click', (e) => ocupado(e.currentTarget, mas));
  };
  await mas();
}

// ── Datos de la clínica ─────────────────────────────────────
export async function clinica(el, ctx) {
  ctx.titulo('Datos de la clínica');
  el.innerHTML = String(html`${cabecera('Datos de la clínica', 'Se muestran en la sección de contacto de la página de inicio.')}${esqPanel(3, false)}`);
  const c = await get('/api/publico/clinica');
  if (!ctx.vigente()) return;
  el.innerHTML = String(html`${cabecera('Datos de la clínica', 'Se muestran en la sección de contacto de la página de inicio.')}
    <form class="panel" style="max-width:720px" novalidate data-form>
      <div class="campo"><label for="cl-dir">Dirección</label><input class="control" id="cl-dir" name="direccion" value="${c.direccion}" maxlength="200" placeholder="Calle, número, barrio, ciudad"></div>
      <div class="fila-campos">
        <div class="campo"><label for="cl-tel">Teléfono</label><input class="control" type="tel" id="cl-tel" name="telefono" value="${c.telefono}" maxlength="40"></div>
        <div class="campo"><label for="cl-cor">Correo</label><input class="control" type="email" id="cl-cor" name="correo" value="${c.correo}" maxlength="120"></div>
      </div>
      <div class="campo"><label for="cl-hor">Horario de atención</label><textarea class="control" id="cl-hor" name="horario" rows="3" maxlength="300" placeholder="Lunes a viernes, 7:00 a. m. a 6:00 p. m.&#10;Sábados, 8:00 a. m. a 12:00 m.">${c.horario}</textarea></div>
      <button class="btn" type="submit"><span>Guardar datos</span></button>
    </form>`);
  const form = el.querySelector('[data-form]');
  form.onsubmit = (e) => {
    e.preventDefault();
    ocupado(form.querySelector('[type=submit]'), async () => {
      try { await put('/api/admin/clinica', datosForm(form)); avisar('Datos guardados. Ya se ven en la página de inicio.'); }
      catch (err) { mostrarErrores(form, err); }
    });
  };
}
