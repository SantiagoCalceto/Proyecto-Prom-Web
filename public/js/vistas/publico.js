// Vistas públicas: inicio, ingreso, registro, recuperación, configuración inicial y cambio de contraseña.
import { estado, get, post, ir, iniciarSesion } from '../estado.js';
import {
  html, raw, icono, avisar, ocupado, mostrarErrores, limpiarErrores, datosForm, activarClaves, campoClave, vacio, esqLista,
} from '../ui.js';

const TIPOS_DOC = ['Cédula de ciudadanía', 'Tarjeta de identidad', 'Cédula de extranjería', 'Pasaporte', 'Registro civil', 'Permiso por protección temporal'];
const opcionesDoc = (sel = 'Cédula de ciudadanía') => TIPOS_DOC.map((t) => html`<option ${t === sel ? 'selected' : ''}>${t}</option>`);

const anillos = (oscuro = true) => raw(`<svg viewBox="0 0 400 400" aria-hidden="true">
  <circle class="anillo a3" cx="200" cy="200" r="196" fill="none" stroke="${oscuro ? '#15807a' : '#cfe3df'}" stroke-width="1" opacity=".5"/>
  <circle class="anillo a2" cx="200" cy="200" r="160" fill="${oscuro ? 'rgba(21,128,122,.14)' : '#f1f7f5'}" stroke="${oscuro ? '#2a9d93' : '#cfe3df'}" stroke-width="1.2"/>
  <circle class="anillo a1" cx="200" cy="200" r="118" fill="${oscuro ? 'rgba(142,224,214,.12)' : '#e3efec'}" stroke="#8ee0d6" stroke-width="1.5"/>
</svg>`);

// ── Inicio ──────────────────────────────────────────────────
export async function inicio(el, ctx) {
  ctx.titulo('Portal de pacientes');
  el.innerHTML = String(html`
    <section class="heroe" aria-labelledby="heroe-t">
      <div class="contenedor heroe-int">
        <div>
          <h1 id="heroe-t">Tus exámenes respiratorios y tus citas, en un solo lugar.</h1>
          <p class="bajada">Consulta tus resultados en cuanto tu médico los cargue y agenda, cambia o cancela tus citas en Neumoser sin llamar ni hacer fila.</p>
          <div class="heroe-acciones">
            ${estado.usuario
              ? html`<a class="btn btn-lg" href="/portal" data-link>Ir a mi portal</a>`
              : html`<a class="btn btn-lg" href="/registro" data-link>Crear mi cuenta de paciente</a><a class="btn btn-secundario btn-lg" href="/ingresar" data-link>Ya tengo cuenta</a>`}
          </div>
          <p class="heroe-nota">${icono('escudo')} Tus datos se tratan según la Ley 1581 de 2012 de protección de datos personales.</p>
        </div>
        <div class="respiracion" aria-hidden="true">
          ${anillos(true)}
          <div class="respiracion-texto"><span class="fase" data-fase>Inhala</span><span class="fase-sub">Respira con el círculo</span></div>
        </div>
      </div>
    </section>

    <section class="seccion" id="como-funciona" aria-labelledby="cf-t">
      <div class="contenedor">
        <h2 id="cf-t">Cómo funciona</h2>
        <p class="intro">Tres pasos, desde tu celular o computador. No necesitas instalar nada.</p>
        <ol class="pasos" role="list">
          <li class="paso"><h3>Crea tu cuenta</h3><p>Regístrate con tu documento de identidad. Es la misma información que te piden en la recepción.</p></li>
          <li class="paso"><h3>Agenda tu cita</h3><p>Elige el examen o la terapia, el profesional y un horario libre. Puedes cambiarla o cancelarla después.</p></li>
          <li class="paso"><h3>Recibe tu resultado</h3><p>Cuando tu médico cargue el informe, te avisamos aquí mismo. Lo puedes ver, descargar o compartir con otro especialista.</p></li>
        </ol>
      </div>
    </section>

    <section class="seccion seccion-alt" id="servicios" aria-labelledby="sv-t">
      <div class="contenedor">
        <h2 id="sv-t">Servicios que puedes agendar</h2>
        <p class="intro">Estos son los exámenes y terapias que la clínica tiene habilitados en el portal.</p>
        <div data-servicios>${esqLista(3)}</div>
      </div>
    </section>

    <section class="seccion" id="contacto" aria-labelledby="ct-t">
      <div class="contenedor">
        <h2 id="ct-t">Contacto</h2>
        <div data-contacto></div>
      </div>
    </section>

    <footer class="pie"><div class="contenedor pie-int">
      <div>${raw(String(html`<span class="marca-texto"><span class="marca-nombre">Neumoser</span><span class="marca-sub">Neumología y Servicios de Rehabilitación</span></span>`))}</div>
      <p>© ${new Date().getFullYear()} Neumoser S.A.S. Proyecto académico de Ingeniería de Sistemas, UDES Cúcuta.</p>
    </div></footer>`);

  // Fase de respiración sincronizada con la animación (ciclo de 11 s)
  const fase = el.querySelector('[data-fase]');
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const t0 = performance.now();
    let ultimo = '';
    const tick = () => {
      if (!fase.isConnected) return;
      const t = ((performance.now() - t0) % 11000) / 11000;
      const txt = t < 0.45 ? 'Inhala' : t < 0.55 ? 'Sostén' : 'Exhala';
      if (txt !== ultimo) { fase.textContent = txt; ultimo = txt; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  } else fase.textContent = 'Respira';

  const [servicios, clinica] = await Promise.all([
    get('/api/publico/servicios').catch(() => null),
    get('/api/publico/clinica').catch(() => ({})),
  ]);
  const cont = el.querySelector('[data-servicios]');
  if (!servicios) cont.innerHTML = String(vacio({ ilus: 'buscar', titulo: 'No pudimos cargar los servicios', texto: 'Recarga la página en un momento.', compacto: true }));
  else if (!servicios.length) cont.innerHTML = String(vacio({ ilus: 'servicios', titulo: 'Aún no hay servicios publicados', texto: 'La clínica está configurando los exámenes y terapias que se podrán agendar en línea.', compacto: true }));
  else cont.innerHTML = String(html`<div class="servicios-lista">${servicios.map((s) => html`
    <article class="servicio-fila">
      <h3>${s.nombre}</h3>
      ${s.descripcion ? html`<p>${s.descripcion}</p>` : ''}
      <div class="servicio-meta">
        <span>${icono('reloj')} ${s.duracion_min} minutos</span>
        <span>${icono('estetoscopio')} ${s.medicos ? `${s.medicos} ${s.medicos === 1 ? 'profesional' : 'profesionales'}` : 'Agenda próximamente'}</span>
      </div>
    </article>`)}</div>`);

  const c = el.querySelector('[data-contacto]');
  const tiene = clinica.direccion || clinica.telefono || clinica.horario || clinica.correo;
  c.innerHTML = String(tiene ? html`<div class="contacto-rejilla">
      ${clinica.direccion ? html`<div><h3>Dónde estamos</h3><address>${clinica.direccion}</address></div>` : ''}
      ${clinica.horario ? html`<div><h3>Horario de atención</h3><p style="white-space:pre-line">${clinica.horario}</p></div>` : ''}
      ${clinica.telefono || clinica.correo ? html`<div><h3>Escríbenos o llámanos</h3><p>${clinica.telefono ? html`<a href="tel:${clinica.telefono.replace(/\s/g, '')}">${clinica.telefono}</a><br>` : ''}${clinica.correo ? html`<a href="mailto:${clinica.correo}">${clinica.correo}</a>` : ''}</p></div>` : ''}
    </div>`
    : html`<p class="intro">Para soporte con el portal, comunícate con la recepción de la clínica.</p>`);

  if (ctx.hash) document.getElementById(ctx.hash.slice(1))?.scrollIntoView();
}

// ── Marco de autenticación ──────────────────────────────────
const ladoAuth = (titulo, texto, puntos) => html`
  <aside class="auth-lado">
    <div><h2>${titulo}</h2><p>${texto}</p></div>
    <ul>${puntos.map((p) => html`<li>${icono('checkCirculo')}<span>${p}</span></li>`)}</ul>
    <div class="respiracion" aria-hidden="true">${anillos(true)}</div>
  </aside>`;

// ── Ingresar ────────────────────────────────────────────────
export async function ingresar(el, ctx) {
  ctx.titulo('Ingresar');
  const volver = ctx.query.get('volver');
  el.innerHTML = String(html`<div class="auth">
    ${ladoAuth('Bienvenido de nuevo', 'Ingresa para ver tus resultados, tus próximas citas y los avisos de la clínica.', [
      'Pacientes, personal médico y administración usan este mismo acceso.',
      'Si la clínica te creó la cuenta, usa la contraseña temporal que te entregaron.',
    ])}
    <div class="auth-form"><div class="auth-caja">
      <h1>Ingresar al portal</h1>
      <p class="sub">Usa tu correo o tu número de documento.</p>
      ${ctx.query.get('motivo') === 'clave' ? html`<div class="aviso aviso-exito" role="status">${icono('checkCirculo')}<p>Contraseña actualizada. Ingresa con la nueva.</p></div>` : ''}
      <form novalidate data-form>
        <div class="campo">
          <label for="lg-usuario">Correo o número de documento</label>
          <input class="control" id="lg-usuario" name="usuario" autocomplete="username" required autofocus inputmode="email">
        </div>
        ${campoClave({ id: 'lg-clave' })}
        <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;margin-bottom:1.25rem;flex-wrap:wrap">
          <label class="casilla"><input type="checkbox" name="recordar"> Mantener la sesión en este equipo</label>
          <a href="/recuperar" data-link style="font-size:var(--t-sm)">Olvidé mi contraseña</a>
        </div>
        <button class="btn btn-lg btn-bloque" type="submit"><span>Ingresar</span></button>
      </form>
      <p class="auth-pie">¿Eres paciente y no tienes cuenta? <a href="/registro" data-link>Crea tu cuenta</a></p>
    </div></div></div>`);
  const form = el.querySelector('[data-form]');
  activarClaves(form);
  form.onsubmit = (e) => {
    e.preventDefault();
    const d = datosForm(form);
    const errores = {};
    if (!d.usuario.trim()) errores.usuario = 'Escribe tu correo o tu número de documento.';
    if (!d.password) errores.password = 'Escribe tu contraseña.';
    if (Object.keys(errores).length) return mostrarErrores(form, { campos: errores });
    ocupado(form.querySelector('[type=submit]'), async () => {
      try {
        const r = await post('/api/auth/login', { usuario: d.usuario, password: d.password, recordar: !!d.recordar });
        iniciarSesion(r.usuario);
        avisar(`Hola, ${r.usuario.nombre}.`);
        ir(r.usuario.debe_cambiar_clave ? '/cambiar-clave' : (volver?.startsWith('/portal') ? volver : '/portal'), { reemplazar: true });
      } catch (err) { mostrarErrores(form, err); }
    });
  };
}

// ── Registro de pacientes ───────────────────────────────────
export async function registro(el, ctx) {
  ctx.titulo('Crear cuenta');
  el.innerHTML = String(html`<div class="auth">
    ${ladoAuth('Tu cuenta de paciente', 'Con tu cuenta puedes agendar citas y recibir tus resultados sin desplazarte a la clínica.', [
      'Tus resultados quedan guardados y ordenados por fecha.',
      'Recibes un aviso cuando hay un resultado nuevo o un cambio en tus citas.',
      'Puedes descargar cada informe para llevarlo a otro especialista.',
    ])}
    <div class="auth-form"><div class="auth-caja ancha">
      <h1>Crear cuenta de paciente</h1>
      <p class="sub">Escribe tus datos tal como aparecen en tu documento de identidad.</p>
      <form novalidate data-form>
        <p class="grupo-titulo">Datos personales</p>
        <div class="fila-campos">
          <div class="campo"><label for="rg-nombre">Nombres</label><input class="control" id="rg-nombre" name="nombre" autocomplete="given-name" required autofocus></div>
          <div class="campo"><label for="rg-apellido">Apellidos</label><input class="control" id="rg-apellido" name="apellido" autocomplete="family-name" required></div>
        </div>
        <div class="fila-campos">
          <div class="campo"><label for="rg-tipo">Tipo de documento</label><select class="control" id="rg-tipo" name="tipo_documento">${opcionesDoc()}</select></div>
          <div class="campo"><label for="rg-doc">Número de documento</label><input class="control" id="rg-doc" name="documento" inputmode="numeric" autocomplete="off" required placeholder="Sin puntos ni espacios"></div>
        </div>
        <div class="fila-campos">
          <div class="campo"><label for="rg-nac">Fecha de nacimiento</label><input class="control" type="date" id="rg-nac" name="fecha_nacimiento" autocomplete="bday" required max="${estado.servidor?.hoy || ''}"></div>
          <div class="campo"><label for="rg-eps">EPS o aseguradora <span class="opcional">(opcional)</span></label><input class="control" id="rg-eps" name="eps" autocomplete="off"></div>
        </div>
        <hr class="separador-form">
        <p class="grupo-titulo">Contacto y acceso</p>
        <div class="fila-campos">
          <div class="campo"><label for="rg-tel">Celular</label><input class="control" type="tel" id="rg-tel" name="telefono" autocomplete="tel" inputmode="tel" required placeholder="3001234567"></div>
          <div class="campo"><label for="rg-email">Correo electrónico</label><input class="control" type="email" id="rg-email" name="email" autocomplete="email" required></div>
        </div>
        ${campoClave({ id: 'rg-clave', etiqueta: 'Crea una contraseña', autocompletar: 'new-password', medidor: true })}
        <div class="campo">
          <label class="casilla"><input type="checkbox" name="acepta_datos" required>
            <span>Autorizo a Neumoser a tratar mis datos personales y de salud para la prestación del servicio, conforme a la Ley 1581 de 2012.</span></label>
        </div>
        <button class="btn btn-lg btn-bloque" type="submit"><span>Crear mi cuenta</span></button>
      </form>
      <p class="auth-pie">¿Ya tienes cuenta? <a href="/ingresar" data-link>Ingresa aquí</a></p>
    </div></div></div>`);
  const form = el.querySelector('[data-form]');
  activarClaves(form);
  form.onsubmit = (e) => {
    e.preventDefault();
    const d = datosForm(form);
    ocupado(form.querySelector('[type=submit]'), async () => {
      try {
        const r = await post('/api/auth/registro', { ...d, acepta_datos: !!d.acepta_datos });
        iniciarSesion(r.usuario);
        avisar('Tu cuenta quedó creada.');
        ir('/portal', { reemplazar: true });
      } catch (err) { mostrarErrores(form, err); }
    });
  };
}

// ── Recuperar acceso ────────────────────────────────────────
export async function recuperar(el, ctx) {
  ctx.titulo('Recuperar acceso');
  el.innerHTML = String(html`<div class="auth">
    ${ladoAuth('Recupera tu acceso', 'Por seguridad, el restablecimiento lo hace la administración de la clínica, que verifica tu identidad antes de entregarte una contraseña temporal.', [
      'Envía tu solicitud con tu correo o documento.',
      'La clínica te contacta al teléfono que registraste.',
      'Al ingresar con la contraseña temporal, eliges una nueva.',
    ])}
    <div class="auth-form"><div class="auth-caja" data-caja>
      <h1>Olvidé mi contraseña</h1>
      <p class="sub">Escribe el correo o el número de documento con el que te registraste.</p>
      <form novalidate data-form>
        <div class="campo"><label for="rc-usuario">Correo o número de documento</label><input class="control" id="rc-usuario" name="usuario" required autofocus></div>
        <button class="btn btn-lg btn-bloque" type="submit"><span>Enviar solicitud</span></button>
      </form>
      <p class="auth-pie"><a href="/ingresar" data-link>Volver a ingresar</a></p>
    </div></div></div>`);
  const form = el.querySelector('[data-form]');
  form.onsubmit = (e) => {
    e.preventDefault();
    ocupado(form.querySelector('[type=submit]'), async () => {
      try {
        await post('/api/auth/recuperar', datosForm(form));
        el.querySelector('[data-caja]').innerHTML = String(html`
          ${vacio({ ilus: 'listo', titulo: 'Solicitud enviada', texto: 'Si los datos corresponden a una cuenta, la administración de la clínica te contactará al teléfono registrado para entregarte una contraseña temporal.', accion: html`<a class="btn" href="/ingresar" data-link>Volver a ingresar</a>` })}`);
      } catch (err) { mostrarErrores(form, err); }
    });
  };
}

// ── Configuración inicial (primera vez) ─────────────────────
export async function configuracion(el, ctx) {
  ctx.titulo('Configurar el portal');
  el.innerHTML = String(html`<div class="auth">
    ${ladoAuth('Configura el portal de la clínica', 'Este paso se hace una sola vez. Crearás la cuenta de administración con la que después registrarás al personal médico y los servicios.', [
      'Luego crea los servicios: espirometría, polisomnografía, terapias…',
      'Registra a cada médico y asígnale sus servicios.',
      'Cada médico define su horario y los pacientes ya pueden agendar.',
    ])}
    <div class="auth-form"><div class="auth-caja ancha">
      <h1>Crear la cuenta de administración</h1>
      <p class="sub">El portal aún no tiene administrador. Esta será la cuenta principal de la clínica.</p>
      <form novalidate data-form>
        <div class="fila-campos">
          <div class="campo"><label for="cf-nombre">Nombres</label><input class="control" id="cf-nombre" name="nombre" autocomplete="given-name" required autofocus></div>
          <div class="campo"><label for="cf-apellido">Apellidos</label><input class="control" id="cf-apellido" name="apellido" autocomplete="family-name" required></div>
        </div>
        <div class="fila-campos">
          <div class="campo"><label for="cf-tipo">Tipo de documento</label><select class="control" id="cf-tipo" name="tipo_documento">${opcionesDoc()}</select></div>
          <div class="campo"><label for="cf-doc">Número de documento</label><input class="control" id="cf-doc" name="documento" inputmode="numeric" required></div>
        </div>
        <div class="campo"><label for="cf-email">Correo electrónico</label><input class="control" type="email" id="cf-email" name="email" autocomplete="email" required></div>
        ${campoClave({ id: 'cf-clave', etiqueta: 'Contraseña', autocompletar: 'new-password', medidor: true })}
        <button class="btn btn-lg btn-bloque" type="submit"><span>Crear cuenta y entrar</span></button>
      </form>
    </div></div></div>`);
  const form = el.querySelector('[data-form]');
  activarClaves(form);
  form.onsubmit = (e) => {
    e.preventDefault();
    ocupado(form.querySelector('[type=submit]'), async () => {
      try {
        const r = await post('/api/configuracion', datosForm(form));
        iniciarSesion(r.usuario);
        avisar('Portal configurado. Ahora crea los servicios de la clínica.');
        ir('/portal', { reemplazar: true });
      } catch (err) { mostrarErrores(form, err); }
    });
  };
}

// ── Cambiar contraseña (obligatorio con clave temporal) ─────
export async function cambiarClave(el, ctx) {
  ctx.titulo('Cambiar contraseña');
  const u = estado.usuario;
  const temporal = u.debe_cambiar_clave;
  el.innerHTML = String(html`<div class="auth">
    ${ladoAuth(temporal ? 'Un último paso' : 'Cambia tu contraseña', 'Tu contraseña es personal. Nadie de la clínica te la pedirá por teléfono ni por correo.', [
      'Usa al menos 8 caracteres combinando letras y números.',
      'Evita fechas de nacimiento o tu número de documento.',
    ])}
    <div class="auth-form"><div class="auth-caja">
      <h1>${temporal ? 'Crea tu contraseña personal' : 'Cambiar contraseña'}</h1>
      <p class="sub">${temporal ? `Hola, ${u.nombre}. Ingresaste con una contraseña temporal; elige una nueva para continuar.` : 'Escribe tu contraseña actual y la nueva.'}</p>
      <form novalidate data-form>
        ${campoClave({ id: 'cc-actual', nombre: 'actual', etiqueta: temporal ? 'Contraseña temporal' : 'Contraseña actual' })}
        ${campoClave({ id: 'cc-nueva', nombre: 'nueva', etiqueta: 'Nueva contraseña', autocompletar: 'new-password', medidor: true })}
        <div class="campo"><label for="cc-rep">Repite la nueva contraseña</label><input class="control" type="password" id="cc-rep" name="repetir" autocomplete="new-password" required></div>
        <button class="btn btn-lg btn-bloque" type="submit"><span>Guardar contraseña</span></button>
      </form>
      ${temporal ? '' : html`<p class="auth-pie"><a href="/portal/perfil" data-link>Volver a mi perfil</a></p>`}
    </div></div></div>`);
  const form = el.querySelector('[data-form]');
  activarClaves(form);
  form.onsubmit = (e) => {
    e.preventDefault();
    const d = datosForm(form);
    limpiarErrores(form);
    if (d.nueva !== d.repetir) return mostrarErrores(form, { campos: { repetir: 'Las contraseñas no coinciden.' } });
    ocupado(form.querySelector('[type=submit]'), async () => {
      try {
        const r = await post('/api/auth/cambiar-clave', { actual: d.actual, nueva: d.nueva });
        iniciarSesion(r.usuario);
        avisar('Contraseña actualizada.');
        ir('/portal', { reemplazar: true });
      } catch (err) { mostrarErrores(form, err); }
    });
  };
}
