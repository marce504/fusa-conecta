# Estructura del repositorio

Repositorio: https://github.com/marce504/fusa-conecta (Git y GitHub). 240 archivos versionados y 11 000 líneas de código
propio entre la PWA, la API y los procesos.

```text
fusa-conecta/
├── index.html, app.js, app.css     PWA: interfaz, lógica y estilos (sin framework)
├── datos.js                        Directorio base, rutas y números de emergencia (funcionan sin conexión)
├── icons.js                        Íconos Lucide locales
├── sw.js, manifest.json            Service worker (offline) y manifiesto de la PWA
├── firestore.rules                 Toda la seguridad de los datos (roles, validaciones, límites de IA)
├── firebase.json                   Hosting, reglas y emuladores
├── .well-known/assetlinks.json     Vínculo de la web con la app Android (TWA)
├── img/, lib/, rutas/              Imágenes, librerías locales (MapLibre, QR) y trazados GeoJSON
├── android/                        App Android (Trusted Web Activity, Bubblewrap) · LEEME.md
├── api/                            API REST en Python (FastAPI) · LEEME.md
│   ├── app/main.py                 Endpoints, CORS, límite de peticiones, autenticación
│   ├── app/servicios.py            Reglas de negocio
│   ├── app/repositorio.py          Acceso a Firestore con caché (patrón Repository)
│   ├── app/utilidades.py           Horarios, búsqueda, fechas (traducidos de app.js)
│   ├── app/formatos.py             GPX, ICS, Excel (openpyxl) y PDF (ReportLab)
│   ├── app/datos_base.json         Copia de datos.js (exportar_datos.mjs)
│   └── tests/                      pytest: unitarias, API e integración
├── automatizacion/                 Procesos en Python (GitHub Actions) · LEEME.md
│   ├── agenda.py                   Agenda automática con Gemini
│   ├── limpieza.py                 Limpieza diaria
│   └── tests/                      pytest: paridad con la versión JS, unitarias e integración
├── pruebas/
│   ├── unitarias/                  Vitest sobre el código real de app.js
│   ├── e2e/                        Playwright (390×844) y semilla del emulador
│   └── resumen.mjs                 Informe HTML y tabla de docs/pruebas.md
├── docs/                           Documentación por tema, evidencias y esta entrega
├── .github/
│   ├── workflows/ci.yml            Integración continua y despliegue
│   ├── workflows/agenda.yml        Agenda y limpieza programadas
│   ├── workflows/android.yml       APK y AAB firmados
│   └── pull_request_template.md
├── eslint.config.js, .prettierrc.json, pyproject.toml, .flake8   Estándares
├── playwright.config.js, vitest.config.js, lighthouserc.json      Pruebas
├── render.yaml                     Despliegue de la API (Render)
├── package.json                    Herramientas de desarrollo (no se publican)
├── README.md, CONTRIBUTING.md, CHANGELOG.md
└── .gitattributes, .gitignore, .npmrc
```

## Control de versiones

| Práctica | Cómo |
|---|---|
| Ramas | `main` es producción; `develop` integra; `feat/…` y `fix/…` son de trabajo (`CONTRIBUTING.md`) |
| Mensajes | Conventional Commits (`feat(api): …`, `fix(app): …`), revisados por el CI en cada Pull Request |
| Pull Requests | Plantilla con lista de revisión (`.github/pull_request_template.md`) |
| Versiones | Versionado semántico con etiquetas `v0.1.0` (prototipo de junio) … `v1.0.0` (estándares) · `v1.1.0` (pruebas) |
| Registro de cambios | `CHANGELOG.md` (formato Keep a Changelog) |
| Secretos | Nunca en el código: GitHub Secrets (`GEMINI_API_KEY`, `FIREBASE_SA`, firma del APK) y Render (`FIREBASE_SA` de solo lectura) |

## Estándares de codificación

| Lenguaje | Herramientas | Resultado en CI |
|---|---|---|
| JavaScript | ESLint 9 (guía Airbnb adaptada) y Prettier 3 | 0 errores, 0 advertencias |
| Python | black 24, flake8 7 (PEP 8) y type hints | 0 observaciones |

Detalle y reglas adaptadas: `docs/estandares.md`.
