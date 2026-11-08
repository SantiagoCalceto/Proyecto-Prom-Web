// Vistas y piezas compartidas por los tres roles.
import { estado, get, post, patch, del, ir, refrescarNotificaciones, iniciarSesion } from '../estado.js';
import {
  html, raw, icono, avisar, ocupado, mostrarErrores, datosForm, vacio, esqLista, esqPanel, hace, fecha, fechaHora, hora,
  tamano, iniciales, nombreCompleto, ROL, abrirCajon, botonCerrar, confirmar, mesCorto, diaNum, diaSem, estadoCita,
} from '../ui.js';

// ── Encabezado de vista ─────────────────────────────────────
export const cabecera = (titulo, texto = '', acciones = '') => html`
  <div class="titulo-vista"><div><h1>${titulo}</h1>${texto ? html`<p>${texto}</p>` : ''}</div>${acciones ? html`<div style="display:flex;gap:.5rem;flex-wrap:wrap">${acciones}</div>` : ''}</div>`;

// ── Elemento de cita ────────────────────────────────────────
export function itemCita(c, { verPaciente = false, verMedico = true, href = '' } = {}) {
  const quien = [verPaciente ? `${c.paciente_nombre} ${c.paciente_apellido}` : '', verMedico ? `${c.medico_nombre} ${c.medico_apellido}` : ''].filter(Boolean).join(', ');
  const cuerpo = html`
    <div class="mini-fecha" aria-hidden="true"><span class="d">${diaNum(c.inicio)}</span><span class="m">${mesCorto(c.inicio)}</span></div>
    <div><div class="titulo">${c.servicio}</div>
      <div class="meta">${diaSem(c.inicio)}, ${hora(c.inicio)}${quien ? `, con ${quien}` : ''}</div></div>
    <div class="lado">${estadoCita(c)}${href ? icono('flecha', 'class="flecha"') : ''}</div>`;
  return href ? html`<a class="item" href="${href}" data-link>${cuerpo}</a>` : html`<div class="item" data-cita="${c.id}">${cuerpo}</div>`;
}

// ── Detalle de un resultado (cajón lateral) ─────────────────
export async function abrirResultado(id, { alCerrar, puedeEliminar = false } = {}) {
  const cajon = abrirCajon({
    etiqueta: 'Detalle del resultado',
    alCerrar,
    contenido: String(html`<div class="cajon-cab"><div class="esq esq-titulo" style="width:60%"></div>${botonCerrar}</div>
      <div class="cajon-cuerpo"><div style="display:grid;gap:.75rem">${[80, 60, 70, 40].map((w) => html`<div class="esq esq-linea" style="width:${raw(w)}%"></div>`)}</div></div>`),
  });
  let r;
  try { r = await get(`/api/resultados/${id}`); }
  catch (e) {
    cajon.el.querySelector('.cajon-cuerpo').innerHTML = String(vacio({ ilus: 'resultados', titulo: 'No pudimos abrir el resultado', texto: e.message, compacto: true }));
    return;
  }
  const url = `/api/resultados/${r.id}/archivo`;
  const esPdf = r.archivo_tipo === 'application/pdf';
  const esImg = r.archivo_tipo?.startsWith('image/');
  cajon.el.innerHTML = String(html`
    <div class="cajon-cab"><div><h2 style="font-size:var(--t-lg)">${r.titulo}</h2><p class="ayuda" style="margin-top:.2rem">${r.servicio || 'Resultado clínico'}</p></div>${botonCerrar}</div>
    <div class="cajon-cuerpo">
      <dl class="datos">
        ${estado.usuario.rol !== 'paciente' ? html`<dt>Paciente</dt><dd>${r.paciente_nombre} ${r.paciente_apellido}, ${r.paciente_documento}</dd>` : ''}
        <dt>Fecha del examen</dt><dd>${fecha(r.fecha_examen)}</dd>
        <dt>Profesional</dt><dd>${r.medico_nombre} ${r.medico_apellido}</dd>
        <dt>Publicado</dt><dd>${hace(r.creado_en)}</dd>
        ${r.archivo_nombre ? html`<dt>Archivo</dt><dd>${r.archivo_nombre} (${tamano(r.archivo_bytes)})</dd>` : ''}
      </dl>
      ${r.observaciones ? html`<h3 style="font-size:var(--t-md);margin-top:1.5rem">Observaciones del médico</h3><div class="observaciones">${r.observaciones}</div>` : ''}
      ${esPdf ? html`<object class="visor" data="${url}?ver=1" type="application/pdf" aria-label="Vista previa del PDF"><p class="ayuda" style="padding:1rem">Tu navegador no puede mostrar el PDF aquí. Usa el botón Descargar.</p></object>` : ''}
      ${esImg ? html`<img class="visor-img" src="${url}?ver=1" alt="Imagen del resultado ${r.titulo}">` : ''}
    </div>
    <div class="cajon-pie">
      ${r.archivo_nombre ? html`<a class="btn" href="${url}" download>${icono('descargar')}<span>Descargar</span></a>
        <a class="btn btn-secundario" href="${url}?ver=1" target="_blank" rel="noopener">${icono('ojo')}<span>Abrir en otra pestaña</span></a>` : ''}
      ${puedeEliminar && r.medico_id === estado.usuario.id ? html`<button class="btn btn-peligro" type="button" data-eliminar style="margin-left:auto">${icono('papelera')}<span>Eliminar</span></button>` : ''}
    </div>`);
  cajon.el.querySelector('[data-eliminar]')?.addEventListener('click', async (e) => {
    const b = e.currentTarget;
    if (!await confirmar({ titulo: 'Eliminar este resultado', texto: `El paciente dejará de ver “${r.titulo}”. Esta acción no se puede deshacer.`, aceptar: 'Eliminar resultado', peligro: true })) return;
    ocupado(b, async () => {
      try { await del(`/api/resultados/${r.id}`); avisar('Resultado eliminado.'); cajon.cerrar('eliminado'); }
      catch (err) { avisar(err.message, 'error'); }
    });
  });
  cajon.el.querySelector('[data-cerrar]')?.focus();
  return cajon;
}

// ── Notificaciones ──────────────────────────────────────────
const ICONO_NOTIF = {
  resultado_nuevo: ['resultados', ''], cita_nueva: ['calendarioCheck', 'azul'], cita_cancelada: ['citas', 'coral'],
  cita_reprogramada: ['repetir', 'ambar'], cita_confirmada: ['checkCirculo', ''], solicitud_clave: ['llave', 'ambar'], bienvenida: ['pulmon', ''],
};
export async function notificaciones(el, ctx) {
  ctx.titulo('Notificaciones');
  el.innerHTML = String(html`${cabecera('Notificaciones', 'Avisos sobre tus citas, resultados y tu cuenta.', raw('<span data-acc></span>'))}<div class="panel panel-sin-pad" data-lista>${esqLista(4)}</div>`);
  const pintar = (n) => {
    const acc = el.querySelector('[data-acc]');
    acc.innerHTML = n.sinLeer ? String(html`<button class="btn btn-secundario" type="button" data-todas>${icono('check')}<span>Marcar todas como leídas</span></button>`) : '';
    acc.querySelector('[data-todas]')?.addEventListener('click', (e) => ocupado(e.currentTarget, async () => {
      await post('/api/notificaciones/leer-todas');
      const m = await refrescarNotificaciones(); pintar(m);
      avisar('Todas las notificaciones quedaron como leídas.');
    }));
    const lista = el.querySelector('[data-lista]');
    if (!n.items.length) {
      lista.innerHTML = String(vacio({ ilus: 'campana', titulo: 'No tienes notificaciones', texto: 'Aquí aparecerán los avisos cuando haya un resultado nuevo o un cambio en tus citas.' }));
      return;
    }
    lista.innerHTML = String(html`<div role="list">${n.items.map((x) => {
      const [ic, color] = ICONO_NOTIF[x.tipo] || ['info', ''];
      const cuerpo = html`<span class="icono-item ${color}" aria-hidden="true">${icono(ic)}</span>
        <div><div class="titulo">${!x.leida ? html`<span class="marca-nueva" aria-label="Sin leer"></span>` : ''}${x.titulo}</div><div class="msg">${x.mensaje}</div></div>
        <span class="tiempo">${hace(x.creado_en)}</span>`;
      return x.enlace
        ? html`<a role="listitem" class="notif ${x.leida ? '' : 'sin-leer'}" href="${x.enlace}" data-link data-id="${x.id}">${cuerpo}</a>`
        : html`<div role="listitem" class="notif ${x.leida ? '' : 'sin-leer'}" data-id="${x.id}">${cuerpo}</div>`;
    })}</div>`);
    lista.querySelectorAll('a.notif.sin-leer').forEach((a) => a.addEventListener('click', () => {
      post(`/api/notificaciones/${a.dataset.id}/leer`).then(refrescarNotificaciones).catch(() => {});
    }));
  };
  const n = await refrescarNotificaciones() || await get('/api/notificaciones');
  if (!ctx.vigente()) return;
  pintar(n);
}

// ── Perfil ──────────────────────────────────────────────────
export async function perfil(el, ctx) {
  ctx.titulo('Mi perfil');
  const u = estado.usuario;
  el.innerHTML = String(html`
    ${cabecera('Mi perfil', 'Mantén tus datos de contacto al día para que la clínica pueda comunicarse contigo.')}
    <div class="rejilla-2">
      <div class="panel">
        <div class="perfil-cab"><span class="avatar avatar-lg" aria-hidden="true">${iniciales(u)}</span>
          <div><h2>${nombreCompleto(u)}</h2><p>${ROL[u.rol]}${u.registro_medico ? `, registro ${u.registro_medico}` : ''}</p></div></div>
        <form novalidate data-form>
          <div class="fila-campos">
            <div class="campo"><label>Documento</label><input class="control" value="${u.tipo_documento}: ${u.documento}" disabled></div>
            <div class="campo"><label>Fecha de nacimiento</label><input class="control" value="${u.fecha_nacimiento ? fecha(u.fecha_nacimiento) : 'No registrada'}" disabled></div>
          </div>
          <p class="ayuda" style="margin:-.5rem 0 1.1rem">Para corregir tu nombre o documento, solicítalo en la recepción de la clínica.</p>
          <div class="fila-campos">
            <div class="campo"><label for="pf-email">Correo electrónico</label><input class="control" type="email" id="pf-email" name="email" value="${u.email}" autocomplete="email" required></div>
            <div class="campo"><label for="pf-tel">Celular</label><input class="control" type="tel" id="pf-tel" name="telefono" value="${u.telefono}" autocomplete="tel"></div>
          </div>
          ${u.rol === 'paciente' ? html`<div class="campo"><label for="pf-eps">EPS o aseguradora <span class="opcional">(opcional)</span></label><input class="control" id="pf-eps" name="eps" value="${u.eps}"></div>` : ''}
          <button class="btn" type="submit"><span>Guardar cambios</span></button>
        </form>
      </div>
      <div class="columna">
        <div class="panel">
          <h2 style="font-size:var(--t-lg)">Contraseña</h2>
          <p class="ayuda" style="margin:.35rem 0 1rem">Al cambiarla, se cierran las sesiones abiertas en otros equipos.</p>
          <a class="btn btn-secundario" href="/cambiar-clave" data-link>${icono('llave')}<span>Cambiar contraseña</span></a>
        </div>
        <div class="panel">
          <h2 style="font-size:var(--t-lg)">Tu cuenta</h2>
          <dl class="datos" style="margin-top:1rem">
            <dt>Creada</dt><dd>${hace(u.creado_en)}</dd>
            <dt>Último ingreso</dt><dd>${u.ultimo_acceso ? hace(u.ultimo_acceso) : 'Ahora'}</dd>
          </dl>
        </div>
      </div>
    </div>`);
  const form = el.querySelector('[data-form]');
  form.onsubmit = (e) => {
    e.preventDefault();
    ocupado(form.querySelector('[type=submit]'), async () => {
      try {
        const r = await patch('/api/perfil', datosForm(form));
        estado.usuario = r.usuario;
        avisar('Cambios guardados.');
      } catch (err) { mostrarErrores(form, err); }
    });
  };
}

// ── Ayuda ───────────────────────────────────────────────────
const GUIAS = {
  paciente: [
    ['citas', 'Agendar una cita', ['Entra a Mis citas y elige Agendar cita.', 'Escoge el examen o la terapia.', 'Elige el profesional.', 'Toca un día resaltado del calendario y luego una hora libre.', 'Revisa el resumen y confirma.']],
    ['repetir', 'Cambiar o cancelar una cita', ['Entra a Mis citas.', 'En la cita, elige Cambiar fecha o Cancelar.', 'Si cambias la fecha, escoge el nuevo horario y confirma.', 'Puedes hacerlo hasta antes de la hora de la cita.']],
    ['resultados', 'Ver y descargar resultados', ['Entra a Mis resultados.', 'Los nuevos aparecen marcados como Nuevo.', 'Toca un resultado para ver el informe y las observaciones.', 'Usa Descargar para guardarlo o enviarlo a otro especialista.']],
  ],
  medico: [
    ['reloj', 'Definir tu horario', ['Entra a Mi horario.', 'Agrega franjas de atención para cada día de la semana.', 'Guarda. Los pacientes verán los horarios libres según la duración de cada servicio.']],
    ['subir', 'Cargar un resultado', ['Entra a Resultados cargados y elige Cargar resultado.', 'Busca al paciente por nombre o documento.', 'Adjunta el PDF o la imagen y escribe tus observaciones.', 'El paciente recibe un aviso de inmediato.']],
    ['calendarioCheck', 'Registrar la atención', ['En Hoy o Agenda, abre la cita cuando haya pasado la hora.', 'Marca Atendida o No asistió y deja notas si lo necesitas.']],
  ],
  admin: [
    ['servicios', 'Publicar un servicio', ['Entra a Servicios y elige Nuevo servicio.', 'Define nombre, duración e indicaciones de preparación.', 'Asigna el servicio a los médicos que lo atienden desde Usuarios.']],
    ['usuarios', 'Registrar personal médico', ['Entra a Usuarios y elige Nueva cuenta.', 'Completa los datos y elige los servicios que atiende.', 'Entrega la contraseña temporal al médico; la cambiará al ingresar.']],
    ['llave', 'Restablecer una contraseña', ['Entra a Solicitudes de acceso.', 'Verifica la identidad de la persona por teléfono.', 'Elige Generar contraseña temporal y entrégala por un medio seguro.']],
  ],
};
const PREGUNTAS = [
  ['¿Qué pasa si llego tarde a mi cita?', 'Comunícate con la recepción de la clínica. Si no puedes asistir, cancela la cita en el portal para que otro paciente pueda usar ese horario.'],
  ['¿Por qué no veo horarios disponibles?', 'Solo se muestran los horarios libres de los próximos 90 días y con al menos una hora de anticipación. Si un profesional no tiene horarios, prueba con otro o con otro mes.'],
  ['¿Mis resultados son privados?', 'Sí. Solo tú y el personal médico de la clínica pueden verlos. La administración no tiene acceso a los informes clínicos.'],
  ['Olvidé mi contraseña, ¿qué hago?', 'En la pantalla de ingreso elige “Olvidé mi contraseña”. La clínica verificará tu identidad y te entregará una contraseña temporal.'],
  ['¿Puedo usar el portal desde el celular?', 'Sí. El portal funciona en cualquier celular, tablet o computador con un navegador actualizado. No necesitas instalar nada.'],
];
export async function ayuda(el, ctx) {
  ctx.titulo('Ayuda');
  const guias = GUIAS[estado.usuario.rol];
  el.innerHTML = String(html`
    ${cabecera('Ayuda', 'Guías cortas para las tareas más comunes del portal.')}
    <div class="guias">${guias.map(([ic, t, pasos]) => html`<div class="panel guia"><h3>${icono(ic)}${t}</h3><ol>${pasos.map((p) => html`<li>${p}</li>`)}</ol></div>`)}</div>
    <div class="panel" style="margin-top:1.25rem">
      <h2 style="font-size:var(--t-lg);margin-bottom:.5rem">Preguntas frecuentes</h2>
      ${PREGUNTAS.map(([p, r]) => html`<details class="pregunta"><summary>${p}${icono('abajo')}</summary><p>${r}</p></details>`)}
    </div>`);
}
