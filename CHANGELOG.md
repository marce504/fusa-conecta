# Registro de cambios

Todos los cambios importantes de Fusa Conecta. Formato de [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y
versiones con [Versionado Semántico](https://semver.org/lang/es/) (`vMAYOR.MENOR.PARCHE`). Cada versión tiene su etiqueta en Git.

La versión que ve la gente en la app (`?v=` en `index.html`, por ejemplo v63) es el número de publicación de la PWA; la de
este archivo es la del proyecto completo (PWA, app Android, API y procesos).

## [Sin publicar]

### Agregado
- `docs/tecnologias-emergentes.md`: lo que ya funciona (IA generativa con llamadas a funciones, IA desde afiches, agenda automática, mapas 3D con relieve real, grabación GPS, PWA offline-first, TWA y analítica Umami) con su evidencia en `docs/evidencias/tecnologias/`.

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

[Sin publicar]: https://github.com/marce504/fusa-conecta/compare/v1.1.0...develop
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
