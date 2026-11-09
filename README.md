# Neumoser: Portal de Resultados Clínicos y Citas

**Estudiante:** Santiago Carreño Calceto
**Repositorio:** `Proyecto-Prom-Web`
**Universidad:** UDES Cúcuta, Ingeniería de Sistemas

## Descripción

Portal web para **Neumoser (Neumología y Servicios de Rehabilitación, Cúcuta)**. Los pacientes consultan sus resultados clínicos y gestionan sus citas sin desplazarse a la clínica; el personal médico publica su horario, atiende su agenda y carga resultados; y la administración gestiona cuentas, servicios y accesos.

La aplicación es real de punta a punta: tiene servidor, base de datos y cuentas con tres roles. **No hay datos de ejemplo**: todo lo que aparece en el portal lo crean personas desde la interfaz.

| Rol | Qué puede hacer |
|-----|-----------------|
| **Paciente** | Registrarse; agendar, confirmar, reprogramar y cancelar citas; ver y descargar resultados (PDF o imagen); recibir notificaciones; editar su perfil y su contraseña. |
| **Personal médico** | Publicar su horario semanal; ver su agenda; registrar la atención o la inasistencia; buscar pacientes; cargar resultados con archivo y observaciones. |
| **Administrador** | Configurar el portal la primera vez; crear servicios; crear cuentas con contraseña temporal; asignar servicios a médicos; activar y desactivar cuentas; atender solicitudes de restablecimiento de contraseña; ver todas las citas y el registro de actividad. |

## Tecnologías

- **Node.js 22.5+** sin dependencias en producción: servidor `node:http` y base de datos **SQLite** con el módulo nativo `node:sqlite`.
- **Frontend:** HTML, CSS y JavaScript con módulos ES, sin frameworks. Aplicación de una sola página (SPA) con rutas reales del navegador.
- **Seguridad:** contraseñas con `scrypt` y sal aleatoria, sesiones con cookie `HttpOnly`, protección CSRF, CSP y control de acceso por rol y por propietario.
- **Pruebas:** `node:test` para las pruebas unitarias y de integración, **Playwright** para las de punta a punta, cobertura con `--experimental-test-coverage` y **GitHub Actions** para correrlas en cada cambio.

## Estructura

```
Proyecto-Prom-Web/
├── README.md
├── package.json
├── server.js                      arranca el servidor
├── capturas/                      evidencia de la aplicación y de las pruebas
├── .github/workflows/pruebas.yml  integración continua
├── src/
│   ├── app.js       crea el servidor HTTP (archivos estáticos + API)
│   ├── api.js       rutas REST y reglas de negocio
│   ├── db.js        esquema SQLite y transacciones
│   ├── auth.js      scrypt, tokens de sesión y límite de intentos
│   ├── http.js      enrutador, cookies y cabeceras de seguridad
│   └── time.js      fechas y horas en hora de Colombia
├── public/
│   ├── index.html
│   ├── css/app.css
│   └── js/          app.js (rutas), ui.js (componentes), vistas/ por rol
└── tests/
    ├── unit/        pruebas unitarias
    ├── integracion/ pruebas de la API con servidor real
    └── e2e/         pruebas de punta a punta con Playwright
```

## Cómo ejecutarlo

Requisito: [Node.js](https://nodejs.org) 22.5 o superior (versión LTS).

```bash
npm start
```

Abre <http://localhost:3000>. La primera vez el portal pide crear la cuenta de administración. Los datos se guardan en `data/neumoser.db`; para empezar de cero, detén el servidor y borra la carpeta `data/`.

---

## La aplicación

### Página de inicio

Los servicios y los datos de contacto que se muestran salen de la base de datos; los configura la administración.

![Página de inicio](capturas/inicio-publico.png)

### Configuración inicial y administración

La primera vez no existe ninguna cuenta, así que el portal pide crear la de administración. Los formularios validan cada campo en el servidor y muestran el error junto al campo.

![Configuración inicial con validaciones](capturas/configuracion-inicial.png)

El resumen del administrador indica qué falta configurar. Los servicios definen la duración de cada cita y las indicaciones de preparación.

![Resumen del administrador](capturas/admin-resumen.png)
![Servicios](capturas/admin-servicios.png)

Las cuentas del personal médico las crea el administrador. El portal genera una **contraseña temporal** que la persona debe cambiar en su primer ingreso.

![Contraseña temporal](capturas/admin-clave-temporal.png)
![Usuarios](capturas/admin-usuarios.png)

Quien olvida su contraseña envía una solicitud; la administración verifica su identidad y genera una contraseña temporal.

![Solicitudes de acceso](capturas/admin-solicitudes.png)

### Personal médico

El médico publica su horario semanal. Los horarios libres que ven los pacientes se calculan con ese horario y la duración de cada servicio.

![Horario del médico](capturas/medico-horario.png)
![Agenda](capturas/medico-agenda.png)
![Detalle de una cita](capturas/medico-detalle-cita.png)

Al cargar un resultado, el paciente recibe una notificación de inmediato.

![Cargar resultado](capturas/medico-cargar-resultado.png)

### Paciente

Las pantallas vacías explican qué hacer a continuación.

![Inicio del paciente sin citas](capturas/paciente-inicio-vacio.png)

Para agendar se elige el servicio, el profesional, el día y la hora. El calendario solo habilita los días con cupos, y las horas ocupadas no se pueden elegir.

![Agendar cita](capturas/paciente-agendar.png)
![Próxima cita con indicaciones de preparación](capturas/paciente-proxima-cita.png)
![Detalle y descarga de un resultado](capturas/paciente-resultado.png)
![Historial de citas](capturas/paciente-historial.png)
![Notificaciones](capturas/paciente-notificaciones.png)

### Celular

El diseño se adapta a pantallas pequeñas; el menú se abre como un panel lateral.

<p>
  <img src="capturas/movil-inicio.png" alt="Inicio en celular" width="280">
  <img src="capturas/movil-menu.png" alt="Menú en celular" width="280">
</p>

---

## Pruebas

| Nivel | Carpeta | Qué prueba | Cantidad |
|-------|---------|------------|----------|
| **Unitarias** | `tests/unit/` | Funciones aisladas: cifrado y verificación de contraseñas, contraseñas temporales, límite de intentos, fechas y horas en hora de Colombia, validadores, enrutador y cookies. | 44 |
| **Integración** | `tests/integracion/` | La API completa con un servidor real y una base de datos temporal: configuración inicial, registro, inicio de sesión, horarios, agendamiento sin choques de horario, reprogramación, cancelación, resultados, permisos por rol, CSRF y recuperación de contraseña. | 42 |
| **Punta a punta (E2E)** | `tests/e2e/` | Un navegador Chromium real controlado por Playwright recorre el portal como el administrador, el médico y el paciente, incluida la versión para celular. | 9 |

### Pruebas unitarias

```bash
npm run test:unit
```

![Pruebas unitarias](capturas/pruebas-unitarias.png)

### Pruebas de integración

Cada prueba habla con la API por HTTP, como lo haría el navegador. Verifican, entre otras cosas, que dos pacientes no puedan tomar el mismo horario, que un paciente no pueda ver las citas ni los resultados de otro, que la administración no tenga acceso a los informes clínicos y que se rechacen las peticiones sin la cabecera anti-CSRF.

```bash
npm run test:integracion
```

![Pruebas de integración](capturas/pruebas-integracion.png)

`npm test` ejecuta las dos anteriores juntas:

![Resumen de npm test](capturas/resumen-npm-test.png)

### Pruebas de punta a punta (E2E)

La prueba arranca su propio servidor en un puerto libre con una base de datos vacía y temporal, así que no toca los datos reales. Las capturas de la sección **La aplicación** las tomó esta misma prueba.

```bash
npm install
npm run playwright:instalar   # solo la primera vez
npm run test:e2e
```

![Pruebas E2E con Playwright](capturas/pruebas-e2e.png)

### Cobertura

```bash
npm run test:cobertura
```

![Cobertura de código](capturas/cobertura.png)

### Integración continua en GitHub Actions

`.github/workflows/pruebas.yml` ejecuta las pruebas unitarias, de integración, de cobertura y E2E en cada `push` a `main`. Los resultados quedan en la pestaña **Actions** del repositorio, y las capturas de la prueba E2E se pueden descargar como artefacto (`capturas-e2e`).

Las siguientes capturas se tomaron directamente en GitHub. La ejecución terminó en **Success** y todos los pasos pasaron:

<p>
  <img src="capturas/github-actions-resumen.jpg" alt="Ejecución de GitHub Actions: Success" width="420">
  <img src="capturas/github-actions-pasos.jpg" alt="Pasos del flujo en verde" width="420">
</p>

Salida de `npm test` en GitHub (**86 pruebas, 0 fallos**) y de las pruebas E2E con Playwright (**9 pruebas, 0 fallos**):

<p>
  <img src="capturas/github-actions-unitarias-integracion.jpg" alt="npm test en GitHub Actions: 86 pruebas pasan" width="420">
  <img src="capturas/github-actions-e2e.jpg" alt="Pruebas E2E en GitHub Actions: 9 pruebas pasan" width="420">
</p>

---

## Autoría

<img src="capturas/github-contributors.jpg" alt="Contributors: SantiagoCalceto" width="420">

## Seguridad

- **Contraseñas:** se cifran con **scrypt** y sal aleatoria; nunca se guardan en texto plano.
- **Sesiones:** cookie `HttpOnly` y `SameSite=Lax`; en la base solo se guarda el hash del token.
- **CSRF:** toda petición que modifica datos debe incluir la cabecera `X-Neumoser`.
- **Permisos:** cada consulta verifica el rol y el propietario del recurso.
- **Inicio de sesión:** se bloquea tras 8 intentos fallidos en 15 minutos.
- **Archivos:** solo se aceptan PDF, JPG o PNG de hasta 10 MB, y se verifica la firma del PDF.
- **Cabeceras:** `Content-Security-Policy`, `X-Content-Type-Options` y `X-Frame-Options`.
- **Auditoría:** las acciones importantes quedan registradas.

## Accesibilidad

- **Tipografía:** Atkinson Hyperlegible, diseñada para personas con baja visión, con texto base de 17 px.
- **Teclado:** se puede usar todo el portal con el teclado. Tiene foco visible, enlace para saltar al contenido y modales que retienen el foco y se cierran con Esc.
- **Errores y avisos:** los errores aparecen junto a cada campo y los avisos se anuncian a los lectores de pantalla.
- **Movimiento reducido:** se respeta la preferencia del sistema.
