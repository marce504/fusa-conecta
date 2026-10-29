# Tecnologías emergentes en Fusa Conecta

Este documento reúne **solo lo que ya funciona** en el proyecto, con su evidencia: archivo y función, capturas, cifras
medidas y enlaces. Las capturas de `docs/evidencias/` se tomaron sobre la app real, con el emulador de Firebase y datos
de prueba salvo donde se indica, entre el 28 y el 29 de octubre de 2026.

| Tecnología | Dónde | Estado |
|---|---|---|
| IA generativa con llamadas a funciones (asistente) | `app.js` · `preguntarFusa`, `FUNCIONES_ASIS` | En producción |
| IA para llenar eventos desde un afiche o un texto | `app.js` · `enlazarIAEvento`, `obtenerModeloIA` | En producción (admin y organizadores) |
| Agenda automática con IA | `automatizacion/agenda.py` + GitHub Actions | En producción (todos los días a las 6:00 a. m.) |
| Mapas 3D con relieve real | `app.js` · `abrir3D`, `agregarRelieve` (MapLibre GL + Terrarium) | En producción |
| Grabación de recorridos con GPS | `app.js` · grabador (`watchPosition`, Wake Lock, IndexedDB) | En producción |
| PWA offline-first | `sw.js`, `manifest.json`, IndexedDB | En producción |
| App Android con Trusted Web Activity | `android/`, `.well-known/assetlinks.json` | APK y AAB firmados |
| Analítica respetuosa de la privacidad | `app.js` · `UMAMI`, `medir` (Umami Cloud) | En producción |

## 1. Inteligencia artificial generativa

Todos los usos corren con **Gemini** (`gemini-flash-lite-latest`) y respetan el plan gratuito Spark de Firebase (sin Cloud Functions):

| Uso | Cómo se llama a Gemini |
|---|---|
| La app (asistente y eventos) | **Firebase AI Logic** desde el navegador (`firebase-ai.js` 12.19.0, `getAI` con `GoogleAIBackend`) |
| La agenda automática | API de Gemini desde GitHub Actions, con la clave guardada solo como secreto |

### 1.1 Asistente «Pregúntale a Fusa» con llamadas a funciones (function calling)

- **Cómo funciona:** el modelo no inventa lugares. Recibe la pregunta y decide qué **función** de la app llamar (`app.js`, `herramientasAsis` y `FUNCIONES_ASIS`):

  | Función | Para qué |
  |---|---|
  | `buscarLugares` | Texto, categoría, abiertos ahora, cerca de mí y municipio |
  | `eventosEntre` | Eventos entre dos fechas, por categoría o solo gratis |
  | `rutas` | Rutas por distancia y dificultad |
  | `tramites` | Entidades para trámites |
  | `emergencias` | Números de emergencia por municipio y tipo |

  Las funciones responden con los datos del directorio, con el estado abierto o cerrado calculado en ese momento. El modelo redacta la respuesta y la app muestra **tarjetas** con lo que devolvieron las funciones.
- **Controles:**
  - Hasta 4 vueltas de funciones y 30 s por vuelta.
  - Las tarjetas aparecen mientras el modelo escribe.
  - Límite diario validado en `firestore.rules` (`uso_asistente`): 30 preguntas con cuenta y 10 como invitado.
  - La instrucción del sistema prohíbe agregar datos que no vengan de las funciones.
  - La nota «Respuesta con IA: confirma horarios…» sale solo cuando se recomiendan lugares.
  - Los eventos automáticos llevan el enlace «Ver fuente oficial».
- **Evidencia (respuestas reales de Gemini):**

| Pregunta | Tiempo | Resultado | Captura |
|---|---|---|---|
| «panadería cerca» | 4,5 s | Panadería y Café El Cedro, 1,3 km, abierta, con tarjeta | `evidencias/tecnologias/ia-1-asistente-panaderia.png` |
| «dónde radico un documento» | 3,6 s | Alcaldía (dirección y horario) y Fiscalía | `ia-2-asistente-tramites.png` |
| «¿Qué eventos hay esta semana?» | 4,4 s | Eventos con «Ver fuente oficial» | `ia-4-asistente-fuente-oficial.png` |
| «¿Quién ganó el último mundial?» | 2,1 s | Explica que solo ayuda con Fusagasugá y Pasca, sin la nota de IA | `ia-3-asistente-fuera-de-tema.png` |

  La prueba de extremo a extremo `pruebas/e2e/flujos.spec.js` («asistente…») cubre este flujo. Con `E2E_IA_REAL=1` usa Gemini de verdad: el 2026-10-28 respondió «Panadería y Café El Cedro… ahora está cerrada» con su tarjeta.

### 1.2 Llenar un evento con IA desde un afiche o un texto

- **Cómo funciona:** el admin o el organizador sube la foto de un afiche (Gemini lee la imagen) o pega el texto de la publicación.
  - Gemini responde en **JSON con esquema** (`responseSchema`): título, categoría, fechas, lugar, municipio, organizador, precio y enlace.
  - La app llena el formulario y la persona revisa antes de publicar.
  - Límite: 20 usos al día por persona.
- **Evidencia:** el texto «Festival gastronómico de la gulupa el sábado 14 de noviembre de 10 a. m. a 6 p. m. en el Parque de la Cultura…» llenó título, inicio (2026-11-14 10:00), fin (18:00), lugar y categoría Gastronomía:
  - Llenado en **2,6 s**; guardado en 0,2 s.
  - Capturas: `ia-5-evento-desde-texto.png` e `ia-6-evento-guardado.png`.
  - El panel **Diagnóstico** mide la llamada a la IA desde el teléfono: **1,1 s**.

### 1.3 Agenda automática desde fuentes oficiales

- **Cómo funciona:** `automatizacion/agenda.py` (Python) corre en GitHub Actions todos los días y cuando el admin toca «Buscar eventos ahora».
  - Lee las APIs públicas de las alcaldías de Fusagasugá y Pasca y del IDECUT.
  - Gemini extrae los eventos futuros de las noticias, con un esquema JSON que indica si la fecha y el lugar están claros.
  - Quita duplicados y descarga la imagen de la noticia en WebP de máximo 200 KB.
  - Marca cada evento como «plan» o «aviso del municipio».
  - Publica solo lo oficial y completo; lo demás queda pendiente para el admin.
- **Evidencia (datos reales de producción):**

  | Corrida | Resultado |
  |---|---|
  | 2026-10-28, 10:44 a. m. (en JavaScript) | 16 noticias leídas con IA, 3 eventos publicados en 225 s (`ia-7-agenda-automatica.png`) |
  | 2026-10-28, 7:43 p. m. (en Python) | 48 s, 1 evento encontrado que ya existía, 3 eventos anteriores reparados con título corto, tipo e imagen |

  El registro de la corrida queda en el panel (`ia-8-agenda-registro-python.png`). Fuentes leídas: Fusagasugá con 380 contenidos y 17 noticias recientes, Pasca con 527 contenidos e IDECUT con 21.

## 2. Mapas 3D con relieve real y grabación de recorridos con GPS

- **Mapa 3D** (`app.js`, `abrir3D` y `agregarRelieve`):
  - **MapLibre GL** (local, en `lib/maplibre/`) con mapa de **OpenFreeMap**.
  - El relieve sale de los **Terrain Tiles de Mapzen/AWS** (formato *Terrarium*), con terreno exagerado ×1,5 y sombreado.
  - «Recorrer» vuela la cámara por el sendero.
  - Ejemplo: la ruta de prueba «Variante a La Aguadita» vista en 3D en el panel del admin (`mapa-1-relieve-3d.png`).
- **Rutas con trazado real:**
  - Cara del Indio, desde OpenStreetMap: 200 puntos, 3,98 km, +421 m.
  - Perfil de elevación y ruta guiada (`mapa-2-ruta-guiada.png`).
  - Se puede exportar en **GPX** desde la API REST (`mapa-5-relieve-y-gpx.png`).
- **Grabación** (comentario del módulo en `app.js`: «watchPosition + Wake Lock + IndexedDB»):
  - `navigator.geolocation.watchPosition` con alta precisión.
  - **Screen Wake Lock** para que la pantalla no se apague.
  - Cada punto y cada foto se guardan en **IndexedDB** (`fusa-recorridos`), así el recorrido sobrevive si se cierra la app.
  - Al terminar:
    - Video vertical 1080×1920 con **MediaRecorder** a partir del vuelo 3D.
    - Tarjeta para compartir.
    - Propuesta como ruta de la comunidad.
    - El admin puede publicarlo como trazado oficial del sendero (`mapa-3-grabar-recorrido.png`, `mapa-4-trazado-oficial.png`).

## 3. PWA offline-first y Trusted Web Activity para Android

- **Service worker** (`sw.js`):
  - El código propio se pide primero a la red y, sin conexión, se sirve la copia guardada.
  - Las teselas del mapa se guardan con un límite de tamaño.
  - Las fotos se sirven desde la copia guardada mientras se actualizan en segundo plano.
  - Las peticiones a Firebase y a la API nunca se guardan.
- **Datos sin conexión:**
  - Firestore con persistencia local, IndexedDB para los recorridos y `localStorage` para la billetera de cupones.
  - Los números de emergencia funcionan en modo avión.
- **Evidencia:**
  - La prueba de extremo a extremo «SOS sin conexión» hace una primera visita, pasa a modo avión, recarga y muestra los números de emergencia con sus botones de llamar. Pasa en local y en GitHub Actions (`pwa-1-sos-sin-conexion.png`).
  - **Lighthouse 11** (móvil): **PWA 100**, Accesibilidad 100, Buenas prácticas 100, SEO 100 (`docs/pruebas.md`).
- **Trusted Web Activity:** la app Android `co.fusaconecta.app` es la misma PWA a pantalla completa (Bubblewrap; `android/LEEME.md`).
  - Google confirma el vínculo del sitio con la app (Digital Asset Links): `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://fusa-conecta.web.app&relation=delegate_permission/common.handle_all_urls` devuelve el paquete `co.fusaconecta.app` y la huella `EE:27:…:93:D6`.
  - El APK y el AAB los firma GitHub Actions (`android.yml`), que también comprueba la huella contra `assetlinks.json`.
  - Pantalla de inicio de la app: `twa-1-splash.png`.

## 4. Analítica respetuosa de la privacidad (Umami)

- Usa **Umami Cloud** (`cloud.umami.is`), con el sitio `62b419e4-…` (`app.js`, constante `UMAMI`).
- **No usa cookies ni guarda datos personales.** Solo carga en los dominios de producción (`fusa-conecta.web.app` y la versión anterior en Netlify), nunca en local ni en las pruebas.
- Mide visitas a pantallas, fichas y eventos, y **24 eventos de uso** con nombre (`medir(...)`). Ejemplos:
  - búsqueda (solo el término, en minúsculas);
  - toque en WhatsApp;
  - cupón obtenido;
  - preguntas al asistente (solo qué funciones usó, nunca el texto);
  - descarga de GPX y de reporte;
  - suscripción a la agenda.
- El aviso legal de la app lo explica, en la sección de privacidad.

## Lo que **no** se usa

Para que el documento técnico no prometa de más:
- Blockchain.
- IoT.
- Modelos de IA propios.
- Servicios de IA de AWS.

AWS solo aparece como alojamiento de los **datos públicos de elevación** (Terrain Tiles en S3).
