# Entrega SENA · Fusa Conecta v1.1.0

Material para actualizar los capítulos 3 a 11 del documento técnico (GFPI-F-135, numerales 3.3 y 3.4) con lo que
**realmente se construyó**. Todo lo que hay aquí se puede comprobar en los enlaces, el código o las capturas.

## Enlaces

| Qué | Enlace |
|---|---|
| Aplicación web (PWA) | https://fusa-conecta.web.app |
| Aplicación Android (APK y AAB) | Compilación firmada: https://github.com/marce504/fusa-conecta/actions/workflows/android.yml (artefacto «fusa-conecta-android»). Para un enlace público permanente, crea la Release con la etiqueta `apk-v1.0.0` (`android/LEEME.md`); quedará en https://github.com/marce504/fusa-conecta/releases |
| API REST: documentación interactiva (OpenAPI) | https://fusa-conecta-api.onrender.com/docs |
| API REST: estado | https://fusa-conecta-api.onrender.com/v1/salud |
| Repositorio | https://github.com/marce504/fusa-conecta |
| Integración continua (última corrida en verde) | https://github.com/marce504/fusa-conecta/actions/runs/40803962146 |
| Versiones y cambios | https://github.com/marce504/fusa-conecta/tags · `CHANGELOG.md` |

La API está en el plan gratuito de Render y se duerme tras 15 minutos sin uso: la primera petición tarda de 30 a 60 s.

## Contenido

| Archivo | Para qué capítulos |
|---|---|
| [01-arquitectura.md](01-arquitectura.md) | Diagramas Mermaid de contexto y despliegue, capas y componentes, modelo de datos (Firestore), secuencias críticas y CI/CD | 3, 4, 5, 6, 7, 8 |
| [02-endpoints.md](02-endpoints.md) | Los 10 servicios web REST con ejemplos de respuesta (reales de producción del 1 al 9) | 7, 8 |
| [03-estructura-repositorio.md](03-estructura-repositorio.md) | Estructura del repositorio, ramas, versiones y estándares | 6, 9 |
| [04-pruebas.md](04-pruebas.md) | Comandos para correr las pruebas, resultados y capturas | 9 |
| [05-guia-por-capitulo.md](05-guia-por-capitulo.md) | Qué cambiar en cada capítulo, del diseño v2 (React Native + SQLite) a lo construido, con tablas listas para copiar | 3 a 11 |
| [diagramas/](diagramas/) | Los 7 diagramas de `01-arquitectura.md` en PNG, listos para pegar en el documento | 3 a 8 |
| [capturas/](capturas/) | CI en verde, API `/docs`, Lighthouse, Playwright, pytest y cobertura | 9 |

Evidencias que ya existen en el repositorio y se citan aquí:
- `docs/evidencias/pruebas/`: flujos de extremo a extremo e informe de pruebas.
- `docs/evidencias/tecnologias/`: IA, mapas 3D, PWA y TWA.

## Cumplimiento de la guía (numerales 3.3 y 3.4)

| Requisito de la guía | Cómo se cumple | Evidencia |
|---|---|---|
| Aplicación web o móvil funcional | PWA en producción y app Android (TWA) del mismo código | Enlaces de arriba · `android/LEEME.md` |
| Servicios web REST | API FastAPI `/v1` con 10 endpoints, JSON, ICS, GPX, Excel, PDF y avisos push (FCM), OpenAPI | `02-endpoints.md` · `api/` |
| Integración de módulos | La PWA consume la API (calendario, GPX, reportes, Diagnóstico); la agenda en Python escribe en Firestore lo que la PWA y la API leen | `01-arquitectura.md` |
| Control de versiones | Git y GitHub, ramas `main` y `develop`, Conventional Commits, etiquetas v0.1.0 a v1.1.0, CHANGELOG | `03-estructura-repositorio.md` |
| Estándares de codificación | ESLint (Airbnb adaptada) y Prettier; black, flake8 (PEP 8) y type hints; 0 errores en CI | `docs/estandares.md` |
| Tecnologías emergentes | IA generativa con llamadas a funciones, mapas 3D con relieve, PWA offline-first, TWA | `docs/tecnologias-emergentes.md` |
| Plan de pruebas con evidencias | 101 pruebas en 6 suites + Lighthouse (accesibilidad y PWA 100), informe HTML en cada corrida | `04-pruebas.md` · `docs/pruebas.md` |
| Módulos en Java, Python, PHP o C# | **Python**: API REST (`api/`) y procesos automáticos (`automatizacion/`) | `api/LEEME.md` · `automatizacion/LEEME.md` |
