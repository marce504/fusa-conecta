# Pruebas: comandos, resultados y capturas

El plan completo, los criterios de aceptación y la tabla caso por caso están en `docs/pruebas.md`.

## Resultados (v1.2.0, 2026-10-29)

| Suite | Herramienta | Casos | Resultado |
|---|---|---|---|
| Unitarias JavaScript (código real de `app.js`) | Vitest 2 | 50 | 50 pasan |
| Unitarias y de API Python | pytest 8 | 61 | 56 pasan, 5 de integración se corren aparte |
| Procesos automáticos Python | pytest 8 | 27 | 24 pasan, 3 de integración se corren aparte |
| Integración: API contra el emulador | pytest + Firebase Emulator Suite | 5 | 5 pasan |
| Integración: procesos contra el emulador | pytest + Firebase Emulator Suite | 3 | 3 pasan |
| Extremo a extremo en celular 390×844 | Playwright 1.55 | 9 | 9 pasan |
| **Total** | | **155** | **147 pasan, 0 fallan** (las 8 omitidas son las de integración, que pasan en su propia suite) |

**Lighthouse 11** (móvil, mediana de 3 corridas):

| Categoría | Puntaje |
|---|---|
| Accesibilidad | **100** (meta ≥ 90) |
| PWA | **100** (meta ≥ 90) |
| Buenas prácticas | 100 |
| SEO | 100 |
| Rendimiento | 56 |

El rendimiento se reporta como advertencia: con la simulación de celular lento de Lighthouse, la primera pintura tarda 9,3 s, porque la entrada espera a que la app esté lista. El bloqueo total es de 0 ms y el cambio de diseño, de 0.

**Cobertura de la API:** 84 % (el CI exige al menos 80 %).

## Casos de prueba de aceptación del capítulo 9 cubiertos por pruebas automáticas

| Caso del documento | Prueba automática |
|---|---|
| **CP-16** Emergencias en modo avión | E2E «SOS sin conexión»: primera visita, modo avión, recarga y números con botón de llamar |
| **CP-09** WhatsApp desde la ficha | E2E «explorar»: abre `wa.me/57…` con el mensaje precargado |
| **CP-05** Sugerencias de búsqueda | E2E «explorar» («cafe» sin tilde → sugerencia) y Vitest de búsqueda sin tildes ni plurales |
| **CP-11** Canjear dos veces un cupón | E2E «cupón»: el primer canje se confirma y el segundo dice «Ya fue canjeado» |
| **CP-11b** Cupón sin conexión | La billetera guarda el cupón y su QR en el teléfono (`localStorage`), así que se puede mostrar sin internet. La validación del comerciante exige conexión a propósito, para evitar canjes dobles: sin internet el escáner dice «Sin conexión». Verificado en el navegador; no tiene prueba automática |
| **CP-19** Premium primero | Pruebas de la API: Premium encabeza `/v1/comercios`. En la PWA: `prioridad()` |
| **CP-26** Contraseñas y HTTPS | Firebase Auth (las contraseñas nunca pasan por la app) y Hosting, Render y Firestore solo con HTTPS |
| **CP-25** Versiones mínimas | Android 7 o superior (TWA, `minSdkVersion` 24); iPhone y computador por navegador (PWA) |

Otros casos (CP-12 calificaciones, CP-13 compartir, CP-14 favoritos sin conexión, CP-17 desvío de la ruta) se probaron
en el navegador durante el desarrollo; todavía no tienen prueba automática.

## Comandos

Desde la raíz del repositorio:

```bash
npm ci
```

```bash
npm test
```

```bash
npm run test:e2e
```

```bash
npm run test:lighthouse
```

```bash
npm run lint
```

```bash
npm run formato:revisar
```

Python (con `pip install -r api/requirements-dev.txt -r automatizacion/requirements-dev.txt`):

```bash
cd api && python -m pytest --html=../informe-pruebas/python.html --cov=app --cov-report=html:../informe-pruebas/cobertura
```

```bash
cd automatizacion && python -m pytest
```

```bash
firebase emulators:exec --only firestore,auth --project demo-fusa-conecta "cd api && pytest -m integracion && cd ../automatizacion && pytest -m integracion"
```

```bash
python -m black --check api automatizacion
```

```bash
python -m flake8 api automatizacion
```

Informe con todo junto (`informe-pruebas/index.html`) y la tabla de `docs/pruebas.md`:

```bash
node pruebas/resumen.mjs --docs
```

En GitHub Actions todo esto corre solo en cada Pull Request y cada push. El informe queda en la corrida, en **Artifacts → informe-pruebas**.

## Capturas

| Captura | Qué muestra |
|---|---|
| [capturas/01-ci-github-actions-verde.png](capturas/01-ci-github-actions-verde.png) | La corrida de integración continua con los 8 trabajos en verde |
| [capturas/02-api-docs-produccion.png](capturas/02-api-docs-produccion.png) | La documentación OpenAPI de la API en producción |
| [capturas/04-lighthouse-movil.png](capturas/04-lighthouse-movil.png) | Lighthouse en móvil: 56, 100, 100, 100 y PWA aprobada |
| [capturas/05-playwright-informe.png](capturas/05-playwright-informe.png) | Informe de Playwright (captura de la v1.1.0, con los 4 flujos de entonces; hoy son 9) |
| [capturas/06-cobertura-api.png](capturas/06-cobertura-api.png) | Cobertura de la API por archivo |
| [capturas/07-pytest-informe.png](capturas/07-pytest-informe.png) | Informe HTML de pytest |
| [../evidencias/pruebas/informe-pruebas.png](../evidencias/pruebas/informe-pruebas.png) | Resumen de todas las suites |
| [../evidencias/pruebas/](../evidencias/pruebas/) | Pantallas de los flujos: búsqueda, ficha, cupón con QR, canje confirmado, SOS sin conexión, asistente |
