# Registro de cambios

Todos los cambios importantes de Fusa Conecta. Formato de [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y
versiones con [Versionado Semántico](https://semver.org/lang/es/) (`vMAYOR.MENOR.PARCHE`). Cada versión tiene su etiqueta en Git.

La versión que ve la gente en la app (`?v=` en `index.html`, por ejemplo v63) es el número de publicación de la PWA; la de
este archivo es la del proyecto completo (PWA, app Android, API y procesos).

## [Sin publicar]

## [1.3.0] - 2026-10-30 · Pasca vuelve a estar en Fusa Conecta

### Agregado
- **Selector de municipio en el Inicio (parte 1).** Debajo del buscador hay tres pastillas: «Fusa y Pasca» (por defecto),
  «Fusagasugá» y «Pasca». La elección queda guardada en el teléfono (`fc_municipio`). Es el mismo filtro de municipio
  de la hoja de Filtros (`estado.filtros.municipio`), no uno nuevo. Filtra:
  - los carruseles del Inicio, los mosaicos, «Cupones de la semana» y la lista;
  - el mapa: se centra en el municipio elegido y tiene el botón «Ir a Pasca» (4.30783, -74.30018, según OpenStreetMap);
  - la agenda y el banner del fin de semana;
  - el asistente, que usa el municipio elegido si la persona no pide otro.
  La Agenda y el Mapa también muestran el selector.
- **Sección «Pasca, puerta del Sumapaz»** en el Inicio, con los lugares de Pasca. Mientras haya menos de 6, termina
  con la tarjeta «¿Tienes un negocio en Pasca? Publícalo gratis», que abre «Registrar mi negocio» con Pasca ya elegido.
- **Contenido verificado de Pasca (parte 2).** Seis lugares nuevos en `datos.js` (`c72` a `c77`), cada uno con su
  fuente en `fuentes` y la fecha de revisión en `verificado`:
  - la Alcaldía, la Casa de la Cultura y el CDI, con dirección y horario de la página de turismo de la Alcaldía de Pasca;
  - la Parroquia de Nuestra Señora de la Encarnación y el Museo Arqueológico, con OpenStreetMap y Wikipedia;
  - el Páramo de Sumapaz, como ficha informativa con el aviso oficial de Parques Nacionales Naturales del 13 de marzo de
    2026: el parque **no está habilitado para el ecoturismo**.

  Las coordenadas son de OpenStreetMap; las que no están allí quedan en el centro del casco urbano, marcadas como
  aproximadas. No hay teléfonos inventados: sin teléfono no se muestran «Llamar» ni «WhatsApp». Detalle y diferencias
  con lo pedido en `docs/pasca-fuentes.md`.
- La ficha muestra el correo, el sitio web, las fuentes con la fecha de verificación y el aviso oficial. También
  muestra «Consulta horarios en la Casa de la Cultura» cuando no hay horario confirmado. A los lugares verificados no
  se les ofrece «¿Es tu negocio? Reclámalo».
- **Horarios con varios grupos de días** separados por «;», por ejemplo «Lun-Vie 8:00-13:00 y 14:00-17:00; Sáb
  8:00-12:00». Se usa en la app (`estadoApertura`) y en la API (`estado_apertura`). Antes se ignoraba el sábado.
- **Rutas:** las tres oficiales tienen `municipio` («Fusagasugá»). `GET /v1/rutas` lo devuelve y lo filtra con
  `?municipio=`. Con «Pasca» elegido, la app dice «Aún no hay senderos de Pasca con trazado real. ¿Conoces uno? Grábalo
  con «Grabar mi recorrido» y propónlo», con el botón.
- La API devuelve en la ficha (`/v1/comercios/{id}`) los campos `correo`, `fuentes` y `aviso`.
- La invitación «¿Tienes un negocio en Pasca?» cuenta solo los negocios con dueño, no los lugares oficiales.
- **Verificación del directorio base (parte 4).** `docs/datos-base-verificacion.md` lista los 71 lugares de
  Fusagasugá con «verificado: sí / no / no sé», la fuente y una nota. No se borró ni cambió nada:
  - 13 «sí», confirmados con OpenStreetMap, un sitio oficial o el registro de su dueño;
  - 40 «no», que parecen datos de ejemplo del prototipo: teléfonos con el patrón 310-111-00NN, 310-222-00NN,
    310-444-00NN o 310-555-00NN, sin rastro en OpenStreetMap;
  - 18 «no sé», que pueden existir pero no tienen una fuente que se pueda enlazar: las notarías, la Cruz Roja, la Casa
    de la Mujer, algunos miradores y senderos, y las licoreras agregadas desde Google Maps sin enlace.

  También quedan señalados los teléfonos de ejemplo de lugares que sí existen, como el Cerro Fusacatán o la Iglesia de
  Belén.
- **Agenda de Pasca (parte 3).** El panel admin muestra, en cada fuente de la agenda automática, la fecha de su
  última noticia y de su último evento publicado (`ultima_noticia` y `ultimo_evento` en `agenda.py`). Si los dos
  tienen más de 60 días, marca el sitio como desactualizado: el proceso funciona, pero la fuente no publica nada
  nuevo. Diagnóstico de Pasca, fuentes revisadas e invitación en `docs/pasca-agenda.md`:
  - el sitio de la Alcaldía no publica noticias desde febrero, pero sí publicó 5 festivales del 23 al 25 de octubre;
  - la Gobernación no tiene API ni calendario;
  - Facebook no se lee de forma automatizada.
- **Enlace de invitación de organizador:** `/?organizador=correo` abre «Crea tu cuenta» con ese correo ya escrito. El
  mensaje que copia el admin trae el enlace y explica cómo publicar con IA desde un afiche. Enlace preparado para la
  Casa de la Cultura de Pasca.
- Los eventos de Pasca dicen «· Pasca» junto al lugar en el carrusel, la Agenda y Novedades.
- **Registrar mi negocio:** el municipio (Fusagasugá o Pasca) es obligatorio. El mapa del formulario se centra en el
  municipio elegido. Antes, todo negocio se guardaba como de Fusagasugá, incluso al editarlo.

### Cambiado
- Textos que nombraban solo a Fusa:
  - «Qué hacer en Fusa» ahora dice «Qué hacer en Fusa y Pasca», o el municipio elegido;
  - el pie de página dice «El directorio digital de Fusagasugá y Pasca, en la región del Sumapaz»;
  - el `<title>` y el manifiesto dicen «Fusa Conecta — Fusagasugá y Pasca», y los atajos, «Mapa de Fusa y Pasca» y
    «Agenda: qué hacer en Fusa y Pasca»;
  - también cambiaron el saludo, los cupones vacíos, las Novedades, el texto para compartir un lugar y una regla nueva
    del asistente.

  La marca «Fusa Conecta» y el lema del logo no cambiaron. La meta descripción, el manifiesto y el aviso legal ya
  nombraban a Pasca.
- La línea de filtros activos ya no muestra el municipio, porque se ve siempre en el selector. «Mis favoritos» muestra
  todos los guardados, sin importar el municipio.
- PWA v68 (`fusa-v61`). Parte 2: PWA v69 (`fusa-v62`). Parte 3: PWA v70 (`fusa-v63`).

### Pruebas
- Vitest: `municipioDe`, `enMunicipio`, las opciones del selector y `municipioGuardado`.
- Playwright: con «Pasca» elegido se ven solo lugares de Pasca, «Todo Pasca» y la invitación a publicar. La elección
  sobrevive a la recarga. El mapa se centra en Pasca. Con «Fusa y Pasca» se ven los dos municipios. La semilla del
  emulador trae un negocio de prueba en Pasca.
- pytest: un negocio de Pasca aprobado sale en `/v1/comercios?municipio=Pasca` con su municipio, y no sale en
  Fusagasugá.
- pytest y Vitest: el horario de la Alcaldía de Pasca (abierto el sábado a las 10:00, cerrado a las 13:00).
  `/v1/rutas?municipio=`. Los 6 lugares de Pasca con su fuente y sin teléfono, y el aviso del páramo.
- Playwright: con «Pasca» se ven la Alcaldía, el mensaje de senderos y las fichas del páramo (aviso oficial, sin
  «Llamar» ni «Cómo llegar») y de la Alcaldía (correo y fuente).
- pytest: `ultima_publicacion` por tipo, con el caso real de Pasca: última noticia en febrero, último evento en
  octubre.
- Vitest: `lugarEv` («· Pasca») y `textoUltima` (más de 60 días = desactualizado).
- Playwright: el enlace de invitación abre el registro con el correo escrito, y el mensaje del admin lo incluye.

## [1.2.0] - 2026-10-29 · Entrada más corta, barra con Inicio al centro y avisos al celular

### Cambiado
- **Entrada más corta (parte 1).** Con sesión, la pantalla de entrada se va con lo primero que pase: la app está lista (mínimo 1,6 s) o se cumplen 3 s (`SPLASH.max`). Ya no espera a la nube: si el teléfono tiene una copia del directorio (`datos.js` y la persistencia de Firestore de una visita anterior, marcada con `fc_nube_ok`) o el perfil guardado (`fc_perfil_<uid>`), entra con eso y `onSnapshot` actualiza la vista cuando llegan los datos.
- El rol admin solo se habilita con el perfil real de Firestore (`estado.perfilReal`), nunca con la copia del teléfono.
- Invitado: la animación de entrada va un 25 % más rápida y los botones «Registrarse» y «Solo explorar» se ven completos a los 2,05 s de aparecer la pantalla (antes, 3,3 s). El aviso «Cargando… revisa tu conexión» de los 8 s queda solo para cuando el teléfono no tiene ninguna copia.
- PWA v64 (`fusa-v57`).
- **Barra inferior con Inicio al centro (parte 2).** Nuevo orden: Mapa · Cupones · **Inicio** (botón central grande, ícono `house`, con un anillo cuando está activo) · Agenda · Perfil. Cupones es un botón normal con su globo de cantidad. **Agenda** (`calendar-days`) abre «Qué hacer en Fusa», la misma vista de «Ver agenda», que sigue en el inicio. Atajo nuevo del ícono de la app: `?ir=agenda`.
- **Mis favoritos** sale de la barra y pasa a Perfil como primera opción, con su contador. Se abre como pantalla de segundo nivel (con «Volver») y marca la pestaña Perfil. Para un invitado abre la hoja de ingreso. El corazón de cada ficha sigue igual.
- Revisada a 360 px de ancho, en modo noche y con el texto agrandado un 30 %: los cinco botones miden 70 × 60 px.
- PWA v65 (`fusa-v58`).
- **Avisos al celular (parte 3).** Notificaciones push reales con Firebase Cloud Messaging, sin Cloud Functions (plan Spark): al aprobar o rechazar un negocio, evento, ruta, Premium o reclamo, el panel admin guarda la decisión y llama a la API, que avisa a la persona. El admin ve «Aprobado. Le avisamos a {nombre} en su celular» o «… Verá el aviso en la campana de Novedades». Si la API está dormida, reintenta en segundo plano hasta 60 s sin bloquearlo.
- El permiso **nunca** se pide al abrir la app: solo al terminar «Registrar mi negocio» («¿Quieres que te avisemos aquí cuando tu negocio sea aprobado?») o con el interruptor «Avisos en este celular» de Perfil. Si está bloqueado, se explica cómo activarlo. En iPhone se avisa que hace falta la app instalada (iOS 16.4 o superior).
- La campana muestra «Para ti» con las aprobaciones y rechazos (`usuarios/{uid}/notificaciones`), aunque la persona no haya dado permiso. Al tocar un aviso se abre la pantalla correcta (`#/mi-negocio`, `#/evento/…`, `#/recorridos`).
- `sw.js` recibe el push y muestra el aviso con el ícono de la marca. PWA v66 (`fusa-v59`).
- **Cupones (parte 4).** Cuando no hay cupones activos, la pantalla ya no dice que se publican cada semana. Ahora dice «Pronto habrá cupones de los negocios de Fusa. ¿Tienes un negocio? Publica el tuyo», con un botón a «Registrar mi negocio».
- **Mi negocio:** si la ficha no tiene foto o WhatsApp, avisa «Tu ficha está incompleta: agrega una foto y tu WhatsApp para recibir más clientes», con el botón «Completar mi ficha». El aviso también sale en «Mis negocios» de Perfil.
- **Limpieza diaria:** además de los negocios sin foto, cuenta y lista los que no tienen WhatsApp (`sin_whatsapp`). El panel admin los muestra.
- **App Android 1.1.0** (`apk-v1.1.0`, `versionCode` 2). Los avisos salen como «Fusa Conecta» (`enableNotifications: true`), con el isotipo en blanco. En Android 13 o superior la app pide `POST_NOTIFICATIONS`. Atajo nuevo: Agenda.
- PWA v67 (`fusa-v60`).

### Corregido
- **Agenda: eventos duplicados con otro título u hora.** Caso real: «Celebración del Día Dulce» (31/10, 9:00, «Estadio Fernando Mazuera») y «Día Dulce» (31/10, 14:00, «Estadio municipal Fernando Mazuera»). Regla nueva en `agenda.py` (`parecidos`): mismo día; lugar con al menos 60 % de palabras en común, sin contar «municipal», «estadio», etc.; y un título dentro del otro o con similitud ≥ 0,6. Los parecidos se unen en uno con el horario más amplio (9:00 a 16:00) y las dos fuentes (`fuentes`). La ficha del evento muestra «Otra publicación».
- La agenda repara también los duplicados ya guardados (`unir_guardados`). Nunca borra un evento que publicó una persona. El panel muestra cuántos se unieron.
- Escáner de cupones: si el navegador tardaba en negar la cámara, el aviso «Necesitamos permiso para usar la cámara» aparecía tarde y tapaba el resultado del código escrito a mano.

### Agregado
- Releases de la app Android en GitHub: `apk-v1.0.0` (la que cita el documento técnico) y `apk-v1.1.0`.
- API: `POST /v1/notificaciones/aprobacion` (el endpoint 10). Usa una cuenta de servicio aparte, `FIREBASE_SA_FCM` («Firebase Cloud Messaging API Admin»), solo en Render. Pasos en `api/LEEME.md`. Es idempotente y borra los tokens inválidos. CORS admite POST.
- Reglas: `usuarios/{uid}/dispositivos/{token}`: solo la persona los crea y borra, nadie los lee desde la app. `usuarios/{uid}/notificaciones`: solo la API escribe; la persona lee y marca como leídas.
- `docs/tecnologias-emergentes.md`: lo que ya funciona (IA generativa con llamadas a funciones, IA desde afiches, agenda automática, mapas 3D con relieve real, grabación GPS, PWA offline-first, TWA y analítica Umami) con su evidencia en `docs/evidencias/tecnologias/`.
- `docs/entrega-sena/`: material para el documento técnico (capítulos 3 a 11). Incluye arquitectura en Mermaid (7 diagramas, también en PNG), los 9 endpoints con respuestas reales de producción, la estructura del repositorio, comandos y resultados de pruebas con capturas, y una guía de qué cambiar en cada capítulo.

### Pruebas
- Vitest: `appLista` y la regla del máximo (`salidaSplash`), 5 casos.
- Playwright: entrada con sesión (≤ 3,5 s; medido 1,6 s), con la nube lenta (se va a los 3 s sin esperarla) e invitado (botones visibles ≤ 2,6 s desde la primera pintura; medido 2,0 s).
- Playwright: la barra inferior (los cinco botones, cada uno con su pantalla y `aria-current`, área táctil ≥ 44 px) y Perfil → «Mis favoritos». La prueba del cupón ahora entra a la billetera por el botón Cupones de la barra y revisa su globo.
- pytest: el endpoint de avisos (401, 403, 404, 409, 422 y 503; aprobado y rechazado; tokens inválidos borrados; sin repetir; sin push para quien no dio permiso), `AvisadorFCM` con `messaging` simulado y el repositorio, que solo escribe en novedades y dispositivos. Integración contra el emulador. Cobertura de la API: 84 %.
- Vitest: `estadoAvisos`, `refrescarDispositivo` (nunca pide el permiso al abrir) y `textoAviso`.
- Playwright: reglas de dispositivos, «Para ti» en la campana y la pregunta después de registrar el negocio.
- pytest: el caso real del Día Dulce (`parecidos`, `unir`, `unir_parecidos`) y, contra el emulador, la reparación de los ya guardados (queda uno de 9:00 a 16:00 con las dos fuentes; el de una persona no se borra; una corrida nueva no lo vuelve a crear). También los negocios sin WhatsApp.
- Vitest: `fichaIncompleta`.

### Revisado sin cambios
- **Fotos en base64.** Se midieron los negocios publicados en producción el 2026-10-29: el más grande, MG WASHERS, pesa 27 KB, y los cuatro juntos, 68 KB. Desde la v4, el documento solo guarda una miniatura de portada; `firestore.rules` la limita a 56 000 caracteres (≈ 40 KB). Las fotos grandes van en la subcolección `comercios/{id}/fotos`, que solo se lee al abrir la ficha. Ningún documento se acerca a 200 KB.

## [1.1.0] - 2026-10-28 · Plan de pruebas con evidencias

### Agregado
- **Unitarias de JavaScript** (Vitest): 36 casos sobre el código real de `app.js`, cargado sin modificar con espree:
  - horarios (abierto, cierra pronto, próxima apertura y medianoche);
  - formato de la hora;
  - búsqueda sin tildes ni plurales;
  - validación de cupones.
- **De extremo a extremo** (Playwright, celular de 390×844, emulador): explorar, buscar «café», abrir la ficha y WhatsApp; el ciclo completo del cupón (obtener, QR, validar, canjear y rechazar un segundo canje); SOS sin conexión; asistente con llamada a funciones.
- **Lighthouse CI** (móvil, 3 corridas): accesibilidad 100 y PWA 100 (meta ≥ 90), buenas prácticas 100, SEO 100 y rendimiento 56 (advertencia).
- Informes HTML con pytest-html y cobertura de la API (83 %, mínimo exigido 80 %).
- Artefacto **informe-pruebas** en GitHub Actions con el resumen de todas las suites (`pruebas/resumen.mjs`).
- Plan de pruebas y tabla de resultados en `docs/pruebas.md`, con capturas en `docs/evidencias/pruebas/`.
- `emulators` en `firebase.json`, con el puerto de Firestore 8099, el mismo que usa la PWA en modo emulador.

## [1.0.0] - 2026-10-28 · Estándares e integración continua

### Agregado
- ESLint 9 con la guía de Airbnb adaptada y Prettier para JavaScript; black, flake8 (PEP 8) y type hints para Python (`docs/estandares.md`).
- Ramas `main` (producción) y `develop`, Conventional Commits, plantilla de Pull Request y este CHANGELOG (`CONTRIBUTING.md`).
- Integración continua en GitHub Actions (`ci.yml`). En cada Pull Request:
  - ESLint, Prettier, black y flake8;
  - pruebas de Python;
  - pruebas de integración contra el emulador de Firestore;
  - formato de los commits.
- Despliegue automático al fusionar en `main`: Firebase Hosting y reglas de Firestore; la API en Render se despliega cuando pasan las pruebas.

### Cambiado
- `app.js` cumple ESLint (0 errores) sin cambiar su comportamiento. Las correcciones se aplicaron sobre el árbol sintáctico, se revisaron en el navegador y se quitaron tres funciones que nadie usaba.

## [0.9.0] - 2026-10-28 · App Android, API REST y procesos en Python

### Agregado
- App Android (Trusted Web Activity) `co.fusaconecta.app` con APK y AAB firmados en GitHub Actions, y `assetlinks.json` (sin barra del navegador).
- API REST en Python (FastAPI) con 9 endpoints:
  - comercios, eventos, calendario ICS, rutas en GPX y emergencias;
  - reporte del negocio en Excel y PDF;
  - estadísticas del admin y estado del servicio.
- Documentación OpenAPI en `/docs`. Despliegue gratuito en Render.
- Botones nuevos en la app: «Suscribirme a la agenda», «Descargar GPX», «Descargar reporte» y la API en el Diagnóstico.
- Limpieza diaria en Python: cupones vencidos, eventos de ejemplo y negocios sin foto.

### Cambiado
- La agenda automática pasó de JavaScript a Python con el mismo comportamiento (prueba de paridad).

## [0.8.0] - 2026-10-28 · Agenda más clara
- Eventos de ejemplo:
  - Etiqueta «Ejemplo».
  - No salen en el asistente, el banner ni «Qué hacer en Fusa».
  - Se borran solos a las 24 horas.
- Eventos automáticos con título corto, imagen de la noticia y separación entre planes y «Avisos del municipio».
- Inicio sin lugares repetidos y con los que tienen foto primero.
- Trazados oficiales de senderos publicados por el admin desde la app.

## [0.7.0] - 2026-10-28 · IA y comunidad
- Asistente «Pregúntale a Fusa» (Gemini con llamadas a funciones).
- Agenda automática desde fuentes oficiales.
- Rutas propuestas por la comunidad.
- Pantalla de entrada que espera a que la app esté lista.
- Modo noche automático por la hora de Colombia.
- Aviso de mudanza para la versión de Netlify.

## [0.6.0] - 2026-10-23 · Eventos con IA
- Llenar eventos con IA desde un afiche o un texto, y organizadores invitados.
- Categoría Servicios.
- Trazado real de Cara del Indio.

## [0.5.0] - 2026-10-23 · Senderos y agenda
- Senderos con ruta guiada y 3D.
- Nuevo diseño de comercios.
- «Qué hacer en Fusa» (eventos y agenda).
- Fotos de negocios y privacidad.

## [0.4.0] - 2026-10-23 · Una sola cuenta y panel de administración
- Una sola cuenta para todos y galería de fotos.
- Panel de administración, plan Premium y modo oscuro.
- Hosting en Firebase (fusa-conecta.web.app).

## [0.3.0] - 2026-10-22 · Roles, cupones y presentación
- Reglas por rol y cupones con QR (crear, obtener, billetera y escanear).
- Identidad visual, radio en vivo y analítica con Umami.

## [0.2.0] - 2026-10-19 · Firebase real
- Ingreso con Firebase, base de datos en tiempo real y sistema de diseño con íconos Lucide.

## [0.1.0] - 2026-06-13 · Prototipo
- Primer prototipo del directorio de Fusagasugá.

[Sin publicar]: https://github.com/marce504/fusa-conecta/compare/v1.3.0...develop
[1.3.0]: https://github.com/marce504/fusa-conecta/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/marce504/fusa-conecta/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/marce504/fusa-conecta/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/marce504/fusa-conecta/compare/v0.9.0...v1.0.0
[0.9.0]: https://github.com/marce504/fusa-conecta/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/marce504/fusa-conecta/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/marce504/fusa-conecta/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/marce504/fusa-conecta/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/marce504/fusa-conecta/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/marce504/fusa-conecta/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/marce504/fusa-conecta/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/marce504/fusa-conecta/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/marce504/fusa-conecta/releases/tag/v0.1.0
