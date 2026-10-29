# Guía para actualizar el documento técnico, capítulo por capítulo

El documento v2 (`Documento_Tecnico_FusaConecta_v2`) describe el **diseño propuesto**: app híbrida en React Native con
SQLite local, publicada en Google Play y App Store. Lo que se **construyó** es una PWA con Firebase, una app Android que
abre esa misma PWA (TWA), una API REST y procesos automáticos en Python.

Esta guía dice, para cada capítulo:
- qué texto queda igual;
- qué hay que cambiar;
- con qué datos cambiarlo.

**Sobre el capítulo 12:** el índice del v2 llega hasta el 11 (conclusión general). Si en tu versión el 12 es otro, aplica
ahí la sección «Capítulo 11».

Sugerencia de redacción para todo el documento: presentar el cambio de React Native a PWA como una **decisión de
arquitectura justificada**, no como un error del diseño. La PWA permitió:
- un solo código para web, Android e iPhone;
- costo de $0 en el plan Spark;
- actualizaciones al instante sin pasar por las tiendas;
- funcionamiento sin conexión con service worker.

---

## Capítulo 3 · Stack tecnológico

**Reemplazar la Tabla 7 (3.3)** por esta:

| Capa | Tecnología | Versión | Licencia |
|---|---|---|---|
| App web progresiva (PWA) | HTML5, CSS3 y JavaScript (ES2023), sin framework | — | Propia |
| App Android | Trusted Web Activity (Bubblewrap; `androidbrowserhelper`) | 2.7.4 | Apache 2.0 |
| Íconos e interfaz | Lucide (local) y tokens CSS propios | — | ISC |
| Datos sin conexión | Service worker, IndexedDB, persistencia de Firestore y `localStorage` | — | Estándar web |
| Backend en la nube | Firebase: Auth, Cloud Firestore, Hosting y AI Logic | SDK 10.12 y 12.19 (IA) | SaaS Google |
| API REST | Python 3.12, FastAPI, Firebase Admin, openpyxl, ReportLab y slowapi | FastAPI 0.115 | MIT y BSD |
| Procesos automáticos | Python 3.12 en GitHub Actions; httpx y Pillow | — | MIT y HPND |
| IA generativa | Google Gemini `gemini-flash-lite-latest` | — | SaaS Google |
| Mapas | Leaflet y OpenStreetMap (2D); MapLibre GL, OpenFreeMap y Terrain Tiles (3D) | — | BSD, ODbL y CC |
| Analítica | Umami Cloud (sin cookies) | — | MIT |
| Calidad | ESLint, Prettier, black, flake8, Vitest, pytest, Playwright y Lighthouse CI | — | MIT |

**Cambios de texto:**
- **3.4.1, capa móvil:** de «React Native» a «PWA + TWA». Justificación: un código para tres plataformas, publicación inmediata, instalación desde el navegador y la app Android sin reescribir nada.
- **3.4.2, persistencia local:** de «SQLite» a «IndexedDB, persistencia de Firestore, `datos.js` y `localStorage`». Cumple RNF-02 (sin conexión): lo comprueba la prueba E2E «SOS sin conexión».
- **3.4.3, backend:** se agrega «API REST en Python (FastAPI) en Render» y «procesos en Python en GitHub Actions». **No se usa Cloud Functions**, porque exige el plan Blaze.
- **3.5, React Native vs. Flutter:** agregar una tercera columna «PWA + TWA (elegida)», con costo $0, un solo código, sin tiendas para iPhone, actualización instantánea y Lighthouse PWA 100.
- **3.7, diagrama del stack:** usar el diagrama 1 de `01-arquitectura.md`.

## Capítulo 4 · Clases, secuencias y modelo de datos

- **4.2 a 4.5, clases:** las «clases» se implementaron como **documentos de Firestore** (JavaScript no tiene clases de dominio en la PWA). Mantén el diagrama de clases como modelo conceptual y agrega el diagrama entidad-relación de `01-arquitectura.md` §3 como modelo físico. Atributos reales:
  - `Comercio`: `estado_publicacion`, `propietario_uid`, `esPremium`, `suscripcion_vigente_hasta`, `prioridadBusqueda`, `dias`, `abre`, `cierra`, `fotos`.
  - `Cupon`: `cupo_total`, `cupo_restante`, `vigencia`, `estado`.
  - `Canje`: `codigo FC-XXXX-XXXX`, `estado reservado o usado`, `fecha_vencimiento`.
  - Nuevas: `Evento` (con `tipo plan o aviso` y `origen`) y `RutaComunidad`.
- **4.7.1, emergencias sin conexión:** la secuencia real es «la app lee `datos.js` o la copia de Firestore» (no SQLite).
- **4.7.2, sincronización delta:** la hace Firestore por sí solo: persistencia local más escrituras en cola, que el Diagnóstico muestra como «Cola de escrituras del teléfono».
- **4.7, nuevas secuencias:** el asistente con funciones, el canje de cupón y la agenda automática (`01-arquitectura.md` §4).
- **4.8.1, esquema SQLite:** reemplazar por los almacenes locales reales:

  | Almacén | Contenido |
  |---|---|
  | IndexedDB `fusa-recorridos` | `recorridos` y `fotos` |
  | Persistencia de Firestore | Copia local de los datos de la nube |
  | `localStorage` | Billetera (`fc_cupones_<uid>`), tema y preferencias |
  | `datos.js` | 71 lugares, 3 rutas y los números de emergencia |

- **4.8.2, colecciones:** usar la lista de `01-arquitectura.md` §3. Son 18 colecciones principales y 2 subcolecciones (`comercios/{id}/estadisticas`, y `fotos` en comercios y rutas); la seguridad está en `firestore.rules`.
- **4.8.3, reglas de integridad:** citar las reglas reales:
  - un cupón por persona (id `cupon_uid`);
  - canje de «reservado» a «usado» solo por el dueño;
  - límite diario de IA en `uso_asistente`;
  - las rutas exigen al menos una foto y el admin rechaza con motivo.

## Capítulo 5 · Arquitectura e interfaces

- **5.2, «en capas + MVVM»:** queda «en capas» (presentación, lógica, datos y servicios externos) más un **estado observable**: el objeto `estado`, las vistas `render*()` y las suscripciones `onSnapshot`. Cumple el papel del ViewModel sin framework. Diagrama: `01-arquitectura.md` §2.
- **5.4, diagrama esquemático:** `01-arquitectura.md` §1.
- **5.6, interfaces:** reemplazar los bocetos por capturas reales:
  - `docs/evidencias/pruebas/` (búsqueda, ficha, cupón con QR, canje y SOS);
  - `docs/evidencias/tecnologias/` (asistente, 3D y agenda).

## Capítulo 6 · Patrones de diseño

Reemplazar 6.2 y 6.3 por la tabla «Patrones de diseño que sí se usan» de `01-arquitectura.md` §2. Cambios principales:

| Patrón | Qué cambia en el texto |
|---|---|
| **Singleton** | Se cumple con `db` y `auth` únicos en la PWA, y con `iniciar_firebase()` y `repositorio()` en la API (no con React Context) |
| **Factory** | No hay `UsuarioFactory`: el rol vive en el documento `usuarios/{uid}` y lo hacen cumplir las reglas de Firestore. Recomiendo retirar este patrón o presentarlo como «roles por datos, no por clases» |
| **MVVM** | Sale; queda «estado observable + vistas `render*()`» (ver capítulo 5) |
| **Repository** | Se cumple en la API (`Repositorio` como `Protocol` con dos implementaciones: Firestore y una falsa para pruebas) y en `IDB` de la PWA |
| Nuevos | Observer (`onSnapshot`), Strategy (funciones del asistente), Caché (proxy) e Inyección de dependencias (FastAPI) |

## Capítulo 7 · Componentes

Componentes reales:

| Componente | Archivo o carpeta | Interfaz que ofrece |
|---|---|---|
| PWA | `index.html`, `app.js`, `app.css` | Interfaz de usuario |
| Service worker | `sw.js` | Funcionamiento sin conexión |
| Reglas de seguridad | `firestore.rules` | Autorización de cada lectura y escritura |
| API REST | `api/` | 10 endpoints `/v1` (`02-endpoints.md`) |
| Agenda automática | `automatizacion/agenda.py` | Escribe en `eventos` y `config/agenda_auto` |
| Limpieza diaria | `automatizacion/limpieza.py` | Escribe en `cupones`, `eventos` y `config/limpieza` |
| App Android | `android/` | Abre la PWA (TWA) |
| CI/CD | `.github/workflows/` | Pruebas y despliegue |

**7.4, trazabilidad:** agregar estas filas:

| Requisito | Componente |
|---|---|
| RF-11, cupones | PWA + reglas |
| RF-16, emergencias | PWA + service worker + `datos.js` |
| RF-17, rutas | PWA (MapLibre) + API (GPX) |
| Integración de módulos | La PWA consume la API (ICS, GPX, reportes y Diagnóstico); los procesos en Python escriben lo que la PWA y la API leen |

## Capítulo 8 · Despliegue

**8.2, nodos.** Reemplazar «Tiendas de Apps» por:
- Firebase Hosting (CDN con HTTPS);
- Google Play, pendiente: el AAB ya está firmado y la cuenta de desarrollador cuesta USD 25, una sola vez.

Y agregar:

| Nodo | Rol |
|---|---|
| Render | API REST |
| GitHub Actions | Procesos programados y CI/CD |
| Google Gemini | IA |
| Umami Cloud | Analítica |

**8.3, protocolos:**

| Protocolo | Uso |
|---|---|
| HTTPS (TLS) | Todo el tráfico |
| Conexión persistente sobre HTTPS (WebChannel del SDK web) | Firestore en tiempo real |
| REST + JSON, ICS, GPX | API |
| JWT (`idToken`) | Autorización de la API |
| Digital Asset Links | Vínculo de la web con la app (TWA) |

- **8.4, diagrama:** `01-arquitectura.md` §1 (contexto y despliegue) y §5 (CI/CD).
- **8.5, justificación:** costo $0 en todos los nodos (tabla de `01-arquitectura.md` §1), despliegue automático al fusionar en `main` y la API desplegada solo si pasan las pruebas.

## Capítulo 9 · Metodología, validación y pruebas

- **9.1 y 9.3, metodología y cronograma:**
  - **Versiones:** se trabajó en **versiones incrementales** (v3 a v8 de la app y luego las fases SENA 1 a 7), con entregas publicadas al final de cada fase. Fechas reales: `CHANGELOG.md` y las etiquetas `v0.1.0`…`v1.1.0`.
  - **Control de versiones:** Git y GitHub, ramas `main` y `develop`, y Conventional Commits (`03-estructura-repositorio.md`).
- **9.5, estrategia de validación:** agregar los niveles automáticos (unitarias, integración, extremo a extremo, Lighthouse y estándares). La tabla está en `docs/pruebas.md`.
- **9.6, casos de prueba de aceptación:**
  - Agregar una columna «Prueba automática / resultado» con la tabla de `04-pruebas.md`.
  - **CP-11b** cambia: la validación del canje exige conexión a propósito, para evitar canjes dobles. El QR sí se ve sin conexión.
  - **CP-25** cambia: Android 7 o superior por la TWA, y cualquier navegador moderno por la PWA.
- **9.7, trazabilidad:** sumar las pruebas automáticas a la matriz.
- **9.8, riesgos:** actualizar con riesgos reales y su mitigación:

| Riesgo | Mitigación implementada |
|---|---|
| Superar la cuota gratuita de Firestore (50 000 lecturas al día) | Caché de 2 min en la API y persistencia local en la PWA |
| Abuso de la IA | Límites diarios validados en `firestore.rules` (30 o 10 preguntas y 20 usos de afiches) |
| Eventos falsos o duplicados | Solo se publican solos los oficiales completos; deduplicación; revisión del admin |
| API dormida (plan gratuito) | La app avisa «el servicio está despertando»; las funciones principales no dependen de la API |
| Pérdida de la llave de firma del APK | Guardada fuera del repositorio, con copia recomendada (`android/LEEME.md`) |
| Fallas al publicar | CI con 101 pruebas antes de desplegar; Render despliega solo con pruebas en verde |

## Capítulo 10 · Costos

- **10.3, infraestructura:** cambiar la fila «Infraestructura Cloud AWS/GCP» por los costos reales de operación:

  | Servicio | Plan | Costo mensual |
  |---|---|---|
  | Firebase (Hosting, Auth, Firestore, AI Logic) | Spark | $0 |
  | Render (API) | Gratuito | $0 |
  | GitHub (repositorio y Actions) | Gratuito, repositorio público | $0 |
  | Google Gemini | Cuota gratuita | $0 |
  | Umami Cloud | Gratuito | $0 |
  | Google Play (opcional) | Pago único | USD 25 una sola vez |

  Costos posibles al crecer: el plan Blaze de Firebase (pago por uso) o el plan Starter de Render (USD 7/mes), para que la API no se duerma.

- **10.6, monetización:** el plan Premium ya está implementado: cupones, más fotos, posición destacada, novedades y el reporte mensual en Excel o PDF desde la API. Sirve como evidencia de la propuesta B2B.

## Capítulo 11 · Conclusión general

Puntos para la conclusión, todos comprobables:
- El sistema está **en producción**: fusa-conecta.web.app, la app Android firmada y la API con OpenAPI.
- Cumple los numerales 3.3 y 3.4 de la guía GFPI-F-135. La tabla de cumplimiento está en el `README.md` de esta carpeta.
- Módulos en **Python**: la API REST y los procesos automáticos (agenda con IA y limpieza diaria).
- Calidad medida:
  - **101 pruebas automáticas, 0 fallas**;
  - accesibilidad y PWA 100 en Lighthouse;
  - 0 errores de estilo con ESLint y flake8;
  - cobertura del 83 % en la API.
- Tecnologías emergentes reales, sin promesas: IA generativa con llamadas a funciones, mapas 3D con relieve, PWA offline-first y TWA (`docs/tecnologias-emergentes.md`).
- **Trabajo pendiente (honesto):**
  - publicar en Google Play;
  - grabar en campo los senderos Cerro Fusacatán y La Aguadita;
  - mejorar el rendimiento de carga en celulares lentos (Lighthouse 56);
  - pruebas automáticas para calificaciones, favoritos y desvío de la ruta.

## Glosario: términos nuevos para agregar

| Término | Definición |
|---|---|
| **PWA** | Aplicación web progresiva |
| **TWA** | Trusted Web Activity |
| **Service worker** | Programa del navegador que permite el funcionamiento sin conexión |
| **IndexedDB** | Base de datos local del navegador |
| **API REST** | Servicios web por HTTP con recursos y verbos |
| **OpenAPI** | Estándar para describir una API |
| **Function calling** | Llamadas a funciones: el modelo de IA pide ejecutar funciones de la app |
| **CI/CD** | Integración y despliegue continuos |
| **Conventional Commits** | Formato estándar de los mensajes de commit |
| **Emulador de Firebase** | Copia local de Firebase para hacer pruebas sin tocar producción |
| **GPX** | Formato de rutas GPS |
| **ICS** | Formato de calendario |
| **Lighthouse** | Herramienta de Google que mide rendimiento, accesibilidad y PWA |
