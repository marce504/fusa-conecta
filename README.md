# Fusa Conecta

Guía digital de **Fusagasugá y Pasca** (Cundinamarca, Colombia). Reúne directorio de comercios y servicios, cupones con QR,
agenda de eventos, senderos con ruta guiada y 3D, números de emergencia y un asistente con IA.

| | |
|---|---|
| App web (PWA) | https://fusa-conecta.web.app |
| App Android (TWA) | `co.fusaconecta.app` · APK en [Releases](https://github.com/marce504/fusa-conecta/releases) (`android/LEEME.md`) |
| API REST (Python) | https://fusa-conecta-api.onrender.com/docs (`api/LEEME.md`) |
| Versión | ver `CHANGELOG.md` |

## Componentes

| Carpeta | Qué es | Tecnología |
|---|---|---|
| raíz (`index.html`, `app.js`, `app.css`, `datos.js`, `sw.js`) | PWA offline-first | HTML, CSS y JavaScript sin framework; Firebase (Auth y Firestore) |
| `android/` | App Android que abre la misma PWA a pantalla completa | Trusted Web Activity (Bubblewrap) |
| `api/` | Servicios web REST: comercios, agenda (JSON e ICS), rutas (GPX), emergencias, reportes Excel/PDF | Python 3.12, FastAPI, Firebase Admin |
| `automatizacion/` | Agenda automática con IA y limpieza diaria | Python 3.12, Gemini, GitHub Actions |
| `firestore.rules` | Toda la seguridad de los datos | Reglas de Firestore |
| `docs/` | Documentación por tema | |

## Ejecutar en local

```bash
python -m http.server 5510
```

Abre http://localhost:5510. Para probar con datos de prueba usa el emulador de Firebase y abre `http://localhost:5510/?emulador`:

```bash
firebase emulators:start --only firestore,auth --project fusa-conecta
```

La API y los procesos tienen sus propias instrucciones en `api/LEEME.md` y `automatizacion/LEEME.md`.

## Calidad

- Estándares: ESLint (Airbnb adaptada) y Prettier en JavaScript; black, flake8 y type hints en Python (`docs/estandares.md`).
- Integración continua en cada Pull Request y despliegue al fusionar en `main` (`docs/integracion-continua.md`).
- Ramas `main` y `develop`, Conventional Commits y etiquetas de versión (`CONTRIBUTING.md`, `CHANGELOG.md`).

## Restricciones del proyecto

- Plan gratuito Spark de Firebase: sin Cloud Functions.
- Toda la seguridad vive en `firestore.rules`.
- Ninguna clave va en el código.
- Sin scraping de redes sociales.
