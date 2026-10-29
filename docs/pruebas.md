# Plan de pruebas de Fusa Conecta

## Objetivo y alcance

Comprobar que la PWA, la app Android (que abre la misma PWA), la API REST y los procesos automáticos hacen lo que
prometen. La comprobación tiene cinco niveles:

1. Funciones sueltas.
2. Servicios contra la base de datos.
3. Flujos completos en un celular.
4. Calidad de la página (rendimiento, accesibilidad y PWA).
5. Seguridad de las reglas de Firestore.

Todas las pruebas usan el **emulador de Firebase** o datos de prueba: **nunca** escriben en producción ni usan cuentas reales.

## Niveles, herramientas y criterios de aceptación

| Nivel | Herramienta | Qué cubre | Criterio de aceptación |
|---|---|---|---|
| Unitarias JavaScript | **Vitest 2** (`pruebas/unitarias/`) | Código **real** de `app.js` y `datos.js`, cargado sin modificar (`cargar-app.js` extrae las funciones con espree): `estadoApertura` (abierto, cierra pronto, próxima apertura, medianoche, senderos), `formatearHora` y `horaTexto`, búsqueda sin tildes ni plurales (`norm`, `raiz`, `tokens`, `coincide`), validación de cupones (`cuponesDe`, `estadoCupon`, `premiumVigente`, `codigoCupon`, `leerTextoQR`, `aMs`), pantalla de entrada (`appLista`, `salidaSplash`) | 100 % pasan |
| Unitarias Python | **pytest 8** (`api/tests`, `automatizacion/tests`) | Utilidades de la API, estado abierto o cerrado (traducido de la app), exportación **GPX** e **ICS**, reportes **Excel y PDF**, deduplicación y títulos de la agenda, limpieza diaria, **paridad** con la versión anterior en JavaScript | 100 % pasan; cobertura de la API ≥ 80 % |
| API (servicio) | pytest + `TestClient` de FastAPI con repositorio falso | Los 9 endpoints: filtros, paginación, errores 401/403/404/422, CORS solo para la web, límite de peticiones (429) | 100 % pasan |
| Integración | pytest contra los **emuladores de Firestore y Auth** (`firebase emulators:exec`) | La API real con tokens reales del emulador (solo lo publicado sale; reporte del dueño; estadísticas del admin) y los procesos guardando, deduplicando, reparando y limpiando | 100 % pasan |
| Extremo a extremo | **Playwright 1.55** (`pruebas/e2e/`) en un celular de **390×844** contra el emulador | Ver los ocho flujos, abajo | 100 % pasan |
| Rendimiento y accesibilidad | **Lighthouse CI 0.13** (Lighthouse 11, móvil, mediana de 3 corridas; `lighthouserc.json`) | Rendimiento, accesibilidad, buenas prácticas, SEO y PWA | **Accesibilidad ≥ 90** y **PWA ≥ 90** (bloquean); manifiesto instalable; rendimiento ≥ 60 solo como advertencia |
| Estándares | ESLint, Prettier, black, flake8 | Estilo y errores comunes (`docs/estandares.md`) | 0 errores |

Flujos de extremo a extremo:

1. **Explorar:** entrada → «Solo explorar» → buscar «cafe» sin tilde → sugerencia → ficha → WhatsApp abre `wa.me/57…` con el mensaje.
2. **Cupón:** Ana obtiene el cupón → el botón Cupones de la barra muestra el globo → billetera → QR en pantalla completa. La comerciante escribe el código en el escáner → «Cupón válido» → «Canje confirmado». Un segundo intento con el mismo código → «Ya fue canjeado».
3. **SOS sin conexión:** primera visita (el service worker guarda la app) → modo avión → recarga → entrada → SOS con los números y sus botones de llamar.
4. **Asistente:** una pregunta → llamada a la función `buscarLugares` → respuesta con tarjeta del directorio y la nota de IA. En CI responde un modelo de prueba, así la prueba es repetible y no gasta la cuota de Gemini. Con `E2E_IA_REAL=1` responde Gemini de verdad; así se corrió el 2026-10-28, con resultado «Panadería y Café El Cedro».
5. **Entrada con sesión:** recarga con la sesión iniciada → la entrada se va en **≤ 3,5 s** desde que se abre la página.
6. **Entrada con la nube lenta:** sin copia del perfil ni del directorio y Firestore demorado 6 s → la entrada no lo espera y se va a los **3 s**.
7. **Entrada del invitado:** «Registrarse» y «Solo explorar» del todo visibles en **≤ 2,6 s** desde la primera pintura.
8. **Barra inferior:** Mapa · Cupones · Inicio · Agenda · Perfil, cada uno abre su pantalla y queda marcado (`aria-current`), todos con área táctil ≥ 44 px. Un favorito guardado con el corazón aparece en Perfil → «Mis favoritos» (primera opción, con contador), que abre la lista con «Volver».

## Cómo correrlas

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
cd api && python -m pytest --html=../informe-pruebas/python.html --cov=app --cov-report=html:../informe-pruebas/cobertura
```

```bash
firebase emulators:exec --only firestore,auth --project demo-fusa-conecta "cd api && pytest -m integracion"
```

```bash
npm run test:informe
```

El último comando junta todo en `informe-pruebas/index.html`; con `-- --docs` además actualiza la tabla de este documento.

## Evidencias en GitHub Actions

Cada corrida de **Integración continua** (`.github/workflows/ci.yml`) deja el artefacto **informe-pruebas** con:
- `index.html`: el resumen con todas las suites, caso por caso, y los puntajes de Lighthouse;
- informes HTML de Vitest y Playwright (con las capturas de cada flujo), pytest-html y la cobertura;
- los informes de Lighthouse.

Abre la corrida → **Artifacts** → **informe-pruebas**.

## Resultados

<!-- resultados:inicio -->
Última corrida: 2026-10-29. Total: **110 pasan, 0 fallan, 6 omitidas**.

**Lighthouse** (mediana de 3 corridas, móvil): Rendimiento 56 · Accesibilidad 100 · Buenas prácticas 100 · SEO 100 · PWA 100

Las omitidas son las pruebas de integración dentro de las suites unitarias de Python: necesitan el emulador y corren
(y pasan) en su propia suite, «Integración».

| Suite | Casos | Pasan | Fallan | Omitidas |
|---|---|---|---|---|
| Unitarias JavaScript (Vitest) | 41 | 41 | 0 | 0 |
| Unitarias y de API Python (pytest) | 40 | 36 | 0 | 4 |
| Procesos automáticos Python (pytest) | 21 | 19 | 0 | 2 |
| Integración: API contra el emulador | 4 | 4 | 0 | 0 |
| Integración: procesos contra el emulador | 2 | 2 | 0 | 0 |
| Extremo a extremo (Playwright, 390×844) | 8 | 8 | 0 | 0 |

| Suite | Caso | Resultado | Fecha |
|---|---|---|---|
| Unitarias JavaScript (Vitest) | pruebas/unitarias/app.test.js | Pasa | 2026-10-29 |
| Unitarias JavaScript (Vitest) | pruebas/unitarias/app.test.js | Pasa | 2026-10-29 |
| Unitarias JavaScript (Vitest) | pruebas/unitarias/app.test.js | Pasa | 2026-10-29 |
| Unitarias JavaScript (Vitest) | pruebas/unitarias/app.test.js | Pasa | 2026-10-29 |
| Unitarias JavaScript (Vitest) | pruebas/unitarias/app.test.js | Pasa | 2026-10-29 |
| Unitarias JavaScript (Vitest) | pruebas/unitarias/app.test.js | Pasa | 2026-10-29 |
| Unitarias JavaScript (Vitest) | pruebas/unitarias/app.test.js | Pasa | 2026-10-29 |
| Unitarias JavaScript (Vitest) | pruebas/unitarias/app.test.js | Pasa | 2026-10-29 |
| Unitarias JavaScript (Vitest) | pruebas/unitarias/app.test.js | Pasa | 2026-10-29 |
| Unitarias JavaScript (Vitest) | pruebas/unitarias/app.test.js | Pasa | 2026-10-29 |
| Unitarias JavaScript (Vitest) | pruebas/unitarias/app.test.js | Pasa | 2026-10-29 |
| Unitarias JavaScript (Vitest) | pruebas/unitarias/app.test.js | Pasa | 2026-10-29 |
| Unitarias JavaScript (Vitest) | pruebas/unitarias/app.test.js | Pasa | 2026-10-29 |
| Unitarias JavaScript (Vitest) | pruebas/unitarias/app.test.js | Pasa | 2026-10-29 |
| Unitarias JavaScript (Vitest) | pruebas/unitarias/app.test.js | Pasa | 2026-10-29 |
| Unitarias JavaScript (Vitest) | pruebas/unitarias/app.test.js | Pasa | 2026-10-29 |
| Unitarias JavaScript (Vitest) | pruebas/unitarias/app.test.js | Pasa | 2026-10-29 |
| Unitarias JavaScript (Vitest) | pruebas/unitarias/app.test.js | Pasa | 2026-10-29 |
| Unitarias JavaScript (Vitest) | pruebas/unitarias/app.test.js | Pasa | 2026-10-29 |
| Unitarias JavaScript (Vitest) | pruebas/unitarias/app.test.js | Pasa | 2026-10-29 |
| Unitarias JavaScript (Vitest) | pruebas/unitarias/app.test.js | Pasa | 2026-10-29 |
| Unitarias JavaScript (Vitest) | pruebas/unitarias/app.test.js | Pasa | 2026-10-29 |
| Unitarias JavaScript (Vitest) | pruebas/unitarias/app.test.js | Pasa | 2026-10-29 |
| Unitarias JavaScript (Vitest) | pruebas/unitarias/app.test.js | Pasa | 2026-10-29 |
| Unitarias JavaScript (Vitest) | pruebas/unitarias/app.test.js | Pasa | 2026-10-29 |
| Unitarias JavaScript (Vitest) | pruebas/unitarias/app.test.js | Pasa | 2026-10-29 |
| Unitarias JavaScript (Vitest) | pruebas/unitarias/app.test.js | Pasa | 2026-10-29 |
| Unitarias JavaScript (Vitest) | pruebas/unitarias/app.test.js | Pasa | 2026-10-29 |
| Unitarias JavaScript (Vitest) | pruebas/unitarias/app.test.js | Pasa | 2026-10-29 |
| Unitarias JavaScript (Vitest) | pruebas/unitarias/app.test.js | Pasa | 2026-10-29 |
| Unitarias JavaScript (Vitest) | pruebas/unitarias/app.test.js | Pasa | 2026-10-29 |
| Unitarias JavaScript (Vitest) | pruebas/unitarias/app.test.js | Pasa | 2026-10-29 |
| Unitarias JavaScript (Vitest) | pruebas/unitarias/app.test.js | Pasa | 2026-10-29 |
| Unitarias JavaScript (Vitest) | pruebas/unitarias/app.test.js | Pasa | 2026-10-29 |
| Unitarias JavaScript (Vitest) | pruebas/unitarias/app.test.js | Pasa | 2026-10-29 |
| Unitarias JavaScript (Vitest) | pruebas/unitarias/app.test.js | Pasa | 2026-10-29 |
| Unitarias JavaScript (Vitest) | pruebas/unitarias/app.test.js | Pasa | 2026-10-29 |
| Unitarias JavaScript (Vitest) | pruebas/unitarias/app.test.js | Pasa | 2026-10-29 |
| Unitarias JavaScript (Vitest) | pruebas/unitarias/app.test.js | Pasa | 2026-10-29 |
| Unitarias JavaScript (Vitest) | pruebas/unitarias/app.test.js | Pasa | 2026-10-29 |
| Unitarias JavaScript (Vitest) | pruebas/unitarias/app.test.js | Pasa | 2026-10-29 |
| Unitarias y de API Python (pytest) | tests.test_api | Pasa | 2026-10-29 |
| Unitarias y de API Python (pytest) | tests.test_api | Pasa | 2026-10-29 |
| Unitarias y de API Python (pytest) | tests.test_api | Pasa | 2026-10-29 |
| Unitarias y de API Python (pytest) | tests.test_api | Pasa | 2026-10-29 |
| Unitarias y de API Python (pytest) | tests.test_api | Pasa | 2026-10-29 |
| Unitarias y de API Python (pytest) | tests.test_api | Pasa | 2026-10-29 |
| Unitarias y de API Python (pytest) | tests.test_api | Pasa | 2026-10-29 |
| Unitarias y de API Python (pytest) | tests.test_api | Pasa | 2026-10-29 |
| Unitarias y de API Python (pytest) | tests.test_api | Pasa | 2026-10-29 |
| Unitarias y de API Python (pytest) | tests.test_api | Pasa | 2026-10-29 |
| Unitarias y de API Python (pytest) | tests.test_api | Pasa | 2026-10-29 |
| Unitarias y de API Python (pytest) | tests.test_api | Pasa | 2026-10-29 |
| Unitarias y de API Python (pytest) | tests.test_api | Pasa | 2026-10-29 |
| Unitarias y de API Python (pytest) | tests.test_formatos | Pasa | 2026-10-29 |
| Unitarias y de API Python (pytest) | tests.test_formatos | Pasa | 2026-10-29 |
| Unitarias y de API Python (pytest) | tests.test_formatos | Pasa | 2026-10-29 |
| Unitarias y de API Python (pytest) | tests.test_formatos | Pasa | 2026-10-29 |
| Unitarias y de API Python (pytest) | tests.test_integracion | Omitida | 2026-10-29 |
| Unitarias y de API Python (pytest) | tests.test_integracion | Omitida | 2026-10-29 |
| Unitarias y de API Python (pytest) | tests.test_integracion | Omitida | 2026-10-29 |
| Unitarias y de API Python (pytest) | tests.test_integracion | Omitida | 2026-10-29 |
| Unitarias y de API Python (pytest) | tests.test_utilidades | Pasa | 2026-10-29 |
| Unitarias y de API Python (pytest) | tests.test_utilidades | Pasa | 2026-10-29 |
| Unitarias y de API Python (pytest) | tests.test_utilidades | Pasa | 2026-10-29 |
| Unitarias y de API Python (pytest) | tests.test_utilidades | Pasa | 2026-10-29 |
| Unitarias y de API Python (pytest) | tests.test_utilidades | Pasa | 2026-10-29 |
| Unitarias y de API Python (pytest) | tests.test_utilidades | Pasa | 2026-10-29 |
| Unitarias y de API Python (pytest) | tests.test_utilidades | Pasa | 2026-10-29 |
| Unitarias y de API Python (pytest) | tests.test_utilidades | Pasa | 2026-10-29 |
| Unitarias y de API Python (pytest) | tests.test_utilidades | Pasa | 2026-10-29 |
| Unitarias y de API Python (pytest) | tests.test_utilidades | Pasa | 2026-10-29 |
| Unitarias y de API Python (pytest) | tests.test_utilidades | Pasa | 2026-10-29 |
| Unitarias y de API Python (pytest) | tests.test_utilidades | Pasa | 2026-10-29 |
| Unitarias y de API Python (pytest) | tests.test_utilidades | Pasa | 2026-10-29 |
| Unitarias y de API Python (pytest) | tests.test_utilidades | Pasa | 2026-10-29 |
| Unitarias y de API Python (pytest) | tests.test_utilidades | Pasa | 2026-10-29 |
| Unitarias y de API Python (pytest) | tests.test_utilidades | Pasa | 2026-10-29 |
| Unitarias y de API Python (pytest) | tests.test_utilidades | Pasa | 2026-10-29 |
| Unitarias y de API Python (pytest) | tests.test_utilidades | Pasa | 2026-10-29 |
| Unitarias y de API Python (pytest) | tests.test_utilidades | Pasa | 2026-10-29 |
| Procesos automáticos Python (pytest) | tests.test_agenda | Pasa | 2026-10-29 |
| Procesos automáticos Python (pytest) | tests.test_agenda | Pasa | 2026-10-29 |
| Procesos automáticos Python (pytest) | tests.test_agenda | Pasa | 2026-10-29 |
| Procesos automáticos Python (pytest) | tests.test_agenda | Pasa | 2026-10-29 |
| Procesos automáticos Python (pytest) | tests.test_agenda | Pasa | 2026-10-29 |
| Procesos automáticos Python (pytest) | tests.test_agenda | Pasa | 2026-10-29 |
| Procesos automáticos Python (pytest) | tests.test_agenda | Pasa | 2026-10-29 |
| Procesos automáticos Python (pytest) | tests.test_integracion_agenda | Omitida | 2026-10-29 |
| Procesos automáticos Python (pytest) | tests.test_limpieza | Pasa | 2026-10-29 |
| Procesos automáticos Python (pytest) | tests.test_limpieza | Pasa | 2026-10-29 |
| Procesos automáticos Python (pytest) | tests.test_limpieza | Pasa | 2026-10-29 |
| Procesos automáticos Python (pytest) | tests.test_limpieza | Omitida | 2026-10-29 |
| Procesos automáticos Python (pytest) | tests.test_paridad | Pasa | 2026-10-29 |
| Procesos automáticos Python (pytest) | tests.test_paridad | Pasa | 2026-10-29 |
| Procesos automáticos Python (pytest) | tests.test_paridad | Pasa | 2026-10-29 |
| Procesos automáticos Python (pytest) | tests.test_paridad | Pasa | 2026-10-29 |
| Procesos automáticos Python (pytest) | tests.test_paridad | Pasa | 2026-10-29 |
| Procesos automáticos Python (pytest) | tests.test_paridad | Pasa | 2026-10-29 |
| Procesos automáticos Python (pytest) | tests.test_paridad | Pasa | 2026-10-29 |
| Procesos automáticos Python (pytest) | tests.test_paridad | Pasa | 2026-10-29 |
| Procesos automáticos Python (pytest) | tests.test_paridad | Pasa | 2026-10-29 |
| Integración: API contra el emulador | tests.test_integracion | Pasa | 2026-10-29 |
| Integración: API contra el emulador | tests.test_integracion | Pasa | 2026-10-29 |
| Integración: API contra el emulador | tests.test_integracion | Pasa | 2026-10-29 |
| Integración: API contra el emulador | tests.test_integracion | Pasa | 2026-10-29 |
| Integración: procesos contra el emulador | tests.test_integracion_agenda | Pasa | 2026-10-29 |
| Integración: procesos contra el emulador | tests.test_limpieza | Pasa | 2026-10-29 |
| Extremo a extremo (Playwright, 390×844) | explorar: entrada → «Solo explorar» → buscar «café» → ficha → WhatsApp | Pasa | 2026-10-29 |
| Extremo a extremo (Playwright, 390×844) | cupón: Ana lo obtiene → lo muestra con QR → la comerciante valida el código y lo canjea | Pasa | 2026-10-29 |
| Extremo a extremo (Playwright, 390×844) | SOS sin conexión: los números de emergencia funcionan en modo avión | Pasa | 2026-10-29 |
| Extremo a extremo (Playwright, 390×844) | asistente: una pregunta con llamada a funciones y tarjetas del directorio | Pasa | 2026-10-29 |
| Extremo a extremo (Playwright, 390×844) | entrada con sesión: se va en 3,5 s como máximo | Pasa | 2026-10-29 |
| Extremo a extremo (Playwright, 390×844) | entrada con sesión y la nube lenta: no la espera y se va a los 3 s | Pasa | 2026-10-29 |
| Extremo a extremo (Playwright, 390×844) | entrada como invitado: «Registrarse» y «Solo explorar» visibles en 2,6 s como máximo | Pasa | 2026-10-29 |
| Extremo a extremo (Playwright, 390×844) | barra inferior: Mapa · Cupones · Inicio · Agenda · Perfil y Perfil → «Mis favoritos» | Pasa | 2026-10-29 |
<!-- resultados:fin -->
