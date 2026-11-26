# Informe de arreglos de UX/UI y accesibilidad · Fusa Conecta

Fecha: 26 de noviembre de 2026 · Rama: `ux-accesibilidad` (30 commits sobre `main` en `23f70f5`) · PWA v100 (`fusa-v93`)

Nada se desplegó ni se escribió en la base de datos real. Todas las pruebas con datos se hicieron en el Firebase
Emulator Suite (`/?emulador`) con cuentas y datos de prueba. La versión anterior se midió desde una copia del commit
`23f70f5` servida en otro puerto, en las mismas condiciones.

## 1. Cómo es la app (resumen de la exploración)

- **Estructura:** PWA sin framework: `index.html` (esqueleto y hojas), `app.js` (unas 7 300 líneas, toda la lógica),
  `app.css` (sistema de diseño «Orquídea»), `datos.js` (directorio base de 546 lugares, rutas y emergencias), `icons.js`
  (íconos Lucide) y `sw.js` (sin conexión). Además: `api/` (FastAPI en Render), `automatizacion/` (agenda automática en
  GitHub Actions), `android/` (TWA) y `firestore.rules` (toda la seguridad; plan Spark, sin Cloud Functions ni Storage).
- **Pantallas:** `navegar({tipo})` apila la vista y `render()` llama a `renderLista`, `renderAgenda`, `renderSOS`,
  `renderPerfil`, `renderMapa`, `renderAdmin`, `renderDashboard`, `renderComunidad` (nueva), etc. Las hojas se abren con
  `abrir(id)` / `abrirHoja()`: `abrirDetalle` (ficha), `abrirEvento`, `abrirFormComercio`, `formEvento`…
- **Datos:** el directorio base sale de `datos.js` y se completa en vivo con Firestore (`comercios` aprobados, `eventos`
  publicados, `cupones`, `banners`, `alertas`…). Sin conexión, `datos.js`, la caché del service worker y `localStorage`.
- **Despliegue:** `firebase.json` publica la raíz en Hosting (con exclusiones) y `firestore.rules`.
- **Pruebas:** Vitest (código real de `app.js` cargado con espree), Playwright contra el emulador, pytest (API y
  automatización), Lighthouse CI, ESLint y Prettier.

## 2. Hallazgos y estado

| Código | Hallazgo | Estado | Commit |
|---|---|---|---|
| E1 | Evento repetido en Agenda e Inicio | Corregido (causa en la agenda automática + defensa en la app) | `ce4251d` |
| E8 | Fecha de eventos en curso | Corregido | `c1b65ea` |
| E2 / U3 | Buscador sin tolerancia ni sinónimos | Corregido, con pruebas unitarias | `5534601` |
| E3 | Asistente sin salida | Corregido | `3dfe511` |
| E4 | Inicio no limpia la búsqueda | Corregido | `edc7e7a` |
| E5 | La X de la ficha se pierde al bajar | Corregido | `1084f6e`, `2ac4ab2` |
| E6 | Barra superior vacía | Corregido | `f6e8f27` |
| E7 | Filtros de la Agenda cortados | Corregido | `05043b7` |
| U4 | Salud a la vista | Corregido (en «Lo que necesitas») | `684f545`, `cc675ca` |
| SOS | Llamar con palabra, copiar, confirmar | Corregido | `0148fe3` |
| U2 / U9 | Fichas sin teléfono ni horario; «Compartir» repetido | Corregido + CSV | `34c1062` |
| Letra grande | Tamaño de letra y CSS en rem | Corregido | `59a2c68` |
| U7 | Letra de menos de 14 px | Corregido | `59a2c68` |
| U6 | Áreas táctiles de menos de 48 px | Corregido + script | `18a8a93`, `13226af` |
| U5 | Estrellas casi invisibles | Corregido | `f0a5855` |
| Palabras | Campana, Guardar, avisos de 5 s con Deshacer | Corregido | `bddd2bc` |
| U10 | Modo oscuro automático por defecto | Corregido («Sistema») | `048c1b9` |
| Lenguaje | Fechas completas y explicaciones cortas | Corregido | `bddd2bc`, `3b3ff2a` |
| Técnica | alt, h1, foco en hojas, pausa del carrusel | Corregido | `3b3ff2a`, `471d638` |
| U1 / U8 | Inicio con 7 secciones y «Ver todos» | Corregido | `cc675ca` |
| Barra | Inicio · Agenda · Mapa · Comunidad · Perfil | Corregido | `cc675ca` |
| CLS | La pantalla salta al cargar | Corregido (0,36 → 0,01) | `e849ec0` |
| Sencillo | Modo sencillo | Hecho (opcional) | `ba6d637` |
| Fase 5 | Reclamar este comercio | Hecho, probado de punta a punta | `49e4f0a`, `ef30ad3` |
| Fase 6 | Fotos en eventos y comercios | Parcial: 64 % de las tarjetas del Inicio con imagen (ver 5.2) | `1b958d3` y el commit de las imágenes de referencia |
| N1 | Enlaces de paradas de rutas turísticas tapaban la pantalla | Corregido | `d20f57f` |
| N2 | Errores de ingreso solo en un aviso que se va | Corregido | `ea765fb` |
| N3 | Error de Leaflet `_leaflet_pos` al cambiar de pestaña | Corregido | `f4f0945` |
| N4 | Etiquetas de la foto tapadas por los botones fijos con letra grande | Corregido | `2ac4ab2` |
| N5 | En modo emulador la app llama a la API de producción (la bloquea CORS) | Pendiente (ver 6) | — |

### Detalles importantes

- **E1:** la causa estaba en `automatizacion/agenda.py`: comparaba los eventos nuevos solo con los que *empezaban* desde
  ayer, así que un evento de varios días ya empezado no se veía y cada corrida lo volvía a crear. Ahora compara con los
  que no han terminado (`fecha_fin`). Hay **3 registros duplicados en producción** (no los borré):
  `HzQEfmT11Me7ivGSaSPP`, `lhWEWkgRjWGtU5EQg6bS` y `ln2Jo2210KI9KJf5RkVQ` («Exposiciones de la Escuela de Artes
  Visuales EFAC»). **Ojo:** cuando el arreglo llegue a `main`, la próxima corrida de la agenda automática los unirá sola
  (su función `unir_guardados` deja uno y borra los otros dos). Si prefieres borrarlos tú, hazlo antes de fusionar.
- **E2:** diccionario `SINONIMOS` en `datos.js` (fácil de ampliar). «doctor» pone primero «Taller de Motos The Doctor»
  porque la regla pedida ordena primero las coincidencias exactas; los lugares de salud vienen después.
- **Barra inferior:** «Comunidad» es más larga que las otras palabras; para que quepa a 14 px en 360 px, ese botón es
  un poco más ancho (el estilo de los cinco es el mismo).
- **U4:** las categorías de comercios quedaron como pide la Fase 4 (Comida, Tiendas, Servicios, Campo, Turismo,
  Hospedaje, Bares y Más). Salud y Trámites están en «Lo que necesitas» y también dentro de «Más».
- **Modo sencillo:** la meta de «3 toques» se cumple con 2 (Salud → «Llamar»), probado con una droguería de prueba.
  En el directorio base **ningún lugar de Salud tiene teléfono** todavía (ver `docs/comercios-incompletos.csv`).
- **Verde en «Sí, llamar»:** el sistema de diseño reserva el verde para estados; lo usé porque el documento lo pide.

## 3. Cómo se probó

| Prueba | Resultado |
|---|---|
| Vitest (unitarias, código real) | 158 pasan (26 nuevas: búsqueda, E1, E8, asistente, fechas, fotos) |
| Playwright E2E contra el emulador | 25 pasan (3 nuevas: modo sencillo, modo sencillo por defecto y reclamo de punta a punta; 5 actualizadas al nuevo Inicio y la nueva barra) |
| API (pytest) | 103 pasan, 6 saltadas (3 de avisos de `reclamo_comercio` y 12 de la decisión de reclamos) |
| API con el emulador (integración) | 6 pasan (1 nueva: aprobar y rechazar un reclamo en Firestore, con 403, 409 y 422) |
| Automatización con emulador | 45 pasan (1 nueva: E1) |
| ESLint y Prettier | Sin errores |
| `scripts/areas-tactiles.mjs` | 0 elementos de menos de 48 px o a menos de 8 px, con letra Normal y Muy grande |
| `scripts/medir-cls.mjs` (Slow 4G, CPU 4×) | 0,008 a 360×800 y 0,007 a 412×915 |
| Contraste y nombres accesibles (script en la página) | 0 fallos en Inicio, Agenda, SOS, Comunidad, Perfil, Empleos y ficha, en claro y oscuro |
| Sin conexión (modo avión) | SOS con sus 11 números, barra «Sin conexión», directorio de 546 lugares |
| Desbordes con «Muy grande» a 360 px | Ninguno en Inicio, Comunidad, Empleos, Transporte, Cupones, Agenda, SOS y Perfil |
| Reglas de Firestore (reclamos) | 7 escrituras indebidas negadas en el emulador; la propia prueba sí se lee. Ni el admin puede escribir el dueño ni la decisión desde el navegador (E2E) |

Cada fase se revisó a 360×800 y 412×915, en claro y oscuro, y la consola quedó sin errores nuevos.

## 4. Lighthouse (móvil, 1 corrida, servidor local sin compresión, con el emulador)

| Página | Rendimiento | Accesibilidad | Buenas prácticas | SEO | PWA | CLS | LCP |
|---|---|---|---|---|---|---|---|
| Inicio, antes | 37 | 100 | 100 | 100 | 100 | 0,312 | 9,5 s |
| Inicio, después | 61 | 100 | 100 | 100 | 100 | 0,01 | 9,1 s |
| Ficha, antes | 39 | 100 | 100 | 98 | 100 | 0,312 | 10,0 s |
| Ficha, después | 56 | 100 | 100 | 100 | 100 | 0,01 | 11,2 s |

La meta de rendimiento 80 **no se alcanzó**. Lo que pesa: `app.js` (≈ 600 KB sin comprimir), `datos.js` (≈ 330 KB) y los
SDK de Firebase; Lighthouse estima 545 KB de JavaScript sin usar en la carga. El servidor local no comprime; Firebase
Hosting sí (gzip/brotli), así que en producción la cifra será algo mejor, pero no llega a 80 sin dividir el código.

**Propuesta para dividir `app.js`** (no la hice: es un cambio grande que conviene en su propia rama):
1. Pasar a módulos ES (`<script type="module">`) y separar en archivos: núcleo (estado, navegación, Inicio, búsqueda,
   ficha, SOS) y módulos que se cargan al entrar a su pantalla con `import()`: panel admin, panel de mi negocio
   y cupones del comerciante, rutas y 3D (MapLibre), grabar ruta, asistente (IA), agenda y formularios.
2. Cargar `datos.js` como JSON y guardarlo en IndexedDB, para no bloquear el primer pintado.
3. Minificar en un paso de compilación (esbuild) y precargar solo el núcleo en el service worker.

## 5. Lo que no se pudo hacer, y por qué

### 5.1 Reclamar este comercio (Fase 5)
- **Sin Cloud Functions (plan Spark): la decisión la toma la API** (Render), no el navegador. El panel llama a
  `POST /v1/reclamos/{id}/decision`; la API revisa en una transacción que quien decide es admin y no es quien reclamó,
  que el reclamo sigue pendiente y que el comercio no tiene otro dueño, y escribe el dueño, el Premium de la campaña y el
  rol. Ningún navegador (ni el del admin) puede escribir `propietario_uid` ni la decisión: se quitaron `comercios` y
  `reclamos_comercio` de la regla general «el admin puede todo», que lo permitía. **Riesgo que queda:** con la cuenta de
  un admin robada se puede llamar a la API; queda registrado `revisado_por`.
- **Requisito:** la API escribe con la cuenta `FIREBASE_SA_FCM` (la de los avisos, ver `api/LEEME.md`). Si no está
  configurada en Render, el panel muestra «La API aún no tiene la cuenta de servicio con permiso de escritura» y el
  reclamo sigue pendiente.
  La primera aprobación del día puede tardar hasta un minuto mientras Render despierta.
- **Sin Storage:** la foto de la prueba se guarda comprimida (≈ 200 KB) en `reclamos_comercio/{id}/prueba/foto`, como
  las fotos de los negocios. Por eso no hay reglas de Storage que actualizar.
- **Código por WhatsApp:** lo envía el admin a mano (el panel muestra el teléfono de la ficha); queda listo para
  automatizarlo desde la API.
- La edición del horario en la prueba E2E se hace como dueña directamente en Firestore (las reglas lo validan); el
  asistente de edición ya lo cubren otras pruebas.

### 5.2 Fotos (Fase 6) — parcial
- **Imágenes de referencia (decidido el 26-nov: «las eliges tú»):** 18 fotos gratuitas de Unsplash (no «Unsplash+»),
  una por subcategoría, revisadas una por una, en `img/categorias/` en WebP de 11 a 77 KB, con autor y enlace en
  `CREDITOS_IMAGENES.md` y en la ficha («Imagen de referencia. No es la foto de este lugar»). Se muestran solo si el
  lugar no tiene foto propia y nunca se guardan en sus datos. Trámites y Turismo no tienen imagen genérica a propósito.
- **Google Places:** `scripts/proponer-fotos.mjs` lo usa solo si existe `GOOGLE_PLACES_KEY`; no hay clave configurada.
- **Wikimedia Commons:** la primera corrida propuso 4 fotos de 40 lugares (`docs/propuestas-fotos.csv`); algunas **no
  corresponden** al lugar (por ejemplo «American Park»), así que hay que revisarlas antes de aplicar nada.
- Con ellas, el **64 %** de las tarjetas del Inicio muestra una imagen (antes, cerca del 10 %). El 80 % pedido exige fotos
  propias o de Wikimedia de los lugares de Turismo y Trámites.

### 5.3 Pruebas a fondo (Fase 7) — lo que quedó sin revisar a fondo
| Área | Resultado |
|---|---|
| Registro e ingreso | Funciona; mejorado (N2). «Con Google» no se puede probar sin una cuenta real de Google. |
| Cupones (obtener, QR, canjear, doble canje, vencido, agotado) | Funciona (E2E y unitarias existentes) |
| Panel de mi negocio | Parcial: menú y empleos (E2E); estadísticas y fotos sin revisar a fondo |
| Panel de administración | Aprobar reclamos, alertas, transporte, empleos y fotos (E2E); Premium y moderar calificaciones sin revisar a fondo |
| Registrar un negocio | El asistente abre y valida; el envío completo lo cubre la prueba de avisos |
| Rutas, 3D, grabar, insignias | No probado: necesita GPS y WebGL de un celular real |
| Empleos, Perdidos, Transporte | Funciona (E2E) |
| Campana, avisos, radio | Campana y reglas (E2E); push real y radio necesitan un celular y la emisora |
| Calificar y reportar | Funciona (calificar, editar, reportar, «¿Lo conoces?») |
| Filtros y «Mejor calificados» | Funciona |
| Sin conexión | Funciona (SOS, directorio, barra «Sin conexión») |
| Modo oscuro | Contraste sin fallos en 7 pantallas |
| Teclado y lector | Foco atrapado y devuelto, Escape, nombres accesibles sin fallos; lector de pantalla real no probado |
| Instalar como PWA | Lighthouse PWA 100; instalación real en celular no probada |
| Rendimiento | Ver sección 4 |

## 6. Decisiones que necesitas tomar

1. **Fusionar y desplegar** la rama (sección 7). Al fusionar, la agenda automática unirá los 3 eventos duplicados.
2. ~~**Fotos genéricas por categoría**~~ **Decidido (26-nov):** las elegí en Unsplash (18, ver `CREDITOS_IMAGENES.md`).
3. **Google Places:** necesita una clave restringida por dominio (en la consola de Google Cloud, nunca en el código).
   Costo: Place Photos tiene 1 000 solicitudes gratis al mes y luego unos USD 7 por cada 1 000; como la foto se pide en
   vivo cada vez que se ve, con 300 vistas de fichas al día serían unas 9 000 al mes ≈ USD 56/mes. La búsqueda de los
   `place_id` (unas 540, una sola vez) entra en el cupo gratis de búsqueda. Verifica las cifras en la lista oficial de
   precios antes de activarlo.
4. ~~**Modo sencillo por defecto**~~ **Decidido (26-nov):** viene activado por defecto con letra Grande; se quita con
   «Ver el Inicio completo» o en Perfil → Apariencia.
5. ~~**Aprobación de reclamos en la API**~~ **Hecho (26-nov):** la decide la API (ver 5.1).
6. **N5:** en modo emulador la app llama a la API de producción (Render) para los avisos; CORS lo bloquea y no pasa nada,
   pero convendría que en modo emulador no la llame.
7. **Completar datos:** teléfonos y horarios de Salud y Trámites (`docs/comercios-incompletos.csv`).
8. **Dividir `app.js`** para llegar a rendimiento 80 (sección 4).

## 7. Pasos para desplegar (los ejecutas o los apruebas tú)

1. Revisar la rama y fusionarla: `git push origin ux-accesibilidad` y abrir el Pull Request hacia `main` (la integración
   continua corre todas las pruebas). Después, `git branch -f develop main` y `git push origin develop`.
2. La API se despliega sola en Render cuando `api/**` llega a `main` (trae el tipo `reclamo_comercio` y la decisión de
   los reclamos). Revisa que `FIREBASE_SA_FCM` esté en Render: sin ella no se pueden aprobar reclamos.
   **Despliega la API antes que las reglas:** con las reglas nuevas, el panel ya no puede aprobar por su cuenta.
3. Reglas e índices: `npx --yes firebase-tools@13.29.1 deploy --only firestore:rules --project fusa-conecta`
   (agregan `reclamos_comercio` y los campos de foto de los eventos). La consulta de reclamos por `estado` y por
   `usuario_uid` usa índices simples, que Firestore crea solo.
4. Hosting: `npx --yes firebase-tools@13.29.1 deploy --only hosting --project fusa-conecta --non-interactive`
   (la versión ya está en v100 y el service worker en `fusa-v93`).
5. Probar en un celular: Inicio, SOS (llamar y copiar), una ficha, «Muy grande», modo sencillo y un reclamo de prueba.

## 8. Capturas

En `docs/informe-ux/capturas/` (360×800, a 2x): `antes-normal-*`, `despues-normal-*` y `despues-muy-grande-*` de Inicio,
SOS, ficha y Agenda, y `despues-sin-conexion.jpg`. La versión anterior no tenía tamaño de letra, así que no hay
«antes, Muy grande».
